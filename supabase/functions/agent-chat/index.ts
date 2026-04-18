import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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
        const { data, error } = await supabaseAdmin.from("campaigns").insert({
          user_id: userId,
          objective: args.objective as string,
          channels: (args.channels as string[]) || ["instagram"],
          tone: (args.tone as string) || "professional",
          duration_days: (args.duration_days as number) || 30,
          key_offers_or_topics: (args.key_offers_or_topics as string[]) || [],
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
        const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

        // Generate text content (caption + hashtags + CTA)
        const textRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              {
                role: "system",
                content: `You are a social media copywriter. Generate a ${channel} post. ${brandContext} ${companyContext}
Tone: ${tone}. Return ONLY valid JSON: {"caption":"...","hashtags":["..."],"cta":"..."}`
              },
              { role: "user", content: prompt }
            ],
          }),
        });
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

        if (visualType === "video") {
          // 3 video script variants (lightweight; full video gen happens via separate flow)
          for (let i = 0; i < 3; i++) {
            try {
              const scriptRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
                method: "POST",
                headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                  model: "google/gemini-3-flash-preview",
                  messages: [
                    { role: "system", content: `You write short 15-second ${channel} video scripts. Style: ${styleAngles[i]}. ${brandContext}. Return only the script — scene-by-scene, max 80 words.` },
                    { role: "user", content: prompt },
                  ],
                }),
              });
              const sd = await scriptRes.json();
              const script = sd.choices?.[0]?.message?.content || "";
              variants.push({ url: null, style: styleAngles[i], script });
            } catch { /* skip */ }
          }
        } else {
          // 3 image variants in parallel
          const imagePromises = styleAngles.map((style) =>
            fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash-image",
                messages: [
                  { role: "user", content: `Create a ${channel} social media visual for: ${prompt}${colorHint}. Style: ${style}. Modern, professional.` }
                ],
                modalities: ["image", "text"],
              }),
            }).then(r => r.json()).catch(() => null)
          );
          const imageResults = await Promise.all(imagePromises);
          imageResults.forEach((imgData, i) => {
            const url = imgData?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
            if (url) variants.push({ url, style: styleAngles[i] });
          });
        }

        return JSON.stringify({
          generated: true,
          caption: postContent.caption,
          hashtags: postContent.hashtags,
          cta: postContent.cta,
          channel,
          tone,
          visual_type: visualType,
          variants,
          message: `Generated ${variants.length} ${visualType} options. Present a brief intro, the caption, and hashtags. Then APPEND this exact marker on its own line at the end so the UI can render the gallery picker: <<VARIANTS:${JSON.stringify(variants)}>>`
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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

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

    const { messages } = await req.json();

    const systemPrompt = `You are AIson — an all-in-one AI marketing agent. EVERYTHING happens here in chat. Never tell users to go to another page.

RULES:
1. Be SHORT. 2-4 sentences for simple answers.
2. NEVER use markdown tables. Present data naturally in sentences.
3. Bold key numbers and names: **5 campaigns**, **3.2%** engagement.
4. DO actions immediately with tools — never explain what you "would" do.
5. After an action, confirm in ONE line + suggest one next step.
6. Skip pleasantries. Just answer.
7. Write like you're texting a busy CEO.

CONTENT GENERATION FLOW:
When user asks to create content, a post, or a campaign with content:
1. Use generate_post_content tool immediately with their request
2. Present the result as a preview:
   - Show the image using markdown: ![Post preview](image_url)
   - Show the caption in **bold**
   - Show hashtags
   - Show the CTA
3. Ask: "Want me to **save** this, **schedule** it, or **regenerate** with changes?"
4. If they approve → use save_creative to save it
5. If they want to schedule → save first, then use schedule_post
6. If they want changes → regenerate with updated prompt

CAMPAIGN FLOW:
When user asks to launch/create a campaign:
1. Quickly confirm: channel, tone, objective (ask in ONE message if missing)
2. Create the campaign with create_campaign
3. Immediately generate 1-2 sample posts using generate_post_content
4. Show previews and ask if they want more or want to adjust

NEVER say "go to Content Studio" or "visit the Dashboard" — do everything here.`;

    // Build messages for the AI
    const aiMessages = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    // First AI call (may request tool calls)
    let response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: aiMessages,
        tools,
      }),
    });

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
      response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: aiMessages,
          tools,
        }),
      });

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
