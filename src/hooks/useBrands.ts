import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { BrandProfile } from "@/hooks/useBrandIntelligence";

// Multi-brand management. An account can hold several brand_profiles; one is the
// "active" brand (profiles.active_brand_id) that generation uses by default.
export function useBrands() {
  const [brands, setBrands] = useState<BrandProfile[]>([]);
  const [activeBrandId, setActiveBrandId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setBrands([]); setActiveBrandId(null); return; }

      const [{ data: rows }, { data: profile }] = await Promise.all([
        supabase.from("brand_profiles").select("*").eq("user_id", session.user.id).order("created_at", { ascending: true }),
        (supabase.from("profiles").select("active_brand_id").eq("id", session.user.id).maybeSingle() as any),
      ]);

      const list = (rows as BrandProfile[]) || [];
      setBrands(list);
      // Resolve active: stored pointer if it still exists, else newest brand.
      const stored = (profile as any)?.active_brand_id as string | null;
      const valid = stored && list.some((b) => b.id === stored) ? stored : (list.length ? list[list.length - 1].id : null);
      setActiveBrandId(valid);
      if (valid && valid !== stored) {
        await (supabase.from("profiles").update({ active_brand_id: valid }).eq("id", session.user.id) as any);
      }
    } catch {
      // stay quiet; UI shows empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Keep every useBrands instance (page + sidebar switcher) in sync.
    const onChange = () => load();
    window.addEventListener("aison:brands-changed", onChange);
    return () => window.removeEventListener("aison:brands-changed", onChange);
  }, [load]);

  // Mirror a brand's details into company_details so generation (which reads
  // company_details) always reflects the ACTIVE brand. This is what makes
  // "company details" per-brand instead of one global set.
  const syncCompanyDetails = useCallback(async (brand: BrandProfile | undefined | null) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !brand) return;
    const colors = [...(brand.primary_colors || []), ...(brand.secondary_colors || [])].filter(Boolean).slice(0, 5);
    try {
      await (supabase.from("company_details").upsert({
        user_id: session.user.id,
        company_name: brand.brand_name || "",
        business_type: brand.industry || "",
        target_audience: brand.target_audience_signals || "",
        website: (brand.website || brand.source_url || "").replace(/^manual:.*/, ""),
        location: brand.location || "",
        brand_colors: colors,
      }, { onConflict: "user_id" }) as any);
    } catch { /* non-fatal */ }
  }, []);

  const setActive = useCallback(async (brandId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setActiveBrandId(brandId);
    const { error } = await (supabase.from("profiles").update({ active_brand_id: brandId }).eq("id", session.user.id) as any);
    if (error) { toast.error("Couldn't switch brand"); return; }
    const b = brands.find((x) => x.id === brandId);
    await syncCompanyDetails(b);
    toast.success(`Active brand: ${b?.brand_name || "updated"}`);
    window.dispatchEvent(new Event("aison:brands-changed"));
  }, [brands, syncCompanyDetails]);

  const addFromUrl = useCallback(async (url: string): Promise<BrandProfile | null> => {
    if (!url.trim()) return null;
    setBusy(true);
    try {
      // Always force a fresh scrape so colours/brand data reflect the live site
      // (the function otherwise serves a 7-day cache).
      const { data, error } = await supabase.functions.invoke("brand-intelligence", { body: { url: url.trim(), force_refresh: true } });
      if (error) throw new Error(error.message);
      if (data?.error || !data?.data) throw new Error(data?.error || "Could not build brand from that URL");
      toast.success(`Added ${data.data.brand_name || "brand"}`);
      await load();
      await setActive(data.data.id);
      return data.data as BrandProfile;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add brand");
      return null;
    } finally {
      setBusy(false);
    }
  }, [load, setActive]);

  const addManual = useCallback(async (fields: {
    brand_name: string;
    tone_of_voice?: string;
    visual_style?: string;
    industry?: string;
    target_audience_signals?: string;
    primary_colors?: string[];
  }): Promise<BrandProfile | null> => {
    if (!fields.brand_name.trim()) { toast.error("Brand name is required"); return null; }
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;
      const row = {
        user_id: session.user.id,
        source_url: `manual:${crypto.randomUUID()}`,
        is_manual: true,
        brand_name: fields.brand_name.trim(),
        tone_of_voice: fields.tone_of_voice?.trim() || null,
        visual_style: fields.visual_style?.trim() || null,
        industry: fields.industry?.trim() || null,
        target_audience_signals: fields.target_audience_signals?.trim() || null,
        primary_colors: (fields.primary_colors || []).filter(Boolean),
      };
      const { data, error } = await (supabase.from("brand_profiles").insert(row as any).select().single() as any);
      if (error) throw new Error(error.message);
      toast.success(`Added ${row.brand_name}`);
      await load();
      await setActive(data.id);
      return data as BrandProfile;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add brand");
      return null;
    } finally {
      setBusy(false);
    }
  }, [load, setActive]);

  const updateBrand = useCallback(async (brandId: string, fields: {
    brand_name?: string;
    tone_of_voice?: string;
    visual_style?: string;
    industry?: string;
    target_audience_signals?: string;
    tagline?: string;
    location?: string;
    website?: string;
    primary_colors?: string[];
    secondary_colors?: string[];
  }): Promise<boolean> => {
    setBusy(true);
    try {
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(fields)) {
        if (v === undefined) continue;
        patch[k] = typeof v === "string" ? v.trim() : v;
      }
      const { error } = await supabase.from("brand_profiles").update(patch).eq("id", brandId);
      if (error) throw new Error(error.message);
      toast.success("Brand updated");
      await load();
      // If we edited the active brand, mirror its details into company_details.
      if (brandId === activeBrandId) {
        await syncCompanyDetails({ ...(brands.find((b) => b.id === brandId) as BrandProfile), ...patch } as BrandProfile);
      }
      window.dispatchEvent(new Event("aison:brands-changed"));
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update brand");
      return false;
    } finally {
      setBusy(false);
    }
  }, [load, activeBrandId, brands, syncCompanyDetails]);

  const remove = useCallback(async (brandId: string) => {
    setBusy(true);
    try {
      const { error } = await supabase.from("brand_profiles").delete().eq("id", brandId);
      if (error) throw new Error(error.message);
      toast.success("Brand removed");
      await load();
      window.dispatchEvent(new Event("aison:brands-changed"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove brand");
    } finally {
      setBusy(false);
    }
  }, [load]);

  const activeBrand = brands.find((b) => b.id === activeBrandId) || null;

  return { brands, activeBrand, activeBrandId, loading, busy, load, setActive, addFromUrl, addManual, updateBrand, remove };
}

/**
 * Server-lite helper: resolve the account's active brand profile for generation.
 * Prefers profiles.active_brand_id, falls back to the newest brand.
 */
export async function getActiveBrandProfile(): Promise<BrandProfile | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data: profile } = await (supabase.from("profiles").select("active_brand_id").eq("id", session.user.id).maybeSingle() as any);
  const activeId = (profile as any)?.active_brand_id as string | null;
  if (activeId) {
    const { data } = await supabase.from("brand_profiles").select("*").eq("id", activeId).maybeSingle();
    if (data) return data as BrandProfile;
  }
  const { data } = await supabase.from("brand_profiles").select("*").eq("user_id", session.user.id)
    .order("scraped_at", { ascending: false }).limit(1).maybeSingle();
  return (data as BrandProfile) || null;
}
