import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sparkles, Heart, X, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { PresetPrompts, PresetType, presetPrompts, imagePresetPrompts } from "@/components/PresetPrompts";
import { StrategyProgressFeed } from "@/components/StrategyProgressFeed";
import { runStrategyPreparation, type StrategyProgressItem, type StrategyResult } from "@/lib/strategyFlow";

interface CreativeGalleryProps {
  campaignId: string;
}

export function CreativeGallery({ campaignId }: CreativeGalleryProps) {
  const [creatives, setCreatives] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedPreset, setSelectedPreset] = useState<PresetType>(null);
  const [batchInfo, setBatchInfo] = useState<{ totalPlanned: number; totalGenerated: number; hasMore: boolean; nextBatchIndex: number | null; channels: string[] } | null>(null);
  const [strategySteps, setStrategySteps] = useState<StrategyProgressItem[]>([]);
  const [strategyResult, setStrategyResult] = useState<StrategyResult | null>(null);

  useEffect(() => {
    loadCreatives();
  }, [campaignId]);

  const loadCreatives = async () => {
    try {
      const { data, error } = await supabase
        .from("creatives")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setCreatives(data || []);
    } catch (error) {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setStrategySteps([]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      // Load preferred model from company details
      const [{ data: company }, { data: campaign }] = await Promise.all([
        supabase
        .from("company_details")
        .select("*")
        .eq("user_id", session.user.id)
        .maybeSingle(),
        supabase.from("campaigns").select("*").eq("id", campaignId).single(),
      ]);

      const campaignPrompt = [
        campaign?.objective ? `Campaign: ${campaign.objective}` : "",
        (campaign as any)?.content_mix?.goal ? `Goal: ${(campaign as any).content_mix.goal}` : "",
        campaign?.tone ? `Tone: ${campaign.tone}` : "",
        campaign?.channels?.length ? `Channels: ${campaign.channels.join(", ")}` : "",
        campaign?.key_offers_or_topics?.length ? `Topics: ${campaign.key_offers_or_topics.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      let strategyPayload: StrategyResult | null = null;
      try {
        strategyPayload = await runStrategyPreparation({
          sourcePrompt: campaignPrompt || "Create a high-performing campaign content system",
          requestedContentType: "campaign",
          requestedGoal: campaignPrompt || "Campaign generation",
          preferredModel: (company as any)?.preferred_model || undefined,
          competitorInputs: [],
          onProgress: setStrategySteps,
        });
        setStrategyResult(strategyPayload);

        await supabase
          .from("campaigns")
          .update({
            brand_intelligence: {
              ...((campaign as any)?.brand_intelligence || {}),
              strategy_prompt: strategyPayload.optimizedPrompt,
              strategy_system_context: strategyPayload.optimizedSystemContext,
              strategy_report: strategyPayload.report || null,
              prompt_score: strategyPayload.score,
              resolved_competitors: strategyPayload.resolvedCompetitors,
            },
          })
          .eq("id", campaignId);
      } catch (strategyError) {
        console.warn("Campaign strategy fallback:", strategyError);
        setStrategyResult(null);
      }

      // Generate next batch (default 5 posts) — channel-adapted
      const { data, error } = await supabase.functions.invoke("generate-campaign-content", {
        body: {
          campaignId,
          presetType: selectedPreset,
          presetPrompt: selectedPreset ? presetPrompts[selectedPreset] : null,
          imagePresetPrompt: selectedPreset ? imagePresetPrompts[selectedPreset] : null,
          preferredModel: (company as any)?.preferred_model || undefined,
          strategyPrompt: strategyPayload?.optimizedPrompt || null,
          strategySystemContext: strategyPayload?.optimizedSystemContext || null,
          batchSize: 5,
          batchIndex: batchInfo?.nextBatchIndex ?? 0,
        }
      });

      if (error) {
        // Surface the backend's real message (e.g. AI not configured) instead of a generic one.
        let serverMsg = "";
        try { serverMsg = (await (error as any)?.context?.json?.())?.error || ""; } catch { /* ignore */ }
        throw new Error(serverMsg || (error as Error).message);
      }

      if (data?.batchInfo) setBatchInfo(data.batchInfo);
      const generated = data?.count || 0;
      if (generated === 0) {
        toast.error("No posts were generated. Check that an AI provider is configured (Account → API Keys), then try again.");
        return;
      }
      const remaining = data?.batchInfo?.hasMore
        ? `${data.batchInfo.totalGenerated}/${data.batchInfo.totalPlanned} done — generate next batch when ready.`
        : `All ${data?.batchInfo?.totalGenerated || data?.count} posts generated!`;
      toast.success(`Batch ready: ${generated} new creatives. ${remaining}`);
      loadCreatives();
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : "Content generation failed. Please try again in a moment.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSwipe = async (direction: "left" | "right" | "heart") => {
    if (creatives.length === 0 || currentIndex >= creatives.length) return;

    const creative = creatives[currentIndex];
    const feedbackType = direction === "left" ? "dislike" : direction === "right" ? "like" : "love";

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { error } = await supabase
        .from("creative_feedback")
        .upsert({
          creative_id: creative.id,
          user_id: session.user.id,
          feedback_type: feedbackType
        });

      if (error) throw error;

      // Move to next creative
      setCurrentIndex((prev) => Math.min(prev + 1, creatives.length));

      if (direction === "heart") {
        toast.success("Added to favorites! ❤️");
      }
    } catch (error) {
    }
  };

  const currentCreative = creatives[currentIndex];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Generated Content</h2>
            {batchInfo && (
              <p className="text-xs text-muted-foreground mt-1">
                {batchInfo.totalGenerated} of {batchInfo.totalPlanned} planned posts · {batchInfo.channels.join(" · ")}
              </p>
            )}
          </div>
          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="bg-gradient-primary text-white hover:scale-105 transition-all"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            {isGenerating
              ? "Generating..."
              : batchInfo?.hasMore
                ? `Generate Next 5`
                : creatives.length > 0
                  ? "Generate More"
                  : "Generate First Batch"}
          </Button>
        </div>

        {/* Preset Selection */}
        <div className="bg-card p-4 rounded-lg border border-border">
          <p className="text-sm text-muted-foreground mb-3 text-center">Select a content style:</p>
          <PresetPrompts selectedPreset={selectedPreset} onSelectPreset={setSelectedPreset} />
        </div>

        {(isGenerating || strategySteps.length > 0) && (
          <StrategyProgressFeed title="Campaign generation flow" steps={strategySteps} compact />
        )}

        {strategyResult && !isGenerating && (
          <Card className="p-4">
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className="text-sm font-semibold text-foreground/80">Campaign strategy ready</p>
              {strategyResult.score != null && (
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                  {strategyResult.score}% score
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {strategyResult.report?.strategy?.recommended_angle || "AIson prepared a strategy-led generation prompt for this campaign."}
            </p>
          </Card>
        )}
      </div>

      {loading ? (
        <Card className="p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading content...</p>
        </Card>
      ) : creatives.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="p-4 bg-primary/10 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center">
            <Sparkles className="w-10 h-10 text-primary" />
          </div>
          <h3 className="text-xl font-semibold mb-3">No content yet</h3>
          <p className="text-muted-foreground mb-6">
            Generate your first batch of on-brand creatives
          </p>
          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="bg-gradient-primary text-white"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Generate Now
          </Button>
        </Card>
      ) : currentIndex >= creatives.length ? (
        <Card className="p-12 text-center">
          <h3 className="text-xl font-semibold mb-3">All done! 🎉</h3>
          <p className="text-muted-foreground mb-6">
            You've reviewed all {creatives.length} creatives
          </p>
          <Button
            onClick={() => setCurrentIndex(0)}
            variant="outline"
            className="mr-3"
          >
            Review Again
          </Button>
          <Button
            onClick={handleGenerate}
            className="bg-gradient-primary text-white"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Generate More
          </Button>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="aspect-square bg-gradient-light flex items-center justify-center relative">
            {currentCreative.visual_url ? (
              <img
                src={currentCreative.visual_url}
                alt={currentCreative.alt_text || "Generated content"}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="text-center p-8">
                <Sparkles className="w-16 h-16 text-primary mx-auto mb-4" />
                <p className="text-lg font-medium">{currentCreative.caption}</p>
              </div>
            )}
            <div className="absolute top-4 right-4 bg-card px-3 py-1 rounded-full text-sm font-medium">
              {currentIndex + 1} / {creatives.length}
            </div>
            {currentCreative.generation_metadata?.channel && (
              <div className="absolute top-4 left-4 bg-primary/90 text-primary-foreground px-3 py-1 rounded-full text-xs font-semibold capitalize">
                {currentCreative.generation_metadata.channel}
              </div>
            )}
          </div>

          <div className="p-6">
            <div className="mb-4">
              <p className="text-lg mb-2">{currentCreative.caption}</p>
              {currentCreative.hashtags && currentCreative.hashtags.length > 0 && (
                <p className="text-sm text-primary">
                  {currentCreative.hashtags.map((tag: string) => `#${tag}`).join(" ")}
                </p>
              )}
            </div>

            <div className="flex items-center justify-center gap-6">
              <Button
                size="lg"
                variant="outline"
                className="rounded-full w-16 h-16 p-0"
                onClick={() => handleSwipe("left")}
              >
                <X className="w-6 h-6 text-red-500" />
              </Button>
              <Button
                size="lg"
                className="rounded-full w-20 h-20 p-0 bg-gradient-primary hover:scale-110 transition-all"
                onClick={() => handleSwipe("heart")}
              >
                <Heart className="w-8 h-8 text-white" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="rounded-full w-16 h-16 p-0"
                onClick={() => handleSwipe("right")}
              >
                <ChevronRight className="w-6 h-6 text-green-500" />
              </Button>
            </div>

            <p className="text-center text-sm text-muted-foreground mt-6">
              Swipe left to skip • Heart to love • Swipe right to like
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
