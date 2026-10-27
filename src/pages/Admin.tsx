import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { checkIsAdmin } from "@/lib/admin";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Users, Image as ImageIcon, Film, Upload, Link2, RefreshCw, ShieldCheck, Trash2, Download, Zap, AlertTriangle,
} from "lucide-react";

// Higgsfield credit thresholds for admin alerts.
const CREDITS_CRITICAL = 20;
const CREDITS_LOW = 50;

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
  last_sign_in_at: string | null;
  confirmed: boolean;
  creatives: { total: number; image: number; video: number };
  is_admin: boolean;
  is_founder?: boolean;
}

interface Creative {
  id: string;
  content_type: string;
  visual_url: string;
  caption: string | null;
  saved: boolean;
  created_at: string;
  generation_metadata?: Record<string, unknown>;
}

const BUCKET = "admin-creatives";

export default function Admin() {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [meId, setMeId] = useState("");

  // admin-management state
  const [busyAdmin, setBusyAdmin] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [credits, setCredits] = useState<{ configured: boolean; ok?: boolean; credits?: number | null; plan?: string; email?: string; needs_relogin?: boolean; reachable?: boolean } | null>(null);
  const [creditPopupDismissed, setCreditPopupDismissed] = useState(false);
  const [hfPopupDismissed, setHfPopupDismissed] = useState(false);
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [loadingCreatives, setLoadingCreatives] = useState(false);

  // delivery form
  const [mode, setMode] = useState<"upload" | "url">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [contentType, setContentType] = useState("image");
  const [caption, setCaption] = useState("");
  const [delivering, setDelivering] = useState(false);

  // Gate: founder email OR a runtime-granted admin (admins table).
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const email = session?.user?.email || "";
      const id = session?.user?.id || "";
      setMeId(id);
      const ok = await checkIsAdmin(id, email);
      setAllowed(ok);
      setAuthChecked(true);
      if (!ok) {
        toast.error("Admin access only");
        navigate("/home", { replace: true });
      }
    });
  }, [navigate]);

  const call = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke("admin", { body: { action, ...extra } });
    if (error) throw new Error(error.message || "Request failed");
    if (data?.error) throw new Error(data.error);
    return data;
  }, []);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const data = await call("list_users");
      setUsers(data.users || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load accounts");
    } finally {
      setLoadingUsers(false);
    }
  }, [call]);

  const loadCredits = useCallback(async () => {
    try {
      const data = await call("higgsfield_status");
      setCredits(data);
    } catch {
      setCredits({ configured: true, ok: false });
    }
  }, [call]);

  useEffect(() => {
    if (allowed) { loadUsers(); loadCredits(); }
  }, [allowed, loadUsers, loadCredits]);

  const openUser = async (u: UserRow) => {
    setSelected(u);
    setCreatives([]);
    setLoadingCreatives(true);
    try {
      const data = await call("list_creatives", { user_id: u.id });
      setCreatives(data.creatives || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load creatives");
    } finally {
      setLoadingCreatives(false);
    }
  };

  const deliver = async () => {
    if (!selected) return;
    setDelivering(true);
    try {
      let visualUrl = url.trim();

      if (mode === "upload") {
        if (!file) { toast.error("Choose a file first"); setDelivering(false); return; }
        const ext = file.name.split(".").pop() || "bin";
        const path = `${selected.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
          cacheControl: "3600", upsert: false, contentType: file.type || undefined,
        });
        if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
        visualUrl = pub.publicUrl;
      }

      if (!visualUrl) { toast.error("Provide a file or URL"); setDelivering(false); return; }

      await call("upload_creative", {
        user_id: selected.id,
        visual_url: visualUrl,
        content_type: contentType,
        caption: caption.trim(),
      });

      toast.success(`Delivered to ${selected.email}'s Library`);
      setFile(null); setUrl(""); setCaption("");
      await openUser(selected);
      await loadUsers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delivery failed");
    } finally {
      setDelivering(false);
    }
  };

  const removeCreative = async (id: string) => {
    if (!selected) return;
    try {
      await call("delete_creative", { creative_id: id });
      setCreatives((c) => c.filter((x) => x.id !== id));
      toast.success("Removed");
      loadUsers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const toggleAdmin = async () => {
    if (!selected) return;
    setBusyAdmin(true);
    try {
      const makeAdmin = !selected.is_admin;
      await call(makeAdmin ? "add_admin" : "remove_admin", { user_id: selected.id });
      toast.success(makeAdmin ? `${selected.email} is now an admin` : `Admin access revoked for ${selected.email}`);
      setSelected((s) => (s ? { ...s, is_admin: makeAdmin } : s));
      await loadUsers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update admin status");
    } finally {
      setBusyAdmin(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await call("delete_user", { user_id: deleteTarget.id });
      toast.success(`Account deleted: ${deleteTarget.email}`);
      if (selected?.id === deleteTarget.id) setSelected(null);
      setDeleteTarget(null);
      await loadUsers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete account");
    } finally {
      setDeleting(false);
    }
  };

  const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : "—");
  const isVideo = (t: string) => t === "video" || t === "short_video";

  if (!authChecked) {
    return <div className="p-8"><Skeleton className="h-8 w-48 mb-4" /><Skeleton className="h-64 w-full" /></div>;
  }
  if (!allowed) return null;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" /> Admin
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            All accounts on AIson. Deliver generated creatives straight into any user's Library.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {credits?.ok && typeof credits.credits === "number" && (
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border ${
                credits.credits <= CREDITS_CRITICAL
                  ? "bg-destructive/10 border-destructive/40 text-destructive"
                  : credits.credits <= CREDITS_LOW
                    ? "bg-amber-500/10 border-amber-500/40 text-amber-500"
                    : "bg-primary/10 border-primary/30 text-primary"
              }`}
              title="Higgsfield credits (image/video generation)"
            >
              <Zap className="w-4 h-4" /> {credits.credits} credits
            </div>
          )}
          {credits && credits.configured && credits.ok === false && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border bg-destructive/10 border-destructive/40 text-destructive"
              title="Image/video generation is offline">
              <AlertTriangle className="w-4 h-4" /> {credits.needs_relogin ? "Higgsfield: re-login needed" : "Higgsfield: offline"}
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => { loadUsers(); loadCredits(); setCreditPopupDismissed(false); }} disabled={loadingUsers}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loadingUsers ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* Persistent low-credits banner */}
      {credits?.ok && typeof credits.credits === "number" && credits.credits <= CREDITS_LOW && (
        <div className={`mb-6 flex items-start gap-3 rounded-lg border p-3 text-sm ${
          credits.credits <= CREDITS_CRITICAL ? "border-destructive/40 bg-destructive/10" : "border-amber-500/40 bg-amber-500/10"
        }`}>
          <AlertTriangle className={`w-5 h-5 shrink-0 ${credits.credits <= CREDITS_CRITICAL ? "text-destructive" : "text-amber-500"}`} />
          <div>
            <p className="font-medium text-foreground">
              {credits.credits <= CREDITS_CRITICAL ? "Higgsfield credits critically low" : "Higgsfield credits running low"}
              {" — "}{credits.credits} left
            </p>
            <p className="text-muted-foreground">
              Image and video generation stops for every account at 0. Top up at{" "}
              <a href="https://higgsfield.ai" target="_blank" rel="noreferrer" className="underline text-primary">higgsfield.ai</a>.
            </p>
          </div>
        </div>
      )}

      {/* Higgsfield disconnected banner */}
      {credits && credits.configured && credits.ok === false && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0 text-destructive" />
          <div>
            <p className="font-medium text-foreground">
              {credits.needs_relogin ? "Higgsfield login expired — image/video generation is paused" : "Higgsfield generator is offline"}
            </p>
            <p className="text-muted-foreground">
              {credits.needs_relogin
                ? <>Run <code className="px-1 rounded bg-muted">higgsfield auth login</code> on the connected Mac, then it auto-syncs to the cloud. Text, campaigns and reports still work.</>
                : <>The generation bridge isn't reachable right now. Text, campaigns and reports still work; images/videos are temporarily unavailable.</>}
            </p>
          </div>
        </div>
      )}

      {/* Higgsfield re-login popup */}
      <Dialog
        open={!!credits && credits.configured === true && credits.ok === false && !hfPopupDismissed}
        onOpenChange={(o) => { if (!o) setHfPopupDismissed(true); }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" /> {credits?.needs_relogin ? "Higgsfield login expired" : "Higgsfield generator offline"}
            </DialogTitle>
            <DialogDescription className="pt-2 text-foreground">
              {credits?.needs_relogin
                ? <>Image and video generation is <span className="font-medium">paused</span> until Higgsfield is signed in again. On the connected Mac, run <code className="px-1 rounded bg-muted">higgsfield auth login</code> — it then auto-syncs to the always-on cloud server. Everything else (text, campaigns, reports) keeps working.</>
                : <>The generation server isn't responding. Image/video generation is temporarily paused; everything else keeps working. If it doesn't recover shortly, the cloud bridge may need a restart.</>}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setHfPopupDismissed(true)}>Dismiss</Button>
            <Button onClick={() => { loadCredits(); setHfPopupDismissed(true); }}>
              <RefreshCw className="w-4 h-4 mr-2" /> Re-check
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Critical credits popup */}
      <Dialog
        open={!!credits?.ok && typeof credits?.credits === "number" && credits.credits <= CREDITS_CRITICAL && !creditPopupDismissed}
        onOpenChange={(o) => { if (!o) setCreditPopupDismissed(true); }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" /> Higgsfield credits critically low
            </DialogTitle>
            <DialogDescription className="pt-2 text-foreground">
              Only <span className="font-bold">{credits?.credits}</span> credits remain on the Higgsfield account
              ({credits?.email}). When it hits 0, <span className="font-medium">all image and video generation stops</span> for
              every account on the platform — jobs will silently fail to appear in users' Libraries.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setCreditPopupDismissed(true)}>Dismiss</Button>
            <Button asChild>
              <a href="https://higgsfield.ai" target="_blank" rel="noreferrer"><Zap className="w-4 h-4 mr-2" /> Top up now</a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete-account confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" /> Delete account
            </DialogTitle>
            <DialogDescription className="pt-2 text-foreground">
              This permanently deletes <span className="font-semibold">{deleteTarget?.email}</span> and all of their data —
              brands, campaigns, library, scheduled posts, stars and connections. This <span className="font-semibold">cannot be undone</span>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Accounts list */}
        <Card className="lg:col-span-1 p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2 text-sm font-medium">
            <Users className="w-4 h-4 text-muted-foreground" />
            Accounts {loadingUsers ? "" : `(${users.length})`}
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {loadingUsers ? (
              <div className="p-4 space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : users.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No accounts yet.</p>
            ) : (
              users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => openUser(u)}
                  className={`w-full text-left px-4 py-3 border-b border-border/60 hover:bg-accent transition-colors ${
                    selected?.id === u.id ? "bg-primary/10" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground truncate">{u.full_name || u.email.split("@")[0]}</span>
                    {u.is_admin && <Badge variant="secondary" className="text-[10px] shrink-0">admin</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1"><ImageIcon className="w-3 h-3" />{u.creatives.image}</span>
                    <span className="flex items-center gap-1"><Film className="w-3 h-3" />{u.creatives.video}</span>
                    <span>joined {fmt(u.created_at)}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </Card>

        {/* Detail + delivery */}
        <div className="lg:col-span-2 space-y-6">
          {!selected ? (
            <Card className="p-10 text-center text-muted-foreground">
              Select an account to view its Library and deliver creatives.
            </Card>
          ) : (
            <>
              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-foreground">{selected.full_name || selected.email.split("@")[0]}</h2>
                    <p className="text-sm text-muted-foreground">{selected.email}</p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <div>Joined {fmt(selected.created_at)}</div>
                    <div>Last seen {fmt(selected.last_sign_in_at)}</div>
                  </div>
                </div>

                <div className="mt-5 border-t border-border pt-5">
                  <h3 className="text-sm font-medium mb-3 flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Admin controls</h3>
                  <div className="flex flex-wrap items-center gap-2">
                    {selected.is_admin ? (
                      <Button
                        size="sm" variant="outline"
                        onClick={toggleAdmin}
                        disabled={busyAdmin || selected.is_founder}
                      >
                        {busyAdmin ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />}
                        Revoke admin
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={toggleAdmin} disabled={busyAdmin}>
                        {busyAdmin ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />}
                        Make admin
                      </Button>
                    )}
                    <Button
                      size="sm" variant="destructive"
                      onClick={() => setDeleteTarget(selected)}
                      disabled={selected.id === meId || selected.is_founder}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete account
                    </Button>
                    {selected.is_admin && <Badge variant="secondary" className="text-[10px]">admin</Badge>}
                  </div>
                  {selected.id === meId ? (
                    <p className="text-xs text-muted-foreground mt-2">You can't delete your own account here.</p>
                  ) : selected.is_founder ? (
                    <p className="text-xs text-muted-foreground mt-2">Protected founder account — always admin, can't be deleted.</p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-2">Admins can access this page and manage every account. Deleting an account is permanent.</p>
                  )}
                </div>

                <div className="mt-5 border-t border-border pt-5">
                  <h3 className="text-sm font-medium mb-3 flex items-center gap-2"><Upload className="w-4 h-4" /> Deliver a creative</h3>

                  <div className="flex gap-2 mb-3">
                    <Button size="sm" variant={mode === "upload" ? "default" : "outline"} onClick={() => setMode("upload")}>
                      <Upload className="w-3.5 h-3.5 mr-1.5" /> Upload file
                    </Button>
                    <Button size="sm" variant={mode === "url" ? "default" : "outline"} onClick={() => setMode("url")}>
                      <Link2 className="w-3.5 h-3.5 mr-1.5" /> Paste URL
                    </Button>
                  </div>

                  {mode === "upload" ? (
                    <Input type="file" accept="image/*,video/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="mb-3" />
                  ) : (
                    <Input placeholder="https://…/creative.png" value={url} onChange={(e) => setUrl(e.target.value)} className="mb-3" />
                  )}

                  <div className="flex flex-col sm:flex-row gap-3 mb-3">
                    <Select value={contentType} onValueChange={setContentType}>
                      <SelectTrigger className="sm:w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="image">Image</SelectItem>
                        <SelectItem value="video">Video</SelectItem>
                        <SelectItem value="carousel">Carousel</SelectItem>
                        <SelectItem value="story">Story</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input placeholder="Caption (optional)" value={caption} onChange={(e) => setCaption(e.target.value)} className="flex-1" />
                  </div>

                  <Button onClick={deliver} disabled={delivering} className="w-full sm:w-auto">
                    {delivering ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                    Deliver to Library
                  </Button>
                </div>
              </Card>

              <Card className="p-5">
                <h3 className="text-sm font-medium mb-3">Library ({creatives.length})</h3>
                {loadingCreatives ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="aspect-square" />)}</div>
                ) : creatives.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No creatives yet.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {creatives.map((c) => (
                      <div key={c.id} className="group relative rounded-lg overflow-hidden border border-border bg-muted/30">
                        <div className="aspect-square flex items-center justify-center overflow-hidden">
                          {isVideo(c.content_type) ? (
                            <video src={c.visual_url} className="w-full h-full object-cover" muted loop
                              onMouseOver={(e) => (e.currentTarget as HTMLVideoElement).play()}
                              onMouseOut={(e) => (e.currentTarget as HTMLVideoElement).pause()} />
                          ) : (
                            <img src={c.visual_url} alt={c.caption || ""} className="w-full h-full object-cover" loading="lazy" />
                          )}
                        </div>
                        <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-between">
                          <a href={c.visual_url} target="_blank" rel="noreferrer" className="text-white text-xs flex items-center gap-1">
                            <Download className="w-3.5 h-3.5" /> Open
                          </a>
                          <button onClick={() => removeCreative(c.id)} className="text-white/90 hover:text-red-400">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {c.generation_metadata?.provider === "admin_upload" && (
                          <Badge className="absolute top-1.5 left-1.5 text-[9px]" variant="secondary">delivered</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
