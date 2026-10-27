import { claudeChatCompletion, hasClaude } from "../_shared/claude.ts";
import { openaiChatCompletion, resolveOpenAIKey } from "../_shared/openai.ts";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BrandIdentity {
  colors: {
    primary: string;
    secondary: string;
    accent?: string;
    background?: string;
  };
  logo?: string;
  fonts?: string[];
  extractionSuccess: boolean;
  message?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ 
          extractionSuccess: false, 
          message: 'URL is required',
          colors: { primary: '#FF6B35', secondary: '#004E89' }
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format URL
    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    
    // If Firecrawl is not configured, use AI to analyze the brand
    if (!firecrawlApiKey) {
      console.log('Firecrawl not configured, using AI analysis');

      const openaiKey = await resolveOpenAIKey(null);
      if (!openaiKey && !hasClaude()) {
        return new Response(
          JSON.stringify({
            extractionSuccess: false,
            message: 'Brand extraction service not configured. Using default colors.',
            colors: { primary: '#FF6B35', secondary: '#004E89' }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Use AI to generate brand-appropriate colors based on the URL/domain
      const domain = new URL(formattedUrl).hostname;
      
      const aiBody = {
          model: 'google/gemini-2.5-flash',
          messages: [
            {
              role: 'user',
              content: `Analyze the domain "${domain}" and suggest appropriate brand colors. Return ONLY a JSON object with this exact structure (no markdown, no explanation):
{"primary": "#HEXCODE", "secondary": "#HEXCODE", "accent": "#HEXCODE"}

Consider the industry/type of business the domain name suggests. Use professional, modern color palettes.`
            }
          ]
      };

      // Claude when configured, otherwise OpenAI
      const aiResponse = hasClaude()
        ? await claudeChatCompletion({ messages: aiBody.messages, response_format: { type: "json_object" } })
        : await openaiChatCompletion(openaiKey!, { messages: aiBody.messages, response_format: { type: "json_object" } });

      if (!aiResponse.ok) {
        return new Response(
          JSON.stringify({
            extractionSuccess: false,
            message: 'Could not analyze brand. Using default colors.',
            colors: { primary: '#FF6B35', secondary: '#004E89' }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const aiData = await aiResponse.json();
      const content = aiData.choices?.[0]?.message?.content || '';
      
      try {
        // Extract JSON from the response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const colors = JSON.parse(jsonMatch[0]);
          return new Response(
            JSON.stringify({
              extractionSuccess: true,
              message: 'Colors generated based on domain analysis',
              colors: {
                primary: colors.primary || '#FF6B35',
                secondary: colors.secondary || '#004E89',
                accent: colors.accent
              }
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (parseError) {
        console.error('Failed to parse AI response:', parseError);
      }

      return new Response(
        JSON.stringify({
          extractionSuccess: false,
          message: 'Could not parse brand colors. Using defaults.',
          colors: { primary: '#FF6B35', secondary: '#004E89' }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use Firecrawl to extract branding
    console.log('Extracting brand identity from:', formattedUrl);

    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: formattedUrl,
        formats: ['branding'],
        onlyMainContent: true,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      console.error('Firecrawl API error:', data);
      return new Response(
        JSON.stringify({
          extractionSuccess: false,
          message: 'Could not extract brand identity. Using default colors.',
          colors: { primary: '#FF6B35', secondary: '#004E89' }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const branding = data.data?.branding || data.branding;

    if (!branding || !branding.colors) {
      return new Response(
        JSON.stringify({
          extractionSuccess: false,
          message: 'No branding information found. Using default colors.',
          colors: { primary: '#FF6B35', secondary: '#004E89' }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const brandIdentity: BrandIdentity = {
      extractionSuccess: true,
      message: 'Brand identity extracted successfully',
      colors: {
        primary: branding.colors.primary || '#FF6B35',
        secondary: branding.colors.secondary || '#004E89',
        accent: branding.colors.accent,
        background: branding.colors.background,
      },
      logo: branding.images?.logo || branding.logo,
      fonts: branding.fonts?.map((f: any) => f.family) || []
    };

    console.log('Brand identity extracted:', brandIdentity);

    return new Response(
      JSON.stringify(brandIdentity),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error extracting brand identity:', error);
    return new Response(
      JSON.stringify({
        extractionSuccess: false,
        message: 'Failed to extract brand identity. Using default colors.',
        colors: { primary: '#FF6B35', secondary: '#004E89' }
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});