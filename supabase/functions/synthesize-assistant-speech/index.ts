import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { synthesizeAssistantSpeech } from "../_shared/openaiTts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authorization required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return new Response(JSON.stringify({ error: "Service temporarily unavailable" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;
    const { text, voice, speed } = await req.json();
    const input = String(text || "").trim();

    if (!input) {
      return new Response(JSON.stringify({ error: "Text is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: companyDetails } = await supabase
      .from("company_details")
      .select("assistant_voice, assistant_voice_speed, assistant_voice_enabled")
      .eq("user_id", userId)
      .maybeSingle();

    if (companyDetails?.assistant_voice_enabled === false) {
      return new Response(
        JSON.stringify({
          audioBase64: null,
          audioMimeType: null,
          audioError: true,
          disabled: true,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const audioBytes = await synthesizeAssistantSpeech(input, {
      voice: voice || companyDetails?.assistant_voice || undefined,
      speed: typeof speed === "number" ? speed : companyDetails?.assistant_voice_speed ?? undefined,
    });

    let binary = "";
    audioBytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    const audioBase64 = btoa(binary);

    return new Response(
      JSON.stringify({
        audioBase64,
        audioMimeType: "audio/wav",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in synthesize-assistant-speech:", error);
    return new Response(JSON.stringify({ error: "Failed to synthesize assistant speech" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
