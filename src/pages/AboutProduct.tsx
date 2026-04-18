import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { PublicChatWidget } from "@/components/PublicChatWidget";
import {
  Sparkles,
  Brain,
  Image,
  Video,
  Pen,
  Calendar,
  BarChart3,
  MessageCircle,
  Shield,
  Zap,
  ArrowRight,
} from "lucide-react";

const capabilities = [
  { icon: Brain, title: "Brand Memory Engine", desc: "AIson learns your brand identity — tone, colours, style, audience — and applies it consistently across every piece of content." },
  { icon: Image, title: "AI Image Generation", desc: "Studio-quality product shots, lifestyle imagery, social media graphics, and ad creatives — all generated in seconds." },
  { icon: Video, title: "AI Video Creation", desc: "Short-form videos for Reels, TikTok, and Stories. Automatically formatted for each platform." },
  { icon: Pen, title: "AI Copywriting", desc: "Captions, ad copy, email subject lines, blog posts — all written in your exact brand voice." },
  { icon: Calendar, title: "Smart Scheduling", desc: "AI-recommended posting times, drag-and-drop calendar, and automatic cross-platform publishing." },
  { icon: BarChart3, title: "Performance Analytics", desc: "Track impressions, reach, engagement, and conversions. Get AI-powered recommendations to improve results." },
  { icon: MessageCircle, title: "AI Marketing Agent", desc: "Chat with your AI marketing assistant to create campaigns, get feedback, and manage your entire marketing workflow." },
  { icon: Shield, title: "Enterprise Security", desc: "AES-GCM encrypted tokens, JWT authentication, row-level security, and GDPR compliance built in." },
];

export default function AboutProduct() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#111111] text-white">
      {/* Nav */}
      <PublicNav />

      <section className="pt-24 pb-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="font-serif text-4xl sm:text-5xl font-bold mb-4">
              The AI Marketing <span className="text-[#F97316]">Operating System</span>
            </h1>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              AIson replaces your entire marketing team with an autonomous AI platform that learns, creates, executes, and optimizes — across every channel.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Capabilities Grid */}
      <section className="pb-20 px-4">
        <div className="max-w-5xl mx-auto grid sm:grid-cols-2 gap-6">
          {capabilities.map((c, i) => (
            <motion.div
              key={c.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-[#1A1A1A] rounded-2xl p-6 border border-[#2A2A2A] hover:border-[#F97316] transition-colors"
            >
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#F97316]/15 text-[#F97316] mb-4">
                <c.icon className="w-5 h-5" />
              </span>
              <h3 className="font-bold text-lg mb-2">{c.title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{c.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 text-center bg-[#0D0D0D]">
        <h2 className="font-serif text-3xl font-bold mb-4">Ready to transform your marketing?</h2>
        <p className="text-gray-400 mb-8">Start free. No credit card required.</p>
        <button onClick={() => navigate("/signup")} className="px-8 py-3.5 rounded-full bg-[#F97316] text-white font-semibold hover:bg-[#EA680C] transition-colors">
          Get started free <ArrowRight className="w-4 h-4 inline ml-1" />
        </button>
      </section>

      <PublicFooter />
      <PublicChatWidget />
    </div>
  );
}

/* Shared public nav & footer — reusable across public pages */
import { Link } from "react-router-dom";

export function PublicNav() {
  return (
    <nav className="sticky top-0 z-50 bg-[#111111]/90 backdrop-blur-md border-b border-[#2A2A2A]">
      <div className="bg-gradient-to-r from-[#F97316] to-[#FB923C] h-[2px]" />
      <div className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 h-14">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#F97316]">
            <Zap className="w-4 h-4 text-white" />
          </span>
          <span className="text-lg font-bold"><span className="text-[#F97316]">AI</span>son</span>
        </Link>
        <div className="hidden md:flex items-center gap-6 text-sm text-gray-300">
          <Link to="/about-product" className="hover:text-[#F97316] transition-colors">Product</Link>
          <Link to="/about-us" className="hover:text-[#F97316] transition-colors">About Us</Link>
          <Link to="/news" className="hover:text-[#F97316] transition-colors">News</Link>
          <Link to="/faqs" className="hover:text-[#F97316] transition-colors">FAQs</Link>
          <Link to="/contact" className="hover:text-[#F97316] transition-colors">Contact</Link>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/auth" className="text-sm text-gray-300 hover:text-[#F97316] transition-colors hidden sm:inline">Log in</Link>
          <Link to="/signup" className="px-5 py-2 rounded-full bg-[#F97316] text-white text-sm font-semibold hover:bg-[#EA680C] transition-colors">
            Sign up
          </Link>
        </div>
      </div>
    </nav>
  );
}

export function PublicFooter() {
  return (
    <footer className="bg-[#111111] border-t border-[#2A2A2A] py-12 px-4">
      <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-[#F97316]"><Zap className="w-3.5 h-3.5 text-white" /></span>
            <span className="font-bold"><span className="text-[#F97316]">AI</span>son</span>
          </div>
          <p className="text-gray-500 text-xs">AI content. Your brand. Your way.</p>
        </div>
        <div>
          <h4 className="font-bold text-sm mb-3">Product</h4>
          {[{ l: "Features", to: "/about-product" }, { l: "Pricing", to: "/#pricing" }, { l: "FAQs", to: "/faqs" }].map(({ l, to }) => (
            <Link key={l} to={to} className="block text-gray-500 text-xs hover:text-[#F97316] transition-colors mb-2">{l}</Link>
          ))}
        </div>
        <div>
          <h4 className="font-bold text-sm mb-3">Company</h4>
          {[{ l: "About Us", to: "/about-us" }, { l: "News", to: "/news" }, { l: "Contact", to: "/contact" }].map(({ l, to }) => (
            <Link key={l} to={to} className="block text-gray-500 text-xs hover:text-[#F97316] transition-colors mb-2">{l}</Link>
          ))}
        </div>
        <div>
          <h4 className="font-bold text-sm mb-3">Legal</h4>
          {["Privacy Policy", "Terms of Service", "GDPR"].map((l) => (
            <p key={l} className="text-gray-500 text-xs mb-2 cursor-pointer hover:text-[#F97316] transition-colors">{l}</p>
          ))}
        </div>
      </div>
      <div className="max-w-6xl mx-auto border-t border-[#2A2A2A] pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-gray-500">
        <p>© 2026 AIson Ltd. All rights reserved.</p>
        <p>Made with 🍊 in London</p>
      </div>
    </footer>
  );
}
