// refine-creative: turns a vague image/video request into an incredible one.
// Interviews the user ONE question at a time (only what's actually missing),
// then compiles a long, professional, best-practice prompt for the generator.
//
// POST { kind: "image"|"video", request: string,
//        answers?: {q:string,a:string}[], brandProfile?, companyDetails? }
// →  { status: "question", question, progress } | { status: "ready", prompt, negative_prompt, aspect_ratio, duration, summary }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { openaiChatCompletion, resolveOpenAIKey, noProviderResponse } from "../_shared/openai.ts";

const MAX_QUESTIONS = 4;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const IMAGE_BEST_PRACTICES = `
IMAGE PROMPT BEST PRACTICES — the final prompt MUST weave these in (as flowing descriptive language, not a checklist):
- Subject: the exact focal subject with concrete, specific detail (what it is, materials, colours, state, quantity).
- Action/pose & context: what the subject is doing and the setting/environment around it.
- Composition & framing: shot type (close-up / macro / product hero / wide), camera angle (eye-level, low, top-down, 3/4), rule-of-thirds or centered, foreground/background, negative space for text.
- Lighting: named lighting (soft diffused daylight, golden hour, studio softbox, rim light, dramatic chiaroscuro) and mood it creates.
- Lens / camera feel: focal length or effect (85mm portrait, shallow depth of field / bokeh, tilt-shift, crisp product macro).
- Colour palette: specific palette, and the brand colours if provided, used deliberately.
- Style / medium: photography vs 3D render vs illustration vs flat vector; realism level; any art direction reference.
- Mood & atmosphere: the feeling the image should evoke.
- Finish & quality: high detail, sharp focus, professional, clean, high-resolution; commercial/editorial polish.
`;

const VIDEO_BEST_PRACTICES = `
VIDEO PROMPT BEST PRACTICES — the final prompt MUST weave these in (flowing cinematic language, not a checklist):
- Subject & action: the hero subject and the single clear action/beat for a very short clip.
- Shot type & framing: close-up / medium / wide / aerial; what's in frame.
- Camera movement: ONE coherent move for a short clip (slow push-in, gentle dolly, orbit, static locked-off, crane up) — avoid many conflicting moves.
- Setting & time: location, time of day, weather/atmosphere.
- Lighting & colour: cinematic lighting and palette/grade (warm golden, cool teal-orange, soft natural).
- Pacing & energy: calm and elegant vs punchy and dynamic — matched to the brand.
- Style: photoreal / cinematic / animated / stylised; film-look references if useful.
- Mood: the feeling the clip should leave.
- Keep it physically coherent and achievable in the given short duration; describe a continuous moment, not a montage.
- Note aspect ratio (9:16 vertical for social/stories/reels, 16:9 for landscape) and duration.
`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return json({ error: "Service unavailable" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Authorization required" }, 401);
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claims?.claims) return json({ error: "Invalid or expired token" }, 401);
    const userId = claims.claims.sub;

    const { kind: rawKind, request, answers = [], brandProfile, companyDetails } = await req.json();
    const kind = rawKind === "video" ? "video" : "image";
    if (!request || typeof request !== "string") return json({ error: "request is required" }, 400);

    const apiKey = await resolveOpenAIKey(userId);
    if (!apiKey) return noProviderResponse();

    const answered = Array.isArray(answers) ? answers.slice(0, MAX_QUESTIONS) : [];
    const forceFinal = answered.length >= MAX_QUESTIONS;

    const brandBits: string[] = [];
    if (brandProfile?.brand_name) brandBits.push(`Brand: ${brandProfile.brand_name}`);
    if (brandProfile?.visual_style) brandBits.push(`Visual style: ${brandProfile.visual_style}`);
    if (brandProfile?.tone_of_voice) brandBits.push(`Tone: ${brandProfile.tone_of_voice}`);
    if (brandProfile?.industry) brandBits.push(`Industry: ${brandProfile.industry}`);
    const colors = [...(brandProfile?.primary_colors || []), ...(brandProfile?.secondary_colors || [])].filter(Boolean).slice(0, 5);
    if (colors.length) brandBits.push(`Brand colours: ${colors.join(", ")}`);
    if (companyDetails?.target_audience) brandBits.push(`Audience: ${companyDetails.target_audience}`);
    const brandContext = brandBits.length ? brandBits.join("\n") : "(no brand profile provided)";

    const qa = answered.length
      ? answered.map((a: { q: string; a: string }, i: number) => `Q${i + 1}: ${a.q}\nA${i + 1}: ${a.a}`).join("\n")
      : "(none yet)";

    const system = `You are a world-class creative director and prompt engineer for a marketing platform.
Your job: turn a client's ${kind} request into an INCREDIBLE, professional generation prompt.

You work in two modes and MUST reply with ONLY a JSON object.

MODE 1 — ASK (when key creative details are still missing and you have asked fewer than ${MAX_QUESTIONS} questions):
Ask exactly ONE short, friendly, specific question about the single MOST important missing detail.
Never ask more than one thing at a time. Prefer concrete either/or or example-laden questions so the client answers fast.
Good things to clarify (only what's missing): the exact subject/product, the goal/platform, the setting/scene,
the mood/feeling, the visual style, colours, and for video the action + energy + camera feel.
Do NOT ask about things already answered or already clear. Do NOT ask more than needed.
Return: {"status":"question","question":"<one question>"}

MODE 2 — FINALISE (when you have enough to make something great, OR you have already asked ${MAX_QUESTIONS} questions):
Compile a LONG, richly-detailed, professional ${kind} prompt (roughly 90-160 words) using the best practices below.
Fold in the brand context and every answer the client gave. Write it as vivid flowing description, ready to feed a generator.
${kind === "image" ? IMAGE_BEST_PRACTICES : VIDEO_BEST_PRACTICES}
Return: {"status":"ready","prompt":"<the full professional prompt>","negative_prompt":"<things to avoid, e.g. blurry, distorted text, watermark, extra limbs>","aspect_ratio":"${kind === "video" ? "9:16" : "1:1"}","duration":${kind === "video" ? 5 : 0},"summary":"<one short line telling the client what you're creating>"}

Rules:
- Output JSON only, no markdown, no prose outside JSON.
- ${forceFinal ? "You have reached the question limit — you MUST return status \"ready\" now." : "Ask a question only if it materially improves the result; if the request is already detailed, go straight to ready."}
- Choose aspect_ratio sensibly (9:16 for stories/reels/vertical social, 1:1 for feed images, 16:9 for landscape/website) based on the request.`;

    const user = `CLIENT REQUEST (${kind}): "${request}"

BRAND CONTEXT:
${brandContext}

CLARIFYING Q&A SO FAR (${answered.length}/${MAX_QUESTIONS}):
${qa}

Respond with the JSON for the correct mode now.`;

    const resp = await openaiChatCompletion(apiKey, {
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    });
    if (!resp.ok) {
      const t = await resp.text();
      console.error("LLM error:", resp.status, t);
      return json({ error: "AI provider error" }, 502);
    }
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content || "";
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : null;
    }
    if (!parsed) return json({ error: "Could not parse AI response" }, 502);

    if (parsed.status === "question" && parsed.question && !forceFinal) {
      return json({ status: "question", question: String(parsed.question), progress: { asked: answered.length, max: MAX_QUESTIONS } });
    }

    // ready (or forced)
    const prompt = String(parsed.prompt || request).slice(0, 3200);
    return json({
      status: "ready",
      prompt,
      negative_prompt: parsed.negative_prompt ? String(parsed.negative_prompt).slice(0, 600) : undefined,
      aspect_ratio: parsed.aspect_ratio || (kind === "video" ? "9:16" : "1:1"),
      duration: kind === "video" ? Number(parsed.duration) || 5 : undefined,
      summary: parsed.summary ? String(parsed.summary) : undefined,
    });
  } catch (e) {
    console.error("refine-creative error:", e);
    return json({ error: "Unexpected error" }, 500);
  }
});
