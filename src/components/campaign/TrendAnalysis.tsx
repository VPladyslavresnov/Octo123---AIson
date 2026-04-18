import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TrendingUp, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";

interface TrendAnalysisProps {
  campaignId: string;
}

export function TrendAnalysis({ campaignId }: TrendAnalysisProps) {
  const navigate = useNavigate();
  const [trendProfile, setTrendProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    loadTrendProfile();
  }, [campaignId]);

  const loadTrendProfile = async () => {
    try {
      const { data, error } = await supabase
        .from("trend_profiles")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error && error.code !== "PGRST116") throw error;
      setTrendProfile(data);
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateTrends = async () => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-trends", {
        body: { campaignId },
      });

      if (error) throw error;
      toast.success("Trend analysis complete!");
      loadTrendProfile();
    } catch (error) {
      toast.error("Content generation failed. Please try again in a moment.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleTopicClick = (topic: string) => {
    // Navigate to Content Studio with the topic pre-filled as a query param
    navigate(`/studio?prompt=${encodeURIComponent(topic)}`);
  };

  if (loading) {
    return (
      <Card className="p-12 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
        <p className="mt-4 text-muted-foreground">Loading trends...</p>
      </Card>
    );
  }

  if (!trendProfile) {
    return (
      <Card className="p-12 text-center">
        <div className="p-4 bg-primary/10 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center">
          <TrendingUp className="w-10 h-10 text-primary" />
        </div>
        <h3 className="text-xl font-semibold mb-3 text-foreground">Analyze Trends for Your Campaign</h3>
        <p className="text-muted-foreground mb-6 max-w-md mx-auto">
          Get AI-powered trending topics based on your industry and audience — click any result to start creating content
        </p>
        <Button
          onClick={handleGenerateTrends}
          disabled={isGenerating}
          className="bg-gradient-primary text-white hover:scale-105 transition-all"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <TrendingUp className="w-4 h-4 mr-2" />
              Analyze Trends
            </>
          )}
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-foreground">Trends Report</h2>
        <Button onClick={handleGenerateTrends} disabled={isGenerating} variant="outline">
          <TrendingUp className="w-4 h-4 mr-2" />
          Refresh Analysis
        </Button>
      </div>

      {trendProfile.evidence && (
        <Card className="p-6 bg-primary/5 border-primary/20">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2 text-foreground">
            <TrendingUp className="w-5 h-5 text-primary" />
            Key Insights
          </h3>
          <p className="text-foreground leading-relaxed">{trendProfile.evidence}</p>
        </Card>
      )}

      {/* Trending Topics — clickable cards */}
      {trendProfile.top_themes && trendProfile.top_themes.length > 0 && (
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2 text-foreground">
            <span className="text-2xl">🔥</span>
            Trending Topics — click to create content
          </h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {trendProfile.top_themes.slice(0, 6).map((theme: string, i: number) => (
              <Card
                key={i}
                onClick={() => handleTopicClick(theme)}
                className="p-4 cursor-pointer hover:shadow-md hover:border-primary/40 transition-all group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="flex items-center justify-center w-7 h-7 bg-primary text-primary-foreground rounded-full text-sm font-bold shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium text-foreground">{theme}</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-1" />
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Visual Styles */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-foreground">
            <span className="text-2xl">🎨</span>
            Top Visual Styles
          </h3>
          <ul className="space-y-3">
            {trendProfile.top_visual_styles?.map((style: string, i: number) => (
              <li key={i} className="flex items-start gap-3 p-3 bg-accent/50 rounded-lg hover:bg-accent transition-colors">
                <span className="flex items-center justify-center w-6 h-6 bg-primary text-primary-foreground rounded-full text-sm font-bold shrink-0">
                  {i + 1}
                </span>
                <span className="text-foreground">{style}</span>
              </li>
            ))}
          </ul>
        </Card>

        {/* Hooks & CTAs */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-foreground">
            <span className="text-2xl">💬</span>
            Top Hooks & CTAs
          </h3>
          <ul className="space-y-3">
            {trendProfile.top_hooks_ctas?.map((hook: string, i: number) => (
              <li key={i} className="flex items-start gap-3 p-3 bg-accent/50 rounded-lg hover:bg-accent transition-colors">
                <span className="flex items-center justify-center w-6 h-6 bg-primary text-primary-foreground rounded-full text-sm font-bold shrink-0">
                  {i + 1}
                </span>
                <span className="text-foreground">{hook}</span>
              </li>
            ))}
          </ul>
        </Card>

        {/* Hashtags */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-foreground">
            <span className="text-2xl">#️⃣</span>
            Recommended Hashtags
          </h3>
          <div className="flex flex-wrap gap-2">
            {trendProfile.hashtag_suggestions?.map((tag: string) => (
              <span
                key={tag}
                className="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-medium hover:bg-primary/20 transition-colors cursor-default"
              >
                #{tag}
              </span>
            ))}
          </div>
        </Card>

        {/* Posting Times */}
        {trendProfile.recommended_posting_windows && (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-foreground">
              <span className="text-2xl">⏰</span>
              Best Posting Times
            </h3>
            <div className="space-y-4">
              {Object.entries(trendProfile.recommended_posting_windows).map(
                ([platform, times]: [string, any]) => (
                  <div key={platform} className="p-4 bg-accent/50 rounded-lg">
                    <h4 className="font-semibold capitalize mb-2 text-primary">{platform}</h4>
                    <ul className="space-y-1">
                      {Array.isArray(times) ? (
                        times.map((time: string, i: number) => (
                          <li key={i} className="text-sm text-foreground flex items-center gap-2">
                            <span className="w-2 h-2 bg-primary rounded-full" />
                            {time}
                          </li>
                        ))
                      ) : (
                        <li className="text-sm text-foreground flex items-center gap-2">
                          <span className="w-2 h-2 bg-primary rounded-full" />
                          {String(times)}
                        </li>
                      )}
                    </ul>
                  </div>
                )
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
