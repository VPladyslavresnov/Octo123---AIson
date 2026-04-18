import { Heart, MessageCircle, Send, Bookmark, MoreHorizontal } from "lucide-react";
import type { BrandProfile } from "@/hooks/useBrandIntelligence";

interface BrandPreviewProps {
  colors: {
    primary: string;
    secondary: string;
    accent?: string;
  };
  companyName?: string;
  brandProfile?: BrandProfile | null;
}

export function BrandPreview({ colors, companyName = "Your Brand", brandProfile }: BrandPreviewProps) {
  const lightenColor = (hex: string, percent: number) => {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.min(255, (num >> 16) + amt);
    const G = Math.min(255, ((num >> 8) & 0x00FF) + amt);
    const B = Math.min(255, (num & 0x0000FF) + amt);
    return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
  };

  const displayName = brandProfile?.brand_name || companyName;
  const tagline = brandProfile?.tagline || "Your Content Here";
  const subtitle = brandProfile?.brand_description?.slice(0, 80) || "AI-generated visuals with your brand colors";
  const caption = brandProfile?.content_examples?.[0]?.slice(0, 120) || "Sample caption with your brand voice...";
  const hashtag1 = brandProfile?.hashtags?.[0] || "#YourHashtag";
  const hashtag2 = brandProfile?.hashtags?.[1] || "#BrandTag";
  const ctaText = brandProfile?.cta_patterns?.[0] || "Shop Now →";

  const primaryLight = lightenColor(colors.primary, 85);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground">Content Preview</h3>
      <p className="text-sm text-muted-foreground">
        {brandProfile ? `Live preview using data from ${displayName}` : "See how your brand colors will look on generated content"}
      </p>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Social Media Post Preview */}
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="p-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div 
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                style={{ backgroundColor: colors.primary }}
              >
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold">{displayName}</p>
                <p className="text-xs text-muted-foreground">Sponsored</p>
              </div>
            </div>
            <MoreHorizontal className="w-5 h-5 text-muted-foreground" />
          </div>
          
          <div 
            className="aspect-square flex items-center justify-center"
            style={{ 
              background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%)`
            }}
          >
            <div className="text-center text-white p-6">
              <p className="text-2xl font-bold mb-2">{tagline}</p>
              <p className="text-sm opacity-90">{subtitle}</p>
            </div>
          </div>

          <div className="p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-4">
                <Heart className="w-6 h-6" />
                <MessageCircle className="w-6 h-6" />
                <Send className="w-6 h-6" />
              </div>
              <Bookmark className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold">1,234 likes</p>
            <p className="text-sm">
              <span className="font-semibold">{displayName.toLowerCase().replace(/\s/g, '')}</span>{' '}
              <span className="text-muted-foreground">{caption}</span>
            </p>
          </div>
        </div>

        {/* Story/Ad Preview */}
        <div className="space-y-4">
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-xs text-muted-foreground mb-3">Call-to-Action Button</p>
            <button
              className="w-full py-3 px-4 rounded-lg text-white font-semibold transition-transform hover:scale-105"
              style={{ backgroundColor: colors.primary }}
            >
              {ctaText}
            </button>
          </div>

          <div 
            className="rounded-xl p-4"
            style={{ backgroundColor: primaryLight }}
          >
            <p className="text-xs text-muted-foreground mb-3">Text Post Style</p>
            <div className="bg-card rounded-lg p-4 shadow-sm">
              <p 
                className="text-lg font-bold mb-2"
                style={{ color: colors.primary }}
              >
                {brandProfile?.key_messages?.[0] || "Headline in Brand Color"}
              </p>
              <p className="text-sm text-muted-foreground mb-3">
                {brandProfile?.content_examples?.[1]?.slice(0, 140) || "Your AI-generated copy will maintain a consistent tone and style that matches your brand identity."}
              </p>
              <div className="flex gap-2">
                <span 
                  className="text-xs px-2 py-1 rounded-full text-white"
                  style={{ backgroundColor: colors.secondary }}
                >
                  {hashtag1.startsWith('#') ? hashtag1 : `#${hashtag1}`}
                </span>
                <span 
                  className="text-xs px-2 py-1 rounded-full"
                  style={{ 
                    backgroundColor: colors.accent || colors.primary,
                    color: 'white'
                  }}
                >
                  {hashtag2.startsWith('#') ? hashtag2 : `#${hashtag2}`}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-xs text-muted-foreground mb-3">Color Palette</p>
            <div className="flex gap-2">
              <div className="flex-1">
                <div className="h-12 rounded-lg mb-1" style={{ backgroundColor: colors.primary }} />
                <p className="text-xs text-center text-muted-foreground">Primary</p>
              </div>
              <div className="flex-1">
                <div className="h-12 rounded-lg mb-1" style={{ backgroundColor: colors.secondary }} />
                <p className="text-xs text-center text-muted-foreground">Secondary</p>
              </div>
              {colors.accent && (
                <div className="flex-1">
                  <div className="h-12 rounded-lg mb-1" style={{ backgroundColor: colors.accent }} />
                  <p className="text-xs text-center text-muted-foreground">Accent</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
