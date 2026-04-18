import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

async function getEncryptionKey(): Promise<CryptoKey> {
  const masterKeyB64 = Deno.env.get("ENCRYPTION_MASTER_KEY");
  if (!masterKeyB64) throw new Error("Encryption key not configured");
  const rawKey = Uint8Array.from(atob(masterKeyB64), c => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encrypt(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function decrypt(encryptedB64: string): Promise<string> {
  const key = await getEncryptionKey();
  const combined = Uint8Array.from(atob(encryptedB64), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { action, platform, access_token, account_name } = await req.json();

    if (action === "store") {
      if (!platform || !access_token) {
        return new Response(JSON.stringify({ error: "platform and access_token required" }), {
          status: 400, headers: corsHeaders,
        });
      }
      if (platform.length > 50 || access_token.length > 2000) {
        return new Response(JSON.stringify({ error: "Input too long" }), {
          status: 400, headers: corsHeaders,
        });
      }

      const encryptedToken = await encrypt(access_token);

      const { data, error } = await supabase
        .from("social_connections")
        .upsert({
          user_id: user.id,
          platform: platform.trim(),
          access_token_encrypted: encryptedToken,
          account_name: account_name || null,
          connected_at: new Date().toISOString(),
        }, { onConflict: "user_id,platform" })
        .select("id, platform, account_name, connected_at")
        .single();

      if (error) {
        // If upsert fails due to no unique constraint, try insert
        const { data: insertData, error: insertError } = await supabase
          .from("social_connections")
          .insert({
            user_id: user.id,
            platform: platform.trim(),
            access_token_encrypted: encryptedToken,
            account_name: account_name || null,
          })
          .select("id, platform, account_name, connected_at")
          .single();

        if (insertError) throw insertError;
        return new Response(JSON.stringify({ connection: insertData }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ connection: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === "get_token") {
      // Returns decrypted token for a specific platform — used by posting edge functions
      if (!platform) {
        return new Response(JSON.stringify({ error: "platform required" }), {
          status: 400, headers: corsHeaders,
        });
      }

      const { data: conn } = await supabase
        .from("social_connections")
        .select("access_token_encrypted")
        .eq("user_id", user.id)
        .eq("platform", platform)
        .single();

      if (!conn || !conn.access_token_encrypted) {
        return new Response(JSON.stringify({ error: "Connection not found" }), {
          status: 404, headers: corsHeaders,
        });
      }

      let token = conn.access_token_encrypted;
      try {
        token = await decrypt(conn.access_token_encrypted);
      } catch {
        // Legacy unencrypted token
      }

      return new Response(JSON.stringify({ access_token: token }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400, headers: corsHeaders,
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: "Something went wrong" }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
