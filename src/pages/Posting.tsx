import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Send,
  Instagram,
  Facebook,
  Twitter,
  Linkedin,
  CheckCircle2,
  AlertCircle,
  Wand2,
  Image as ImageIcon,
} from "lucide-react";
import { toast } from "sonner";

interface SocialChannel {
  id: string;
  platform: string;
  account_name: string | null;
  connected_at: string | null;
  auto_publish: boolean | null;
}

const platformMeta: Record<string, { icon: any; label: string; color: string }> = {
  instagram: { icon: Instagram, label: "Instagram", color: "text-pink-400" },
  facebook: { icon: Facebook, label: "Facebook", color: "text-blue-400" },
  twitter: { icon: Twitter, label: "Twitter / X", color: "text-foreground" },
  linkedin: { icon: Linkedin, label: "LinkedIn", color: "text-blue-500" },
  tiktok: { icon: Send, label: "TikTok", color: "text-foreground" },
  google_business: { icon: Send, label: "Google Business", color: "text-emerald-400" },
};

const allPlatforms = ["instagram", "facebook", "twitter", "linkedin", "tiktok", "google_business"];

export default function Posting() {
  const navigate = useNavigate();
  const [connections, setConnections] = useState<SocialChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectPlatform, setConnectPlatform] = useState<string | null>(null);

  useEffect(() => {
    loadConnections();
  }, []);

  const loadConnections = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { navigate("/auth"); return; }

    const { data } = await supabase
      .from("social_connections_safe" as any)
      .select("*")
      .eq("user_id", session.user.id);

    setConnections((data as unknown as SocialChannel[]) || []);
    setLoading(false);
  };

  const getConnection = (platform: string) =>
    connections.find((c) => c.platform === platform);

  const handleConnect = (platform: string) => {
    setConnectPlatform(platform);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Send className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Posting</h1>
              <p className="text-muted-foreground text-sm">
                Connect your channels and publish content directly from AIson.
              </p>
            </div>
          </div>
        </div>
      </header>
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <Card className="p-5 border-primary/10 bg-primary/5">
          <div className="flex items-start gap-3">
            <Wand2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-foreground text-sm mb-1">Connect channels inside AIson</h3>
              <p className="text-xs text-muted-foreground">
                This page now handles connection guidance in-context. You no longer need to leave the flow just to understand what to do next.
              </p>
            </div>
          </div>
        </Card>

        {/* Channel List */}
        <div className="space-y-3">
          {allPlatforms.map((platform) => {
            const meta = platformMeta[platform];
            const conn = getConnection(platform);
            const Icon = meta.icon;

            return (
              <Card key={platform} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`p-2.5 rounded-xl bg-card ${meta.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground text-sm">{meta.label}</p>
                      {conn ? (
                        <p className="text-xs text-muted-foreground">
                          {conn.account_name || "Connected"} · Since {new Date(conn.connected_at || "").toLocaleDateString()}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">Not connected</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {conn ? (
                      <>
                        <Badge variant="secondary" className="gap-1 text-emerald-400 bg-emerald-500/10">
                          <CheckCircle2 className="w-3 h-3" /> Connected
                        </Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate("/home")}
                          className="gap-1.5"
                        >
                          <ImageIcon className="w-3.5 h-3.5" />
                          Create & Post
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" onClick={() => handleConnect(platform)} className="gap-1.5">
                        <Send className="w-3.5 h-3.5" />
                        Connect
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Info Card */}
        <Card className="p-5 border-primary/10 bg-primary/5">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-foreground text-sm mb-1">Direct Publishing</h3>
              <p className="text-xs text-muted-foreground">
                Once connected, AIson can publish content directly to your channels via their APIs.
                Use the library to schedule content and reuse creatives inside campaigns.
              </p>
            </div>
          </div>
        </Card>
      </div>

      <Dialog open={!!connectPlatform} onOpenChange={(open) => !open && setConnectPlatform(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect {connectPlatform ? platformMeta[connectPlatform]?.label : "channel"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>
              AIson now explains the setup inside the posting flow. The final credential and OAuth steps still live in Settings so your account remains the single place for managing secure connections.
            </p>
            <div className="rounded-xl border border-border p-4">
              <p className="font-medium text-foreground mb-2">What to expect</p>
              <ul className="space-y-2">
                <li>1. Open the Connections tab in Settings.</li>
                <li>2. Add your app credentials or approve OAuth for this channel.</li>
                <li>3. Return here and publish or schedule content without leaving AIson.</li>
              </ul>
            </div>
            <div className="rounded-xl border border-border p-4">
              <p className="font-medium text-foreground mb-2">AIson-side help</p>
              <p>
                We should keep platform-specific instructions, video help, or assistant guidance here instead of sending users to external platform documentation first.
              </p>
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setConnectPlatform(null)}>Close</Button>
              <Button onClick={() => navigate("/account")}>Open Connections settings</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
