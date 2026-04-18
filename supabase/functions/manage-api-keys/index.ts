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

function maskKey(key: string): string {
  if (key.length <= 8) return "••••" + key.slice(-4);
  return key.slice(0, 4) + "••••" + key.slice(-4);
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

    const { action, id, service_name, api_key, is_default } = await req.json();

    if (action === "list") {
      const { data: keys, error } = await supabase
        .from("api_keys")
        .select("id, service_name, api_key, is_default, created_at, updated_at")
        .eq("user_id", user.id);

      if (error) throw error;

      const maskedKeys = (keys || []).map(k => ({
        ...k,
        api_key: maskKey(k.api_key.length > 20 ? "encrypted" : k.api_key),
        api_key_preview: k.api_key.startsWith("eyJ") || k.api_key.length > 100
          ? maskKey("encrypted-key")
          : maskKey(k.api_key),
      }));

      // Try to decrypt for proper masking
      const result = [];
      for (const k of keys || []) {
        let displayKey = k.api_key;
        try {
          displayKey = await decrypt(k.api_key);
        } catch {
          // Not encrypted yet (legacy), use raw value
        }
        result.push({
          id: k.id,
          service_name: k.service_name,
          is_default: k.is_default,
          created_at: k.created_at,
          updated_at: k.updated_at,
          api_key_masked: maskKey(displayKey),
        });
      }

      return new Response(JSON.stringify({ keys: result }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === "create") {
      if (!service_name || !api_key) {
        return new Response(JSON.stringify({ error: "service_name and api_key required" }), {
          status: 400, headers: corsHeaders,
        });
      }
      if (service_name.length > 100 || api_key.length > 500) {
        return new Response(JSON.stringify({ error: "Input too long" }), {
          status: 400, headers: corsHeaders,
        });
      }

      const encryptedKey = await encrypt(api_key);

      const { data, error } = await supabase
        .from("api_keys")
        .insert({
          user_id: user.id,
          service_name: service_name.trim(),
          api_key: encryptedKey,
          is_default: is_default || false,
        })
        .select("id, service_name, is_default, created_at")
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({
        key: { ...data, api_key_masked: maskKey(api_key) },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === "delete") {
      if (!id) {
        return new Response(JSON.stringify({ error: "id required" }), {
          status: 400, headers: corsHeaders,
        });
      }

      // Verify ownership
      const { data: existing } = await supabase
        .from("api_keys")
        .select("id")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();

      if (!existing) {
        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404, headers: corsHeaders,
        });
      }

      const { error } = await supabase
        .from("api_keys")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === "get_decrypted") {
      // Only for server-side use — returns decrypted key for a specific service
      if (!service_name) {
        return new Response(JSON.stringify({ error: "service_name required" }), {
          status: 400, headers: corsHeaders,
        });
      }

      const { data: keyRow } = await supabase
        .from("api_keys")
        .select("api_key")
        .eq("user_id", user.id)
        .eq("service_name", service_name)
        .single();

      if (!keyRow) {
        return new Response(JSON.stringify({ error: "Key not found" }), {
          status: 404, headers: corsHeaders,
        });
      }

      let decryptedKey = keyRow.api_key;
      try {
        decryptedKey = await decrypt(keyRow.api_key);
      } catch {
        // Legacy unencrypted key
      }

      return new Response(JSON.stringify({ api_key: decryptedKey }), {
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
