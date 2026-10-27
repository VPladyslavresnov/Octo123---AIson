import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Mail, Lock, User } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { shouldBypassAuth } from "@/lib/localAccessBypass";

const authSchema = z.object({
  email: z.string().trim().email("Please enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  fullName: z.string().trim().optional(),
});

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (shouldBypassAuth()) {
      navigate("/home", { replace: true });
      return;
    }

    const redirectTarget = searchParams.get("redirect");
    const isResetFlow = searchParams.get("reset") === "true" || searchParams.get("mode") === "reset";
    const explicitMode = searchParams.get("mode");
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const hashType = hashParams.get("type");
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");
    const code = searchParams.get("code");
    const isRecoveryLink = isResetFlow || hashType === "recovery" || searchParams.get("type") === "recovery" || Boolean(code);

    // (Removed a DEV-only auto-redirect to /home here: it conflicted with
    // AuthGuard — which now protects app routes — and caused an /auth⇄/home
    // redirect loop. Dev now logs in normally, matching production.)

    setIsRecoveryMode(isRecoveryLink);
    if (isRecoveryLink) {
      setIsForgotPassword(false);
      setIsLogin(false);
    }

    const bootstrapRecovery = async () => {
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          toast.error(error.message || "Password reset link is invalid or expired.");
        } else {
          setIsRecoveryMode(true);
          window.history.replaceState({}, document.title, "/auth?mode=reset");
          toast.success("Reset verified. Choose your new password.");
        }
        return;
      }

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) {
          toast.error(error.message || "Password reset link is invalid or expired.");
        } else {
          setIsRecoveryMode(true);
          window.history.replaceState({}, document.title, "/auth?mode=reset");
          toast.success("Reset verified. Choose your new password.");
        }
      }
    };

    void bootstrapRecovery();

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && !isRecoveryLink) {
        navigate(redirectTarget || "/account", { replace: true });
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsRecoveryMode(true);
        setIsForgotPassword(false);
        setIsLogin(false);
        toast.success("Recovery link confirmed. Set a new password.");
        return;
      }

      if (session && event === "SIGNED_IN" && !isRecoveryLink) {
        navigate(redirectTarget || "/account", { replace: true });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isRecoveryMode) {
      if (!password || password.length < 6) {
        toast.error("Password must be at least 6 characters");
        return;
      }
      if (password !== confirmPassword) {
        toast.error("Passwords do not match");
        return;
      }

      setLoading(true);
      try {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;

        toast.success("Password updated successfully. You can now use your new password.");
        setIsRecoveryMode(false);
        setIsLogin(true);
        setPassword("");
        setConfirmPassword("");
        navigate("/account", { replace: true });
      } catch (error: any) {
        toast.error(error.message || "Failed to update password");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (isForgotPassword) {
      // Handle password reset
      if (!email.trim()) {
        toast.error("Please enter your email");
        return;
      }

      setLoading(true);
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/auth?mode=reset`,
        });

        if (error) throw error;
        toast.success("Password reset email sent! Check your inbox.");
        setIsForgotPassword(false);
        setEmail("");
      } catch (error: any) {
        toast.error(error.message || "Failed to send reset email");
      } finally {
        setLoading(false);
      }
      return;
    }

    const validation = authSchema.safeParse({ 
      email, 
      password, 
      fullName: isLogin ? undefined : fullName 
    });
    
    if (!validation.success) {
      validation.error.issues.forEach(err => toast.error(err.message));
      return;
    }

    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) throw error;
        toast.success("Welcome back!");
      } else {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: fullName.trim() },
            emailRedirectTo: `${window.location.origin}/account`,
          },
        });

        if (error) {
          if (error.message.includes("already registered")) {
            toast.error("This email is already registered. Please login instead.");
          } else {
            throw error;
          }
        } else {
          toast.success("Account created successfully!");
        }
      }
    } catch (error: any) {
      const msg = error?.message?.toLowerCase?.() || "";
      if (msg.includes("invalid login") || msg.includes("invalid email") || msg.includes("password")) {
        toast.error("Invalid email or password. Please try again.");
      } else if (msg.includes("already registered") || msg.includes("already been registered")) {
        toast.error("This email is already registered. Try logging in instead.");
      } else if (msg.includes("rate limit")) {
        toast.error("Too many attempts. Please wait a moment and try again.");
      } else {
        toast.error("Authentication failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="p-3 bg-gradient-primary rounded-xl">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-foreground">AIson</h1>
          </div>
          <p className="text-muted-foreground">
            {isLogin ? "Welcome back!" : "Create your account"}
          </p>
        </div>

        {/* Auth Form */}
        <div className="bg-card rounded-2xl p-8 shadow-medium">
          <h2 className="text-2xl font-bold text-center mb-6">
            {isRecoveryMode ? "Create New Password" : isForgotPassword ? "Reset Password" : isLogin ? "Login" : "Sign Up"}
          </h2>

          {isForgotPassword && (
            <p className="text-sm text-muted-foreground text-center mb-6">
              Enter your email address and we'll send you a link to reset your password.
            </p>
          )}

          {isRecoveryMode && (
            <p className="text-sm text-muted-foreground text-center mb-6">
              Your reset link is confirmed. Enter a new password below to restore access to your account.
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && !isForgotPassword && !isRecoveryMode && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="John Doe"
                    required={!isLogin}
                    className="w-full pl-10 pr-4 py-3 border border-border rounded-xl bg-background focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all text-foreground"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  disabled={isRecoveryMode}
                  className="w-full pl-10 pr-4 py-3 border border-border rounded-xl bg-background focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all text-foreground"
                />
              </div>
            </div>

            {!isForgotPassword && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  {isRecoveryMode ? "New Password" : "Password"}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    className="w-full pl-10 pr-4 py-3 border border-border rounded-xl bg-background focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all text-foreground"
                  />
                </div>
              </div>
            )}

            {isRecoveryMode && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Confirm New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    className="w-full pl-10 pr-4 py-3 border border-border rounded-xl bg-background focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all text-foreground"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-primary text-white font-semibold rounded-xl shadow-strong hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              {loading ? "Loading..." : isRecoveryMode ? "Update Password" : isForgotPassword ? "Send Reset Link" : isLogin ? "Login" : "Sign Up"}
            </button>
          </form>

          <div className="mt-6 space-y-3 text-center">
            {isLogin && !isForgotPassword && !isRecoveryMode && (
              <button
                onClick={() => setIsForgotPassword(true)}
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                Forgot password?
              </button>
            )}
            
            {!isForgotPassword && !isRecoveryMode && (
              <button
                onClick={() => setIsLogin(!isLogin)}
                className="block w-full text-primary hover:text-primary-hover font-medium transition-colors"
              >
                {isLogin
                  ? "Don't have an account? Sign up"
                  : "Already have an account? Login"}
              </button>
            )}

            {(isForgotPassword || isRecoveryMode) && (
              <button
                onClick={() => {
                  setIsForgotPassword(false);
                  setIsRecoveryMode(false);
                  setIsLogin(true);
                  setEmail("");
                  setPassword("");
                  setConfirmPassword("");
                  window.history.replaceState({}, document.title, "/auth");
                }}
                className="block w-full text-primary hover:text-primary-hover font-medium transition-colors"
              >
                Back to login
              </button>
            )}
          </div>
        </div>

        <div className="mt-6 text-center">
          <button
            onClick={() => navigate("/")}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to Home
          </button>
        </div>
      </div>
    </div>
  );
};

export default Auth;
