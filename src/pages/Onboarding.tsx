import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Confetti } from "@/components/Confetti";
import {
  Instagram,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Loader2,
  CheckCircle2,
  Globe,
  Upload,
  Facebook,
  Linkedin,
  Target,
  Users,
  MapPin,
  Briefcase,
  DollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { getBypassRedirectTarget } from "@/lib/localAccessBypass";

type Step = "data" | "questionnaire" | "profile" | "welcome";

const industries = [
  "Retail & E-commerce", "Food & Beverage", "Beauty & Wellness", "Fitness & Health",
  "Technology", "Finance", "Real Estate", "Education", "Travel & Hospitality",
  "Fashion", "Creative Agency", "Professional Services", "Other",
];

const goals = [
  "Brand Awareness", "Lead Generation", "Sales & Conversions",
  "Community Building", "Content Marketing", "Customer Retention",
];

const budgetRanges = ["£0 – £500/mo", "£500 – £2,000/mo", "£2,000 – £5,000/mo", "£5,000+/mo"];

const regions = [
  "United Kingdom", "Europe", "North America", "Asia Pacific", "Middle East", "Global",
];

export default function Onboarding() {
  const navigate = useNavigate();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [step, setStep] = useState<Step>("data");
  const [isScanning, setIsScanning] = useState(false);
  const [scanStage, setScanStage] = useState<"idle" | "reading" | "learning" | "done">("idle");

  // Step 1: Data Collection
  const [businessDesc, setBusinessDesc] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [instagramHandle, setInstagramHandle] = useState("");
  const [facebookUrl, setFacebookUrl] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [tiktokHandle, setTiktokHandle] = useState("");

  // Step 2: Questionnaire
  const [selectedIndustry, setSelectedIndustry] = useState("");
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [selectedBudget, setSelectedBudget] = useState("");
  const [selectedRegion, setSelectedRegion] = useState("");
  const [targetAudience, setTargetAudience] = useState("");

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [businessDesc]);

  // Restore from session storage
  useEffect(() => {
    const saved = sessionStorage.getItem("onboarding_desc");
    const savedIg = sessionStorage.getItem("onboarding_ig");
    if (saved) { setBusinessDesc(saved); sessionStorage.removeItem("onboarding_desc"); }
    if (savedIg) { setInstagramHandle(savedIg); sessionStorage.removeItem("onboarding_ig"); }
  }, []);

  // If the user already has a brand, they've onboarded — send them to the app.
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      const { data } = await supabase.from("brand_profiles").select("id").eq("user_id", session.user.id).limit(1);
      if (data && data.length) navigate("/home", { replace: true });
    });
  }, [navigate]);

  const toggleGoal = (g: string) => {
    setSelectedGoals((prev) =>
      prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]
    );
  };

  const handleNext = () => {
    if (step === "data") {
      if (!businessDesc.trim()) { toast.error("Tell us about your business first."); return; }
      setStep("questionnaire");
    } else if (step === "questionnaire") {
      handleBuildProfile();
    }
  };

  const handleBuildProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      sessionStorage.setItem("onboarding_desc", businessDesc);
      sessionStorage.setItem("onboarding_ig", instagramHandle);
      navigate(`${getBypassRedirectTarget()}?redirect=/onboarding`);
      return;
    }

    setStep("profile");
    setIsScanning(true);
    setScanStage("reading");

    try {
      const brandSourceUrl = websiteUrl.trim()
        || (instagramHandle.trim() ? `https://instagram.com/${instagramHandle.replace("@", "")}` : undefined);

      // Save company details
      await supabase.from("company_details").upsert({
        user_id: session.user.id,
        company_name: extractName(businessDesc),
        business_type: selectedIndustry || extractIndustry(businessDesc),
        target_audience: targetAudience || "general audience",
        location: selectedRegion || undefined,
        brand_source_url: brandSourceUrl,
        website: websiteUrl.trim() || undefined,
      }, { onConflict: "user_id" });

      setScanStage("learning");

      // Trigger brand intelligence scan if URL available → builds the brand profile.
      let newBrandId: string | null = null;
      if (brandSourceUrl) {
        const { data: scan } = await supabase.functions.invoke("brand-intelligence", {
          body: { url: brandSourceUrl, force_refresh: true },
        });
        newBrandId = scan?.data?.id || null;
      }

      // If no scan (or no URL), create a manual brand from the questionnaire so
      // the account always has a brand after onboarding.
      if (!newBrandId) {
        const { data: manual } = await supabase.from("brand_profiles").insert({
          user_id: session.user.id,
          source_url: `manual:${crypto.randomUUID()}`,
          is_manual: true,
          brand_name: extractName(businessDesc),
          industry: selectedIndustry || extractIndustry(businessDesc),
          target_audience_signals: targetAudience || undefined,
          location: selectedRegion || undefined,
          website: websiteUrl.trim() || undefined,
        } as any).select("id").single();
        newBrandId = (manual as any)?.id || null;
      }

      // Make the new brand the account's ACTIVE brand.
      if (newBrandId) {
        await (supabase.from("profiles").update({ active_brand_id: newBrandId }).eq("id", session.user.id) as any);
      }

      // Kick off the competitor/strategy report in the BACKGROUND so the account
      // is fully understood by the time they start (don't make them wait for it).
      const brandName = extractName(businessDesc);
      const goalText = selectedGoals.length ? ` Goals: ${selectedGoals.join(", ")}.` : "";
      void supabase.functions.invoke("generate-strategy-prompt", {
        body: {
          sourcePrompt: `Grow ${brandName}. ${businessDesc}.${goalText} Target audience: ${targetAudience || "their core customers"}. Industry: ${selectedIndustry || extractIndustry(businessDesc)}.`,
          requestedContentType: "image",
        },
      }).catch(() => { /* non-blocking */ });

      setScanStage("done");
      // Reward: finishing onboarding unlocks the "Brand Builder" star.
      window.dispatchEvent(new Event("aison:brand-ready"));
      await new Promise((r) => setTimeout(r, 1200));
      setStep("welcome");
    } catch {
      toast.error("Something went wrong. Please try again.");
      setIsScanning(false);
      setScanStage("idle");
      setStep("questionnaire");
    }
  };

  const stepNumber = step === "data" ? 1 : step === "questionnaire" ? 2 : step === "profile" ? 3 : 4;

  const mascotGuide =
    step === "data" ? "Tell me about your business — the more detail, the better content I'll make! ✨"
      : step === "questionnaire" ? "A few quick picks so I nail your vibe 🎯"
        : step === "profile" ? "Building your brand… one sec! ⚙️"
          : "Woohoo — you're all set! 🎉";

  return (
    <div className="min-h-screen bg-[#0A0F1E] relative overflow-hidden flex flex-col">
      {/* Celebration on completion */}
      <Confetti fire={step === "welcome"} />

      {/* Guide mascot — points you through the form, celebrates at the end */}
      <div className="hidden lg:flex fixed left-8 bottom-8 z-30 items-end gap-3 pointer-events-none">
        <img
          src={step === "questionnaire" ? "/mascot/mascot-3q.png" : "/mascot/mascot-wave.png"}
          alt="Aison mascot"
          className={`w-32 h-32 object-contain drop-shadow-[0_12px_26px_rgba(234,67,6,0.4)] ${step === "welcome" ? "ob-jump" : "ob-bob"}`}
        />
        <div className="mb-12 max-w-[230px] rounded-2xl rounded-bl-sm bg-white/[0.07] border border-white/10 px-3.5 py-2.5 text-sm text-white shadow-xl backdrop-blur-sm ob-bubble">
          {mascotGuide}
        </div>
      </div>
      <style>{`
        @keyframes ob-bob{0%,100%{transform:translateY(0) rotate(-1.5deg)}50%{transform:translateY(-8px) rotate(1.5deg)}}
        @keyframes ob-jump{0%{transform:translateY(0) scaleX(1) scaleY(1)}14%{transform:translateY(0) scaleX(1.12) scaleY(.86)}38%{transform:translateY(-38px) scaleX(.92) scaleY(1.12) rotate(-6deg)}58%{transform:translateY(-32px) scaleX(.97) scaleY(1.05) rotate(6deg)}80%{transform:translateY(0) scaleX(1.1) scaleY(.9)}100%{transform:translateY(0) scaleX(1) scaleY(1)}}
        @keyframes ob-bubble{from{opacity:0;transform:translateY(6px) scale(.96)}to{opacity:1;transform:none}}
        .ob-bob{animation:ob-bob 3.4s ease-in-out infinite; transform-origin:center bottom}
        .ob-jump{animation:ob-jump .85s cubic-bezier(.34,1.4,.5,1); transform-origin:center bottom}
        .ob-bubble{animation:ob-bubble .3s ease-out}
        @media (prefers-reduced-motion: reduce){.ob-bob,.ob-jump{animation:none}}
      `}</style>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 80%, rgba(232,87,10,0.06) 0%, transparent 70%), " +
            "radial-gradient(ellipse 60% 50% at 50% 20%, rgba(255,180,100,0.03) 0%, transparent 60%)",
        }}
      />

      {/* Header */}
      <div className="relative z-10 pt-6 px-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <span className="text-white font-bold text-lg">AIson</span>
        </div>
        {step !== "welcome" && step !== "profile" && (
          <span className="text-white/30 text-xs">Step {stepNumber} of 3</span>
        )}
      </div>

      {/* Progress bar */}
      {step !== "welcome" && (
        <div className="relative z-10 px-6 mt-4">
          <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-primary rounded-full"
              animate={{ width: `${(stepNumber / 3) * 100}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="relative z-10 flex-1 flex flex-col justify-center px-6 max-w-lg mx-auto w-full py-8">
        <AnimatePresence mode="wait">
          {/* Step 1: Data Collection */}
          {step === "data" && (
            <motion.div key="data" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight mb-1">
                  Tell us about your business
                </h1>
                <p className="text-white/30 text-sm">We'll use this to build your brand profile.</p>
              </div>

              <textarea
                ref={textareaRef}
                value={businessDesc}
                onChange={(e) => setBusinessDesc(e.target.value)}
                placeholder="e.g. I run a coffee shop in East London. We do specialty coffee and homemade cakes."
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-white placeholder:text-white/20 text-sm leading-relaxed resize-none focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all"
                rows={3}
                maxLength={1000}
              />

              <div className="space-y-3">
                <Label className="text-white/40 text-xs">Website URL (optional — we'll auto-scrape your brand)</Label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                  <Input
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="https://yourbusiness.com"
                    className="pl-10 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-white/40 text-xs">Social Media (optional)</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <Instagram className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                    <Input value={instagramHandle} onChange={(e) => setInstagramHandle(e.target.value)} placeholder="@instagram" className="pl-10 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 text-xs h-9" />
                  </div>
                  <div className="relative">
                    <Facebook className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                    <Input value={facebookUrl} onChange={(e) => setFacebookUrl(e.target.value)} placeholder="Facebook URL" className="pl-10 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 text-xs h-9" />
                  </div>
                  <div className="relative">
                    <Linkedin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                    <Input value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} placeholder="LinkedIn URL" className="pl-10 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 text-xs h-9" />
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 text-xs font-bold">TT</span>
                    <Input value={tiktokHandle} onChange={(e) => setTiktokHandle(e.target.value)} placeholder="@tiktok" className="pl-10 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 text-xs h-9" />
                  </div>
                </div>
              </div>

              <Button onClick={handleNext} disabled={!businessDesc.trim()} className="w-full h-12 rounded-xl text-sm font-semibold" style={{ background: "linear-gradient(135deg, hsl(16,95%,47%) 0%, hsl(24,100%,55%) 100%)" }}>
                Continue <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </motion.div>
          )}

          {/* Step 2: Questionnaire */}
          {step === "questionnaire" && (
            <motion.div key="questionnaire" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
              <div>
                <h1 className="text-2xl font-bold text-white mb-1">A few more details</h1>
                <p className="text-white/30 text-sm">This helps AIson generate better content for you.</p>
              </div>

              {/* Industry */}
              <div className="space-y-2">
                <Label className="text-white/40 text-xs flex items-center gap-1"><Briefcase className="w-3 h-3" /> Industry</Label>
                <div className="flex flex-wrap gap-1.5">
                  {industries.map((ind) => (
                    <button
                      key={ind}
                      onClick={() => setSelectedIndustry(ind)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        selectedIndustry === ind
                          ? "bg-primary text-white"
                          : "bg-white/[0.04] text-white/50 border border-white/[0.08] hover:border-primary/30"
                      }`}
                    >
                      {ind}
                    </button>
                  ))}
                </div>
              </div>

              {/* Goals */}
              <div className="space-y-2">
                <Label className="text-white/40 text-xs flex items-center gap-1"><Target className="w-3 h-3" /> Goals (select all that apply)</Label>
                <div className="flex flex-wrap gap-1.5">
                  {goals.map((g) => (
                    <button
                      key={g}
                      onClick={() => toggleGoal(g)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        selectedGoals.includes(g)
                          ? "bg-primary text-white"
                          : "bg-white/[0.04] text-white/50 border border-white/[0.08] hover:border-primary/30"
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              {/* Target Audience */}
              <div className="space-y-2">
                <Label className="text-white/40 text-xs flex items-center gap-1"><Users className="w-3 h-3" /> Target Audience</Label>
                <Input
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  placeholder="e.g. Women 25-40, health-conscious, urban professionals"
                  className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 text-sm"
                />
              </div>

              {/* Budget & Region */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-white/40 text-xs flex items-center gap-1"><DollarSign className="w-3 h-3" /> Budget</Label>
                  <div className="space-y-1">
                    {budgetRanges.map((b) => (
                      <button
                        key={b}
                        onClick={() => setSelectedBudget(b)}
                        className={`block w-full text-left px-3 py-1.5 rounded-lg text-xs transition-all ${
                          selectedBudget === b
                            ? "bg-primary text-white"
                            : "bg-white/[0.04] text-white/50 border border-white/[0.08] hover:border-primary/30"
                        }`}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-white/40 text-xs flex items-center gap-1"><MapPin className="w-3 h-3" /> Region</Label>
                  <div className="space-y-1">
                    {regions.map((r) => (
                      <button
                        key={r}
                        onClick={() => setSelectedRegion(r)}
                        className={`block w-full text-left px-3 py-1.5 rounded-lg text-xs transition-all ${
                          selectedRegion === r
                            ? "bg-primary text-white"
                            : "bg-white/[0.04] text-white/50 border border-white/[0.08] hover:border-primary/30"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep("data")} className="flex-1 h-12 rounded-xl text-sm border-white/10 text-white/60 hover:text-white bg-transparent">
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
                <Button onClick={handleNext} className="flex-[2] h-12 rounded-xl text-sm font-semibold" style={{ background: "linear-gradient(135deg, hsl(16,95%,47%) 0%, hsl(24,100%,55%) 100%)" }}>
                  Build my brand profile <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step 3: Profile Building (scanning animation) */}
          {step === "profile" && (
            <motion.div key="profile" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-8">
              <div className="relative mx-auto w-24 h-24">
                <motion.div className="absolute inset-0 rounded-full border-2 border-primary/30" animate={{ scale: [1, 1.4, 1], opacity: [0.3, 0, 0.3] }} transition={{ duration: 2, repeat: Infinity }} />
                <motion.div className="absolute inset-2 rounded-full border-2 border-primary/50" animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0.1, 0.5] }} transition={{ duration: 2, repeat: Infinity, delay: 0.3 }} />
                <div className="absolute inset-0 flex items-center justify-center">
                  {scanStage === "done" ? <CheckCircle2 className="w-10 h-10 text-emerald-400" /> : <Loader2 className="w-10 h-10 text-primary animate-spin" />}
                </div>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">
                  {scanStage === "reading" && "Analysing your brand…"}
                  {scanStage === "learning" && "Building your profile…"}
                  {scanStage === "done" && "Profile ready!"}
                </h2>
                <p className="text-white/30 text-sm">
                  {scanStage === "reading" && "Scraping website & social data"}
                  {scanStage === "learning" && "Generating tone, style & audience personas"}
                  {scanStage === "done" && "Your AI marketing engine is ready"}
                </p>
              </div>
              <div className="flex items-center justify-center gap-3">
                {(["reading", "learning", "done"] as const).map((s, i) => (
                  <div key={s} className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full transition-all duration-500 ${scanStage === s ? "bg-primary shadow-[0_0_8px_hsl(16,95%,47%)]" : (["reading", "learning", "done"].indexOf(scanStage) > i ? "bg-emerald-400" : "bg-white/10")}`} />
                    {i < 2 && <div className={`w-8 h-px ${["reading", "learning", "done"].indexOf(scanStage) > i ? "bg-emerald-400/40" : "bg-white/10"}`} />}
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Step 4: Welcome + brief platform walkthrough */}
          {step === "welcome" && (
            <motion.div key="welcome" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-6">
              <div className="w-16 h-16 rounded-2xl bg-primary/15 flex items-center justify-center mx-auto">
                <Sparkles className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">Welcome to AIson! 🎉</h1>
                <p className="text-white/40 text-sm">Your brand is set up. Here's a quick tour of what you can do.</p>
              </div>

              <div className="grid gap-3 text-left">
                {[
                  { icon: "💬", title: "Chat with your AI marketing agent", desc: "Ask for advice, ideas, or say \"create a post\" — it knows your brand." },
                  { icon: "✨", title: "Brands", desc: "Your brand's colours, tone & audience — add more brands and switch anytime." },
                  { icon: "🎨", title: "Content Studio", desc: "Generate on-brand images, videos and captions." },
                  { icon: "📣", title: "Campaigns", desc: "Plan multi-post campaigns around a goal." },
                  { icon: "📊", title: "Analytics & Reports", desc: "A competitor-backed strategy report you can download for clients." },
                  { icon: "📁", title: "Library", desc: "Everything you generate is saved here, ready to schedule or download." },
                ].map((f) => (
                  <div key={f.title} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <span className="text-xl leading-none">{f.icon}</span>
                    <div>
                      <p className="text-white text-sm font-medium">{f.title}</p>
                      <p className="text-white/40 text-xs mt-0.5">{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <Button onClick={() => navigate("/home")} className="w-full h-12 rounded-xl text-sm font-semibold" style={{ background: "linear-gradient(135deg, hsl(16,95%,47%) 0%, hsl(24,100%,55%) 100%)" }}>
                  Start with the AI agent <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
                <Button variant="outline" onClick={() => navigate("/brands")} className="w-full h-12 rounded-xl text-sm border-white/10 text-white/60 hover:text-white bg-transparent">
                  Review my brand first
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function extractName(desc: string): string {
  const match = desc.match(/(?:called|named|is)\s+["']?([A-Z][a-zA-Z\s&']+)/);
  if (match) return match[1].trim();
  const words = desc.split(/\s+/).slice(0, 3).join(" ");
  return words || "My Business";
}

function extractIndustry(desc: string): string {
  const keywords: Record<string, string> = {
    coffee: "cafe", bakery: "bakery", restaurant: "restaurant", shop: "retail",
    store: "retail", gym: "fitness", salon: "beauty", hotel: "hospitality",
    agency: "agency", studio: "creative", clinic: "healthcare", bar: "hospitality",
  };
  const lower = desc.toLowerCase();
  for (const [k, v] of Object.entries(keywords)) {
    if (lower.includes(k)) return v;
  }
  return "general";
}
