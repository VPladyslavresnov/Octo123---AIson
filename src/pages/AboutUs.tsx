import { motion } from "framer-motion";
import { PublicNav, PublicFooter } from "./AboutProduct";
import { PublicChatWidget } from "@/components/PublicChatWidget";
import { Users, Target, Globe, Award } from "lucide-react";

const team = [
  { name: "AIson Team", role: "AI & Engineering", desc: "A multidisciplinary team of AI engineers, marketers, and designers building the future of autonomous marketing." },
];

const values = [
  { icon: Target, title: "Mission-Driven", desc: "Enable businesses of all sizes to launch, manage, and grow their marketing with AI — without human bottlenecks." },
  { icon: Globe, title: "Global Reach", desc: "Built for brands worldwide, with multi-language support and localized content generation." },
  { icon: Users, title: "Customer First", desc: "Every feature is designed around real user feedback from 500+ SMEs in our beta programme." },
  { icon: Award, title: "Quality Obsessed", desc: "We don't ship features — we ship results. Every AI output is tested against real brand standards." },
];

export default function AboutUs() {
  return (
    <div className="min-h-screen bg-[#111111] text-white">
      <PublicNav />

      <section className="pt-24 pb-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="font-serif text-4xl sm:text-5xl font-bold mb-4">
              About <span className="text-[#F97316]">AIson</span>
            </h1>
            <p className="text-gray-400 text-lg leading-relaxed">
              AIson was founded with a simple belief: every business deserves world-class marketing — regardless of budget or team size. We're building an AI-powered marketing operating system that handles everything from strategy to execution.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Values */}
      <section className="pb-20 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="font-serif text-2xl font-bold text-center mb-10">Our Values</h2>
          <div className="grid sm:grid-cols-2 gap-6">
            {values.map((v, i) => (
              <motion.div
                key={v.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-[#1A1A1A] rounded-2xl p-6 border border-[#2A2A2A]"
              >
                <v.icon className="w-8 h-8 text-[#F97316] mb-3" />
                <h3 className="font-bold text-lg mb-2">{v.title}</h3>
                <p className="text-gray-400 text-sm">{v.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Partners placeholder */}
      <section className="py-16 px-4 bg-[#0D0D0D]">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="font-serif text-2xl font-bold mb-4">Trusted by 500+ SMEs</h2>
          <p className="text-gray-400 text-sm mb-8">From bakeries to fintech startups, brands trust AIson to power their marketing.</p>
          <div className="flex flex-wrap justify-center gap-6 text-gray-500 text-sm">
            {["Bloom Bakery", "Kova Studio", "Tidal Fit", "Meridian Legal", "Foxden Coffee", "Northstar Retail"].map((c) => (
              <span key={c} className="px-4 py-2 border border-[#2A2A2A] rounded-lg">{c}</span>
            ))}
          </div>
        </div>
      </section>

      <PublicFooter />
      <PublicChatWidget />
    </div>
  );
}
