// Admin-only backend for AIson.
// Gated to a hard allowlist of admin emails (ADMIN_EMAILS secret, comma-separated;
// defaults to the founder account). Every action verifies the caller's JWT AND
// that their email is an admin before touching anything. Uses the service role
// key, so it can read every account and write creatives into any user's Library.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const DEFAULT_ADMINS = "work.presnov@gmail.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Env-based founder allowlist. These accounts are ALWAYS admin and are protected
// (can't be demoted or deleted through the Admin UI).
function adminEmails(): string[] {
  return (Deno.env.get("ADMIN_EMAILS") || DEFAULT_ADMINS)
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

// The full admin set = env founders (by email) + rows in the `admins` table
// (by user_id and email). Used both to gate the caller and to mark accounts.
async function adminSets(admin: ReturnType<typeof createClient>) {
  const envEmails = adminEmails();
  const emails = new Set<string>(envEmails);
  const userIds = new Set<string>();
  const { data } = await admin.from("admins").select("user_id, email");
  for (const r of data || []) {
    if (r.user_id) userIds.add(String(r.user_id));
    if (r.email) emails.add(String(r.email).toLowerCase());
  }
  return { envEmails, emails, userIds };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ANON = Deno.env.get("SUPABASE_ANON_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE || !ANON) return json({ error: "Service unavailable" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Authorization required" }, 401);
    const token = authHeader.replace("Bearer ", "");

    // Verify the caller.
    const authClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await authClient.auth.getUser(token);
    const email = userData?.user?.email?.toLowerCase() || "";
    const callerId = userData?.user?.id || "";
    if (userErr || !email) return json({ error: "Invalid or expired token" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    const { action, ...params } = await req.json().catch(() => ({ action: "" }));

    // Authoritative admin check: env founders (by email) OR the admins table.
    const sets = await adminSets(admin);
    const callerIsAdmin = sets.emails.has(email) || sets.userIds.has(callerId);
    if (!callerIsAdmin) return json({ error: "Forbidden — admin access only" }, 403);

    switch (action) {
      case "list_users": {
        // All auth users (paginated), enriched with profile + creative counts.
        const users: any[] = [];
        let page = 1;
        while (page <= 20) {
          const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
          if (error) return json({ error: error.message }, 500);
          users.push(...(data?.users || []));
          if (!data || data.users.length < 200) break;
          page++;
        }

        const { data: creatives } = await admin.from("creatives").select("user_id, content_type");
        const counts: Record<string, { total: number; image: number; video: number }> = {};
        for (const c of creatives || []) {
          const k = c.user_id as string;
          counts[k] ??= { total: 0, image: 0, video: 0 };
          counts[k].total++;
          if (c.content_type === "video" || c.content_type === "short_video") counts[k].video++;
          else if (c.content_type === "image") counts[k].image++;
        }

        const { data: profiles } = await admin.from("profiles").select("id, full_name");
        const nameById: Record<string, string> = {};
        for (const p of profiles || []) nameById[p.id as string] = (p.full_name as string) || "";

        const rows = users.map((u) => ({
          id: u.id,
          email: u.email,
          full_name: u.user_metadata?.full_name || nameById[u.id] || "",
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
          confirmed: !!u.email_confirmed_at,
          creatives: counts[u.id] || { total: 0, image: 0, video: 0 },
          is_admin: sets.emails.has((u.email || "").toLowerCase()) || sets.userIds.has(u.id),
          is_founder: sets.envEmails.includes((u.email || "").toLowerCase()),
        }));
        rows.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
        return json({ users: rows, total: rows.length });
      }

      case "higgsfield_status": {
        // Read the Higgsfield credit balance from the bridge (VM).
        const base = Deno.env.get("HIGGSFIELD_BRIDGE_URL");
        const secret = Deno.env.get("HIGGSFIELD_BRIDGE_SECRET");
        if (!base || !secret) return json({ configured: false });
        try {
          const r = await fetch(`${base.replace(/\/$/, "")}/credits`, {
            headers: { Authorization: `Bearer ${secret}` },
          });
          const body = await r.json().catch(() => ({}));
          const text = JSON.stringify(body).toLowerCase();
          // Higgsfield session expired → the CLI on the VM needs a browser re-login.
          const needsRelogin = /session expired|auth login|no response received|unauthor/i.test(text);
          if (!r.ok || body?.error || needsRelogin) {
            return json({ configured: true, ok: false, needs_relogin: needsRelogin, error: body?.error || `bridge ${r.status}` });
          }
          return json({ configured: true, ok: true, ...body });
        } catch (e) {
          // Bridge unreachable (VM/tunnel down) — not a re-login issue.
          return json({ configured: true, ok: false, reachable: false, error: String(e) });
        }
      }

      case "list_creatives": {
        const uid = String(params.user_id || "");
        if (!uid) return json({ error: "user_id required" }, 400);
        const { data, error } = await admin
          .from("creatives")
          .select("id, content_type, visual_url, caption, saved, created_at, generation_metadata")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) return json({ error: error.message }, 500);
        return json({ creatives: data || [] });
      }

      case "upload_creative": {
        // Insert a creative (already-hosted URL) into a target user's Library.
        const uid = String(params.user_id || "");
        const visualUrl = String(params.visual_url || "").trim();
        const ct = ["image", "video", "carousel", "story"].includes(params.content_type)
          ? params.content_type
          : "image";
        if (!uid || !visualUrl) return json({ error: "user_id and visual_url required" }, 400);
        if (!/^https?:\/\//i.test(visualUrl)) return json({ error: "visual_url must be http(s)" }, 400);

        const { data, error } = await admin
          .from("creatives")
          .insert({
            user_id: uid,
            content_type: ct,
            visual_url: visualUrl,
            caption: String(params.caption || "").slice(0, 500),
            saved: true,
            generation_metadata: { provider: "admin_upload", uploaded_by: email, at: new Date().toISOString() },
          })
          .select("id, content_type, visual_url, caption, created_at")
          .single();
        if (error) return json({ error: error.message }, 500);
        return json({ creative: data });
      }

      case "delete_creative": {
        const id = String(params.creative_id || "");
        if (!id) return json({ error: "creative_id required" }, 400);
        const { error } = await admin.from("creatives").delete().eq("id", id);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }

      case "add_admin": {
        // Promote any account to admin.
        const uid = String(params.user_id || "");
        if (!uid) return json({ error: "user_id required" }, 400);
        const { data: target } = await admin.auth.admin.getUserById(uid);
        const targetEmail = target?.user?.email?.toLowerCase() || null;
        if (!targetEmail) return json({ error: "User not found" }, 404);
        const { error } = await admin
          .from("admins")
          .upsert({ user_id: uid, email: targetEmail, added_by: email }, { onConflict: "user_id" });
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true, email: targetEmail });
      }

      case "remove_admin": {
        // Revoke a table-granted admin. Env founders stay admin regardless.
        const uid = String(params.user_id || "");
        if (!uid) return json({ error: "user_id required" }, 400);
        const { data: target } = await admin.auth.admin.getUserById(uid);
        const targetEmail = target?.user?.email?.toLowerCase() || "";
        if (adminEmails().includes(targetEmail)) {
          return json({ error: "This is a protected founder account and stays admin." }, 400);
        }
        const { error } = await admin.from("admins").delete().eq("user_id", uid);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }

      case "delete_user": {
        // Permanently delete an account. Cascades to all data with a FK to
        // auth.users (profiles, company_details, api_keys, creatives, campaigns,
        // brand_profiles, user_rewards, admins, …).
        const uid = String(params.user_id || "");
        if (!uid) return json({ error: "user_id required" }, 400);
        if (uid === callerId) return json({ error: "You can't delete your own account here." }, 400);
        const { data: target } = await admin.auth.admin.getUserById(uid);
        const targetEmail = target?.user?.email?.toLowerCase() || "";
        if (adminEmails().includes(targetEmail)) {
          return json({ error: "This is a protected founder account and can't be deleted here." }, 403);
        }
        await admin.from("admins").delete().eq("user_id", uid); // FK cascade also covers this
        const { error } = await admin.auth.admin.deleteUser(uid);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true, deleted: uid });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    console.error("admin error:", e);
    return json({ error: "Unexpected error" }, 500);
  }
});
