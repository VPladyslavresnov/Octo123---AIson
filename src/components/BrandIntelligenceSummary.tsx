import { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, RefreshCw, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { BrandProfile } from "@/hooks/useBrandIntelligence";

interface Props {
  profile: BrandProfile;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  showEditLink?: boolean;
  onApplyToAccount?: (profile: BrandProfile) => void;
}

export function BrandIntelligenceSummary({ profile, onRefresh, isRefreshing, showEditLink, onApplyToAccount }: Props) {
  const [expanded, setExpanded] = useState(false);

  const scrapedDate = new Date(profile.scraped_at).toLocaleDateString();
  const hostname = (() => {
    try { return new URL(profile.source_url).hostname; } catch { return profile.source_url; }
  })();

  return (
    <div className="border border-border rounded-xl bg-muted/30 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <span>Brand Intelligence Summary</span>
          <span className="text-muted-foreground">· {scrapedDate}</span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            {profile.tone_of_voice && (
              <div>
                <span className="text-muted-foreground">Tone detected:</span>
                <span className="ml-2 font-medium capitalize">{profile.tone_of_voice}</span>
              </div>
            )}
            {profile.visual_style && (
              <div>
                <span className="text-muted-foreground">Visual style:</span>
                <span className="ml-2 font-medium capitalize">{profile.visual_style}</span>
              </div>
            )}
            {profile.industry && (
              <div>
                <span className="text-muted-foreground">Industry:</span>
                <span className="ml-2 font-medium">{profile.industry}</span>
              </div>
            )}
            {profile.posting_style && (
              <div>
                <span className="text-muted-foreground">Posting style:</span>
                <span className="ml-2 font-medium capitalize">{profile.posting_style}</span>
              </div>
            )}
          </div>

          {profile.primary_colors?.length > 0 && (
            <div>
              <span className="text-sm text-muted-foreground block mb-2">Brand colors:</span>
              <div className="flex gap-2">
                {[...profile.primary_colors, ...(profile.secondary_colors || [])].map((color, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <div className="w-6 h-6 rounded-full border border-border" style={{ backgroundColor: color }} />
                    <span className="text-xs font-mono text-muted-foreground">{color}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {profile.content_themes.length > 0 && (
            <div>
              <span className="text-sm text-muted-foreground block mb-2">Content themes:</span>
              <div className="flex flex-wrap gap-1.5">
                {profile.content_themes.map((theme, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">{theme}</Badge>
                ))}
              </div>
            </div>
          )}

          {profile.hashtags.length > 0 && (
            <div>
              <span className="text-sm text-muted-foreground block mb-2">Hashtags:</span>
              <div className="flex flex-wrap gap-1.5">
                {profile.hashtags.slice(0, 10).map((tag, i) => (
                  <Badge key={i} variant="outline" className="text-xs cursor-pointer hover:bg-primary/10"
                    onClick={() => navigator.clipboard.writeText(tag)}
                  >
                    {tag.startsWith('#') ? tag : `#${tag}`}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="text-xs text-muted-foreground">
            Scraped from: {hostname}
            {profile.social_data?.social_tone && ' + social profiles'}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {onApplyToAccount && (
              <Button variant="default" size="sm" onClick={() => onApplyToAccount(profile)}>
                <Download className="w-3 h-3 mr-1.5" />
                Apply to Account
              </Button>
            )}
            {onRefresh && (
              <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing}>
                <RefreshCw className={`w-3 h-3 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh Brand Data
              </Button>
            )}
            {showEditLink && (
              <a href="/account" className="text-sm text-primary hover:underline flex items-center gap-1">
                Edit Brand Profile <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
