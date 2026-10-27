import { useState, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Sparkles, Loader2, Bot } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Mascot } from "@/components/Mascot";
import { RichMessage } from "@/components/RichMessage";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const pageContextMap: Record<string, string> = {
  "/campaigns": "The user is on the Campaigns page. Help with campaign strategy, creation, and optimization.",
  "/scheduled": "The user is on the Scheduler page. Help with posting times, calendar management, and scheduling.",
  "/posting": "The user is on the Posting/Channels page. Help with connecting social accounts and publishing.",
  "/analytics": "The user is on the Analytics page. Help interpret metrics, suggest improvements, and explain trends.",
  "/library": "The user is on the Library page. Help find, organize, and repurpose saved content.",
  "/account": "The user is on the Account/Settings page. Help with profile, brand setup, connections, and billing.",
};

function getPageContext(pathname: string): string {
  for (const [path, ctx] of Object.entries(pageContextMap)) {
    if (pathname.startsWith(path)) return ctx;
  }
  return "Help the user with any marketing task.";
}

export function FloatingAssistant() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isMainPage = location.pathname === "/home" || location.pathname === "/dashboard";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Don't render on main page (it has its own embedded chat)
  if (isMainPage) return null;

  const sendMessage = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;

    const userMsg: Message = { id: Date.now().toString(), role: "user", content: msg };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const pageContext = getPageContext(location.pathname);
      const allMessages = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));

      // Prepend context as a system-like user message
      const contextualMessages = [
        { role: "user" as const, content: `[Context: ${pageContext}]` },
        ...allMessages,
      ];

      const { data, error } = await supabase.functions.invoke("agent-chat", {
        body: { messages: contextualMessages },
      });

      const reply = data?.content || data?.reply || data?.response || "I'd be happy to help! Please try again.";
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: "assistant", content: reply }]);
    } catch {
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: "assistant", content: "Sorry, I couldn't process that. Try again!" }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating mascot (opens the assistant) */}
      <AnimatePresence>
        {!open && <Mascot onClick={() => setOpen(true)} />}
      </AnimatePresence>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-50 w-[380px] max-h-[520px] rounded-2xl bg-card border border-border shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                  <Sparkles className="w-3.5 h-3.5 text-primary-foreground" />
                </div>
                <div>
                  <p className="text-foreground text-sm font-semibold">AIson Assistant</p>
                  <p className="text-muted-foreground text-[10px]">Context-aware help on this page</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[340px]">
              {messages.length === 0 && (
                <div className="text-center py-8">
                  <Bot className="w-8 h-8 text-primary/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Ask me anything about this page or your marketing strategy.</p>
                </div>
              )}
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] px-3 py-2 rounded-xl text-sm leading-relaxed ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted text-foreground rounded-bl-sm"
                  }`}>
                    {m.role === "assistant" ? (
                      <RichMessage content={m.content} compact analyticsQuery={[...messages].reverse().find((mm) => mm.role === "user")?.content} />
                    ) : m.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-muted px-3 py-2 rounded-xl rounded-bl-sm">
                    <Loader2 className="w-4 h-4 text-primary animate-spin" />
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="p-3 border-t border-border">
              <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex items-center gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask a question..."
                  className="flex-1 bg-muted border-none rounded-lg px-3 py-2 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
                <button type="submit" disabled={!input.trim() || loading} className="w-8 h-8 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-30 flex items-center justify-center">
                  <Send className="w-3.5 h-3.5 text-primary-foreground" />
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
