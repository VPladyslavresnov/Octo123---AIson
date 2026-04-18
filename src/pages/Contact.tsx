import { useState } from "react";
import { motion } from "framer-motion";
import { PublicNav, PublicFooter } from "./AboutProduct";
import { PublicChatWidget } from "@/components/PublicChatWidget";
import { Mail, MapPin, Phone, Shield, FileText, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export default function Contact() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [sending, setSending] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.message) {
      toast.error("Please fill in all fields.");
      return;
    }
    setSending(true);
    setTimeout(() => {
      setSending(false);
      toast.success("Message sent! We'll get back to you shortly.");
      setForm({ name: "", email: "", message: "" });
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-[#111111] text-white">
      <PublicNav />

      <section className="pt-24 pb-20 px-4">
        <div className="max-w-5xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
            <h1 className="font-serif text-4xl sm:text-5xl font-bold mb-4">
              Get in <span className="text-[#F97316]">Touch</span>
            </h1>
            <p className="text-gray-400 text-lg">We'd love to hear from you. Send us a message and we'll respond promptly.</p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-10">
            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                placeholder="Your name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="bg-[#1A1A1A] border-[#2A2A2A] text-white placeholder:text-gray-500"
              />
              <Input
                type="email"
                placeholder="Email address"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="bg-[#1A1A1A] border-[#2A2A2A] text-white placeholder:text-gray-500"
              />
              <Textarea
                placeholder="Your message"
                rows={5}
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                className="bg-[#1A1A1A] border-[#2A2A2A] text-white placeholder:text-gray-500"
              />
              <Button type="submit" className="w-full" disabled={sending}>
                {sending ? "Sending..." : "Send Message"}
              </Button>
            </form>

            {/* Info */}
            <div className="space-y-6">
              <div className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-[#F97316] mt-0.5" />
                <div>
                  <p className="font-semibold text-sm">Email</p>
                  <p className="text-gray-400 text-sm">hello@aison.ai</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-[#F97316] mt-0.5" />
                <div>
                  <p className="font-semibold text-sm">Address</p>
                  <p className="text-gray-400 text-sm">London, United Kingdom</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-[#F97316] mt-0.5" />
                <div>
                  <p className="font-semibold text-sm">Support Hours</p>
                  <p className="text-gray-400 text-sm">Mon – Fri, 9am – 6pm GMT</p>
                </div>
              </div>

              <div className="border-t border-[#2A2A2A] pt-6 space-y-3">
                <h3 className="font-semibold text-sm mb-2">Compliance & Certifications</h3>
                <div className="flex items-center gap-2 text-gray-400 text-xs">
                  <Shield className="w-4 h-4 text-[#F97316]" /> GDPR Compliant
                </div>
                <div className="flex items-center gap-2 text-gray-400 text-xs">
                  <FileText className="w-4 h-4 text-[#F97316]" /> ISO 27001 (in progress)
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <PublicFooter />
      <PublicChatWidget />
    </div>
  );
}
