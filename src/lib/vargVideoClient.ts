const VARG_API_URL = "https://api.varg.ai/v1";
const DEFAULT_MODEL = "kling-v3";
const DEFAULT_MAX_ATTEMPTS = 180;
const DEFAULT_POLL_MS = 2500;

export interface VargVideoResult {
  url: string;
  jobId: string;
  mediaType: string;
}

export function getBrowserVargApiKey(): string {
  return (
    localStorage.getItem("aison_varg_api_key") ||
    import.meta.env.VITE_VARG_API_KEY ||
    ""
  ).trim();
}

export function saveBrowserVargApiKey(apiKey: string) {
  if (apiKey.trim()) {
    localStorage.setItem("aison_varg_api_key", apiKey.trim());
  }
}

export function getVargErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error && typeof error === "object") {
    const message = (error as any).message || (error as any).error || (error as any).statusText;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return "Varg could not generate a video right now.";
}

export async function generateVargVideoInBrowser(params: {
  prompt: string;
  apiKey?: string;
  model?: string;
  duration?: number;
  aspectRatio?: string;
  onStatus?: (status: string) => void;
}): Promise<VargVideoResult> {
  const apiKey = (params.apiKey || getBrowserVargApiKey()).trim();
  if (!apiKey) {
    throw new Error("Varg API key is not configured.");
  }

  const createResponse = await fetch(`${VARG_API_URL}/video`, {
    method: "POST",
    mode: "cors",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: params.model || DEFAULT_MODEL,
      prompt: params.prompt,
      duration: params.duration || 5,
      aspect_ratio: params.aspectRatio || "9:16",
    }),
  });

  const createPayload = await createResponse.json().catch(() => ({}));
  if (!createResponse.ok) {
    throw new Error(createPayload?.message || createPayload?.error || `Varg video creation failed with status ${createResponse.status}.`);
  }

  const jobId = createPayload?.job_id || createPayload?.id;
  if (!jobId) {
    throw new Error("Varg did not return a job id.");
  }

  params.onStatus?.(`Varg video job started: ${jobId}. Estimated time: 1-3 minutes.`);

  for (let attempt = 0; attempt < DEFAULT_MAX_ATTEMPTS; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, DEFAULT_POLL_MS));
    let statusResponse: Response;
    try {
      statusResponse = await fetch(`${VARG_API_URL}/jobs/${jobId}`, {
        mode: "cors",
        headers: { Authorization: `Bearer ${apiKey}` },
      });
    } catch (error) {
      params.onStatus?.(`Varg status: checking render progress...`);
      if (attempt >= DEFAULT_MAX_ATTEMPTS - 1) {
        throw new Error(getVargErrorMessage(error));
      }
      continue;
    }
    const statusPayload = await statusResponse.json().catch(() => ({}));
    if (!statusResponse.ok) {
      if (statusResponse.status >= 400 && statusResponse.status < 500) {
        throw new Error(statusPayload?.message || statusPayload?.error || `Varg job polling failed with status ${statusResponse.status}.`);
      }
      continue;
    }

    const status = String(statusPayload?.status || "").toLowerCase();
    const etaSeconds =
      statusPayload?.eta_seconds ??
      statusPayload?.estimated_time_remaining ??
      statusPayload?.estimated_seconds_remaining ??
      statusPayload?.estimated_time_seconds ??
      null;
    const etaText =
      typeof etaSeconds === "number" && Number.isFinite(etaSeconds)
        ? ` Estimated time remaining: ${Math.max(1, Math.round(etaSeconds))}s.`
        : "";
    params.onStatus?.(`Varg status: ${status || "processing"}.${etaText}`);
    const outputUrl = statusPayload?.output?.url || statusPayload?.url || statusPayload?.video_url;
    if ((status === "completed" || status === "succeeded" || status === "success") && outputUrl) {
      return {
        url: outputUrl,
        jobId,
        mediaType: statusPayload?.output?.media_type || "video/mp4",
      };
    }

    if ((status === "completed" || status === "succeeded" || status === "success") && !outputUrl) {
      throw new Error("Varg completed the job but did not return a playable video URL.");
    }

    if (status === "failed" || status === "error" || status === "cancelled") {
      throw new Error(statusPayload?.error?.message || statusPayload?.message || "Varg video generation failed.");
    }
  }

  throw new Error("Varg video generation is taking longer than expected.");
}
