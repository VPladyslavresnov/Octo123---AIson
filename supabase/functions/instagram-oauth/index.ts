import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { callbackUrl, clientId: userClientId, clientSecret: userClientSecret } = await req.json();

    // Prefer user-provided credentials, fall back to env vars
    const clientId = userClientId || Deno.env.get("INSTAGRAM_CLIENT_ID");
    const redirectUri = `${callbackUrl}?platform=instagram`;

    if (!clientId) {
      return new Response(
        JSON.stringify({ 
          error: "Instagram App ID is required. Please enter your Meta App ID and Secret in Account Settings → Connections to connect Instagram." 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Instagram Basic Display API / Instagram Graph API OAuth
    const authUrl = `https://api.instagram.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=user_profile,user_media&response_type=code`;

    return new Response(
      JSON.stringify({ authUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error("Error in instagram-oauth:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to initiate Instagram connection. Please check your credentials." }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
