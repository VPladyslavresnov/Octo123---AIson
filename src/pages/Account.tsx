import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  User, Building2, Key, DollarSign, LogOut, Save, Plus, Trash2,
  Images, Share2, Loader2
} from "lucide-react";
import { toast } from "sonner";
import type { Session } from "@supabase/supabase-js";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { z } from "zod";
import { BrandAssetLibrary } from "@/components/BrandAssetLibrary";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBrandIntelligence } from "@/hooks/useBrandIntelligence";
import { BrandIntelligenceSummary } from "@/components/BrandIntelligenceSummary";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { motion } from "framer-motion";

const DEFAULT_MODEL = "openai/gpt-5";

const Account = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");

  const [companyName, setCompanyName] = useState("");
  const [website, setWebsite] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [brandSourceUrl, setBrandSourceUrl] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [location, setLocation] = useState("");
  const [brandColors, setBrandColors] = useState<string[]>(["#000000"]);
  const [preferredModel, setPreferredModel] = useState(DEFAULT_MODEL);

  const [balance, setBalance] = useState(0);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("");

  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [newApiService, setNewApiService] = useState("");
  const [newApiKey, setNewApiKey] = useState("");

  const [socialConnections, setSocialConnections] = useState<any[]>([]);
  const { isScanning, brandProfile, scanUrl, loadExistingProfile, scanError } = useBrandIntelligence();
  const [brandScanDone, setBrandScanDone] = useState(false);
  const [connectingPlatform, setConnectingPlatform] = useState(false);
  const [showCredentialModal, setShowCredentialModal] = useState(false);
  const [credentialPlatform, setCredentialPlatform] = useState<{ id: string; label: string; setupUrl: string } | null>(null);
  const [credentialClientId, setCredentialClientId] = useState("");
  const [credentialClientSecret, setCredentialClientSecret] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { navigate("/auth"); return; }
      setSession(session);
      loadUserData(session.user.id);
      loadExistingProfile();
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) navigate("/auth");
      else setSession(session);
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const loadUserData = async (userId: string) => {
    try {
      const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).single();
      if (profile) { setFullName(profile.full_name || ""); setEmail(profile.email || ""); }

      const { data: company } = await supabase.from("company_details").select("*").eq("user_id", userId).maybeSingle();
      if (company) {
        setCompanyName(company.company_name || "");
        setWebsite(company.website || "");
        setTargetAudience(company.target_audience || "");
        setBrandSourceUrl(company.brand_source_url || "");
        setBusinessType(company.business_type || "");
        setLocation(company.location || "");
        setPreferredModel((company as any).preferred_model || DEFAULT_MODEL);
        const colors = company.brand_colors;
        if (Array.isArray(colors) && colors.every(c => typeof c === "string")) setBrandColors(colors as string[]);
        else setBrandColors(["#000000"]);
      }

      const { data: userBalance } = await supabase.from("user_balance").select("*").eq("user_id", userId).single();
      if (userBalance) setBalance(Number(userBalance.balance));

      const { data: connections } = await supabase.from("social_connections_safe" as any).select("*").eq("user_id", userId);
      if (connections) setSocialConnections(connections);

      const { data: keysResult } = await supabase.functions.invoke("manage-api-keys", { body: { action: "list" } });
      if (keysResult?.keys) setApiKeys(keysResult.keys);
    } catch {} finally { setLoading(false); }
  };

  const handleUpdateProfile = async () => {
    if (!session?.user) return;
    try {
      const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", session.user.id);
      if (error) throw error;
      toast.success("Changes saved");
    } catch { toast.error("Something went wrong saving your data. Please try again."); }
  };

  const companySchema = z.object({
    companyName: z.string().trim().max(100).optional(),
    website: z.string().trim().url().max(255).or(z.literal("")).optional(),
    targetAudience: z.string().trim().max(500).optional(),
    brandSourceUrl: z.string().trim().url().max(255).or(z.literal("")).optional(),
    businessType: z.string().trim().max(100).optional(),
    location: z.string().trim().max(100).optional(),
    brandColors: z.array(z.string().regex(/^#[0-9A-Fa-f]{6}$/)).min(1).max(5),
  });

  const handleUpdateCompany = async () => {
    if (!session?.user) return;
    const validation = companySchema.safeParse({ companyName, website, targetAudience, brandSourceUrl, businessType, location, brandColors });
    if (!validation.success) { validation.error.issues.forEach(err => toast.error(err.message)); return; }
    try {
      const { error } = await supabase.from("company_details").upsert({
        user_id: session.user.id, company_name: companyName.trim(), website: website.trim(),
        target_audience: targetAudience.trim(), brand_source_url: brandSourceUrl.trim(),
        business_type: businessType.trim(), location: location.trim(), brand_colors: brandColors,
        preferred_model: preferredModel || DEFAULT_MODEL,
      } as any, { onConflict: "user_id" });
      if (error) throw error;
      toast.success("Changes saved");
      const urlToScan = brandSourceUrl.trim() || website.trim();
      if (urlToScan) { setBrandScanDone(false); const profile = await scanUrl(urlToScan); if (profile) setBrandScanDone(true); }
    } catch { toast.error("Something went wrong saving your data. Please try again."); }
  };

  const handleApplyBrandToAccount = async (profile: import("@/hooks/useBrandIntelligence").BrandProfile) => {
    if (!session?.user) return;
    if (profile.brand_name) setCompanyName(profile.brand_name);
    if (profile.industry) setBusinessType(profile.industry);
    if (profile.target_audience_signals) setTargetAudience(profile.target_audience_signals);
    if (profile.location) setLocation(profile.location);
    if (profile.primary_colors?.length > 0) {
      const newColors = [...profile.primary_colors, ...(profile.secondary_colors || [])].filter(Boolean).slice(0, 5);
      if (newColors.length > 0) setBrandColors(newColors);
    }
    try {
      await supabase.from("company_details").upsert({
        user_id: session.user.id, company_name: profile.brand_name || companyName.trim(),
        website: website.trim(), target_audience: profile.target_audience_signals || targetAudience.trim(),
        brand_source_url: brandSourceUrl.trim(), business_type: profile.industry || businessType.trim(),
        location: profile.location || location.trim(),
        brand_colors: [...profile.primary_colors, ...(profile.secondary_colors || [])].filter(Boolean).slice(0, 5),
        preferred_model: preferredModel || DEFAULT_MODEL,
      } as any, { onConflict: "user_id" });
      toast.success("Changes saved — brand intelligence applied");
    } catch { toast.error("Failed to save. Please try again."); }
  };

  const handleAddColor = () => { if (brandColors.length < 5) setBrandColors([...brandColors, "#000000"]); else toast.error("Maximum 5 brand colors"); };
  const handleRemoveColor = (i: number) => { if (brandColors.length > 1) setBrandColors(brandColors.filter((_, idx) => idx !== i)); };
  const handleColorChange = (i: number, c: string) => { const n = [...brandColors]; n[i] = c; setBrandColors(n); };

  const handleTopUp = async () => {
    toast.info("To add credits, please use the integrated payment system. Contact support for assistance.");
    setTopUpAmount(""); setShowTopUpModal(false);
  };

  const handleAddApiKey = async () => {
    if (!session?.user || !newApiService || !newApiKey) { toast.error("Please fill in all fields"); return; }
    try {
      const { data, error } = await supabase.functions.invoke("manage-api-keys", { body: { action: "create", service_name: newApiService, api_key: newApiKey } });
      if (error) throw error;
      setApiKeys([...apiKeys, data.key]); setNewApiService(""); setNewApiKey(""); setShowApiKeyModal(false);
      toast.success("API key added successfully!");
    } catch { toast.error("Something went wrong saving your data. Please try again."); }
  };

  const handleDeleteApiKey = async (keyId: string) => {
    if (!session?.user) return;
    try {
      const { error } = await supabase.functions.invoke("manage-api-keys", { body: { action: "delete", id: keyId } });
      if (error) throw error;
      setApiKeys(apiKeys.filter(k => k.id !== keyId));
      toast.success("API key deleted");
    } catch { toast.error("Something went wrong. Please try again."); }
  };

  const handleSaveCredentialsAndConnect = async (platform: string, clientId: string, clientSecret: string) => {
    if (!session?.user) return;
    if (!clientId.trim() || !clientSecret.trim()) {
      toast.error("Both App ID and App Secret are required to connect.");
      return;
    }
    setConnectingPlatform(true);
    try {
      // Save credentials via manage-api-keys
      await supabase.functions.invoke("manage-api-keys", {
        body: { action: "create", service_name: `${platform}_client_id`, api_key: clientId.trim() },
      });
      await supabase.functions.invoke("manage-api-keys", {
        body: { action: "create", service_name: `${platform}_client_secret`, api_key: clientSecret.trim() },
      });

      // Now initiate OAuth with user-provided credentials
      const { data, error } = await supabase.functions.invoke(`${platform}-oauth`, {
        body: { callbackUrl: `${window.location.origin}/account`, clientId: clientId.trim(), clientSecret: clientSecret.trim() },
      });
      if (error) throw error;
      if (data?.authUrl) {
        toast.success("Redirecting to authorize your account...");
        window.location.href = data.authUrl;
      }
    } catch (error: any) {
      let message = "Failed to connect account.";
      try {
        const body = typeof error?.context?.body === "string" ? JSON.parse(error.context.body) : error?.context?.body;
        if (body?.error) message = body.error;
      } catch {}
      toast.error(message);
    } finally {
      setConnectingPlatform(false);
      setShowCredentialModal(false);
    }
  };

  const handleConnectSocial = async (platform: string) => {
    // This is now handled through the credential modal flow
    setConnectingPlatform(true);
    try {
      const { data, error } = await supabase.functions.invoke(`${platform}-oauth`, { body: { callbackUrl: `${window.location.origin}/account` } });
      if (error) throw error;
      if (data?.authUrl) window.location.href = data.authUrl;
    } catch (error: any) {
      let message = "Failed to connect account.";
      try { const body = typeof error?.context?.body === "string" ? JSON.parse(error.context.body) : error?.context?.body; if (body?.error) message = body.error; } catch {}
      const errStr = String(error?.message || message).toLowerCase();
      if (errStr.includes("not configured") || errStr.includes("missing") || errStr.includes("client id")) {
        toast.error(`${platform.charAt(0).toUpperCase() + platform.slice(1)} requires API credentials. Please enter your App ID and Secret to connect.`, { duration: 6000 });
      } else toast.error(message);
    } finally { setConnectingPlatform(false); }
  };

  const handleDisconnectSocial = async (connectionId: string) => {
    try {
      const { error } = await supabase.from("social_connections").delete().eq("id", connectionId);
      if (error) throw error;
      toast.success("Social account disconnected");
      if (session) loadUserData(session.user.id);
    } catch { toast.error("Failed to disconnect. Please try again."); }
  };

  const handleLogout = async () => { await supabase.auth.signOut(); navigate("/"); };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading your account...</p>
        </div>
      </div>
    );
  }

  const inputCls = "w-full px-4 py-2.5 border border-border rounded-xl bg-background focus:border-primary outline-none transition-all text-foreground text-sm";
  const labelCls = "block text-sm font-medium text-foreground mb-1.5";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-6 sm:px-6 lg:px-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Settings</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-destructive border border-border rounded-xl hover:border-destructive/30 transition-all"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="w-full justify-start bg-card border border-border rounded-xl p-1 mb-6 overflow-x-auto flex-nowrap">
            <TabsTrigger value="profile" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2 text-sm">
              <User className="w-4 h-4" /> Profile
            </TabsTrigger>
            <TabsTrigger value="brand" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2 text-sm">
              <Building2 className="w-4 h-4" /> Brand
            </TabsTrigger>
            <TabsTrigger value="connections" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2 text-sm">
              <Share2 className="w-4 h-4" /> Connections
            </TabsTrigger>
            <TabsTrigger value="keys" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2 text-sm">
              <Key className="w-4 h-4" /> API Keys
            </TabsTrigger>
            <TabsTrigger value="billing" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2 text-sm">
              <DollarSign className="w-4 h-4" /> Billing
            </TabsTrigger>
          </TabsList>

          {/* ─── PROFILE TAB ─── */}
          <TabsContent value="profile">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-2xl">
              <div className="bg-card rounded-2xl p-6 border border-border">
                <h2 className="text-lg font-semibold text-foreground mb-5">Profile Information</h2>
                <div className="space-y-4">
                  <div>
                    <label className={labelCls}>Full Name</label>
                    <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Email</label>
                    <input type="email" value={email} disabled className={`${inputCls} bg-muted text-muted-foreground cursor-not-allowed`} />
                  </div>
                  <button onClick={handleUpdateProfile} className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition-all">
                    <Save className="w-4 h-4" /> Save Profile
                  </button>
                </div>
              </div>
            </motion.div>
          </TabsContent>

          {/* ─── BRAND TAB ─── */}
          <TabsContent value="brand">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-2xl">
              <div className="bg-card rounded-2xl p-6 border border-border">
                <h2 className="text-lg font-semibold text-foreground mb-5">Company Details</h2>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Company Name</label>
                      <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Inc." className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Industry</label>
                      <input type="text" value={businessType} onChange={(e) => setBusinessType(e.target.value)} placeholder="e.g., Restaurant, SaaS" className={inputCls} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Website</label>
                      <input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://example.com" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Location</label>
                      <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="London, UK" className={inputCls} />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Target Audience</label>
                    <textarea value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} placeholder="Describe your target market..." rows={2} className={`${inputCls} resize-none`} />
                  </div>
                  <div>
                    <label className={labelCls}>Brand Source URL</label>
                    <input type="url" value={brandSourceUrl} onChange={(e) => setBrandSourceUrl(e.target.value)} placeholder="https://example.com or Instagram URL" className={inputCls} />
                    {isScanning && (
                      <div className="flex items-center gap-2 mt-2 text-sm text-primary">
                        <Loader2 className="w-4 h-4 animate-spin" /> Analysing your brand…
                      </div>
                    )}
                    {brandScanDone && brandProfile && (
                      <Alert className="mt-2 border-emerald-500/20 bg-emerald-500/10">
                        <AlertDescription className="text-emerald-400 text-sm">
                          ✓ Brand profile built from {(() => { try { return new URL(brandProfile.source_url).hostname; } catch { return brandProfile.source_url; } })()}
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                  <div>
                    <label className={labelCls}>Preferred AI Model</label>
                    <select value={preferredModel} onChange={(e) => setPreferredModel(e.target.value)} className={inputCls}>
                      <option value="openai/gpt-4o-mini">Default (ChatGPT 4o Mini)</option>
                      <optgroup label="OpenAI">
                        <option value="openai/gpt-4o-mini">ChatGPT 4o Mini — Fast</option>
                        <option value="openai/gpt-4o">ChatGPT 4o — Higher quality</option>
                        <option value="openai/gpt-5-mini">GPT-5 Mini — Strong reasoning</option>
                        <option value="openai/gpt-5">GPT-5 — Most capable</option>
                        <option value="openai/gpt-5-nano">GPT-5 Nano — Fastest</option>
                        <option value="openai/gpt-5.2">GPT-5.2 — Enhanced reasoning</option>
                      </optgroup>
                      <optgroup label="Google Gemini">
                        <option value="google/gemini-3-flash-preview">Gemini 3 Flash Preview</option>
                        <option value="google/gemini-2.5-flash">Gemini 2.5 Flash</option>
                        <option value="google/gemini-2.5-pro">Gemini 2.5 Pro</option>
                        <option value="google/gemini-3.1-pro-preview">Gemini 3.1 Pro Preview</option>
                      </optgroup>
                    </select>
                  </div>

                  {/* Brand Colors */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-sm font-medium text-foreground">Brand Colors</label>
                      <button onClick={handleAddColor} disabled={brandColors.length >= 5} className="text-xs flex items-center gap-1 px-2 py-1 text-primary hover:bg-primary/10 rounded transition-colors disabled:opacity-50">
                        <Plus className="w-3 h-3" /> Add
                      </button>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {brandColors.map((color, i) => (
                        <div key={i} className="flex items-center gap-1.5 bg-secondary rounded-xl px-2 py-1.5">
                          <input type="color" value={color} onChange={(e) => handleColorChange(i, e.target.value)} className="w-8 h-8 rounded-lg border border-border cursor-pointer" />
                          <span className="text-xs font-mono text-muted-foreground">{color}</span>
                          {brandColors.length > 1 && (
                            <button onClick={() => handleRemoveColor(i)} className="p-1 text-destructive/60 hover:text-destructive transition-colors">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {brandProfile && (
                    <BrandIntelligenceSummary
                      profile={brandProfile}
                      onRefresh={() => { const url = brandSourceUrl.trim() || website.trim(); if (url) scanUrl(url, { force_refresh: true }); }}
                      isRefreshing={isScanning}
                      onApplyToAccount={handleApplyBrandToAccount}
                    />
                  )}

                  <button onClick={handleUpdateCompany} disabled={isScanning} className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-sm font-medium transition-all disabled:opacity-50">
                    {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {isScanning ? "Scanning…" : "Save Company Details"}
                  </button>
                </div>
              </div>

              {/* Brand Assets */}
              <div className="bg-card rounded-2xl p-6 border border-border">
                <div className="flex items-center gap-3 mb-5">
                  <Images className="w-5 h-5 text-primary" />
                  <h2 className="text-lg font-semibold text-foreground">Brand Assets</h2>
                </div>
                <BrandAssetLibrary />
              </div>
            </motion.div>
          </TabsContent>

          {/* ─── CONNECTIONS TAB ─── */}
          <TabsContent value="connections">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-2xl">
              {/* Setup notice */}
              <Alert className="border-primary/20 bg-primary/5">
                <AlertDescription className="text-sm text-muted-foreground">
                  <strong className="text-foreground">Before connecting:</strong> Each platform requires your own API credentials. Click "Connect" and you'll be prompted to enter your App ID and Secret. You can get these from the platform's developer portal.
                </AlertDescription>
              </Alert>

              <div className="bg-card rounded-2xl p-6 border border-border">
                <h2 className="text-lg font-semibold text-foreground mb-5">Social Media Accounts</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
                  {[
                    { id: "instagram", label: "Instagram", setupUrl: "https://developers.facebook.com/apps/" },
                    { id: "facebook", label: "Facebook", setupUrl: "https://developers.facebook.com/apps/" },
                    { id: "twitter", label: "Twitter / X", setupUrl: "https://developer.twitter.com/en/portal/dashboard" },
                    { id: "linkedin", label: "LinkedIn", setupUrl: "https://www.linkedin.com/developers/apps" },
                    { id: "tiktok", label: "TikTok", setupUrl: "https://developers.tiktok.com/" },
                    { id: "google-business", label: "Google Business", setupUrl: "https://console.cloud.google.com/" },
                  ].map((p) => {
                    const connected = socialConnections.some((c: any) => c.platform === p.id);
                    const hasCredentials = apiKeys.some((k: any) => k.service_name === `${p.id}_client_id`);
                    return (
                      <button
                        key={p.id}
                        onClick={() => {
                          if (connected) return;
                          setCredentialPlatform(p);
                          setCredentialClientId("");
                          setCredentialClientSecret("");
                          setShowCredentialModal(true);
                        }}
                        disabled={connectingPlatform || connected}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center ${
                          connected
                            ? "border-emerald-500/30 bg-emerald-500/5 cursor-default"
                            : "border-border hover:border-primary bg-background"
                        } disabled:opacity-70`}
                      >
                        <Share2 className={`w-5 h-5 ${connected ? "text-emerald-400" : "text-muted-foreground"}`} />
                        <span className="text-xs font-medium text-foreground">{p.label}</span>
                        {connected && <span className="text-[10px] text-emerald-400">Connected</span>}
                        {!connected && hasCredentials && <span className="text-[10px] text-primary">Credentials saved</span>}
                      </button>
                    );
                  })}
                </div>

                {socialConnections.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground mb-2">Connected Accounts</p>
                    {socialConnections.map((c: any) => (
                      <div key={c.id} className="flex items-center justify-between p-3 bg-secondary rounded-xl">
                        <div>
                          <p className="text-sm font-medium text-foreground capitalize">{c.platform}</p>
                          {c.account_name && <p className="text-xs text-muted-foreground">@{c.account_name}</p>}
                        </div>
                        <button onClick={() => handleDisconnectSocial(c.id)} className="p-2 text-destructive/60 hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </TabsContent>

          {/* ─── API KEYS TAB ─── */}
          <TabsContent value="keys">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-2xl">
              <div className="bg-card rounded-2xl p-6 border border-border">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-lg font-semibold text-foreground">API Keys</h2>
                  <button onClick={() => setShowApiKeyModal(true)} className="flex items-center gap-2 px-3 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl transition-colors text-sm font-medium">
                    <Plus className="w-4 h-4" /> Add Key
                  </button>
                </div>
                <div className="space-y-2">
                  {apiKeys.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8 text-sm">No API keys added yet</p>
                  ) : apiKeys.map((key) => (
                    <div key={key.id} className="flex items-center justify-between p-3 bg-secondary rounded-xl">
                      <div>
                        <p className="text-sm font-medium text-foreground capitalize">{key.service_name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{key.api_key_masked || `••••••••${(key.api_key || "").slice(-4)}`}</p>
                      </div>
                      <button onClick={() => handleDeleteApiKey(key.id)} className="p-2 text-destructive/60 hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </TabsContent>

          {/* ─── BILLING TAB ─── */}
          <TabsContent value="billing">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-2xl">
              <div className="bg-card rounded-2xl p-6 border border-border text-center">
                <h2 className="text-lg font-semibold text-foreground mb-6">Credits</h2>
                <p className="text-5xl font-bold text-primary mb-2">£{balance.toFixed(2)}</p>
                <p className="text-sm text-muted-foreground mb-1">Current Balance</p>
                <p className="text-xs text-muted-foreground mb-6">~£0.05 per generation</p>
                <button onClick={() => setShowTopUpModal(true)} className="px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl transition-all">
                  Top Up Balance
                </button>
              </div>
            </motion.div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Top Up Modal */}
      <Dialog open={showTopUpModal} onOpenChange={setShowTopUpModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Top Up Balance</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className={labelCls}>Amount (£)</label>
              <input type="number" value={topUpAmount} onChange={(e) => setTopUpAmount(e.target.value)} placeholder="0.00" min="0" step="0.01" className={inputCls} />
            </div>
            <div className="flex gap-2">
              {[10, 25, 50, 100].map((a) => (
                <button key={a} onClick={() => setTopUpAmount(a.toString())} className="flex-1 px-3 py-2 border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground rounded-xl transition-colors text-sm font-medium">
                  £{a}
                </button>
              ))}
            </div>
            <button onClick={handleTopUp} className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-xl transition-all">Add Funds</button>
          </div>
        </DialogContent>
      </Dialog>

      {/* API Key Modal */}
      <Dialog open={showApiKeyModal} onOpenChange={setShowApiKeyModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add API Key</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className={labelCls}>Service</label>
              <select value={newApiService} onChange={(e) => setNewApiService(e.target.value)} className={inputCls}>
                <option value="">Select service…</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="google">Google AI</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>API Key</label>
              <input type="password" value={newApiKey} onChange={(e) => setNewApiKey(e.target.value)} placeholder="sk-..." className={inputCls} />
            </div>
            <button onClick={handleAddApiKey} className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-xl transition-all">Add API Key</button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Social Credential Modal */}
      <Dialog open={showCredentialModal} onOpenChange={setShowCredentialModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect {credentialPlatform?.label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Alert className="border-primary/20 bg-primary/5">
              <AlertDescription className="text-sm text-muted-foreground">
                To connect {credentialPlatform?.label}, you need to create a developer app and provide your credentials.{" "}
                <a
                  href={credentialPlatform?.setupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline font-medium"
                >
                  Open {credentialPlatform?.label} Developer Portal →
                </a>
              </AlertDescription>
            </Alert>
            <div>
              <label className={labelCls}>App ID / Client ID</label>
              <input
                type="text"
                value={credentialClientId}
                onChange={(e) => setCredentialClientId(e.target.value)}
                placeholder="Enter your App ID"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>App Secret / Client Secret</label>
              <input
                type="password"
                value={credentialClientSecret}
                onChange={(e) => setCredentialClientSecret(e.target.value)}
                placeholder="Enter your App Secret"
                className={inputCls}
              />
            </div>
            {(!credentialClientId.trim() || !credentialClientSecret.trim()) && (
              <p className="text-xs text-destructive">Both fields are required to connect your account.</p>
            )}
            <button
              onClick={() => {
                if (credentialPlatform) {
                  handleSaveCredentialsAndConnect(credentialPlatform.id, credentialClientId, credentialClientSecret);
                }
              }}
              disabled={connectingPlatform || !credentialClientId.trim() || !credentialClientSecret.trim()}
              className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {connectingPlatform ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Connecting...
                </>
              ) : (
                `Connect ${credentialPlatform?.label}`
              )}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Account;
