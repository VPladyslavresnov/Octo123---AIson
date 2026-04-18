import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, User } from "lucide-react";
import { toast } from "sonner";

import { DarkHeroPromptBar } from "@/components/home/DarkHeroPromptBar";
import { GenerationFeed, type GeneratedBlock } from "@/components/home/GenerationFeed";
import { StatusCards } from "@/components/home/StatusCards";
import { ParticleField } from "@/components/home/ParticleField";
import { parseContentBlocks, createImageBlock, createVideoBlock } from "@/components/home/parseContentBlocks";
import { createVideoFromImage } from "@/lib/createVideoFromImage";
import { presetPrompts } from "@/components/PresetPrompts";
import { useBrandIntelligence } from "@/hooks/useBrandIntelligence";

const Index = () => {
  const navigate = useNavigate();
  const [isGenerating, setIsGenerating] = useState(false);
  const [blocks, setBlocks] = useState<GeneratedBlock[]>([]);
  const [rawContent, setRawContent] = useState<string | null>(null);
  const [companyDetails, setCompanyDetails] = useState<any>(null);
  const [hasBrandProfile, setHasBrandProfile] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [user, setUser] = useState<any>(null);
  const { brandProfile, loadExistingProfile } = useBrandIntelligence();

  useEffect(() => {
    loadUserData();
    loadExistingProfile();
  }, []);

  const loadUserData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setUser(session.user);

      const { data: company } = await supabase
        .from("company_details")
        .select("*")
        .eq("user_id", session.user.id)
        .single();

      if (company) setCompanyDetails(company);

      const { data: brand } = await supabase
        .from("brand_profiles")
        .select("id")
        .eq("user_id", session.user.id)
        .limit(1);

      if (brand && brand.length > 0) setHasBrandProfile(true);
    } catch {
      // silent
    }
  };

  const handleGenerate = async (prompt: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast.error("Please sign in to generate content");
      navigate("/auth?redirect=/");
      return;
    }

    setIsGenerating(true);
    setBlocks([]);
    setRawContent(null);
    setHasGenerated(true);

    try {
      const brandColors = [
        ...(brandProfile?.primary_colors || []),
        ...(brandProfile?.secondary_colors || []),
      ].filter(Boolean).slice(0, 3);

      const textPromise = supabase.functions.invoke("generate-text", {
        body: {
          prompt,
          systemPrompt: presetPrompts["promote"],
          companyDetails,
          brandProfile: brandProfile ? {
            brand_name: brandProfile.brand_name,
            primary_colors: brandProfile.primary_colors,
            secondary_colors: brandProfile.secondary_colors,
          } : null,
        },
      });

      const imagePromise = supabase.functions.invoke("generate-image", {
        body: {
          prompt: `Create a social media visual for: ${prompt}${brandColors.length ? `. Use these brand colours prominently: ${brandColors.join(', ')}` : ''}`,
          companyDetails,
          preferredModel: "google/gemini-2.5-flash-image",
          brandProfile: brandProfile ? {
            brand_name: brandProfile.brand_name,
            visual_style: brandProfile.visual_style,
            primary_colors: brandProfile.primary_colors,
            secondary_colors: brandProfile.secondary_colors,
          } : null,
        },
      }).catch(() => null);

      const [textResult, imageResult] = await Promise.all([textPromise, imagePromise]);

      if (textResult.error) throw textResult.error;

      const content = textResult.data.content || textResult.data.url || "";
      setRawContent(content);

      const parsed = parseContentBlocks(content, "text");
      const imageUrl = imageResult?.data?.url || imageResult?.data?.imageUrl;
      if (imageUrl && typeof imageUrl === "string") {
        parsed.unshift(createImageBlock(imageUrl));
        try {
          const videoUrl = await createVideoFromImage(imageUrl, 5, 30);
          parsed.unshift(createVideoBlock(videoUrl));
        } catch {
          // video creation failed, skip silently
        }
      }
      setBlocks(parsed);

      toast.success("Content generated!");
    } catch (error: any) {
      toast.error("Generation failed. Please try again.");
      console.error("Generation error:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen relative" style={{ background: "#0A0F1E" }}>
      {/* Particle background */}
      <ParticleField />

      {/* Radial glow behind input area */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[600px]"
          style={{
            background: "radial-gradient(ellipse at center, hsla(16, 95%, 47%, 0.06) 0%, transparent 65%)",
          }}
        />
      </div>

      {/* Minimal top nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 sm:px-8 py-5">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="flex items-center gap-2.5"
        >
          <div className="w-8 h-8 rounded-xl bg-[hsl(16,95%,47%)] flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-bold text-white tracking-tight">AIson</span>
        </motion.div>

        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          onClick={() => navigate(user ? "/account" : "/auth")}
          className="w-9 h-9 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center hover:bg-white/[0.1] transition-colors"
        >
          <User className="w-4 h-4 text-white/50" />
        </motion.button>
      </nav>

      {/* Main content — vertically centered when no results */}
      <div
        className={`relative z-10 flex flex-col items-center transition-all duration-700 ${
          hasGenerated ? "pt-8 sm:pt-12" : "justify-center min-h-[calc(100vh-80px)]"
        }`}
      >
        <div className="w-full px-4 sm:px-6 lg:px-8">
          {/* Hero text — only before first generation */}
          {!hasGenerated && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-center mb-10"
            >
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.1]">
                What should{" "}
                <span
                  className="text-transparent bg-clip-text"
                  style={{
                    backgroundImage: "linear-gradient(135deg, hsl(16, 95%, 55%) 0%, hsl(30, 100%, 60%) 100%)",
                  }}
                >
                  AIson
                </span>{" "}
                create?
              </h1>
              <p className="mt-4 text-base sm:text-lg text-white/30 max-w-md mx-auto leading-relaxed font-light">
                One prompt. Full campaigns, posts, visuals — all on-brand.
              </p>
            </motion.div>
          )}

          {/* Prompt bar */}
          <DarkHeroPromptBar onSubmit={handleGenerate} isGenerating={isGenerating} />

          {/* Status cards — only before first generation */}
          {!hasGenerated && <StatusCards hasBrandProfile={hasBrandProfile} />}
        </div>

        {/* Generation feed */}
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
          <GenerationFeed
            blocks={blocks}
            isGenerating={isGenerating}
            contentType="text"
            rawContent={rawContent}
            darkMode
          />
        </div>
      </div>
    </div>
  );
};

export default Index;
