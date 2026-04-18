import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Heart, Image as ImageIcon, FileText, Video, Trash2, ExternalLink, Calendar, Clock, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SavedCreative {
  id: string;
  content_type: string;
  visual_url: string | null;
  caption: string | null;
  alt_text: string | null;
  created_at: string;
  campaign_id: string | null;
  campaign?: {
    id: string;
    objective: string;
  };
}

export default function Library() {
  const navigate = useNavigate();
  const [creatives, setCreatives] = useState<SavedCreative[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "text" | "image" | "video">("all");
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedCreative, setSelectedCreative] = useState<SavedCreative | null>(null);
  const [previewCreative, setPreviewCreative] = useState<SavedCreative | null>(null);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [socialConnections, setSocialConnections] = useState<any[]>([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    loadSavedCreatives();
    loadSocialConnections();
  };

  const loadSocialConnections = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("social_connections_safe" as any)
        .select("*")
        .eq("user_id", user.id);

      if (error) throw error;
      setSocialConnections(data || []);
    } catch (error: any) {
    }
  };

  const loadSavedCreatives = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("creatives")
        .select(`
          *,
          campaign:campaigns(id, objective)
        `)
        .eq("user_id", user.id)
        .eq("saved", true)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setCreatives(data || []);
    } catch (error: any) {
      toast.error("Failed to load saved content: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const unsaveCreative = async (id: string) => {
    try {
      const { error } = await supabase
        .from("creatives")
        .update({ saved: false })
        .eq("id", id);

      if (error) throw error;

      toast.success("Removed from library");
      loadSavedCreatives();
    } catch (error: any) {
      toast.error("Failed to remove from library: " + error.message);
    }
  };

  const deleteCreative = async (id: string) => {
    try {
      const { error } = await supabase
        .from("creatives")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast.success("Creative deleted");
      loadSavedCreatives();
    } catch (error: any) {
      toast.error("Failed to delete creative: " + error.message);
    }
  };

  const openScheduleModal = (creative: SavedCreative) => {
    if (socialConnections.length === 0) {
      toast.error("Please connect a social media account first");
      navigate("/account");
      return;
    }
    setSelectedCreative(creative);
    setShowScheduleModal(true);
    
    const connectedPlatforms = socialConnections.map(conn => conn.platform);
    setSelectedPlatforms(connectedPlatforms);
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    
    setScheduledDate(tomorrow.toISOString().split('T')[0]);
    setScheduledTime("09:00");
  };

  const handleSchedulePost = async () => {
    if (!selectedCreative || !scheduledDate || !scheduledTime || selectedPlatforms.length === 0) {
      toast.error("Please fill in all fields and select at least one platform");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}`);
      
      const { error } = await supabase
        .from("scheduled_posts")
        .insert({
          user_id: user.id,
          creative_id: selectedCreative.id,
          scheduled_time: scheduledDateTime.toISOString(),
          platforms: selectedPlatforms,
          status: "scheduled",
        });

      if (error) throw error;

      toast.success("Post scheduled successfully!");
      setShowScheduleModal(false);
      setSelectedCreative(null);
      setSelectedPlatforms([]);
    } catch (error: any) {
      toast.error("Failed to schedule post: " + error.message);
    }
  };

  const togglePlatform = (platform: string) => {
    setSelectedPlatforms(prev =>
      prev.includes(platform)
        ? prev.filter(p => p !== platform)
        : [...prev, platform]
    );
  };

  const filteredCreatives = creatives.filter(creative => {
    if (filter === "all") return true;
    return creative.content_type === filter;
  });
  const linkedToCampaignCount = creatives.filter((creative) => !!creative.campaign_id).length;

  const getContentTypeIcon = (type: string) => {
    switch (type) {
      case "image":
        return <ImageIcon className="w-4 h-4" />;
      case "video":
        return <Video className="w-4 h-4" />;
      case "text":
        return <FileText className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background pt-8 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-muted-foreground">Loading your library...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-primary/10">
                <Heart className="w-7 h-7 text-primary fill-primary" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Library</h1>
                <p className="text-sm text-muted-foreground mt-0.5">All your saved content in one place</p>
              </div>
            </div>
            <Button onClick={() => navigate("/home")} className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Sparkles className="w-4 h-4 mr-2" /> Create Content
            </Button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-4 md:grid-cols-3 mb-6">
          <Card className="p-5">
            <p className="text-sm text-muted-foreground">Saved assets</p>
            <p className="text-3xl font-bold text-foreground mt-1">{creatives.length}</p>
            <p className="text-sm text-muted-foreground mt-2">Reusable content stored for future campaign use.</p>
          </Card>
          <Card className="p-5">
            <p className="text-sm text-muted-foreground">Linked to campaigns</p>
            <p className="text-3xl font-bold text-foreground mt-1">{linkedToCampaignCount}</p>
            <p className="text-sm text-muted-foreground mt-2">A lightweight usage signal for how actively the library supports campaigns.</p>
          </Card>
          <Card className="p-5">
            <p className="text-sm text-muted-foreground">Recommended action</p>
            <p className="text-base font-semibold text-foreground mt-1">Reuse content operationally</p>
            <p className="text-sm text-muted-foreground mt-2">Add a saved asset to a campaign, build a new campaign from it, or schedule it directly.</p>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <Button
            variant={filter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("all")}
          >
            All ({creatives.length})
          </Button>
          <Button
            variant={filter === "text" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("text")}
          >
            <FileText className="w-4 h-4 mr-2" />
            Text ({creatives.filter(c => c.content_type === "text").length})
          </Button>
          <Button
            variant={filter === "image" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("image")}
          >
            <ImageIcon className="w-4 h-4 mr-2" />
            Images ({creatives.filter(c => c.content_type === "image").length})
          </Button>
          <Button
            variant={filter === "video" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("video")}
          >
            <Video className="w-4 h-4 mr-2" />
            Videos ({creatives.filter(c => c.content_type === "video").length})
          </Button>
        </div>

        {/* Content Grid */}
        {filteredCreatives.length === 0 ? (
          <Card className="p-12 text-center">
            <Heart className="w-14 h-14 text-muted-foreground/40 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-foreground mb-2">
              {creatives.length === 0 ? "Your library is empty" : "No matching content"}
            </h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              {creatives.length === 0
                ? "Generate content in the Content Studio, then save your favourites here for easy access and scheduling."
                : "Try adjusting your filters to find what you're looking for."}
            </p>
            {creatives.length === 0 && (
              <Button onClick={() => navigate("/home")} className="bg-gradient-primary text-white">
                <Sparkles className="w-4 h-4 mr-2" />
                Create Content
              </Button>
            )}
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCreatives.map((creative) => (
              <Card key={creative.id} className="overflow-hidden hover:shadow-lg transition-all group cursor-pointer" onClick={() => setPreviewCreative(creative)}>
                {creative.content_type === "image" && creative.visual_url && (
                  <div className="aspect-video bg-muted relative overflow-hidden">
                    <img
                      src={creative.visual_url}
                      alt={creative.alt_text || "Generated content"}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                
                {creative.content_type === "video" && creative.visual_url && (
                  <div className="aspect-video bg-muted">
                    <video
                      src={creative.visual_url}
                      controls
                      className="w-full h-full"
                    />
                  </div>
                )}

                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="capitalize">
                      {getContentTypeIcon(creative.content_type)}
                      <span className="ml-1">{creative.content_type}</span>
                    </Badge>
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openScheduleModal(creative)}
                        className="h-8 w-8 p-0"
                      >
                        <Calendar className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => unsaveCreative(creative.id)}
                        className="h-8 w-8 p-0"
                      >
                        <Heart className="w-4 h-4 fill-primary text-primary" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteCreative(creative.id)}
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {creative.caption && (
                    <p className="text-sm text-foreground line-clamp-3">
                      {creative.caption}
                    </p>
                  )}

                  <div className="flex gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="outline" onClick={() => navigate("/campaigns")}>
                      Add to Campaign
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => navigate("/campaign/new")}>
                      Create Campaign
                    </Button>
                  </div>

                  {creative.campaign && (
                    <button
                      onClick={() => navigate(`/campaign/${creative.campaign!.id}`)}
                      className="flex items-center gap-2 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" />
                      {creative.campaign.objective}
                    </button>
                  )}

                  {!creative.campaign && (
                    <p className="text-xs text-muted-foreground">
                      Not linked to a campaign yet.
                    </p>
                  )}

                  <p className="text-xs text-muted-foreground">
                    Saved {new Date(creative.created_at).toLocaleDateString()}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Preview Modal */}
        <Dialog open={!!previewCreative} onOpenChange={(open) => !open && setPreviewCreative(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="capitalize flex items-center gap-2">
                {previewCreative && getContentTypeIcon(previewCreative.content_type)}
                {previewCreative?.content_type} Content
              </DialogTitle>
            </DialogHeader>
            {previewCreative && (
              <div className="space-y-4">
                {previewCreative.visual_url && previewCreative.content_type === "image" && (
                  <div className="rounded-lg overflow-hidden bg-muted">
                    <img src={previewCreative.visual_url} alt={previewCreative.alt_text || "Creative"} className="w-full max-h-[400px] object-contain" />
                  </div>
                )}
                {previewCreative.visual_url && previewCreative.content_type === "video" && (
                  <div className="rounded-lg overflow-hidden bg-muted">
                    <video src={previewCreative.visual_url} controls className="w-full max-h-[400px]" />
                  </div>
                )}
                {previewCreative.caption && (
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-foreground whitespace-pre-wrap">{previewCreative.caption}</p>
                  </div>
                )}
                {previewCreative.campaign && (
                  <p className="text-xs text-muted-foreground">
                    Campaign: <button onClick={() => navigate(`/campaign/${previewCreative.campaign!.id}`)} className="text-primary hover:underline">{previewCreative.campaign.objective}</button>
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Saved {new Date(previewCreative.created_at).toLocaleDateString()}
                </p>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" onClick={() => { openScheduleModal(previewCreative); setPreviewCreative(null); }}>
                    <Calendar className="w-4 h-4 mr-2" /> Schedule
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => navigate("/campaigns")}>
                    Add to Campaign
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => navigate("/campaign/new")}>
                    New Campaign
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { unsaveCreative(previewCreative.id); setPreviewCreative(null); }}>
                    <Heart className="w-4 h-4 mr-2" /> Unsave
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => { deleteCreative(previewCreative.id); setPreviewCreative(null); }}>
                    <Trash2 className="w-4 h-4 mr-2" /> Delete
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Schedule Modal */}
        <Dialog open={showScheduleModal} onOpenChange={setShowScheduleModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Schedule Post</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="time">Time</Label>
                <Input
                  id="time"
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Platforms</Label>
                <div className="flex flex-wrap gap-2">
                  {socialConnections.map((connection) => (
                    <Button
                      key={connection.id}
                      type="button"
                      variant={selectedPlatforms.includes(connection.platform) ? "default" : "outline"}
                      size="sm"
                      onClick={() => togglePlatform(connection.platform)}
                    >
                      {connection.platform.charAt(0).toUpperCase() + connection.platform.slice(1)}
                    </Button>
                  ))}
                </div>
              </div>
              {selectedCreative?.caption && (
                <div className="space-y-2">
                  <Label>Preview</Label>
                  <div className="p-3 bg-muted rounded-md text-sm">
                    {selectedCreative.caption}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowScheduleModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleSchedulePost}>
                Schedule Post
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
