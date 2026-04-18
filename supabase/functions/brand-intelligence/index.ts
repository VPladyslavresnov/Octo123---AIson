import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface BrandIntelligence {
  brand_name: string | null;
  tagline: string | null;
  brand_description: string | null;
  tone_of_voice: string | null;
  key_messages: string[];
  primary_colors: string[];
  secondary_colors: string[];
  font_style: string | null;
  visual_style: string | null;
  content_themes: string[];
  posting_style: string | null;
  cta_patterns: string[];
  hashtags: string[];
  emoji_usage: boolean;
  content_examples: string[];
  target_audience_signals: string | null;
  industry: string | null;
  location: string | null;
  competitors_mentioned: string[];
}

function isSocialMediaUrl(url: string): boolean {
  const socialDomains = ['instagram.com', 'linkedin.com', 'facebook.com', 'tiktok.com', 'twitter.com', 'x.com'];
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    return socialDomains.some(d => hostname.includes(d));
  } catch {
    return false;
  }
}

function formatUrl(url: string): string {
  let formatted = url.trim();
  if (!formatted.startsWith('http://') && !formatted.startsWith('https://')) {
    formatted = `https://${formatted}`;
  }
  return formatted;
}

async function scrapeWithFirecrawl(url: string, apiKey: string): Promise<any> {
  console.log('Scraping URL:', url);
  const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url,
      formats: ['markdown', 'screenshot', 'links', 'branding'],
      onlyMainContent: true,
      waitFor: 5000,
    }),
  });

  const data = await response.json();
  console.log('Scrape response status:', response.status, 'success:', data.success);
  if (!response.ok || !data.success) {
    const errorMsg = data.error || `Scrape failed with status ${response.status}`;
    console.error('Scrape error:', errorMsg);
    throw new Error(errorMsg);
  }
  return data.data || data;
}

async function analyzeWithAI(scrapedContent: string, url: string, lovableApiKey: string): Promise<BrandIntelligence> {
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${lovableApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'user',
          content: `Analyze this website content and extract brand intelligence. URL: ${url}

CONTENT:
${scrapedContent.slice(0, 8000)}

Return ONLY a valid JSON object (no markdown, no explanation) with these exact fields:
{
  "brand_name": "string or null",
  "tagline": "string or null",
  "brand_description": "one paragraph summary",
  "tone_of_voice": "one of: professional, friendly, playful, bold, authoritative",
  "key_messages": ["array of 3-5 recurring phrases or values"],
  "primary_colors": ["array of hex codes - ONLY the brand's distinctive signature colors used in logos, buttons, accents, and highlights. NEVER include generic colors like black (#000000), white (#FFFFFF), or near-black/near-white/gray shades"],
  "secondary_colors": ["array of hex codes - secondary brand accent colors, again EXCLUDING black, white, and generic grays"],
  "font_style": "serif, sans-serif, modern, or classic",
  "visual_style": "minimalist, vibrant, corporate, or lifestyle",
  "content_themes": ["array of main topics they cover"],
  "posting_style": "educational, promotional, storytelling, or mixed",
  "cta_patterns": ["array of common calls to action"],
  "hashtags": ["array of hashtags if found"],
  "emoji_usage": true or false,
  "content_examples": ["array of 3-5 real copy snippets from the page"],
  "target_audience_signals": "description of who the content targets",
  "industry": "string",
  "location": "string or null if not detectable",
  "competitors_mentioned": ["array of competitor names if any"]
}`
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error('AI analysis failed');
  }

  const aiData = await response.json();
  const content = aiData.choices?.[0]?.message?.content || '';
  
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Could not parse AI response');
  }

  return JSON.parse(jsonMatch[0]);
}

async function scrapeSocialPosts(url: string, apiKey: string): Promise<any> {
  try {
    console.log('Scraping social posts from:', url);
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 8000,
      }),
    });

    const data = await response.json();
    console.log('Social scrape status:', response.status, 'success:', data.success);
    if (!response.ok || !data.success) {
      console.warn('Social scrape failed:', data.error);
      return null;
    }
    return data.data || data;
  } catch (e) {
    console.warn('Social scrape exception:', e);
    return null;
  }
}

// For Instagram and other sites that block scraping, try search-based approach
async function scrapeViaSearch(handle: string, platform: string, apiKey: string): Promise<string | null> {
  try {
    console.log('Trying search-based approach for:', handle, 'on', platform);
    const query = `${handle} ${platform} brand company`;
    const response = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        limit: 5,
        scrapeOptions: { formats: ['markdown'] },
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.success || !data.data?.length) {
      console.warn('Search fallback failed');
      return null;
    }
    // Combine markdown from search results
    const combined = data.data
      .map((r: any) => `Source: ${r.url}\n${r.markdown || r.description || ''}`)
      .join('\n\n---\n\n');
    console.log('Search fallback got', data.data.length, 'results');
    return combined.slice(0, 10000);
  } catch (e) {
    console.warn('Search fallback exception:', e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;

    const { url, force_refresh = false, campaign_id } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const formattedUrl = formatUrl(url);

    // Check cache (7-day expiry) unless force_refresh
    if (!force_refresh) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: cached } = await supabase
        .from('brand_profiles')
        .select('*')
        .eq('user_id', userId)
        .eq('source_url', formattedUrl)
        .gte('scraped_at', sevenDaysAgo)
        .order('scraped_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cached) {
        return new Response(
          JSON.stringify({ success: true, cached: true, data: cached }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    if (!firecrawlApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Brand scanning service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!lovableApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'AI analysis service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Scrape the URL
    let scrapedData: any;
    let markdown = '';
    let screenshot: string | null = null;
    let branding: any = null;

    try {
      scrapedData = await scrapeWithFirecrawl(formattedUrl, firecrawlApiKey);
      markdown = scrapedData.markdown || '';
      screenshot = scrapedData.screenshot || null;
      branding = scrapedData.branding;
    } catch (scrapeError) {
      const msg = scrapeError instanceof Error ? scrapeError.message : '';
      console.warn('Primary scrape failed:', msg);

      // If social URL, try search-based fallback
      if (isSocialMediaUrl(formattedUrl)) {
        try {
          const urlObj = new URL(formattedUrl);
          const pathParts = urlObj.pathname.split('/').filter(Boolean);
          const handle = pathParts[0] || '';
          const platform = urlObj.hostname.replace('www.', '').split('.')[0];
          const searchContent = await scrapeViaSearch(handle, platform, firecrawlApiKey);
          if (searchContent) {
            markdown = searchContent;
            console.log('Using search fallback content for analysis');
          } else {
            return new Response(
              JSON.stringify({
                success: false,
                error: 'social_scrape_failed',
                message: `We couldn't access this ${platform} profile directly. Try entering the brand's website URL instead, or fill in details manually.`
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        } catch {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'social_scrape_failed',
              message: "We couldn't access this social profile. Try entering the brand's website URL instead."
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } else {
        if (msg.includes('blocked') || msg.includes('403') || msg.includes('robots')) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'site_blocked',
              message: "We couldn't scan this site automatically — please fill in your brand details manually"
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        if (msg.includes('private') || msg.includes('login')) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'private_profile',
              message: "This profile is private. Enter a public URL or add your brand details manually"
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify({
            success: false,
            error: 'scrape_failed',
            message: "We couldn't scan this site. Please try again or fill in your brand details manually"
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    if (!markdown || markdown.trim().length < 50) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'insufficient_content',
          message: "Not enough content was found on this page. Try a different URL or fill in your brand details manually."
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Analyze with AI
    let brandData: BrandIntelligence;
    try {
      brandData = await analyzeWithAI(markdown, formattedUrl, lovableApiKey);
    } catch {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'analysis_failed',
          message: "Brand scan completed but analysis failed. Please try again."
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Override AI-guessed colors with Firecrawl's branding extraction (more accurate)
    if (branding?.colors) {
      const firecrawlColors: string[] = [];
      if (branding.colors.primary) firecrawlColors.push(branding.colors.primary);
      if (branding.colors.secondary) firecrawlColors.push(branding.colors.secondary);
      if (branding.colors.accent) firecrawlColors.push(branding.colors.accent);
      
      if (firecrawlColors.length > 0) {
        brandData.primary_colors = firecrawlColors.slice(0, 2);
        brandData.secondary_colors = firecrawlColors.slice(2);
      }
      
      // Also grab background if available
      if (branding.colors.background) {
        brandData.secondary_colors = [...brandData.secondary_colors, branding.colors.background];
      }
    }

    // If social URL, do a parallel social scrape to enrich
    let socialData: any = {};
    if (isSocialMediaUrl(formattedUrl)) {
      const socialScraped = await scrapeSocialPosts(formattedUrl, firecrawlApiKey);
      if (socialScraped?.markdown) {
        try {
          const socialAnalysis = await analyzeWithAI(socialScraped.markdown, formattedUrl, lovableApiKey);
          socialData = {
            social_tone: socialAnalysis.tone_of_voice,
            social_hashtags: socialAnalysis.hashtags,
            social_content_examples: socialAnalysis.content_examples,
            social_posting_style: socialAnalysis.posting_style,
          };
          // Merge social data into main brand data
          if (socialAnalysis.content_examples?.length) {
            brandData.content_examples = [
              ...brandData.content_examples,
              ...socialAnalysis.content_examples
            ].slice(0, 5);
          }
          if (socialAnalysis.hashtags?.length) {
            brandData.hashtags = [...new Set([...brandData.hashtags, ...socialAnalysis.hashtags])];
          }
        } catch {
          // Social analysis failed, continue with main data
        }
      }
    }

    // Upsert brand profile
    const profileData = {
      user_id: userId,
      source_url: formattedUrl,
      brand_name: brandData.brand_name,
      tagline: brandData.tagline,
      brand_description: brandData.brand_description,
      tone_of_voice: brandData.tone_of_voice,
      key_messages: brandData.key_messages || [],
      primary_colors: brandData.primary_colors || [],
      secondary_colors: brandData.secondary_colors || [],
      font_style: brandData.font_style,
      visual_style: brandData.visual_style,
      content_themes: brandData.content_themes || [],
      posting_style: brandData.posting_style,
      cta_patterns: brandData.cta_patterns || [],
      hashtags: brandData.hashtags || [],
      emoji_usage: brandData.emoji_usage || false,
      content_examples: brandData.content_examples || [],
      target_audience_signals: brandData.target_audience_signals,
      industry: brandData.industry,
      location: brandData.location,
      competitors_mentioned: brandData.competitors_mentioned || [],
      social_data: socialData,
      screenshot_url: screenshot,
      scraped_at: new Date().toISOString(),
    };

    // Check if profile exists for this user + URL
    const { data: existing } = await supabase
      .from('brand_profiles')
      .select('id')
      .eq('user_id', userId)
      .eq('source_url', formattedUrl)
      .maybeSingle();

    let savedProfile;
    if (existing) {
      const { data, error } = await supabase
        .from('brand_profiles')
        .update(profileData)
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      savedProfile = data;
    } else {
      const { data, error } = await supabase
        .from('brand_profiles')
        .insert(profileData)
        .select()
        .single();
      if (error) throw error;
      savedProfile = data;
    }

    // If campaign_id provided, store brand_intelligence on the campaign
    if (campaign_id) {
      await supabase
        .from('campaigns')
        .update({ brand_intelligence: profileData })
        .eq('id', campaign_id)
        .eq('user_id', userId);
    }

    return new Response(
      JSON.stringify({ success: true, cached: false, data: savedProfile }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'unexpected',
        message: "Something went wrong during brand scanning. Please try again."
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
