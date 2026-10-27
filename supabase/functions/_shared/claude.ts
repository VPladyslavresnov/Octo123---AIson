// Shared Anthropic Claude gateway for all AIson edge functions.
// Accepts OpenAI chat-completions-shaped request bodies and returns a
// Response whose JSON is OpenAI-shaped. Optional: used only when
// ANTHROPIC_API_KEY is configured on the backend.
import Anthropic from "npm:@anthropic-ai/sdk";

export const CLAUDE_MODEL = Deno.env.get("ANTHROPIC_MODEL") || "claude-opus-4-8";

export function hasClaude(): boolean {
  return !!Deno.env.get("ANTHROPIC_API_KEY");
}

interface OpenAIMessage {
  role: string;
  content?: unknown;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string | Record<string, unknown> };
  }>;
  tool_call_id?: string;
  // Raw Anthropic content blocks from a previous claudeChatCompletion turn.
  // Replaying them verbatim preserves thinking/tool_use block integrity.
  _anthropicContent?: unknown[];
}

interface ChatBody {
  messages: OpenAIMessage[];
  tools?: Array<{ type: string; function: { name: string; description?: string; parameters?: unknown } }>;
  response_format?: unknown;
  max_tokens?: number;
  model?: string; // ignored — Claude always serves the request
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (typeof p === "string" ? p : (p as { text?: string })?.text || ""))
      .join("");
  }
  return content == null ? "" : String(content);
}

function convertMessages(messages: OpenAIMessage[]): { system: string; converted: Anthropic.MessageParam[] } {
  const systemParts: string[] = [];
  const converted: Anthropic.MessageParam[] = [];

  for (const m of messages) {
    if (m.role === "system") {
      systemParts.push(textOf(m.content));
      continue;
    }
    if (m.role === "tool") {
      const block = {
        type: "tool_result" as const,
        tool_use_id: m.tool_call_id || "",
        content: textOf(m.content),
      };
      const last = converted[converted.length - 1];
      if (last && last.role === "user" && Array.isArray(last.content)) {
        (last.content as unknown[]).push(block);
      } else {
        converted.push({ role: "user", content: [block] });
      }
      continue;
    }
    if (m.role === "assistant") {
      if (Array.isArray(m._anthropicContent) && m._anthropicContent.length) {
        converted.push({ role: "assistant", content: m._anthropicContent as Anthropic.ContentBlockParam[] });
        continue;
      }
      const blocks: Anthropic.ContentBlockParam[] = [];
      const text = textOf(m.content);
      if (text) blocks.push({ type: "text", text });
      for (const tc of m.tool_calls || []) {
        let input: Record<string, unknown> = {};
        try {
          input = typeof tc.function.arguments === "string"
            ? JSON.parse(tc.function.arguments || "{}")
            : (tc.function.arguments as Record<string, unknown>) || {};
        } catch { /* keep empty input */ }
        blocks.push({ type: "tool_use", id: tc.id, name: tc.function.name, input });
      }
      if (blocks.length) converted.push({ role: "assistant", content: blocks });
      continue;
    }
    // user (and anything else) becomes a user turn
    const text = textOf(m.content);
    converted.push({ role: "user", content: text || "(empty)" });
  }

  if (!converted.length || converted[0].role !== "user") {
    converted.unshift({ role: "user", content: "(start)" });
  }
  return { system: systemParts.join("\n\n"), converted };
}

function convertTools(tools?: ChatBody["tools"]): Anthropic.Tool[] | undefined {
  if (!tools?.length) return undefined;
  return tools
    .filter((t) => t?.function?.name)
    .map((t) => ({
      name: t.function.name,
      description: t.function.description || "",
      input_schema: (t.function.parameters || { type: "object", properties: {} }) as Anthropic.Tool["input_schema"],
    }));
}

function openAIShapedJson(msg: Anthropic.Message) {
  let text = "";
  const toolCalls: unknown[] = [];
  for (const block of msg.content) {
    if (block.type === "text") text += block.text;
    if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        type: "function",
        function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) },
      });
    }
  }
  const finishReason = msg.stop_reason === "tool_use" ? "tool_calls" : "stop";
  const message: Record<string, unknown> = {
    role: "assistant",
    content: text || (toolCalls.length ? null : ""),
    _anthropicContent: msg.content,
  };
  if (toolCalls.length) message.tool_calls = toolCalls;
  return {
    id: msg.id,
    object: "chat.completion",
    model: msg.model,
    choices: [{ index: 0, finish_reason: finishReason, message }],
    usage: {
      prompt_tokens: msg.usage?.input_tokens ?? 0,
      completion_tokens: msg.usage?.output_tokens ?? 0,
    },
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Chat completion served by Claude, returned as a Response with
 * OpenAI-shaped JSON (choices[0].message...).
 */
export async function claudeChatCompletion(body: ChatBody): Promise<Response> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return jsonResponse({ error: { message: "ANTHROPIC_API_KEY not configured" } }, 500);
  }
  const client = new Anthropic({ apiKey });

  const { system, converted } = convertMessages(body.messages || []);
  let systemPrompt = system;
  if (body.response_format) {
    systemPrompt += (systemPrompt ? "\n\n" : "") + "Respond with ONLY valid JSON. No prose, no markdown fences.";
  }

  try {
    const msg = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: body.max_tokens ?? 16000,
      thinking: { type: "adaptive" },
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: converted,
      ...(convertTools(body.tools) ? { tools: convertTools(body.tools) } : {}),
    });

    if (msg.stop_reason === "refusal") {
      return jsonResponse({
        choices: [{
          index: 0,
          finish_reason: "stop",
          message: { role: "assistant", content: "I can't help with that request." },
        }],
      });
    }
    return jsonResponse(openAIShapedJson(msg));
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      const status = typeof err.status === "number" ? err.status : 502;
      console.error("Claude API error:", status, err.message);
      return jsonResponse({ error: { message: err.message } }, status);
    }
    console.error("Claude connection error:", err);
    return jsonResponse({ error: { message: String(err) } }, 502);
  }
}
