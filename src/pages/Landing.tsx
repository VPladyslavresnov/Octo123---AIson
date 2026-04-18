import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, Zap, Play, ChevronDown, ChevronUp, Check,
  Settings, Image, Video, Pen, ClipboardList, Calendar,
  Fingerprint, Download, Menu, X,
  Instagram, Linkedin, Twitter,
} from "lucide-react";
import { PublicChatWidget } from "@/components/PublicChatWidget";

/* ─── auth-aware nav helper ─── */
function useAuthNav() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);

  const goApp = () => navigate(user ? "/content-studio" : "/signup");
  const goLogin = () => navigate("/auth");
  return { user, goApp, goLogin };
}

/* ─── smooth scroll ─── */
function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

/* ─── SVG Swoosh ─── */
const Swoosh = () => (
  <svg viewBox="0 0 200 12" className="w-48 mx-auto -mt-2" preserveAspectRatio="none">
    <path d="M5 8 Q100 -4 195 8" stroke="#F97316" strokeWidth="3" fill="none" strokeLinecap="round" />
  </svg>
);

/* ─── FAQ Data ─── */
const faqs = [
  { q: "Do I need design skills to use AIson?", a: "Not at all. AIson handles all the creative work — from generating studio-quality images to writing on-brand copy. You just describe what you need in plain English." },
  { q: "How does the Brand Memory Engine work?", a: "During onboarding you set your brand name, colours, tone of voice, and visual style. AIson stores this as a profile and injects it into every generation prompt automatically, so every asset feels on-brand." },
  { q: "What AI models does AIson use?", a: "AIson uses a combination of leading AI models including xAI Grok for image and video generation, and advanced language models for copywriting — all orchestrated behind a single simple interface." },
  { q: "Can I cancel anytime?", a: "Yes. All paid plans are month-to-month with no lock-in. You can cancel, upgrade, or downgrade at any time from your account settings." },
  { q: "Is my brand data secure?", a: "Absolutely. All data is encrypted at rest and in transit. API keys and social tokens use AES-GCM encryption. We never share your data with third parties." },
  { q: "What's coming in the next update?", a: "We're working on a full content calendar with one-click scheduling, multi-brand workspaces, and direct publishing to Instagram, TikTok, LinkedIn, and Facebook." },
];

/* ─── Pricing Data ─── */
const plans = [
  { name: "Freemium", price: "£0", period: "/mo", features: ["5 images/month", "0 videos/month", "1 brand profile"], cta: "Start free", filled: true, popular: false },
  { name: "Starter", price: "£50", period: "/mo", features: ["8 images/month", "2 videos/month", "1 brand profile"], cta: "Get started", filled: false, popular: false },
  { name: "Growth", price: "£250", period: "/mo", features: ["20 images/month", "5 videos/month", "3 brand profiles"], cta: "Get started", filled: true, popular: true },
  { name: "Pro", price: "£500", period: "/mo", features: ["48 images/month", "12 videos/month", "10 brand profiles"], cta: "Get started", filled: false, popular: false },
];

const testimonials = [
  { quote: "We went from spending £2,000/month on a design agency to generating all our Instagram content in AIson. Our engagement is actually up.", initials: "SK", name: "Sarah K.", role: "Founder, Bloom Bakery" },
  { quote: "The brand memory feature is the killer. It knows our exact tone. I don't review half the captions anymore.", initials: "MT", name: "Marcus T.", role: "Marketing Manager, Kova Studio" },
  { quote: "Onboarded in 10 minutes, had our first month of content by end of day. Insane.", initials: "PN", name: "Priya N.", role: "Co-founder, Tidal Fit" },
];

const features = [
  { icon: Settings, title: "Brand Memory Engine", desc: "Your tone, colours, and style locked in. Every asset is on-brand without you lifting a finger." },
  { icon: Image, title: "AI Image Generation", desc: "Studio-quality visuals from Midjourney and Gemini — product shots, lifestyle, ads, thumbnails." },
  { icon: Video, title: "AI Video Creation", desc: "Short-form video for Reels and TikTok, generated in under 60 seconds via Runway Gen-4." },
  { icon: Pen, title: "AI Copywriting", desc: "Ad copy, email subject lines, social captions — all written in your brand voice via DeepSeek V3.2." },
  { icon: ClipboardList, title: "Campaign Brief Flow", desc: "Set a goal, pick a channel, choose a mood. AIson handles the rest." },
  { icon: Calendar, title: "Content Calendar Export", desc: "Download a month of content in one click. Formatted for Notion, Google Sheets, or PDF.", comingSoon: true },
];

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ LANDING PAGE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
export default function Landing() {
  const { goApp, goLogin } = useAuthNav();
  const [mobileMenu, setMobileMenu] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-[#111111] text-white font-sans overflow-x-hidden">
      {/* ── Generate Content Top Bar ── */}
      <div className="sticky top-0 z-[60] bg-[#111111]/90 backdrop-blur-md">
        {/* top strip */}
        <div className="bg-gradient-to-r from-[#F97316] to-[#FB923C] h-[2px]" />
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 h-14 lg:h-16">
          {/* Logo */}
          <button onClick={() => scrollTo("hero")} className="flex items-center gap-2 group">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#F97316]">
              <Zap className="w-4 h-4 text-white" />
            </span>
            <span className="text-lg font-bold"><span className="text-[#F97316]">AI</span>son</span>
          </button>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-6">
            <Link to="/about-product" className="text-sm text-gray-300 hover:text-[#F97316] transition-colors">Product</Link>
            <Link to="/about-us" className="text-sm text-gray-300 hover:text-[#F97316] transition-colors">About Us</Link>
            <Link to="/faqs" className="text-sm text-gray-300 hover:text-[#F97316] transition-colors">FAQs</Link>
            <Link to="/contact" className="text-sm text-gray-300 hover:text-[#F97316] transition-colors">Contact</Link>
          </nav>

          {/* Right */}
          <div className="flex items-center gap-3">
            <button onClick={goApp} className="hidden sm:inline-flex items-center gap-2 px-5 py-2 rounded-full bg-[#F97316] text-white text-sm font-semibold hover:bg-[#EA680C] transition-colors">
              Start Free Trial
            </button>
            <button onClick={goLogin} className="hidden md:inline text-sm text-gray-300 hover:text-[#F97316] transition-colors">Log in</button>
            {/* Mobile */}
            <button className="md:hidden" onClick={() => setMobileMenu(!mobileMenu)}>
              {mobileMenu ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
        {/* Mobile dropdown */}
        <AnimatePresence>
          {mobileMenu && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="md:hidden bg-[#111111] border-t border-[#2A2A2A] overflow-hidden">
              <div className="flex flex-col gap-3 p-4">
                <Link to="/about-product" onClick={() => setMobileMenu(false)} className="text-gray-300 hover:text-[#F97316] py-2">Product</Link>
                <Link to="/about-us" onClick={() => setMobileMenu(false)} className="text-gray-300 hover:text-[#F97316] py-2">About Us</Link>
                <Link to="/faqs" onClick={() => setMobileMenu(false)} className="text-gray-300 hover:text-[#F97316] py-2">FAQs</Link>
                <Link to="/contact" onClick={() => setMobileMenu(false)} className="text-gray-300 hover:text-[#F97316] py-2">Contact</Link>
                <button onClick={goLogin} className="text-left text-gray-300 hover:text-[#F97316] py-2">Log in</button>
                <button onClick={goApp} className="flex items-center gap-2 px-5 py-2 rounded-full bg-[#F97316] text-white font-semibold justify-center">
                  <Sparkles className="w-4 h-4" /> Start Free Trial
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── HERO ── */}
      <section id="hero" className="relative pt-20 pb-24 lg:pt-28 lg:pb-32 px-4">
        <div className="max-w-4xl mx-auto text-center">
          {/* Beta badge */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#F97316]/40 bg-[#F97316]/10 text-sm text-[#F97316] mb-8">
            <Zap className="w-3.5 h-3.5" /> Now in Beta — join 500+ SMEs
          </motion.div>

          {/* Headline */}
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="font-serif text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.1] mb-2">
            Your brand.<br />Your content.<br />
            <span className="text-[#F97316]">On autopilot.</span>
          </motion.h1>
          <Swoosh />

          {/* Subtitle */}
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mt-6 text-gray-400 text-lg max-w-xl mx-auto leading-relaxed">
            AIson remembers your brand voice, colours, and style — then generates scroll-stopping images, videos, and copy in seconds. No designer needed.
          </motion.p>

          {/* CTAs */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button onClick={goApp} className="px-8 py-3.5 rounded-full bg-[#F97316] text-white font-semibold text-lg hover:bg-[#EA680C] transition-colors shadow-[0_0_24px_rgba(249,115,22,0.35)] animate-[glow-pulse_3s_ease-in-out_infinite]">
              Start for free →
            </button>
            <button className="flex items-center gap-2 text-gray-300 hover:text-[#F97316] transition-colors">
              <Play className="w-4 h-4" /> Watch 60s demo →
            </button>
          </motion.div>

          {/* Product Mockup */}
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="mt-16 relative animate-[float_4s_ease-in-out_infinite]">
            {/* Orange edge glow - 4 sides */}
            <div className="absolute -top-6 -left-6 -right-6 h-12 bg-[#F97316]/10 blur-[30px] rounded-full pointer-events-none" />
            <div className="absolute -bottom-6 -left-6 -right-6 h-12 bg-[#F97316]/10 blur-[30px] rounded-full pointer-events-none" />
            <div className="absolute -left-6 -top-6 -bottom-6 w-12 bg-[#F97316]/8 blur-[30px] rounded-full pointer-events-none" />
            <div className="absolute -right-6 -top-6 -bottom-6 w-12 bg-[#F97316]/8 blur-[30px] rounded-full pointer-events-none" />
            <div className="relative max-w-3xl mx-auto rounded-2xl border border-[#2A2A2A] bg-[#1A1A1A] overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
              {/* Browser chrome */}
              <div className="flex items-center gap-2 px-4 py-3 bg-[#0D0D0D] border-b border-[#2A2A2A]">
                <span className="w-3 h-3 rounded-full bg-[#FF5F56]" />
                <span className="w-3 h-3 rounded-full bg-[#FFBD2E]" />
                <span className="w-3 h-3 rounded-full bg-[#27C93F]" />
                <span className="flex-1 text-center text-xs text-gray-500">app.aison.ai</span>
              </div>
              {/* Mockup content */}
              <div className="grid grid-cols-1 md:grid-cols-[200px_1fr_180px] gap-4 p-4 sm:p-6 text-left text-sm">
                {/* Left panel */}
                <div className="bg-[#111111] rounded-xl p-4 border border-[#2A2A2A]">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-3">Brand Profile</p>
                  <p className="font-bold text-[#F97316]">Bloom Bakery</p>
                  <p className="text-gray-500 text-xs mt-1">Food & Beverage</p>
                  <span className="inline-block mt-2 px-2 py-0.5 rounded-full bg-[#F97316]/20 text-[#F97316] text-[10px]">Tone: Playful</span>
                  <p className="text-[10px] text-gray-500 mt-4 mb-2">Brand Colors</p>
                  <div className="flex gap-2">
                    <span className="w-6 h-6 rounded-full bg-[#D4A843]" />
                    <span className="w-6 h-6 rounded-full bg-[#3B5233]" />
                    <span className="w-6 h-6 rounded-full bg-[#2B7A78]" />
                  </div>
                </div>
                {/* Center */}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-3">Generated Content</p>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="aspect-square rounded-lg bg-gradient-to-br from-[#D4A843] to-[#C09635]" />
                    <div className="aspect-square rounded-lg bg-gradient-to-br from-[#FAF7F2] to-[#E8E0D4]" />
                    <div className="aspect-square rounded-lg bg-gradient-to-br from-[#3B5233] to-[#2B7A78]" />
                  </div>
                  <div className="bg-[#111111] rounded-lg p-3 border border-[#2A2A2A] text-xs text-gray-400">
                    ☕ Rise and shine, London! Our freshly baked sourdough is waiting — warm, crusty, and calling your name. Pop in before 10am for a free flat white with any loaf…
                  </div>
                </div>
                {/* Right */}
                <div className="flex flex-col gap-3">
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-900/40 text-green-400 text-[10px]">
                    <Check className="w-3 h-3" /> 3 assets in 0.8s
                  </span>
                  {["Image", "Video", "Ad Copy", "Email"].map((t) => (
                    <span key={t} className="text-xs text-gray-400 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#F97316]" /> {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── TRUST BAR ── */}
      <section className="py-12 bg-[#111111]">
        <p className="text-center text-sm text-[#F97316] mb-4">Trusted by teams at</p>
        <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-gray-500 text-sm">
          {["Bloom Bakery", "Kova Studio", "Tidal Fit", "Meridian Legal", "Foxden Coffee", "Northstar Retail"].map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
      </section>

      {/* ── STATS ── */}
      <section className="bg-[#FAF7F2] py-16 px-4">
        <div className="max-w-3xl mx-auto grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-gray-300">
          {[["500+", "Beta users"], ["12 sec", "Avg. time to first asset"], ["81%", "Users publish without edits"]].map(([n, l]) => (
            <div key={n} className="text-center py-6 sm:py-0">
              <p className="font-serif text-5xl sm:text-6xl font-bold text-[#F97316]">{n}</p>
              <p className="text-gray-500 text-sm mt-1">{l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" className="bg-[#FAF7F2] py-20 px-4">
        <h2 className="font-serif text-3xl sm:text-4xl text-center text-[#111111] font-bold mb-12">From brief to brand content in 3 steps</h2>
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { icon: Fingerprint, n: "1", title: "Set up your brand profile (once)", desc: "Tell AIson your brand name, industry, tone of voice, target audience, colour palette, and visual style. Takes 5 minutes. Never repeat yourself again.", accent: true },
            { icon: Zap, n: "2", title: "Brief your campaign", desc: "Pick your channel (Instagram, Facebook, Email, TikTok), mood, and goal. AIson injects your brand DNA into every prompt automatically." },
            { icon: Download, n: "3", title: "Generate, review, download", desc: "Get images, video clips, and ad copy in seconds. Review in the app, tweak if needed, download in the right format for every platform." },
          ].map((s) => (
            <div key={s.n} className={`bg-white rounded-2xl p-6 border border-gray-200 hover:border-[#F97316] transition-colors ${s.accent ? "border-l-4 border-l-[#F97316]" : ""}`}>
              <div className="flex items-center gap-3 mb-4">
                <span className="flex items-center justify-center w-10 h-10 rounded-full bg-[#F97316] text-white font-bold text-sm">{s.n}</span>
                <s.icon className="w-5 h-5 text-[#F97316]" />
              </div>
              <h3 className="font-bold text-[#111111] text-lg mb-2">{s.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="bg-[#111111] py-20 px-4">
        <h2 className="font-serif text-3xl sm:text-4xl text-center font-bold mb-4">
          <em>Everything your brand needs. Nothing you don't.</em>
        </h2>
        <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-12">
          {features.map((f) => (
            <div key={f.title} className={`relative bg-[#1A1A1A] rounded-2xl p-6 border border-[#2A2A2A] hover:border-[#F97316] transition-colors group ${f.comingSoon ? "border-[#F97316]/30 bg-gradient-to-br from-[#1A1A1A] to-[#F97316]/5" : ""}`}>
              {f.comingSoon && <span className="absolute top-4 right-4 px-2 py-0.5 rounded-full bg-[#F97316]/20 text-[#F97316] text-[10px] font-semibold">Coming soon</span>}
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#F97316]/15 text-[#F97316] mb-4">
                <f.icon className="w-5 h-5" />
              </span>
              <h3 className="font-bold text-white text-lg mb-2">{f.title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="bg-[#FAF7F2] py-20 px-4">
        <h2 className="font-serif text-3xl sm:text-4xl text-center text-[#111111] font-bold mb-2">Simple pricing. No surprises.</h2>
        <p className="text-center text-gray-500 mb-12">Start free. Scale when you're ready.</p>
        <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {plans.map((p) => (
            <div key={p.name} className={`relative bg-white rounded-2xl p-6 border ${p.popular ? "border-[#F97316] shadow-[0_0_20px_rgba(249,115,22,0.15)]" : "border-gray-200"} hover:border-[#F97316] transition-colors flex flex-col`}>
              {p.popular && <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-[#F97316] text-white text-xs font-semibold">Most popular</span>}
              <h3 className="font-bold text-[#111111] text-lg">{p.name}</h3>
              <p className="mt-3"><span className="font-serif text-4xl font-bold text-[#F97316]">{p.price}</span><span className="text-gray-500 text-sm">{p.period}</span></p>
              <ul className="mt-6 space-y-3 flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-gray-600"><Check className="w-4 h-4 text-[#F97316]" />{f}</li>
                ))}
              </ul>
              <button onClick={goApp} className={`mt-6 w-full py-2.5 rounded-full font-semibold text-sm transition-colors ${p.filled ? "bg-[#F97316] text-white hover:bg-[#EA680C]" : "border-2 border-[#F97316] text-[#F97316] hover:bg-[#F97316] hover:text-white"}`}>
                {p.cta}
              </button>
            </div>
          ))}
        </div>
        <p className="text-center text-gray-500 text-sm mt-8">All plans include a 14-day free trial on paid features. No credit card required for Freemium.</p>
        <div className="max-w-lg mx-auto mt-4 h-1 rounded-full bg-gradient-to-r from-[#111111] via-[#F97316] to-[#111111] opacity-30" />
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="bg-[#FAF7F2] py-20 px-4">
        <h2 className="font-serif text-3xl sm:text-4xl text-center text-[#111111] font-bold mb-12">What SME founders say</h2>
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <div key={t.initials} className="relative bg-white rounded-2xl p-6 border border-gray-200 hover:border-[#F97316] transition-colors">
              <span className="absolute top-4 right-4 text-[#F97316]/20 text-5xl font-serif leading-none">"</span>
              <p className="text-gray-600 text-sm leading-relaxed mb-6 relative z-10">"{t.quote}"</p>
              <div className="flex items-center gap-3">
                <span className="flex items-center justify-center w-10 h-10 rounded-full bg-[#F97316]/20 text-[#F97316] font-bold text-sm">{t.initials}</span>
                <div>
                  <p className="font-semibold text-[#111111] text-sm">{t.name}</p>
                  <p className="text-gray-500 text-xs">{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="bg-[#FAF7F2] py-20 px-4">
        <h2 className="font-serif text-3xl sm:text-4xl text-center text-[#111111] font-bold mb-12">Frequently asked questions</h2>
        <div className="max-w-2xl mx-auto space-y-3">
          {faqs.map((f, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 hover:border-[#F97316] transition-colors overflow-hidden">
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="w-full flex items-center justify-between p-4 text-left">
                <span className="font-semibold text-[#111111] text-sm">{f.q}</span>
                {openFaq === i ? <ChevronUp className="w-4 h-4 text-[#F97316]" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </button>
              <AnimatePresence>
                {openFaq === i && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <p className="px-4 pb-4 text-gray-500 text-sm leading-relaxed">{f.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="bg-[#111111] py-24 px-4 text-center">
        <h2 className="font-serif text-3xl sm:text-4xl font-bold mb-4">Your competitors are already using AI.</h2>
        <p className="text-gray-400 mb-8">Get your brand on AIson today — it's free to start.</p>
        <button onClick={goApp} className="px-10 py-4 rounded-full bg-[#F97316] text-white font-semibold text-lg hover:bg-[#EA680C] transition-colors shadow-[0_0_30px_rgba(249,115,22,0.4)] animate-[glow-pulse_3s_ease-in-out_infinite]">
          Create my free account →
        </button>
        <p className="text-gray-500 text-xs mt-6">No credit card required · Cancel any time · First 5 assets free</p>
      </section>

      {/* ── FOOTER ── */}
      <footer className="bg-[#111111] border-t border-[#2A2A2A] py-12 px-4">
        <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-[#F97316]"><Zap className="w-3.5 h-3.5 text-white" /></span>
              <span className="font-bold"><span className="text-[#F97316]">AI</span>son</span>
            </div>
            <p className="text-gray-500 text-xs mb-4">AI content. Your brand. Your way.</p>
            <div className="flex gap-3">
              {[Instagram, Linkedin, Twitter].map((Icon, i) => (
                <Icon key={i} className="w-4 h-4 text-gray-500 hover:text-[#F97316] transition-colors cursor-pointer" />
              ))}
            </div>
          </div>
          {/* Product */}
          <div>
            <h4 className="font-bold text-sm mb-3">Product</h4>
            {["Features", "Pricing", "How It Works", "Changelog", "Roadmap"].map((l) => (
              <button key={l} onClick={() => scrollTo(l.toLowerCase().replace(/ /g, "-"))} className="block text-gray-500 text-xs hover:text-[#F97316] transition-colors mb-2">{l}</button>
            ))}
          </div>
          {/* Company */}
          <div>
            <h4 className="font-bold text-sm mb-3">Company</h4>
            {["About", "Blog", "Careers", "Press"].map((l) => (
              <p key={l} className="text-gray-500 text-xs mb-2 hover:text-[#F97316] transition-colors cursor-pointer">{l}</p>
            ))}
          </div>
          {/* Legal */}
          <div>
            <h4 className="font-bold text-sm mb-3">Legal</h4>
            {["Privacy Policy", "Terms of Service", "Cookie Settings"].map((l) => (
              <p key={l} className="text-gray-500 text-xs mb-2 hover:text-[#F97316] transition-colors cursor-pointer">{l}</p>
            ))}
          </div>
        </div>
        <div className="max-w-6xl mx-auto border-t border-[#2A2A2A] pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-gray-500">
          <p>© 2026 AIson Ltd. All rights reserved.</p>
          <p>Made with 🍊 in London</p>
        </div>
      </footer>

      {/* Float animation keyframe */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes glow-pulse {
          0%, 100% { box-shadow: 0 0 20px rgba(249,115,22,0.35); }
          50% { box-shadow: 0 0 40px rgba(249,115,22,0.7), 0 0 60px rgba(249,115,22,0.3); }
        }
      `}</style>
      <PublicChatWidget />
    </div>
  );
}
