import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Loader2,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import {
  clearMetaManualConnection,
  getMetaManualConnection,
  saveMetaManualConnection,
  verifyMetaManualConnection,
  type MetaManualConnection,
} from "@/lib/metaLocalConnector";
import { getBypassRedirectTarget, shouldBypassAuth } from "@/lib/localAccessBypass";

interface SocialChannel {
  id: string;
  platform: string;
  account_name: string | null;
  platform_account_id?: string | null;
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [connections, setConnections] = useState<SocialChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectPlatform, setConnectPlatform] = useState<string | null>(null);
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);
  const [metaSetupError, setMetaSetupError] = useState<string | null>(null);
  const [manualMetaConnection, setManualMetaConnection] = useState<MetaManualConnection | null>(null);
  const [manualIgId, setManualIgId] = useState("");
  const [manualAccessToken, setManualAccessToken] = useState("");
  const [savingManualConnection, setSavingManualConnection] = useState(false);

  useEffect(() => {
    loadConnections();
    const manual = getMetaManualConnection();
    setManualMetaConnection(manual);
    if (manual) {
      setManualIgId(manual.instagramBusinessAccountId);
      setManualAccessToken(manual.accessToken);
    }
  }, []);

  useEffect(() => {
    const metaStatus = searchParams.get("meta");
    if (!metaStatus) return;

    if (metaStatus === "connected") {
      toast.success("Instagram connected through Meta");
      loadConnections();
    }
    if (metaStatus === "error") {
      toast.error(`Meta connection failed: ${searchParams.get("reason") || "Please try again"}`);
    }
    setSearchParams({});
  }, [searchParams, setSearchParams]);

  const loadConnections = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      if (shouldBypassAuth()) {
        setConnections([]);
        setLoading(false);
        return;
      }
      navigate(getBypassRedirectTarget());
      return;
    }

    const { data } = await supabase
      .from("social_connections_safe" as any)
      .select("*")
      .eq("user_id", session.user.id);

    setConnections((data as unknown as SocialChannel[]) || []);
    setLoading(false);
  };

  const getConnection = (platform: string) =>
    platform === "instagram" && manualMetaConnection
      ? {
          id: "manual-meta",
          platform: "instagram",
          account_name: manualMetaConnection.accountName || "Manual Meta test connection",
          platform_account_id: manualMetaConnection.instagramBusinessAccountId,
          connected_at: manualMetaConnection.connectedAt,
          auto_publish: false,
        }
      : connections.find((c) => c.platform === platform);

  const handleSaveManualMetaConnection = async () => {
    if (!manualIgId.trim() || !manualAccessToken.trim()) {
      toast.error("Instagram Business Account ID and access token are required.");
      return;
    }

    setSavingManualConnection(true);
    try {
      const draft = saveMetaManualConnection({
        instagramBusinessAccountId: manualIgId.trim(),
        accessToken: manualAccessToken.trim(),
        accountName: "Verifying...",
      });
      const accountName = await verifyMetaManualConnection(draft);
      const saved = saveMetaManualConnection({
        instagramBusinessAccountId: draft.instagramBusinessAccountId,
        accessToken: draft.accessToken,
        accountName,
      });
      setManualMetaConnection(saved);
      setConnectPlatform(null);
      toast.success(`Instagram connected as ${accountName}`);
    } catch (error: any) {
      clearMetaManualConnection();
      setManualMetaConnection(null);
      toast.error(error.message || "Unable to verify Meta token.");
    } finally {
      setSavingManualConnection(false);
    }
  };

  const handleClearManualMetaConnection = () => {
    clearMetaManualConnection();
    setManualMetaConnection(null);
    setManualIgId("");
    setManualAccessToken("");
    toast.success("Manual Meta connection removed");
  };

  const handleConnect = async (platform: string) => {
    if (platform === "instagram" || platform === "facebook") {
      setConnectingPlatform(platform);
      try {
        const { data, error } = await supabase.functions.invoke("meta-oauth", {
          body: { platform },
        });

        if (error) throw new Error(extractFunctionError(error));
        if (!data?.authUrl) throw new Error("Meta did not return a connection URL");

        toast.success("Opening Meta authorization...");
        window.location.href = data.authUrl;
      } catch (error: any) {
        const message = error.message || "Unable to start Meta connection";
        setMetaSetupError(message);
        setConnectPlatform(platform);
        toast.error("Meta connector needs setup before it can authorize users.");
      } finally {
        setConnectingPlatform(null);
      }
      return;
    }
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
                Instagram uses Meta OAuth, so AIson never asks for or stores your Instagram password.
                Connect once, then publish approved image creatives directly from the Library.
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-5 border-emerald-500/20 bg-emerald-500/5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="font-semibold text-foreground text-sm">Real Meta connector</h3>
              <p className="text-xs text-muted-foreground">
                Requirements: Meta app credentials, Instagram Professional account, Facebook Page link, and
                publishing permissions. Media must be hosted at a public URL before Meta can publish it.
              </p>
              {manualMetaConnection ? (
                <p className="text-xs text-emerald-300">
                  Manual Meta test connection is active, so Library publishing can post image creatives now.
                </p>
              ) : (
                <p className="text-xs text-emerald-300">
                  If OAuth is not deployed yet, use the manual Meta test connector in the popup to publish now.
                </p>
              )}
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
                          {conn.platform_account_id ? ` · ID ${conn.platform_account_id}` : ""}
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
                          onClick={() => navigate("/library")}
                          className="gap-1.5"
                        >
                          <ImageIcon className="w-3.5 h-3.5" />
                          Publish from Library
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleConnect(platform)}
                        className="gap-1.5"
                        disabled={connectingPlatform === platform}
                      >
                        {connectingPlatform === platform ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : platform === "instagram" || platform === "facebook" ? (
                          <ExternalLink className="w-3.5 h-3.5" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                        {platform === "instagram" || platform === "facebook" ? "Connect with Meta" : "Connect"}
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
          {connectPlatform === "instagram" || connectPlatform === "facebook" ? (
            <div className="space-y-4 text-sm text-muted-foreground">
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4">
                <p className="font-medium text-foreground mb-2">Meta OAuth is not ready yet</p>
                <p>{metaSetupError || "The Meta authorization backend is not configured for this environment."}</p>
              </div>
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
                <div>
                  <p className="font-medium text-foreground mb-1">Publish now with a Meta test token</p>
                  <p>
                    For immediate testing, paste an Instagram Business Account ID and a Meta access token with
                    `instagram_basic` and `instagram_content_publish`. AIson will use it only in this browser.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manualIgId">Instagram Business Account ID</Label>
                  <Input
                    id="manualIgId"
                    value={manualIgId}
                    onChange={(event) => setManualIgId(event.target.value)}
                    placeholder="1784..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manualAccessToken">Meta access token</Label>
                  <Input
                    id="manualAccessToken"
                    value={manualAccessToken}
                    onChange={(event) => setManualAccessToken(event.target.value)}
                    type="password"
                    placeholder="EAAB..."
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleSaveManualMetaConnection} disabled={savingManualConnection}>
                    {savingManualConnection && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Verify & Save Test Connection
                  </Button>
                  {manualMetaConnection && (
                    <Button variant="outline" onClick={handleClearManualMetaConnection}>
                      Remove Test Connection
                    </Button>
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-border p-4">
                <p className="font-medium text-foreground mb-2">Required to make this button complete OAuth</p>
                <ul className="space-y-2">
                  <li>1. Deploy the Supabase function `meta-oauth`.</li>
                  <li>2. Deploy migration `20260421103000_add_meta_social_connection_fields.sql`.</li>
                  <li>3. Add `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`, `FRONTEND_URL`, and `ENCRYPTION_MASTER_KEY` as Supabase secrets.</li>
                  <li>4. Add the exact `META_REDIRECT_URI` to Valid OAuth Redirect URIs in the Meta app.</li>
                  <li>5. Use an Instagram Professional account linked to a Facebook Page.</li>
                </ul>
              </div>
              <div className="rounded-xl border border-border p-4">
                <p className="font-medium text-foreground mb-2">Current safe behavior</p>
                <p>
                  AIson is not asking for Instagram passwords. Once the backend secrets are deployed, this same button opens the official Meta OAuth screen and stores only the returned token.
                </p>
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setConnectPlatform(null)}>Close</Button>
                <Button onClick={() => handleConnect(connectPlatform)} disabled={connectingPlatform === connectPlatform}>
                  {connectingPlatform === connectPlatform && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Retry Meta OAuth
                </Button>
              </div>
            </div>
          ) : (
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
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function extractFunctionError(error: any): string {
  try {
    const contextBody = error?.context?.body;
    const parsed = typeof contextBody === "string" ? JSON.parse(contextBody) : contextBody;
    if (parsed?.error) return parsed.error;
  } catch {
    // Fall through to generic parsing.
  }

  const message = String(error?.message || "");
  if (message.includes("FunctionsHttpError") || message.includes("non-2xx")) {
    return "The `meta-oauth` edge function is not deployed or its Meta secrets are missing.";
  }
  if (message.includes("Failed to fetch")) {
    return "The Meta OAuth backend could not be reached from this environment.";
  }
  return message || "Unable to start Meta OAuth.";
}
