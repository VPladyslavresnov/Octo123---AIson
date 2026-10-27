// Client-side admin gate. This is UX only — the real enforcement lives in the
// `admin` edge function (env allowlist + `admins` table + service role) and
// storage RLS. The email list below is the always-on founder fallback; keep it
// in sync with the ADMIN_EMAILS backend secret.
import { supabase } from "@/integrations/supabase/client";

export const ADMIN_EMAILS = ["work.presnov@gmail.com"];

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

// Full check: founder email (instant) OR a row in the `admins` table (runtime
// grants). RLS lets a user read only their own admin row, so this is safe.
export async function checkIsAdmin(userId?: string | null, email?: string | null): Promise<boolean> {
  if (isAdminEmail(email)) return true;
  if (!userId) return false;
  try {
    const { data } = await supabase
      .from("admins" as any)
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}
