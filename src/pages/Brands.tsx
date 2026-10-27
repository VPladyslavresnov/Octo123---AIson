import { useState } from "react";
import { useBrands } from "@/hooks/useBrands";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Check, Plus, Trash2, Globe, Sparkles, Star, Loader2, RefreshCw, Pencil, X } from "lucide-react";
import type { BrandProfile } from "@/hooks/useBrandIntelligence";

export default function Brands() {
  const { brands, activeBrandId, loading, busy, setActive, addFromUrl, addManual, updateBrand, remove, load } = useBrands();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [m, setM] = useState({ brand_name: "", tone_of_voice: "", visual_style: "", industry: "", target_audience_signals: "", color: "#000000" });

  // Edit an existing brand
  const [editing, setEditing] = useState<BrandProfile | null>(null);
  const [ef, setEf] = useState({ brand_name: "", tagline: "", industry: "", website: "", location: "", tone_of_voice: "", visual_style: "", target_audience_signals: "", colors: [] as string[] });

  const openEdit = (b: BrandProfile) => {
    setEditing(b);
    setEf({
      brand_name: b.brand_name || "",
      tagline: b.tagline || "",
      industry: b.industry || "",
      website: b.website || (b.source_url && !b.source_url.startsWith("manual:") ? b.source_url : "") || "",
      location: b.location || "",
      tone_of_voice: b.tone_of_voice || "",
      visual_style: b.visual_style || "",
      target_audience_signals: b.target_audience_signals || "",
      colors: [...(b.primary_colors || []), ...(b.secondary_colors || [])].filter(Boolean).slice(0, 5),
    });
  };
  const saveEdit = async () => {
    if (!editing) return;
    if (!ef.brand_name.trim()) { return; }
    const ok = await updateBrand(editing.id, {
      brand_name: ef.brand_name,
      tagline: ef.tagline,
      industry: ef.industry,
      website: ef.website,
      location: ef.location,
      tone_of_voice: ef.tone_of_voice,
      visual_style: ef.visual_style,
      target_audience_signals: ef.target_audience_signals,
      primary_colors: ef.colors.slice(0, 2),
      secondary_colors: ef.colors.slice(2),
    });
    if (ok) setEditing(null);
  };

  const submitUrl = async () => {
    const b = await addFromUrl(url);
    if (b) { setUrl(""); setOpen(false); }
  };
  const submitManual = async () => {
    const b = await addManual({
      brand_name: m.brand_name, tone_of_voice: m.tone_of_voice, visual_style: m.visual_style,
      industry: m.industry, target_audience_signals: m.target_audience_signals,
      primary_colors: m.color ? [m.color] : [],
    });
    if (b) { setM({ brand_name: "", tone_of_voice: "", visual_style: "", industry: "", target_audience_signals: "", color: "#000000" }); setOpen(false); }
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" /> Brands
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage the brands on this account. The <span className="text-foreground font-medium">active</span> brand is used for all new content and campaigns.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-2" /> Add brand</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader><DialogTitle>Add a brand</DialogTitle></DialogHeader>
              <Tabs defaultValue="url">
                <TabsList className="w-full">
                  <TabsTrigger value="url" className="flex-1"><Globe className="w-4 h-4 mr-1.5" /> From website</TabsTrigger>
                  <TabsTrigger value="manual" className="flex-1"><Sparkles className="w-4 h-4 mr-1.5" /> Manually</TabsTrigger>
                </TabsList>
                <TabsContent value="url" className="space-y-3 pt-2">
                  <p className="text-sm text-muted-foreground">We'll analyse the site and build the brand — name, colours, tone and visual style.</p>
                  <Input placeholder="yourbrand.com" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitUrl()} />
                  <DialogFooter>
                    <Button onClick={submitUrl} disabled={busy || !url.trim()}>
                      {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Globe className="w-4 h-4 mr-2" />} Build brand
                    </Button>
                  </DialogFooter>
                </TabsContent>
                <TabsContent value="manual" className="space-y-3 pt-2">
                  <Input placeholder="Brand name *" value={m.brand_name} onChange={(e) => setM({ ...m, brand_name: e.target.value })} />
                  <Input placeholder="Industry (e.g. specialty coffee)" value={m.industry} onChange={(e) => setM({ ...m, industry: e.target.value })} />
                  <Input placeholder="Tone of voice (e.g. friendly, premium)" value={m.tone_of_voice} onChange={(e) => setM({ ...m, tone_of_voice: e.target.value })} />
                  <Input placeholder="Visual style (e.g. minimal, warm, editorial)" value={m.visual_style} onChange={(e) => setM({ ...m, visual_style: e.target.value })} />
                  <Input placeholder="Target audience" value={m.target_audience_signals} onChange={(e) => setM({ ...m, target_audience_signals: e.target.value })} />
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Primary colour</span>
                    <input type="color" value={m.color} onChange={(e) => setM({ ...m, color: e.target.value })} className="w-10 h-8 rounded border border-border bg-transparent" />
                  </div>
                  <DialogFooter>
                    <Button onClick={submitManual} disabled={busy || !m.brand_name.trim()}>
                      {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />} Add brand
                    </Button>
                  </DialogFooter>
                </TabsContent>
              </Tabs>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-44" />)}
        </div>
      ) : brands.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground mt-6">
          No brands yet. Click <span className="text-foreground font-medium">Add brand</span> to create your first one from a website or by hand.
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          {brands.map((b) => {
            const active = b.id === activeBrandId;
            const colors = [...(b.primary_colors || []), ...(b.secondary_colors || [])].filter(Boolean).slice(0, 5);
            return (
              <Card key={b.id} className={`p-4 flex flex-col ${active ? "ring-2 ring-primary" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-foreground truncate flex items-center gap-1.5">
                      {active && <Star className="w-4 h-4 text-primary fill-primary shrink-0" />}
                      {b.brand_name || "Untitled brand"}
                    </h3>
                    <p className="text-xs text-muted-foreground truncate">
                      {b.is_manual ? "Manual" : b.source_url?.replace(/^https?:\/\//, "")}
                    </p>
                  </div>
                  {active && <Badge className="text-[10px] shrink-0">Active</Badge>}
                </div>

                {b.industry && <p className="text-xs text-muted-foreground mt-2">{b.industry}</p>}
                {b.tone_of_voice && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">Tone: {b.tone_of_voice}</p>}

                {colors.length > 0 && (
                  <div className="flex gap-1.5 mt-3">
                    {colors.map((c, i) => <span key={i} className="w-5 h-5 rounded-full border border-border" style={{ background: c }} title={c} />)}
                  </div>
                )}

                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border">
                  {active ? (
                    <span className="text-xs text-primary flex items-center gap-1 flex-1"><Check className="w-3.5 h-3.5" /> In use</span>
                  ) : (
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => setActive(b.id)} disabled={busy}>
                      Set active
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground px-2" onClick={() => openEdit(b)} title="Edit brand">
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive px-2"><Trash2 className="w-4 h-4" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove {b.brand_name || "this brand"}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This deletes the brand profile. Content already generated stays in your Library. This can't be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => remove(b.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit brand dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit brand</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Brand name</label>
              <Input value={ef.brand_name} onChange={(e) => setEf({ ...ef, brand_name: e.target.value })} placeholder="Brand name" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Tagline</label>
              <Input value={ef.tagline} onChange={(e) => setEf({ ...ef, tagline: e.target.value })} placeholder="Optional tagline" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Industry</label>
              <Input value={ef.industry} onChange={(e) => setEf({ ...ef, industry: e.target.value })} placeholder="e.g. specialty coffee" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Website</label>
                <Input value={ef.website} onChange={(e) => setEf({ ...ef, website: e.target.value })} placeholder="brand.com" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Location</label>
                <Input value={ef.location} onChange={(e) => setEf({ ...ef, location: e.target.value })} placeholder="London, UK" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Tone of voice</label>
              <Input value={ef.tone_of_voice} onChange={(e) => setEf({ ...ef, tone_of_voice: e.target.value })} placeholder="e.g. friendly, premium" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Visual style</label>
              <Input value={ef.visual_style} onChange={(e) => setEf({ ...ef, visual_style: e.target.value })} placeholder="e.g. minimal, warm, editorial" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Target audience</label>
              <Input value={ef.target_audience_signals} onChange={(e) => setEf({ ...ef, target_audience_signals: e.target.value })} placeholder="Who they're for" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Brand colours</label>
              <div className="flex items-center gap-2 flex-wrap mt-1">
                {ef.colors.map((c, i) => (
                  <div key={i} className="relative">
                    <input type="color" value={c} onChange={(e) => { const n = [...ef.colors]; n[i] = e.target.value; setEf({ ...ef, colors: n }); }}
                      className="w-9 h-9 rounded border border-border bg-transparent" />
                    <button onClick={() => setEf({ ...ef, colors: ef.colors.filter((_, idx) => idx !== i) })}
                      className="absolute -top-1.5 -right-1.5 bg-background border border-border rounded-full p-0.5 text-muted-foreground hover:text-destructive">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {ef.colors.length < 5 && (
                  <Button size="sm" variant="outline" onClick={() => setEf({ ...ef, colors: [...ef.colors, "#000000"] })}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> Colour
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">First two are used as primary brand colours in generated content.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={busy || !ef.brand_name.trim()}>
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />} Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
