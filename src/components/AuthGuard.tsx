import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

// Gates all app (sidebar) routes behind a real Supabase session. Unauthenticated
// visitors are sent to /auth. RLS already protects data at the database; this
// keeps the authenticated app shell from rendering for logged-out users.
export function AuthGuard() {
  const location = useLocation();
  const [status, setStatus] = useState<"loading" | "in" | "out">("loading");

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (active) setStatus(session ? "in" : "out");
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (active) setStatus(session ? "in" : "out");
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }
  if (status === "out") {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}
