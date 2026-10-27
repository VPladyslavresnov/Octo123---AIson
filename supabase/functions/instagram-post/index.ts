import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptSecret } from "../_shared/crypto.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const META_API_VERSION = Deno.env.get("META_API_VERSION") || "v23.0";
const META_GRAPH_URL = `https://graph.facebook.com/${META_API_VERSION}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { scheduledPostId, creativeId } = await req.json();
    if (!scheduledPostId && !creativeId) {
      return json({ error: "scheduledPostId or creativeId is required" }, 400);
    }

    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;
    if (authHeader) {
      const jwt = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(jwt);
      userId = user?.id || null;
    }

    let scheduledPost: any = null;
    let creative: any = null;

    if (scheduledPostId) {
      const { data, error: fetchError } = await supabase
        .from("scheduled_posts")
        .select(`*, creative:creatives(*)`)
        .eq("id", scheduledPostId)
        .single();

      if (fetchError) throw fetchError;
      scheduledPost = data;
      creative = data.creative;
      userId = userId || data.user_id;
    } else {
      if (!userId) return json({ error: "Unauthorized" }, 401);
      const { data, error: creativeError } = await supabase
        .from("creatives")
        .select("*")
        .eq("id", creativeId)
        .eq("user_id", userId)
        .single();
      if (creativeError) throw creativeError;
      creative = data;
    }

    if (!creative) throw new Error("Creative not found");
    if (!creative.visual_url || !/^https?:\/\//i.test(creative.visual_url)) {
      throw new Error("Instagram publishing requires a publicly accessible image URL.");
    }

    const { data: connection } = await supabase
      .from("social_connections")
      .select("*")
      .eq("user_id", userId)
      .eq("platform", "instagram")
      .single();

    if (!connection) {
      throw new Error("Instagram account not connected");
    }
    if (!connection.platform_account_id) {
      throw new Error("Instagram account ID missing. Reconnect Meta in Posting.");
    }

    const accessToken = connection.access_token_encrypted
      ? await decryptToken(connection.access_token_encrypted)
      : null;
    if (!accessToken) throw new Error("Instagram access token missing. Reconnect Meta in Posting.");

    const caption = buildCaption(creative.caption, creative.hashtags);
    const creationId = await createMediaContainer({
      igUserId: connection.platform_account_id,
      imageUrl: creative.visual_url,
      caption,
      accessToken,
    });
    const publishResult = await publishMediaContainer({
      igUserId: connection.platform_account_id,
      creationId,
      accessToken,
    });

    if (scheduledPostId) {
      await supabase
        .from("scheduled_posts")
        .update({
          status: "published",
          published_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("id", scheduledPostId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Posted to Instagram",
        instagramMediaId: publishResult.id,
        creationId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error("Instagram post failed:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Something went wrong" }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function decryptToken(encryptedB64: string): Promise<string> {
  try {
    return await decryptSecret(encryptedB64);
  } catch {
    return encryptedB64;
  }
}

async function createMediaContainer(args: {
  igUserId: string;
  imageUrl: string;
  caption: string;
  accessToken: string;
}): Promise<string> {
  const body = new URLSearchParams({
    image_url: args.imageUrl,
    caption: args.caption,
    access_token: args.accessToken,
  });

  const response = await fetch(`${META_GRAPH_URL}/${args.igUserId}/media`, {
    method: "POST",
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.id) {
    throw new Error(payload?.error?.message || "Failed to create Instagram media container");
  }
  return payload.id;
}

async function publishMediaContainer(args: {
  igUserId: string;
  creationId: string;
  accessToken: string;
}) {
  const body = new URLSearchParams({
    creation_id: args.creationId,
    access_token: args.accessToken,
  });

  const response = await fetch(`${META_GRAPH_URL}/${args.igUserId}/media_publish`, {
    method: "POST",
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.id) {
    throw new Error(payload?.error?.message || "Failed to publish Instagram media");
  }
  return payload;
}

function buildCaption(caption?: string | null, hashtags?: string[] | null): string {
  const base = (caption || "").trim();
  const tagLine = Array.isArray(hashtags) && hashtags.length
    ? hashtags.map((tag) => tag.startsWith("#") ? tag : `#${tag}`).join(" ")
    : "";
  return [base, tagLine].filter(Boolean).join("\n\n").slice(0, 2200);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
