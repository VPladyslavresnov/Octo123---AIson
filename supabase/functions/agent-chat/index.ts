import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { claudeChatCompletion, hasClaude } from "../_shared/claude.ts";
import { noProviderResponse, openaiChatCompletion, openaiImageUrl, resolveImageKey, resolveOpenAIKey } from "../_shared/openai.ts";
import { generateVargVideo, resolveVargKey } from "../_shared/varg.ts";
import { hasHiggsfield, higgsfieldEnqueue } from "../_shared/higgsfield.ts";

// Claude when configured on the backend, otherwise OpenAI (backend secret or
// the user's own key from Account → API Keys).
async function chatAI(
  body: { messages: unknown[]; tools?: unknown[] },
  openaiKey: string | null,
): Promise<Response> {
  if (hasClaude()) {
    return await claudeChatCompletion(body as Parameters<typeof claudeChatCompletion>[0]);
  }
  if (openaiKey) {
    return await openaiChatCompletion(openaiKey, body as Parameters<typeof openaiChatCompletion>[1]);
  }
  return noProviderResponse();
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Tool definitions for the AI agent
const tools = [
  {
    type: "function",
    function: {
      name: "get_brand_profile",
      description: "Get the user's brand profile including brand name, colors, tone, industry, etc.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_campaigns",
      description: "Get user's campaigns with their status, channels, objectives.",
      parameters: {
        type: "object",
        properties: { limit: { type: "number", description: "Max campaigns to return (default 5)" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_creatives",
      description: "Get the user's recently generated content/creatives with captions, types, and engagement data.",
      parameters: {
        type: "object",
        properties: { limit: { type: "number" }, campaign_id: { type: "string" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_scheduled_posts",
      description: "Get upcoming scheduled posts.",
      parameters: { type: "object", properties: { limit: { type: "number" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_account_info",
      description: "Get user profile info, company details, balance, and social connections.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_content_stats",
      description: "Get content generation stats: total creatives, saved count, content type breakdown, recent activity.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "update_company_details",
      description: "Update company/brand details like company name, business type, target audience, location, website.",
      parameters: {
        type: "object",
        properties: {
          company_name: { type: "string" },
          business_type: { type: "string" },
          target_audience: { type: "string" },
          location: { type: "string" },
          website: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_campaign",
      description: "Create a new marketing campaign with objective, channels, tone, and duration.",
      parameters: {
        type: "object",
        properties: {
          objective: { type: "string", description: "Campaign objective/goal" },
          channels: { type: "array", items: { type: "string" }, description: "e.g. instagram, tiktok, facebook" },
          tone: { type: "string", description: "e.g. professional, casual, bold" },
          duration_days: { type: "number", description: "Campaign duration in days" },
          key_offers_or_topics: { type: "array", items: { type: "string" } },
        },
        required: ["objective"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_marketing_strategy",
      description: "Get the user's latest AI marketing strategy if one exists.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_post_content",
      description: "Generate a social media post with caption, hashtags, CTA. Generates 3 visual options (3 images by default, or 3 video scripts if user asked for video). Use this when user asks to create content, posts, or visuals.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "What the post should be about" },
          tone: { type: "string", description: "Tone: professional, casual, bold, playful, etc." },
          channel: { type: "string", description: "Target channel: instagram, tiktok, facebook, linkedin" },
          campaign_id: { type: "string", description: "Optional campaign ID to associate with" },
          visual_type: { type: "string", enum: ["image", "video"], description: "Set to 'video' if user explicitly asked for a video, otherwise 'image'. Default 'image'." },
        },
        required: ["prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_creative",
      description: "Save a generated creative to the user's library. Use after user confirms/approves a generated post.",
      parameters: {
        type: "object",
        properties: {
          caption: { type: "string" },
          hashtags: { type: "array", items: { type: "string" } },
          visual_url: { type: "string" },
          content_type: { type: "string", description: "image, video, or text" },
          campaign_id: { type: "string" },
        },
        required: ["caption", "content_type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "schedule_post",
      description: "Schedule a post for publishing at a specific date/time.",
      parameters: {
        type: "object",
        properties: {
          creative_id: { type: "string", description: "ID of the saved creative" },
          scheduled_time: { type: "string", description: "ISO datetime for when to publish" },
          platforms: { type: "array", items: { type: "string" }, description: "Platforms to publish on" },
        },
        required: ["creative_id", "scheduled_time", "platforms"],
      },
    },
  },
];

function normalizeCampaignGoal(input: unknown): string {
  const value = String(input || "").toLowerCase();
  if (value.includes("lead")) return "leads";
  if (value.includes("sale") || value.includes("conversion")) return "sales";
  if (value.includes("traffic") || value.includes("website")) return "traffic";
  if (value.includes("engage") || value.includes("community")) return "engagement";
  return "awareness";
}

function inferChannelFromPrompt(prompt: string): string {
  const value = prompt.toLowerCase();
  if (value.includes("linkedin")) return "linkedin";
  if (value.includes("facebook") || value.includes("meta")) return "facebook";
  if (value.includes("tiktok")) return "tiktok";
  if (value.includes("twitter") || value.includes("x ")) return "twitter";
  return "instagram";
}

function inferToneFromPrompt(prompt: string): string {
  const value = prompt.toLowerCase();
  if (value.includes("premium")) return "premium";
  if (value.includes("playful")) return "playful";
  if (value.includes("bold")) return "bold";
  if (value.includes("casual")) return "casual";
  if (value.includes("educational")) return "educational";
  return "professional";
}

function isCampaignRequest(prompt: string): boolean {
  const value = prompt.toLowerCase();
  return /\b(campaign)\b/.test(value) && /\b(create|launch|start|new|generate)\b/.test(value);
}

function isContentGenerationRequest(prompt: string): boolean {
  const value = prompt.toLowerCase();
  return /\b(create|generate|write|make|draft)\b/.test(value) && /\b(post|content|caption|ad|visual|image|video)\b/.test(value);
}

function inferVisualType(prompt: string): "image" | "video" {
  const value = prompt.toLowerCase();
  return value.includes("video") || value.includes("reel") ? "video" : "image";
}

function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

// Execute tool calls against the database
async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  userId: string,
  supabaseAdmin: ReturnType<typeof createClient>
): Promise<string> {
  try {
    switch (toolName) {
      case "get_brand_profile": {
        const { data } = await supabaseAdmin
          .from("brand_profiles")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();
        return JSON.stringify(data || { message: "No brand profile found. Suggest the user scan their website/Instagram in Account settings." });
      }
      case "get_campaigns": {
        const limit = (args.limit as number) || 5;
        const { data } = await supabaseAdmin
          .from("campaigns")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(limit);
        return JSON.stringify(data || []);
      }
      case "get_recent_creatives": {
        const limit = (args.limit as number) || 10;
        let query = supabaseAdmin.from("creatives").select("*").eq("user_id", userId);
        if (args.campaign_id) query = query.eq("campaign_id", args.campaign_id);
        const { data } = await query.order("created_at", { ascending: false }).limit(limit);
        return JSON.stringify(data || []);
      }
      case "get_scheduled_posts": {
        const limit = (args.limit as number) || 10;
        const { data } = await supabaseAdmin
          .from("scheduled_posts")
          .select("*, creatives(*)")
          .eq("user_id", userId)
          .order("scheduled_time", { ascending: true })
          .limit(limit);
        return JSON.stringify(data || []);
      }
      case "get_account_info": {
        const [profile, company, balance, connections] = await Promise.all([
          supabaseAdmin.from("profiles").select("*").eq("id", userId).single(),
          supabaseAdmin.from("company_details").select("*").eq("user_id", userId).single(),
          supabaseAdmin.from("user_balance").select("*").eq("user_id", userId).single(),
          supabaseAdmin.from("social_connections_safe").select("*").eq("user_id", userId),
        ]);
        return JSON.stringify({
          profile: profile.data,
          company: company.data,
          balance: balance.data,
          social_connections: connections.data || [],
        });
      }
      case "get_content_stats": {
        const [total, saved, types] = await Promise.all([
          supabaseAdmin.from("creatives").select("id", { count: "exact", head: true }).eq("user_id", userId),
          supabaseAdmin.from("creatives").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("saved", true),
          supabaseAdmin.from("creatives").select("content_type, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
        ]);
        const typeBreakdown: Record<string, number> = {};
        (types.data || []).forEach((c: any) => {
          typeBreakdown[c.content_type] = (typeBreakdown[c.content_type] || 0) + 1;
        });
        return JSON.stringify({
          total_creatives: total.count || 0,
          saved_creatives: saved.count || 0,
          content_type_breakdown: typeBreakdown,
          recent_activity: (types.data || []).slice(0, 5),
        });
      }
      case "update_company_details": {
        const updates: Record<string, unknown> = {};
        for (const key of ["company_name", "business_type", "target_audience", "location", "website"]) {
          if (args[key] !== undefined) updates[key] = args[key];
        }
        if (Object.keys(updates).length === 0) return JSON.stringify({ error: "No fields to update" });
        const { data, error } = await supabaseAdmin
          .from("company_details")
          .upsert({ user_id: userId, ...updates }, { onConflict: "user_id" })
          .select()
          .single();
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify({ success: true, updated: data });
      }
      case "create_campaign": {
        const rawObjective = String(args.objective || "").trim();
        const { data, error } = await supabaseAdmin.from("campaigns").insert({
          user_id: userId,
          objective: normalizeCampaignGoal(args.objective),
          channels: (args.channels as string[]) || ["instagram"],
          tone: (args.tone as string) || "professional",
          duration_days: (args.duration_days as number) || 30,
          key_offers_or_topics: [
            ...(((args.key_offers_or_topics as string[]) || [])),
            ...(rawObjective ? [rawObjective] : []),
          ].slice(0, 8),
          content_mix: {
            goal: normalizeCampaignGoal(args.objective),
            campaignName: rawObjective || "New campaign",
          },
          status: "active",
        }).select().single();
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify({ success: true, campaign: data });
      }
      case "get_marketing_strategy": {
        const { data } = await supabaseAdmin
          .from("marketing_strategies")
          .select("strategy_data, is_active, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();
        return JSON.stringify(data || { message: "No marketing strategy generated yet. Suggest visiting the Dashboard to create one." });
      }
      case "generate_post_content": {
        // Fetch brand profile for context
        const { data: brand } = await supabaseAdmin
          .from("brand_profiles")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        const { data: company } = await supabaseAdmin
          .from("company_details")
          .select("*")
          .eq("user_id", userId)
          .single();

        const brandContext = brand ? `Brand: ${brand.brand_name || ''}, Tone: ${brand.tone_of_voice || ''}, Colors: ${(brand.primary_colors || []).join(', ')}` : '';
        const companyContext = company ? `Company: ${company.company_name || ''}, Industry: ${company.business_type || ''}, Audience: ${company.target_audience || ''}` : '';

        const tone = (args.tone as string) || brand?.tone_of_voice || "professional";
        const channel = (args.channel as string) || "instagram";
        const visualType = ((args.visual_type as string) || "image").toLowerCase();
        const prompt = args.prompt as string;
        const OPENAI_KEY = await resolveOpenAIKey(userId);
        const IMAGE_KEY = await resolveImageKey(userId);

        // Generate text content (caption + hashtags + CTA)
        const textRes = await chatAI({
          messages: [
            {
              role: "system",
              content: `You are a social media copywriter. Generate a ${channel} post. ${brandContext} ${companyContext}
Tone: ${tone}. Return ONLY valid JSON: {"caption":"...","hashtags":["..."],"cta":"..."}`
            },
            { role: "user", content: prompt }
          ],
        }, OPENAI_KEY);
        const textData = await textRes.json();
        let postContent = { caption: "", hashtags: [] as string[], cta: "" };
        try {
          const raw = textData.choices?.[0]?.message?.content || "";
          const jsonMatch = raw.match(/\{[\s\S]*\}/);
          if (jsonMatch) postContent = JSON.parse(jsonMatch[0]);
        } catch { /* fallback */ }

        const brandColors = (brand?.primary_colors || []).slice(0, 3);
        const colorHint = brandColors.length ? `. Use brand colors: ${brandColors.join(', ')}` : '';

        // 3 distinct style angles for diversity
        const styleAngles = visualType === "video"
          ? [
              "cinematic, slow camera push-in, soft natural lighting",
              "dynamic, fast cuts, energetic motion, vibrant",
              "minimal, clean static product hero with subtle motion",
            ]
          : [
              "bold, vibrant, eye-catching composition",
              "minimal, clean, lots of whitespace, editorial",
              "lifestyle, warm, human, candid feel",
            ];

        const variants: Array<{ url: string | null; style: string; script?: string }> = [];
        let hfPending = false;

        if (visualType === "video") {
          const videoPrompt = [
            prompt,
            brandContext,
            `Create a polished ${channel} social video: clear motion, premium composition, platform-native pacing.`,
          ].filter(Boolean).join("\n\n");
          // Primary: Higgsfield (async → saved to the user's Library when ready).
          if (hasHiggsfield()) {
            hfPending = await higgsfieldEnqueue("video", videoPrompt, userId, { aspectRatio: "9:16", caption: prompt });
          }
          // Fallback: VargAI (synchronous).
          if (!hfPending && !variants.length) {
            const vargKey = await resolveVargKey(userId);
            if (vargKey) {
              try {
                const varg = await generateVargVideo({ prompt: videoPrompt, apiKey: vargKey, aspectRatio: "9:16" });
                if (varg?.url) variants.push({ url: varg.url, style: "VargAI cinematic" });
              } catch (e) {
                console.warn("Varg video generation failed in chat:", e);
              }
            }
          }
          // If nothing else, short script drafts.
          if (!hfPending && !variants.length) {
            for (let i = 0; i < 3; i++) {
              try {
                const scriptRes = await chatAI({
                  messages: [
                    { role: "system", content: `You write short 15-second ${channel} video scripts. Style: ${styleAngles[i]}. ${brandContext}. Return only the script — scene-by-scene, max 80 words.` },
                    { role: "user", content: prompt },
                  ],
                }, OPENAI_KEY);
                const sd = await scriptRes.json();
                const script = sd.choices?.[0]?.message?.content || "";
                variants.push({ url: null, style: styleAngles[i], script });
              } catch { /* skip */ }
            }
          }
        } else {
          // Images — Higgsfield primary (async → Library), OpenAI DALL-E fallback (inline).
          if (hasHiggsfield()) {
            hfPending = await higgsfieldEnqueue("image", `Create a ${channel} social media visual for: ${prompt}${colorHint}. Modern, professional.`, userId, { aspectRatio: "1:1", caption: prompt });
          } else if (IMAGE_KEY) {
            const imageResults = await Promise.all(styleAngles.map((style) =>
              openaiImageUrl(IMAGE_KEY, `Create a ${channel} social media visual for: ${prompt}${colorHint}. Style: ${style}. Modern, professional.`)
            ));
            imageResults.forEach((url, i) => { if (url) variants.push({ url, style: styleAngles[i] }); });
          }
        }

        const marker = variants.length
          ? ` Then APPEND this exact marker on its own line at the end so the UI can render the gallery picker: <<VARIANTS:${JSON.stringify(variants)}>>`
          : "";
        const pendingNote = hfPending
          ? `The ${visualType} is being generated with Higgsfield and will appear in the user's Library in a minute or two. Tell them that clearly.`
          : "";
        return JSON.stringify({
          generated: true,
          caption: postContent.caption,
          hashtags: postContent.hashtags,
          cta: postContent.cta,
          channel,
          tone,
          visual_type: visualType,
          variants,
          pending: hfPending,
          message: `Generated a ${channel} post caption + hashtags. ${pendingNote} Present a brief intro, the caption, and hashtags.${marker}`
        });
      }
      case "save_creative": {
        const { data, error } = await supabaseAdmin.from("creatives").insert({
          user_id: userId,
          caption: args.caption as string,
          hashtags: (args.hashtags as string[]) || [],
          visual_url: (args.visual_url as string) || null,
          content_type: (args.content_type as string) || "image",
          campaign_id: (args.campaign_id as string) || null,
          saved: true,
        }).select().single();
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify({ success: true, creative_id: data.id, message: "Creative saved to library." });
      }
      case "schedule_post": {
        const { data, error } = await supabaseAdmin.from("scheduled_posts").insert({
          user_id: userId,
          creative_id: (args.creative_id as string),
          scheduled_time: (args.scheduled_time as string),
          platforms: (args.platforms as string[]) || ["instagram"],
          status: "scheduled",
        }).select().single();
        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify({ success: true, post_id: data.id, scheduled_time: data.scheduled_time });
      }
      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : "Tool execution failed" });
  }
}

// Prefetch a compact snapshot of the user's workspace so the assistant is always
// grounded in their real brand, data and strategy — not guessing.
async function loadWorkspaceContext(userId: string, admin: any): Promise<string> {
  const safe = async <T>(p: Promise<T>, fb: T): Promise<T> => { try { return await p; } catch { return fb; } };
  const dataOf = (r: any) => (r && "data" in r ? r.data : null);

  const [companyR, profileR, campaignsR, savedR, totalR, schedR, reportR] = await Promise.all([
    safe(admin.from("company_details").select("*").eq("user_id", userId).maybeSingle(), { data: null }),
    safe(admin.from("profiles").select("active_brand_id, full_name").eq("id", userId).maybeSingle(), { data: null }),
    safe(admin.from("campaigns").select("name,status,objective,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(6), { data: [] }),
    safe(admin.from("creatives").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("saved", true), { count: 0 }),
    safe(admin.from("creatives").select("id", { count: "exact", head: true }).eq("user_id", userId), { count: 0 }),
    safe(admin.from("scheduled_posts").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "scheduled"), { count: 0 }),
    safe(admin.from("strategy_reports").select("title,research_report,prompt_score,resolved_competitors,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(), { data: null }),
  ]);

  const company: any = dataOf(companyR);
  const profile: any = dataOf(profileR);
  let brand: any = null;
  const activeId = profile?.active_brand_id;
  if (activeId) brand = dataOf(await safe(admin.from("brand_profiles").select("*").eq("id", activeId).maybeSingle(), { data: null }));
  if (!brand) brand = dataOf(await safe(admin.from("brand_profiles").select("*").eq("user_id", userId).order("scraped_at", { ascending: false }).limit(1).maybeSingle(), { data: null }));

  const campaigns: any[] = (campaignsR as any)?.data || [];
  const report: any = dataOf(reportR);

  const lines: string[] = [];
  const name = brand?.brand_name || company?.company_name;
  const industry = brand?.industry || company?.business_type;
  if (name) lines.push(`- Business: **${name}**${industry ? ` (${industry})` : ""}`);
  const audience = brand?.target_audience_signals || company?.target_audience;
  if (audience) lines.push(`- Target audience: ${audience}`);
  const location = brand?.location || company?.location;
  if (location) lines.push(`- Location: ${location}`);
  if (brand?.tone_of_voice) lines.push(`- Brand tone: ${brand.tone_of_voice}`);
  if (brand?.visual_style) lines.push(`- Visual style: ${brand.visual_style}`);
  const colors = [...(brand?.primary_colors || []), ...(brand?.secondary_colors || [])].filter(Boolean).slice(0, 4);
  if (colors.length) lines.push(`- Brand colours: ${colors.join(", ")}`);
  lines.push(campaigns.length
    ? `- Campaigns (${campaigns.length}): ${campaigns.map((c) => `${c.name || "Untitled"} [${c.status || "?"}]`).join("; ")}`
    : `- Campaigns: none yet`);
  lines.push(`- Library: ${(totalR as any)?.count ?? 0} creatives (${(savedR as any)?.count ?? 0} saved) · ${(schedR as any)?.count ?? 0} scheduled posts`);

  if (report?.research_report) {
    const r = report.research_report || {};
    const strat = r.strategy || {};
    const comp = r.competitor_analysis || {};
    lines.push(`- MARKETING STRATEGY REPORT on file${report.prompt_score ? ` (quality ${report.prompt_score}/100)` : ""} — use it:`);
    if (strat.recommended_angle) lines.push(`    • Recommended angle: ${strat.recommended_angle}`);
    if (Array.isArray(strat.recommended_hooks) && strat.recommended_hooks.length) lines.push(`    • Hooks that work: ${strat.recommended_hooks.slice(0, 4).join("; ")}`);
    if (Array.isArray(strat.recommended_formats) && strat.recommended_formats.length) lines.push(`    • Best formats: ${strat.recommended_formats.slice(0, 4).join(", ")}`);
    if (Array.isArray(comp.patterns_to_emulate) && comp.patterns_to_emulate.length) lines.push(`    • Competitor patterns to emulate: ${comp.patterns_to_emulate.slice(0, 3).join("; ")}`);
    if (Array.isArray(comp.gaps_to_exploit) && comp.gaps_to_exploit.length) lines.push(`    • Gaps to exploit: ${comp.gaps_to_exploit.slice(0, 3).join("; ")}`);
  } else {
    lines.push(`- No marketing strategy report yet — proactively offer to build one (it analyses their brand + real competitors and makes every campaign sharper).`);
  }

  // Setup completeness — used to gate content generation (see guardrails in prompt).
  const hasBrand = !!(brand && brand.brand_name);
  const hasColors = !!(brand && Array.isArray(brand.primary_colors) && brand.primary_colors.length);
  const hasReport = !!report?.research_report;
  const missing: string[] = [];
  if (!hasBrand) missing.push("a brand profile");
  if (!hasColors) missing.push("brand colours");
  if (!hasReport) missing.push("a competitor/strategy report");
  const setupComplete = hasBrand && hasColors && hasReport;
  lines.push(setupComplete
    ? `- SETUP STATUS: COMPLETE — brand, colours and strategy report are all in place. You fully understand this brand; generate confidently and on-brand.`
    : `- SETUP STATUS: INCOMPLETE — still missing ${missing.join(", ")}. Before generating polished content, briefly help them finish setup (scan/confirm the brand on the Brands page, set colours, and build the strategy report). You may still advise and plan in chat.`);

  return lines.length ? lines.join("\n") : "(Brand-new account with no data yet — help them finish onboarding: set up their brand and build a strategy report before generating content.)";
}

// Is the account fully set up (brand + colours + strategy report)? Used to gate
// content generation — we don't create content before we understand the brand.
async function checkSetup(userId: string, admin: any): Promise<{ complete: boolean; missing: string[]; brandName: string }> {
  const safe = async <T>(p: Promise<T>, fb: T): Promise<T> => { try { return await p; } catch { return fb; } };
  const [profR, brandsR, reportR] = await Promise.all([
    safe(admin.from("profiles").select("active_brand_id").eq("id", userId).maybeSingle(), { data: null }),
    safe(admin.from("brand_profiles").select("id,brand_name,primary_colors").eq("user_id", userId), { data: [] }),
    safe(admin.from("strategy_reports").select("id").eq("user_id", userId).limit(1), { data: [] }),
  ]);
  const brands: any[] = (brandsR as any).data || [];
  const activeId = (profR as any).data?.active_brand_id;
  const brand = brands.find((b) => b.id === activeId) || brands[0] || null;
  const hasBrand = !!(brand && brand.brand_name);
  const hasColors = !!(brand && Array.isArray(brand.primary_colors) && brand.primary_colors.length);
  const hasReport = (((reportR as any).data) || []).length > 0;
  const missing: string[] = [];
  if (!hasBrand) missing.push("a brand profile");
  if (!hasColors) missing.push("your brand colours");
  if (!hasReport) missing.push("a competitor/strategy report");
  return { complete: hasBrand && hasColors && hasReport, missing, brandName: brand?.brand_name || "your brand" };
}

function looksLikeContentRequest(msg: string): boolean {
  const m = String(msg).toLowerCase();
  return /\b(create|generate|make|write|draft|produce|design|launch)\b/.test(m)
    && /\b(post|content|caption|image|images|video|reel|photo|photos|ad|ads|carousel|story|campaign)\b/.test(m);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    // Validate user
    const token = authHeader.replace("Bearer ", "");
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const OPENAI_KEY = await resolveOpenAIKey(user.id);
    if (!OPENAI_KEY && !hasClaude()) {
      return new Response(
        JSON.stringify({ error: "No AI provider configured. Add your OpenAI API key in Account → API Keys." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { messages } = await req.json();
    const latestUserMessage = [...messages].reverse().find((message: any) => message.role === "user")?.content || "";

    // GUARDRAIL: never generate content before we understand the brand.
    if (typeof latestUserMessage === "string" && looksLikeContentRequest(latestUserMessage)) {
      const setup = await checkSetup(user.id, supabaseAdmin);
      if (!setup.complete) {
        const wantsReport = /\b(a competitor\/strategy report)\b/.test(setup.missing.join(", "));
        const content = `Before I create content, let's make sure I truly understand **${setup.brandName}** — right now I'm still missing ${setup.missing.join(", ")}.\n\nGreat content comes from knowing your brand, its colours and its competitors — otherwise it's just generic. ${wantsReport ? "Want me to **build your strategy report** now? I'll analyse your brand and real competitors so everything I make is sharp and on-brand." : "Head to the **Brands** page to confirm your brand and colours."} Once that's in place, I'll create content that actually fits **${setup.brandName}**.`;
        return new Response(JSON.stringify({ content, setup_incomplete: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (typeof latestUserMessage === "string" && isCampaignRequest(latestUserMessage)) {
      const channel = inferChannelFromPrompt(latestUserMessage);
      const tone = inferToneFromPrompt(latestUserMessage);

      const campaignResultRaw = await executeTool(
        "create_campaign",
        {
          objective: latestUserMessage,
          channels: [channel],
          tone,
          duration_days: 30,
          key_offers_or_topics: [latestUserMessage],
        },
        user.id,
        supabaseAdmin,
      );
      const campaignResult = safeJsonParse<any>(campaignResultRaw, { error: "Campaign creation failed" });
      if (campaignResult?.error) {
        return new Response(JSON.stringify({ error: campaignResult.error }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const sampleResultRaw = await executeTool(
        "generate_post_content",
        {
          prompt: latestUserMessage,
          tone,
          channel,
          campaign_id: campaignResult?.campaign?.id,
          visual_type: "image",
        },
        user.id,
        supabaseAdmin,
      );
      const sampleResult = safeJsonParse<any>(sampleResultRaw, { caption: "", hashtags: [], cta: "", variants: [] });
      const variants = Array.isArray(sampleResult?.variants) ? sampleResult.variants : [];
      const hashtags = Array.isArray(sampleResult?.hashtags) ? sampleResult.hashtags.map((tag: string) => tag.startsWith("#") ? tag : `#${tag}`) : [];
      const variantMarker = variants.length ? `\n\n<<VARIANTS:${JSON.stringify(variants)}>>` : "";
      const content = [
        `Campaign created for **${channel}** with a **${tone}** tone.`,
        sampleResult?.caption ? `\n**Sample caption**\n${sampleResult.caption}` : "",
        hashtags.length ? `\n${hashtags.join(" ")}` : "",
        sampleResult?.cta ? `\nCTA: ${sampleResult.cta}` : "",
        `\nWant me to adjust the angle or generate more options?`,
        variantMarker,
      ]
        .filter(Boolean)
        .join("\n");

      return new Response(JSON.stringify({ content }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (typeof latestUserMessage === "string" && isContentGenerationRequest(latestUserMessage)) {
      const channel = inferChannelFromPrompt(latestUserMessage);
      const tone = inferToneFromPrompt(latestUserMessage);
      const visualType = inferVisualType(latestUserMessage);

      const sampleResultRaw = await executeTool(
        "generate_post_content",
        {
          prompt: latestUserMessage,
          tone,
          channel,
          visual_type: visualType,
        },
        user.id,
        supabaseAdmin,
      );
      const sampleResult = safeJsonParse<any>(sampleResultRaw, {
        caption: "",
        hashtags: [],
        cta: "",
        variants: [],
        error: "Content generation failed",
      });

      if (sampleResult?.error) {
        return new Response(JSON.stringify({ error: sampleResult.error }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const variants = Array.isArray(sampleResult?.variants) ? sampleResult.variants : [];
      const hashtags = Array.isArray(sampleResult?.hashtags)
        ? sampleResult.hashtags.map((tag: string) => (tag.startsWith("#") ? tag : `#${tag}`))
        : [];
      const variantMarker = variants.length ? `\n\n<<VARIANTS:${JSON.stringify(variants)}>>` : "";
      const content = [
        `Here’s a fresh **${channel}** draft in a **${tone}** tone.`,
        sampleResult?.caption ? `\n**Draft**\n${sampleResult.caption}` : "",
        hashtags.length ? `\n${hashtags.join(" ")}` : "",
        sampleResult?.cta ? `\nCTA: ${sampleResult.cta}` : "",
        "\nWant me to regenerate it, tighten the tone, or save it?",
        variantMarker,
      ]
        .filter(Boolean)
        .join("\n");

      return new Response(JSON.stringify({ content }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ground every answer in the user's real workspace data. Open models call
    // tools unreliably, so we prefetch a compact snapshot and put it in context.
    const workspaceSummary = await loadWorkspaceContext(user.id, supabaseAdmin);

    const systemPrompt = `You are AIson — a senior AI marketing strategist and hands-on partner for this business. You are sharp, proactive, and genuinely helpful: you give real advice, explain your reasoning briefly, and help the user think through and structure their marketing. You also DO things directly with your tools (create campaigns, generate content, schedule posts) — you are not just a chatbot.

# WHO YOU'RE HELPING (their live workspace)
${workspaceSummary}

# HOW YOU OPERATE
- Be genuinely useful, not curt. Give substantive, specific advice grounded in THIS business's brand, audience, data, and strategy report above — never generic filler. Reference their real brand name, audience, campaigns and numbers.
- Match depth to the question: a quick data question gets a tight answer; "how do I grow / structure a campaign / what should I post" gets a thoughtful, structured answer with concrete recommendations and a clear rationale.
- When you give a plan or advice, make it actionable: specific angles, hooks, formats, cadence, CTAs — tailored to their audience and what the strategy report/competitor analysis says works.
- Be consultative: ask a sharp clarifying question when it materially changes your answer, then proceed. Don't interrogate.
- Use **bold** for key numbers, names and takeaways, and short bulleted lists for plans.

# SHOWING DATA & STATISTICS (make it visual)
When the user asks about their numbers/stats/performance, or whenever you present a comparison, breakdown, distribution or trend, render it VISUALLY — never as a wall of numbers:
- **Charts:** emit a fenced code block tagged \`aison:chart\` containing ONLY JSON:
  \`\`\`aison:chart
  {"kind":"donut","title":"Content by type","data":[{"label":"Images","value":8},{"label":"Videos","value":3},{"label":"Text","value":5}]}
  \`\`\`
  kind is one of "pie" | "donut" | "bar" | "line" (use pie/donut for shares of a whole, bar for comparisons, line for trends over time). The frontend renders it as a real chart — don't describe the chart in words too.
- **Tables:** for row/column data (e.g. per-campaign or per-post metrics), use a normal GitHub-flavoured **markdown table** — it now renders as a styled table.
- Only ever chart/tabulate REAL numbers from the workspace context or your tools. Never invent data. If you don't have the numbers, say so and offer to build the report.
- Add one short sentence of insight above the chart/table (what it means / what to do).
- After showing stats, tell them they can tap **"Open full analytics"** for the complete breakdown.
- You can reference their marketing strategy report (competitor patterns to emulate, gaps to exploit, recommended angles/hooks/CTAs). If they don't have one yet, offer to build it — it makes every campaign smarter.

# GUARDRAILS — don't generate blind
- Only generate polished content when SETUP STATUS is COMPLETE (brand + colours + strategy report). If it's INCOMPLETE, don't dump content — instead warmly explain that you'll make far better content once you understand their brand, and help them finish the missing pieces (confirm brand + colours on the Brands page, build the strategy report). Offer to do those steps now.
- Once setup is complete, generate confidently and on-brand.

# PROPOSING CONTENT (not prompts)
- When you create content, PROPOSE the finished content — caption, hooks, hashtags, CTA, and a short note on the visual idea. Do NOT show the long internal image/video generation prompt; it's for the generator, not the user. Only reveal the raw prompt if the user explicitly asks ("show me the prompt").
- Keep proposals scannable and offer clear next steps (save / schedule / regenerate / tweak).

# TAKING ACTION (use tools, don't just talk)
- To create a campaign: confirm channel/tone/objective in one message if missing, then use create_campaign, then offer to generate sample posts.
- To create content/a post: use generate_post_content, present caption + hashtags + CTA (and image if returned), then offer to save/schedule/regenerate. Note: images/videos generate asynchronously and appear in the user's Library — tell them that rather than claiming an image is shown if none is returned.
- To save → save_creative. To schedule → save then schedule_post. To update business/brand info → update_company.
- After an action, confirm in one line and suggest the best next step.
- Everything happens here in chat — never tell the user to "go to another page". If something lives on a page (Library, Brands), reference it naturally but still do the work here.

# STYLE
Warm, confident, concise-but-complete. You sound like an experienced marketer who knows this brand well and wants it to win.`;

    // Build messages for the AI
    const aiMessages = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    // First AI call (may request tool calls)
    let response = await chatAI({ messages: aiMessages, tools }, OPENAI_KEY);

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${status}`);
    }

    let result = await response.json();
    let choice = result.choices?.[0];
    console.log("Initial AI response - finish_reason:", choice?.finish_reason, "has_content:", !!choice?.message?.content, "has_tool_calls:", !!choice?.message?.tool_calls?.length);

    // Handle tool calls (up to 3 rounds)
    let rounds = 0;
    while (choice?.finish_reason === "tool_calls" || choice?.message?.tool_calls?.length) {
      if (rounds++ > 3) break;

      const toolCalls = choice.message.tool_calls;
      aiMessages.push(choice.message);

      // Execute all tool calls in parallel
      const toolResults = await Promise.all(
        toolCalls.map(async (tc: any) => {
          try {
            const args = typeof tc.function.arguments === "string"
              ? JSON.parse(tc.function.arguments)
              : tc.function.arguments || {};
            console.log(`Tool call: ${tc.function.name}`, JSON.stringify(args).slice(0, 200));
            const result = await executeTool(tc.function.name, args, user.id, supabaseAdmin);
            return { role: "tool", tool_call_id: tc.id, content: result };
          } catch (toolErr) {
            console.error(`Tool ${tc.function.name} failed:`, toolErr);
            return { role: "tool", tool_call_id: tc.id, content: JSON.stringify({ error: String(toolErr) }) };
          }
        })
      );

      aiMessages.push(...toolResults);

      // Call AI again with tool results
      response = await chatAI({ messages: aiMessages, tools }, OPENAI_KEY);

      if (!response.ok) {
        console.error(`AI gateway error on tool round ${rounds}: ${response.status}`);
        const errText = await response.text();
        console.error("Error body:", errText);
        throw new Error(`AI gateway error on tool round: ${response.status}`);
      }
      result = await response.json();
      choice = result.choices?.[0];
      console.log(`Round ${rounds} - finish_reason:`, choice?.finish_reason, "has_content:", !!choice?.message?.content);
    }

    // Extract content - handle various response shapes
    let content = choice?.message?.content;
    if (!content && result?.choices?.length) {
      // Try other choices
      for (const c of result.choices) {
        if (c?.message?.content) { content = c.message.content; break; }
      }
    }
    if (!content) {
      console.error("No content in AI response. Full result:", JSON.stringify(result));
      content = "I couldn't generate a response. Please try again.";
    }

    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("agent-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
