import OpenAI from "npm:openai";

const TTS_MODEL = Deno.env.get("OPENAI_TTS_MODEL") || "gpt-4o-mini-tts";
const TTS_VOICE = Deno.env.get("OPENAI_TTS_VOICE") || "coral";
const TTS_SPEED = Number(Deno.env.get("OPENAI_TTS_SPEED") || "0.96");
const MAX_TTS_INPUT_CHARS = 4000;
const DEFAULT_TTS_INSTRUCTIONS =
  Deno.env.get("OPENAI_TTS_INSTRUCTIONS") ||
  "Speak in a natural, warm, human way with subtle British-style conversational pacing. Use gentle variation in rhythm, light emotional expression, soft sentence endings, and short natural pauses. Avoid sounding robotic, overly cheerful, exaggerated, or like a formal announcer. Keep the delivery helpful, calm, polished, and lifelike.";

let cachedClient: OpenAI | null = null;

function getOpenAIClient() {
  if (cachedClient) return cachedClient;
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  cachedClient = new OpenAI({ apiKey });
  return cachedClient;
}

export type SynthesizeSpeechOptions = {
  voice?: string | null;
  speed?: number | null;
  instructions?: string | null;
};

function sanitizeTextForSpeech(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[*#>_~]/g, " ")
    .replace(/\bAIson\b/g, "Aye-son")
    .replace(/\s+/g, " ")
    .replace(/\s([?.!,;:])/g, "$1")
    .trim();
}

export async function synthesizeAssistantSpeech(
  text: string,
  options?: SynthesizeSpeechOptions,
): Promise<Uint8Array> {
  const input = sanitizeTextForSpeech(String(text || ""));
  if (!input) {
    throw new Error("Cannot synthesize empty text");
  }

  const client = getOpenAIClient();
  const response = await client.audio.speech.create({
    model: TTS_MODEL,
    voice: options?.voice || TTS_VOICE,
    input: input.slice(0, MAX_TTS_INPUT_CHARS),
    instructions: options?.instructions || DEFAULT_TTS_INSTRUCTIONS,
    response_format: "wav",
    speed: options?.speed ?? TTS_SPEED,
  });

  return new Uint8Array(await response.arrayBuffer());
}
