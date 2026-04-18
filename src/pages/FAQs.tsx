import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PublicNav, PublicFooter } from "./AboutProduct";
import { PublicChatWidget } from "@/components/PublicChatWidget";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

const faqCategories = [
  {
    category: "Getting Started",
    items: [
      { q: "Do I need design skills to use AIson?", a: "Not at all. AIson handles all the creative work — from generating studio-quality images to writing on-brand copy. You just describe what you need in plain English." },
      { q: "How do I set up my brand profile?", a: "During onboarding, you provide your brand name, colours, tone of voice, and visual style. You can also link your website or Instagram and AIson will automatically extract your brand identity." },
      { q: "Is there a free plan?", a: "Yes! Our Freemium plan gives you 5 images per month at no cost. No credit card required." },
    ],
  },
  {
    category: "AI & Content",
    items: [
      { q: "How does the Brand Memory Engine work?", a: "During onboarding you set your brand name, colours, tone of voice, and visual style. AIson stores this as a profile and injects it into every generation prompt automatically, so every asset feels on-brand." },
      { q: "What AI models does AIson use?", a: "AIson uses a combination of leading AI models including xAI Grok for image and video generation, Google Gemini for multimodal content, and advanced language models for copywriting — all orchestrated behind a single simple interface." },
      { q: "Can I edit generated content?", a: "Yes. You can refine any generated content using natural language prompts. For example, say 'make the headline shorter' or 'change the colour to blue' and AIson will update just that element." },
    ],
  },
  {
    category: "Billing & Account",
    items: [
      { q: "Can I cancel anytime?", a: "Yes. All paid plans are month-to-month with no lock-in. You can cancel, upgrade, or downgrade at any time from your account settings." },
      { q: "What payment methods do you accept?", a: "We accept all major credit and debit cards via Stripe. Bank transfer is available for Enterprise plans." },
      { q: "Do unused credits roll over?", a: "Credits reset at the start of each billing cycle. We recommend using them or they'll expire." },
    ],
  },
  {
    category: "Security & Privacy",
    items: [
      { q: "Is my brand data secure?", a: "Absolutely. All data is encrypted at rest and in transit. API keys and social tokens use AES-GCM encryption. We never share your data with third parties." },
      { q: "Are you GDPR compliant?", a: "Yes. AIson is fully GDPR compliant. You can request data export or deletion at any time. We process data under legitimate interest and explicit consent." },
      { q: "Where is my data stored?", a: "All data is stored in EU-based data centres with SOC 2 Type II certified infrastructure." },
    ],
  },
];

export default function FAQs() {
  const [openIdx, setOpenIdx] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filtered = faqCategories.map((cat) => ({
    ...cat,
    items: cat.items.filter(
      (f) =>
        f.q.toLowerCase().includes(search.toLowerCase()) ||
        f.a.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter((cat) => cat.items.length > 0);

  return (
    <div className="min-h-screen bg-[#111111] text-white">
      <PublicNav />

      <section className="pt-24 pb-20 px-4">
        <div className="max-w-3xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-10">
            <h1 className="font-serif text-4xl sm:text-5xl font-bold mb-4">
              Frequently Asked <span className="text-[#F97316]">Questions</span>
            </h1>
            <p className="text-gray-400">Find answers to common questions about AIson.</p>
          </motion.div>

          {/* Search */}
          <div className="relative mb-8">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input
              placeholder="Search FAQs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-[#1A1A1A] border-[#2A2A2A] text-white placeholder:text-gray-500"
            />
          </div>

          {/* Categories */}
          {filtered.map((cat) => (
            <div key={cat.category} className="mb-8">
              <h2 className="text-sm font-semibold text-[#F97316] uppercase tracking-wider mb-3">{cat.category}</h2>
              <div className="space-y-2">
                {cat.items.map((f) => {
                  const key = `${cat.category}-${f.q}`;
                  const isOpen = openIdx === key;
                  return (
                    <div key={key} className="bg-[#1A1A1A] rounded-xl border border-[#2A2A2A] overflow-hidden">
                      <button
                        onClick={() => setOpenIdx(isOpen ? null : key)}
                        className="w-full flex items-center justify-between p-4 text-left"
                      >
                        <span className="font-medium text-sm">{f.q}</span>
                        {isOpen ? <ChevronUp className="w-4 h-4 text-[#F97316]" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                      </button>
                      <AnimatePresence>
                        {isOpen && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                            <p className="px-4 pb-4 text-gray-400 text-sm leading-relaxed">{f.a}</p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <p className="text-center text-gray-500 py-8">No matching questions found. Try a different search term.</p>
          )}
        </div>
      </section>

      <PublicFooter />
      <PublicChatWidget />
    </div>
  );
}
