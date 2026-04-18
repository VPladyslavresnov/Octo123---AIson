import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Zap, Eye, EyeOff, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function Signup() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/content-studio");
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && event === "SIGNED_IN") navigate("/content-studio");
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!fullName.trim()) e.fullName = "Full name is required";
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Please enter a valid email";
    if (password.length < 8) e.password = "Password must be at least 8 characters";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: fullName.trim(), company_name: company.trim() },
          emailRedirectTo: `${window.location.origin}/content-studio`,
        },
      });
      if (error) {
        if (error.message.includes("already registered")) {
          setErrors({ email: "This email is already registered. Please log in instead." });
        } else {
          toast.error(error.message);
        }
      } else {
        toast.success("Account created! Check your email to verify.");
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const renderField = (label: string, placeholder: string, value: string, onChange: (v: string) => void, type = "text", error?: string, children?: React.ReactNode) => (
    <div>
      <label className="block text-sm font-medium text-white mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={(e) => { onChange(e.target.value); setErrors((p) => ({ ...p, [label]: "" })); }}
          placeholder={placeholder}
          className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#333] rounded-lg text-white placeholder-gray-500 focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]/30 outline-none transition-colors"
        />
        {children}
      </div>
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#111111] flex flex-col md:flex-row">
      {/* LEFT — Form */}
      <div className="w-full md:w-1/2 flex flex-col justify-center px-8 sm:px-12 lg:px-16 py-12">
        {/* Logo */}
        <button onClick={() => navigate("/")} className="flex items-center gap-2 mb-10">
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#F97316]">
            <Zap className="w-4 h-4 text-white" />
          </span>
          <span className="text-lg font-bold"><span className="text-[#F97316]">AI</span><span className="text-white">son</span></span>
        </button>

        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-white mb-2">Create your account</h1>
        <p className="text-[#9CA3AF] mb-8">Start creating on-brand content in minutes.</p>

        <form onSubmit={handleSubmit} className="space-y-5 max-w-md">
          {renderField("Full name", "Jane Doe", fullName, setFullName, "text", errors.fullName || errors["Full name"])}
          {renderField("Work email", "jane@company.com", email, setEmail, "email", errors.email || errors["Work email"])}
          {renderField("Company name", "Acme Inc.", company, setCompany)}
          {renderField("Password", "8+ characters", password, setPassword, showPassword ? "text" : "password", errors.password || errors["Password"],
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors">
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          )}

          <button type="submit" disabled={loading} className="w-full mt-6 py-3.5 rounded-full bg-[#F97316] hover:bg-[#EA680C] text-white font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {loading ? "Creating account..." : "Create free account →"}
          </button>
        </form>

        <p className="text-[#9CA3AF] text-sm mt-6 max-w-md text-center">
          Already have an account?{" "}
          <button onClick={() => navigate("/auth")} className="text-[#F97316] hover:underline font-medium">Log in</button>
        </p>

        <p className="text-gray-500 text-xs mt-8 max-w-md text-center">
          By signing up, you agree to our <span className="text-gray-300 underline cursor-pointer">Terms of Service</span> and <span className="text-gray-300 underline cursor-pointer">Privacy Policy</span>
        </p>
      </div>

      {/* RIGHT — Social Proof */}
      <div className="w-full md:w-1/2 flex flex-col items-center justify-center px-8 sm:px-12 lg:px-16 py-12 relative overflow-hidden"
        style={{ background: "radial-gradient(ellipse at center bottom, rgba(249,115,22,0.15) 0%, rgba(17,17,17,0) 70%), #111111" }}>

        {/* Badge */}
        <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#F97316] text-[#F97316] text-sm mb-8">
          <Zap className="w-3.5 h-3.5" /> Free to start
        </span>

        {/* Headline */}
        <h2 className="font-serif text-3xl sm:text-4xl font-bold text-white text-center leading-tight mb-10">
          Join 500+ SMEs already<br />creating with <span className="text-[#F97316]">AI</span>son
        </h2>

        {/* Benefits */}
        <div className="space-y-4 mb-10">
          {["5 free image generations", "No credit card required", "Set up in under 2 minutes", "Cancel anytime"].map((item) => (
            <div key={item} className="flex items-center gap-3">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#F97316] shrink-0">
                <Check className="w-3.5 h-3.5 text-white" />
              </span>
              <span className="text-white text-sm">{item}</span>
            </div>
          ))}
        </div>

        {/* Testimonial */}
        <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-6 max-w-sm w-full">
          <p className="font-serif italic text-gray-200 text-sm leading-relaxed mb-4">
            "Onboarded in 10 minutes, had our first month of content by end of day. Insane."
          </p>
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-10 h-10 rounded-full bg-[#F97316] text-white font-bold text-sm shrink-0">PN</span>
            <div>
              <p className="text-white font-semibold text-sm">Priya N.</p>
              <p className="text-[#9CA3AF] text-xs">Co-founder, Tidal Fit</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
