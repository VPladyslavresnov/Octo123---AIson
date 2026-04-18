import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface BrandProfile {
  id: string;
  user_id: string;
  source_url: string;
  brand_name: string | null;
  tagline: string | null;
  brand_description: string | null;
  tone_of_voice: string | null;
  key_messages: string[];
  primary_colors: string[];
  secondary_colors: string[];
  font_style: string | null;
  visual_style: string | null;
  content_themes: string[];
  posting_style: string | null;
  cta_patterns: string[];
  hashtags: string[];
  emoji_usage: boolean;
  content_examples: string[];
  target_audience_signals: string | null;
  industry: string | null;
  location: string | null;
  competitors_mentioned: string[];
  social_data: any;
  screenshot_url: string | null;
  scraped_at: string;
  created_at: string;
  updated_at: string;
}

interface ScanResult {
  success: boolean;
  cached?: boolean;
  data?: BrandProfile;
  error?: string;
  message?: string;
}

export function useBrandIntelligence() {
  const [isScanning, setIsScanning] = useState(false);
  const [brandProfile, setBrandProfile] = useState<BrandProfile | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const scanUrl = useCallback(async (url: string, options?: { force_refresh?: boolean; campaign_id?: string }) => {
    if (!url.trim()) return null;

    setIsScanning(true);
    setScanError(null);

    try {
      const { data, error } = await supabase.functions.invoke('brand-intelligence', {
        body: {
          url,
          force_refresh: options?.force_refresh || false,
          campaign_id: options?.campaign_id,
        }
      });

      if (error) throw error;

      const result = data as ScanResult;

      if (result.success && result.data) {
        setBrandProfile(result.data);
        if (result.cached) {
          toast.success(`Brand profile loaded from cache`);
        } else {
          toast.success(`✓ Brand profile built from ${new URL(url.startsWith('http') ? url : `https://${url}`).hostname}`);
        }
        return result.data;
      } else {
        const msg = result.message || "Brand scanning failed. Please fill in details manually.";
        setScanError(msg);
        toast.error(msg);
        return null;
      }
    } catch {
      const msg = "Brand scanning temporarily unavailable — your content will still be generated using your manually entered details";
      setScanError(msg);
      toast.error(msg);
      return null;
    } finally {
      setIsScanning(false);
    }
  }, []);

  const loadExistingProfile = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;

      const { data } = await supabase
        .from('brand_profiles')
        .select('*')
        .eq('user_id', session.user.id)
        .order('scraped_at', { ascending: false })
        .limit(1)
        .maybeSingle() as { data: BrandProfile | null };

      if (data) {
        setBrandProfile(data);
        return data;
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  const isStale = brandProfile
    ? (Date.now() - new Date(brandProfile.scraped_at).getTime()) > 7 * 24 * 60 * 60 * 1000
    : false;

  return {
    isScanning,
    brandProfile,
    scanError,
    isStale,
    scanUrl,
    loadExistingProfile,
    setBrandProfile,
  };
}
