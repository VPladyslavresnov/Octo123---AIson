import { Copy, Check, Download, Sparkles, Save, Heart } from "lucide-react";
import { useState, useEffect } from "react";
import { ContentType } from "./ContentTypeSelector";
import { Progress } from "./ui/progress";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface GeneratedContentProps {
  content: string | null;
  contentType: ContentType;
  isLoading: boolean;
  onRefine?: (refinementPrompt: string) => void;
  isRefining?: boolean;
}

export function GeneratedContent({ content, contentType, isLoading, onRefine, isRefining }: GeneratedContentProps) {
  const [copied, setCopied] = useState(false);
  const [showRefineBox, setShowRefineBox] = useState(false);
  const [refinementPrompt, setRefinementPrompt] = useState("");
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    loadCampaigns();
  }, []);

  useEffect(() => {
    // Reset saved state when content changes
    setIsSaved(false);
  }, [content]);

  const loadCampaigns = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("campaigns")
      .select("id, objective")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setCampaigns(data);
    }
  };

  const copyToClipboard = () => {
    if (content) {
      navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const downloadImage = () => {
    if (content && contentType === 'image') {
      const link = document.createElement('a');
      link.href = content;
      link.download = `generated-image-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleRefineSubmit = () => {
    if (refinementPrompt.trim() && onRefine) {
      onRefine(refinementPrompt.trim());
      setRefinementPrompt("");
      setShowRefineBox(false);
    }
  };

  const handleSaveToCampaign = async () => {
    if (!selectedCampaign || !content) return;

    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please sign in to save content");
        return;
      }

      const creativeData: any = {
        user_id: user.id,
        campaign_id: selectedCampaign,
        content_type: contentType,
      };

      if (contentType === "image" || contentType === "video") {
        creativeData.visual_url = content;
        creativeData.alt_text = "Generated content";
      } else {
        creativeData.caption = content;
      }

      const { error } = await supabase
        .from("creatives")
        .insert(creativeData);

      if (error) throw error;

      toast.success("Content saved to campaign!");
      setShowSaveDialog(false);
      setSelectedCampaign("");
    } catch (error) {
      toast.error("Something went wrong saving your data. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleLike = async () => {
    if (!content) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please sign in to save content");
        return;
      }

      const creativeData: any = {
        user_id: user.id,
        content_type: contentType,
        saved: true,
      };

      if (contentType === "image" || contentType === "video") {
        creativeData.visual_url = content;
        creativeData.alt_text = "Generated content";
      } else {
        creativeData.caption = content;
      }

      const { error } = await supabase
        .from("creatives")
        .insert(creativeData);

      if (error) throw error;

      setIsSaved(true);
      toast.success("Saved to your library!");
    } catch (error) {
      toast.error("Something went wrong saving your data. Please try again.");
    }
  };

  if (isLoading) {
    return (
      <div className="bg-card rounded-2xl p-8 shadow-medium border border-primary/10 animate-fade-in">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin" />
              <div>
                <p className="font-semibold text-foreground text-lg">Generating your content...</p>
                <p className="text-sm text-muted-foreground">Using AIson generation pipeline</p>
              </div>
            </div>
          </div>
          
          <Progress value={undefined} className="h-2" />
          
          <div className="space-y-3 mt-6">
            <div className="h-4 bg-muted rounded-lg w-full animate-pulse"></div>
            <div className="h-4 bg-muted rounded-lg w-5/6 animate-pulse" style={{ animationDelay: '0.1s' }}></div>
            <div className="h-4 bg-muted rounded-lg w-4/6 animate-pulse" style={{ animationDelay: '0.2s' }}></div>
          </div>
        </div>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="bg-gradient-light rounded-2xl p-8 shadow-soft border-2 border-dashed border-border">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 mx-auto rounded-full bg-accent flex items-center justify-center">
            <span className="text-3xl">✨</span>
          </div>
          <p className="text-muted-foreground font-medium">
            Your generated content will appear here
          </p>
          <p className="text-sm text-muted-foreground">
            Enter a prompt and click "Generate Content" to begin
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl p-6 shadow-medium border border-primary/20 animate-scale-in">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold text-lg text-foreground">Generated Content</h3>
          <p className="text-sm text-muted-foreground capitalize">
            {contentType === "text" && "✍️ Text Content"}
            {contentType === "image" && "🖼️ Generated Image"}
            {contentType === "video" && "🎬 Video Script"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={isSaved ? "default" : "outline"}
            size="sm"
            onClick={handleLike}
            disabled={isSaved}
            className="gap-2"
          >
            <Heart className={isSaved ? "w-4 h-4 fill-current" : "w-4 h-4"} />
            {isSaved ? "Saved" : "Save to Library"}
          </Button>
          <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Save className="w-4 h-4" />
                Save to Campaign
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Save to Campaign</DialogTitle>
                <DialogDescription>
                  Choose a campaign to save this content to
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a campaign" />
                  </SelectTrigger>
                  <SelectContent>
                    {campaigns.map((campaign) => (
                      <SelectItem key={campaign.id} value={campaign.id}>
                        {campaign.objective || "Untitled Campaign"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button 
                  onClick={handleSaveToCampaign} 
                  disabled={!selectedCampaign || isSaving}
                  className="w-full"
                >
                  {isSaving ? "Saving..." : "Save Content"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          {contentType !== 'image' && (
            <button
              onClick={copyToClipboard}
              className="px-3 py-2 rounded-lg bg-accent hover:bg-accent/80 transition-colors"
              title="Copy to clipboard"
            >
              {copied ? (
                <Check className="w-4 h-4 text-success" />
              ) : (
                <Copy className="w-4 h-4 text-foreground" />
              )}
            </button>
          )}
          {contentType === 'image' && (
            <button
              onClick={downloadImage}
              className="px-3 py-2 rounded-lg bg-accent hover:bg-accent/80 transition-colors"
              title="Download image"
            >
              <Download className="w-4 h-4 text-foreground" />
            </button>
          )}
        </div>
      </div>
      
      <div className="prose prose-sm max-w-none">
        {contentType === 'image' ? (
          <div className="rounded-lg overflow-hidden border border-border shadow-soft">
            <img 
              src={content} 
              alt="Generated content" 
              className="w-full h-auto"
            />
          </div>
        ) : (
          <div className="p-4 bg-accent rounded-lg border border-primary/10">
            <p className="whitespace-pre-wrap text-foreground leading-relaxed">{content}</p>
          </div>
        )}
      </div>

      {/* Refinement Section */}
      {onRefine && !isRefining && (
        <div className="mt-6 border-t border-border pt-4">
          {!showRefineBox ? (
            <button
              onClick={() => setShowRefineBox(true)}
              className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-all duration-300"
            >
              <Sparkles className="w-4 h-4" />
              <span>Improve / Fix Content</span>
            </button>
          ) : (
            <div className="space-y-3 animate-fade-in">
              <label className="block text-sm font-medium text-foreground">
                Describe what you'd like to improve or change
              </label>
              <textarea
                value={refinementPrompt}
                onChange={(e) => setRefinementPrompt(e.target.value)}
                placeholder="E.g., 'Make it more formal', 'Add emojis', 'Shorten to 100 words'..."
                className="w-full h-24 px-4 py-3 border-2 border-border rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleRefineSubmit}
                  disabled={!refinementPrompt.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-primary text-white rounded-lg hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Refine Content</span>
                </button>
                <button
                  onClick={() => {
                    setShowRefineBox(false);
                    setRefinementPrompt("");
                  }}
                  className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-all duration-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Refining State */}
      {isRefining && (
        <div className="mt-6 border-t border-border pt-4 animate-fade-in">
          <div className="flex items-center gap-3 text-muted-foreground">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium">Improving your content...</span>
          </div>
        </div>
      )}
    </div>
  );
}
