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
    const { callbackUrl, clientId: userClientId } = await req.json();

    const clientId = userClientId || Deno.env.get("FACEBOOK_APP_ID");
    const redirectUri = `${callbackUrl}?platform=facebook`;

    if (!clientId) {
      return new Response(
        JSON.stringify({ 
          error: "Facebook App ID is required. Please enter your Meta App ID and Secret in Account Settings → Connections to connect Facebook." 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=pages_manage_posts,pages_read_engagement&response_type=code`;

    return new Response(
      JSON.stringify({ authUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error("Error in facebook-oauth:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to initiate Facebook connection. Please check your credentials." }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
