// Higgsfield image/video generation via the self-hosted bridge (wraps the CLI).
// Higgsfield generation takes minutes, which is longer than an edge function can
// wait — so this is FIRE-AND-FORGET: we hand the job to the bridge, which
// generates in the background and saves the finished media into the user's
// AIson Library (creatives). The function returns immediately.

export function hasHiggsfield(): boolean {
  return !!(Deno.env.get("HIGGSFIELD_BRIDGE_URL") && Deno.env.get("HIGGSFIELD_BRIDGE_SECRET"));
}

/** Enqueue a Higgsfield image/video job. Returns true if the bridge accepted it. */
export async function higgsfieldEnqueue(
  kind: "image" | "video",
  prompt: string,
  userId: string,
  opts?: { aspectRatio?: string; duration?: number; caption?: string },
): Promise<boolean> {
  const base = Deno.env.get("HIGGSFIELD_BRIDGE_URL");
  const secret = Deno.env.get("HIGGSFIELD_BRIDGE_SECRET");
  if (!base || !secret) return false;
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/generate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        prompt: String(prompt).slice(0, 4000),
        user_id: userId,
        caption: opts?.caption,
        ...(opts?.aspectRatio ? { aspect_ratio: opts.aspectRatio } : {}),
        ...(opts?.duration ? { duration: opts.duration } : {}),
      }),
    });
    if (res.ok || res.status === 202) return true;
    console.warn("Higgsfield bridge rejected job:", res.status, await res.text().catch(() => ""));
    return false;
  } catch (e) {
    console.warn("Higgsfield bridge fetch failed:", e);
    return false;
  }
}
