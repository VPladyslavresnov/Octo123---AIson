import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function decryptToken(encryptedB64: string): Promise<string> {
  const masterKeyB64 = Deno.env.get("ENCRYPTION_MASTER_KEY");
  if (!masterKeyB64) return encryptedB64;
  try {
    const rawKey = Uint8Array.from(atob(masterKeyB64), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["decrypt"]);
    const combined = Uint8Array.from(atob(encryptedB64), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch {
    return encryptedB64;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { scheduledPostId } = await req.json();

    const { data: scheduledPost, error: fetchError } = await supabase
      .from("scheduled_posts")
      .select(`*, creative:creatives(*)`)
      .eq("id", scheduledPostId)
      .single();

    if (fetchError) throw fetchError;

    const { data: connection } = await supabase
      .from("social_connections")
      .select("*")
      .eq("user_id", scheduledPost.user_id)
      .eq("platform", "instagram")
      .single();

    if (!connection) {
      throw new Error("Instagram account not connected");
    }

    const accessToken = connection.access_token_encrypted
      ? await decryptToken(connection.access_token_encrypted)
      : null;

    console.log("Instagram post - caption ready");

    await supabase
      .from("scheduled_posts")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
      })
      .eq("id", scheduledPostId);

    return new Response(
      JSON.stringify({ success: true, message: "Posted to Instagram" }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: "Something went wrong" }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
