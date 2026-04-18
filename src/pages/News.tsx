import { motion } from "framer-motion";
import { PublicNav, PublicFooter } from "./AboutProduct";
import { PublicChatWidget } from "@/components/PublicChatWidget";
import { Sparkles, Zap, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

const newsItems = [
  {
    date: "March 2026",
    tag: "Product Update",
    title: "AIson v2.0 — Full Platform Rebuild",
    summary: "Complete navigation overhaul with persistent sidebar, new Analytics and Posting pages, and redesigned Dashboard with conversational AI command centre.",
  },
  {
    date: "February 2026",
    tag: "Feature",
    title: "AI Marketing Strategy Engine",
    summary: "New strategy generation powered by Claude AI — analyses your brand, competitors, and market to produce actionable marketing strategies with auto-rules.",
  },
  {
    date: "January 2026",
    tag: "Feature",
    title: "Brand Memory Engine Launch",
    summary: "AIson now remembers your brand identity across sessions. Set your tone, colours, and style once — every piece of content stays on-brand automatically.",
  },
  {
    date: "December 2025",
    tag: "Industry",
    title: "AI Marketing Adoption Surges in 2025",
    summary: "According to recent studies, 67% of SMEs now use AI tools for content creation. AIson is leading the charge with its autonomous brand-aware approach.",
  },
  {
    date: "November 2025",
    tag: "Product Update",
    title: "Multi-Platform Scheduling",
    summary: "Schedule content across Instagram, Facebook, Twitter, LinkedIn, and TikTok from a single calendar view with drag-and-drop rescheduling.",
  },
  {
    date: "October 2025",
    tag: "Milestone",
    title: "500+ Beta Users Milestone",
    summary: "AIson reaches 500 active beta users, with 81% publishing generated content without manual edits.",
  },
];

const tagColors: Record<string, string> = {
  "Product Update": "bg-[#F97316]/15 text-[#F97316]",
  Feature: "bg-blue-500/15 text-blue-400",
  Industry: "bg-emerald-500/15 text-emerald-400",
  Milestone: "bg-purple-500/15 text-purple-400",
};

export default function News() {
  return (
    <div className="min-h-screen bg-[#111111] text-white">
      <PublicNav />

      <section className="pt-24 pb-20 px-4">
        <div className="max-w-3xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
            <h1 className="font-serif text-4xl sm:text-5xl font-bold mb-4">
              Latest <span className="text-[#F97316]">News</span>
            </h1>
            <p className="text-gray-400">Product updates, new features, and trends from the AI marketing industry.</p>
          </motion.div>

          {/* Android App Badge */}
          <div className="mb-10 p-4 bg-[#1A1A1A] rounded-xl border border-[#2A2A2A] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Zap className="w-5 h-5 text-[#F97316]" />
              <div>
                <p className="font-semibold text-sm">AIson Mobile App</p>
                <p className="text-gray-500 text-xs">Coming soon on Android & iOS</p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full bg-[#F97316]/15 text-[#F97316] text-xs font-semibold">Coming Soon</span>
          </div>

          {/* News Feed */}
          <div className="space-y-6">
            {newsItems.map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-[#1A1A1A] rounded-2xl p-6 border border-[#2A2A2A] hover:border-[#F97316]/30 transition-colors"
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xs text-gray-500">{item.date}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tagColors[item.tag] || "bg-gray-500/15 text-gray-400"}`}>
                    {item.tag}
                  </span>
                </div>
                <h3 className="font-bold text-lg mb-2">{item.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{item.summary}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <PublicFooter />
      <PublicChatWidget />
    </div>
  );
}
