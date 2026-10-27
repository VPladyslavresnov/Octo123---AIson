import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { claudeChatCompletion, hasClaude } from "../_shared/claude.ts";
import { openaiChatCompletion, resolveOpenAIKey } from "../_shared/openai.ts";

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

/* ─────────── real brand-color extraction from a site's CSS ─────────── */

function clampHex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
}
function rgbToHex(r: number, g: number, b: number): string {
  return `#${clampHex(r)}${clampHex(g)}${clampHex(b)}`.toLowerCase();
}
function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255);
}

// Is this hex a neutral (black / white / gray)? Those aren't brand colors.
function isNeutral(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max - min < 24) return true;        // low saturation → gray/black/white
  if (max < 24) return true;              // near-black
  if (min > 232) return true;             // near-white
  return false;
}

function normalizeHex3(h: string): string {
  // #abc → #aabbcc
  return `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`.toLowerCase();
}

// Parse a single CSS color value (hex / rgb / hsl / bare Tailwind HSL triplet) → hex.
function colorFromValue(value: string): string | null {
  const val = value.trim();
  let m: RegExpMatchArray | null;
  if ((m = val.match(/^#([0-9a-fA-F]{6})\b/))) return `#${m[1]}`.toLowerCase();
  if ((m = val.match(/^#([0-9a-fA-F]{3})\b/))) return normalizeHex3(`#${m[1]}`);
  if ((m = val.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i))) return rgbToHex(+m[1], +m[2], +m[3]);
  if ((m = val.match(/^hsla?\(\s*([\d.]+)[\s,]+([\d.]+)%[\s,]+([\d.]+)%/i))) return hslToHex(+m[1], +m[2], +m[3]);
  if ((m = val.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/))) return hslToHex(+m[1], +m[2], +m[3]); // bare HSL triplet
  return null;
}

// Pull colors from CSS/HTML with a WEIGHT per occurrence. Declared brand tokens
// (CSS variables named --primary/--brand/--accent, brand theme colors) far
// outweigh incidental colors — otherwise a common border/shadow tint wins.
function collectWeightedColors(css: string): Array<{ hex: string; weight: number }> {
  const out: Array<{ hex: string; weight: number }> = [];

  // Declared brand variables in ANY format — the strongest signal.
  for (const m of css.matchAll(/--[\w-]*(?:primary|brand|accent|theme|color-main|main-color|cta)[\w-]*\s*:\s*([^;}\n]+)/gi)) {
    const hex = colorFromValue(m[1]);
    if (hex) out.push({ hex, weight: 60 });
  }
  // Every incidental color occurrence — weak frequency signal.
  for (const m of css.matchAll(/#[0-9a-fA-F]{6}\b/g)) out.push({ hex: m[0].toLowerCase(), weight: 1 });
  for (const m of css.matchAll(/#[0-9a-fA-F]{3}\b/g)) out.push({ hex: normalizeHex3(m[0]), weight: 1 });
  for (const m of css.matchAll(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/g)) out.push({ hex: rgbToHex(+m[1], +m[2], +m[3]), weight: 1 });
  for (const m of css.matchAll(/hsla?\(\s*([\d.]+)[\s,]+([\d.]+)%[\s,]+([\d.]+)%/g)) out.push({ hex: hslToHex(+m[1], +m[2], +m[3]), weight: 1 });
  return out;
}

// The classic flat-UI / chart placeholder palette that LLMs fall back to when
// they invent colours. These must NEVER be stored as a brand's colours.
const GENERIC_PLACEHOLDERS = new Set([
  // flat-UI palette (classic LLM fallback)
  "#3498db", "#2ecc71", "#f1c40f", "#e74c3c", "#9b59b6", "#1abc9c", "#34495e",
  "#95a5a6", "#e67e22", "#16a085", "#27ae60", "#2980b9", "#8e44ad", "#f39c12",
  "#d35400", "#c0392b", "#bdc3c7", "#7f8c8d", "#ecf0f1", "#2c3e50",
  // Bootstrap 4 defaults (dominate framework sites, not brand colours)
  "#007bff", "#6c757d", "#28a745", "#17a2b8", "#ffc107", "#dc3545", "#343a40", "#f8f9fa",
  // Bootstrap 5 defaults
  "#0d6efd", "#6610f2", "#6f42c1", "#d63384", "#fd7e14", "#198754", "#20c997", "#0dcaf0",
  // other very common framework blues we've seen mis-detected
  "#2563eb", "#00a9e0", "#4285f4", "#1877f2",
]);
function stripGenericColors(colors?: string[]): string[] {
  return (colors || []).filter((c) => c && !GENERIC_PLACEHOLDERS.has(String(c).toLowerCase()));
}

// Merge near-identical hexes (within a small RGB distance).
function dist(a: string, b: string): number {
  const p = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return Math.abs(p(a, 0) - p(b, 0)) + Math.abs(p(a, 1) - p(b, 1)) + Math.abs(p(a, 2) - p(b, 2));
}

// Fetch the page + its linked stylesheets and rank real brand colors by frequency.
async function extractSiteColors(baseUrl: string, html: string): Promise<string[]> {
  let css = html;
  const scores = new Map<string, number>();
  const add = (hex: string | null, weight: number) => {
    if (!hex || isNeutral(hex)) return;
    scores.set(hex, (scores.get(hex) || 0) + weight);
  };

  // theme-color / tile-color metas are declared brand colors — strongest signal.
  const theme = html.match(/<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i)?.[1]
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']theme-color["']/i)?.[1];
  add(theme ? colorFromValue(theme) : null, 120);
  const tile = html.match(/<meta[^>]+name=["']msapplication-TileColor["'][^>]+content=["']([^"']+)["']/i)?.[1];
  add(tile ? colorFromValue(tile) : null, 80);

  // fetch up to 4 linked stylesheets
  const links = [...html.matchAll(/<link[^>]+href=["']([^"']+\.css[^"']*)["']/gi)].map((m) => m[1]).slice(0, 4);
  for (const href of links) {
    try {
      const abs = new URL(href, baseUrl).toString();
      const res = await fetch(abs, { headers: { "User-Agent": "AIsonBot/1.0" } });
      if (res.ok) css += "\n" + (await res.text());
    } catch { /* skip */ }
  }

  for (const { hex, weight } of collectWeightedColors(css)) add(hex, weight);

  // Split into DECLARED brand colours (theme-color meta / --primary/--brand vars →
  // score ≥ 30) vs incidental frequency colours. Trust declared ones; only fall
  // back to frequency when a site declares nothing — and take at most 2 then, to
  // avoid padding a brand with random accent/hover/background colours it doesn't own.
  const STRONG = 30;
  const dedupe = (entries: [string, number][]): string[] => {
    const out: string[] = [];
    for (const [hex] of entries) {
      if (out.some((p) => dist(p, hex) < 40)) continue;
      out.push(hex);
    }
    return out;
  };
  const strong = dedupe([...scores.entries()].filter(([, s]) => s >= STRONG).sort((a, b) => b[1] - a[1]));
  if (strong.length) return strong.slice(0, 3);
  const weak = dedupe([...scores.entries()].filter(([, s]) => s < STRONG).sort((a, b) => b[1] - a[1]));
  return weak.slice(0, 2);
}

// Direct fetch of a page's HTML → readable text + the raw HTML (for color extraction).
async function directFetchText(url: string): Promise<{ text: string; html: string }> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AIsonBot/1.0; +https://aison.co.uk)",
        "Accept": "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    if (!res.ok) return { text: "", html: "" };
    const html = await res.text();
    // Pull the useful text: title, meta description, og tags, and body copy.
    const pick = (re: RegExp) => (html.match(re)?.[1] || "").trim();
    const title = pick(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const desc = pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
      || pick(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
    const ogTitle = pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    const ogDesc = pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
    const body = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
    const parts = [
      title ? `TITLE: ${title}` : "",
      (ogTitle && ogTitle !== title) ? `OG_TITLE: ${ogTitle}` : "",
      desc ? `DESCRIPTION: ${desc}` : "",
      (ogDesc && ogDesc !== desc) ? `OG_DESCRIPTION: ${ogDesc}` : "",
      `CONTENT: ${body.slice(0, 6000)}`,
    ].filter(Boolean);
    return { text: parts.join("\n"), html };
  } catch (e) {
    console.warn("directFetchText failed:", e);
    return { text: "", html: "" };
  }
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

async function analyzeWithAI(scrapedContent: string, url: string, openaiKey: string | null): Promise<BrandIntelligence> {
  const aiBody = {
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
  "primary_colors": ["Leave this as an empty array [] unless the provided CONTENT explicitly states exact brand hex codes. Do NOT guess or invent colors, and NEVER output common placeholder palette colors like #3498db, #2ecc71, #f1c40f, #e74c3c. Real brand colors are extracted separately."],
  "secondary_colors": ["Empty array [] unless explicit hex codes are stated in the content. Never guess."],
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
  };

  // Claude when configured, otherwise OpenAI
  if (!hasClaude() && !openaiKey) throw new Error('No AI provider configured');
  const response = hasClaude()
    ? await claudeChatCompletion({ messages: aiBody.messages, response_format: { type: "json_object" } })
    : await openaiChatCompletion(openaiKey!, { messages: aiBody.messages, response_format: { type: "json_object" } });

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
    const openaiKey = await resolveOpenAIKey(userId);

    if (!openaiKey && !hasClaude()) {
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
    let extractedColors: string[] = [];

    // Without Firecrawl, fetch the page directly and analyze its text with AI.
    if (!firecrawlApiKey) {
      const fetched = await directFetchText(formattedUrl);
      markdown = fetched.text;
      // Extract the site's REAL brand colors from its CSS (not AI-guessed).
      if (fetched.html) {
        try { extractedColors = await extractSiteColors(formattedUrl, fetched.html); } catch { /* ignore */ }
      }
      if (!markdown || markdown.trim().length < 50) {
        // Last resort: build context from the company details the user entered
        // so brand identity is still produced (AI infers from name + industry).
        const { data: company } = await supabase
          .from('company_details')
          .select('company_name, business_type, target_audience, location, website')
          .eq('user_id', userId)
          .maybeSingle();
        const host = (() => { try { return new URL(formattedUrl).hostname.replace('www.', ''); } catch { return formattedUrl; } })();
        markdown = [
          `WEBSITE: ${host}`,
          company?.company_name ? `COMPANY: ${company.company_name}` : '',
          company?.business_type ? `INDUSTRY: ${company.business_type}` : '',
          company?.target_audience ? `TARGET AUDIENCE: ${company.target_audience}` : '',
          company?.location ? `LOCATION: ${company.location}` : '',
          `Infer a plausible, professional brand identity for this business from its name, industry, and domain.`,
        ].filter(Boolean).join('\n');
      }
    } else {
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
    } // end firecrawl branch

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
      brandData = await analyzeWithAI(markdown, formattedUrl, openaiKey);
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

    // Override AI-guessed colors with REAL colors extracted from the site's CSS.
    // This is authoritative — the model tends to hallucinate generic palettes.
    if (extractedColors.length > 0) {
      brandData.primary_colors = extractedColors.slice(0, 2);
      brandData.secondary_colors = extractedColors.slice(2, 4);
    }

    // Final guarantee: never store the generic flat-UI placeholder palette the
    // model falls back to. Real extracted CSS colours pass through untouched;
    // if all that's left is placeholders, store none rather than fake ones.
    {
      const cleanedPrimary = stripGenericColors(brandData.primary_colors);
      const cleanedSecondary = stripGenericColors(brandData.secondary_colors);
      const merged = [...cleanedPrimary, ...cleanedSecondary];
      brandData.primary_colors = merged.slice(0, 2);
      brandData.secondary_colors = merged.slice(2, 4);
    }

    // If social URL, do a parallel social scrape to enrich (Firecrawl only)
    let socialData: any = {};
    if (firecrawlApiKey && isSocialMediaUrl(formattedUrl)) {
      const socialScraped = await scrapeSocialPosts(formattedUrl, firecrawlApiKey);
      if (socialScraped?.markdown) {
        try {
          const socialAnalysis = await analyzeWithAI(socialScraped.markdown, formattedUrl, openaiKey);
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
