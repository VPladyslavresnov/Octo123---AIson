const STORAGE_KEY = "aison_meta_manual_connection";
const META_API_VERSION = "v23.0";
const META_GRAPH_URL = `https://graph.facebook.com/${META_API_VERSION}`;

export interface MetaManualConnection {
  instagramBusinessAccountId: string;
  accessToken: string;
  accountName?: string;
  connectedAt: string;
}

export interface InstagramPublishResult {
  creationId: string;
  instagramMediaId: string;
}

export function getMetaManualConnection(): MetaManualConnection | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MetaManualConnection;
    if (!parsed.instagramBusinessAccountId || !parsed.accessToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveMetaManualConnection(connection: Omit<MetaManualConnection, "connectedAt">): MetaManualConnection {
  const saved = {
    ...connection,
    connectedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  return saved;
}

export function clearMetaManualConnection() {
  localStorage.removeItem(STORAGE_KEY);
}

export async function verifyMetaManualConnection(connection: MetaManualConnection): Promise<string> {
  const url = new URL(`${META_GRAPH_URL}/${connection.instagramBusinessAccountId}`);
  url.searchParams.set("fields", "id,username,name");
  url.searchParams.set("access_token", connection.accessToken);

  const response = await fetch(url.toString());
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || "Meta could not verify this Instagram account/token.");
  }

  return payload.username || payload.name || `Instagram ${payload.id}`;
}

export async function publishImageToInstagram(args: {
  connection: MetaManualConnection;
  imageUrl: string;
  caption?: string | null;
  hashtags?: string[] | null;
}): Promise<InstagramPublishResult> {
  const caption = buildCaption(args.caption, args.hashtags);
  const createBody = new URLSearchParams({
    image_url: args.imageUrl,
    caption,
    access_token: args.connection.accessToken,
  });

  const createResponse = await fetch(`${META_GRAPH_URL}/${args.connection.instagramBusinessAccountId}/media`, {
    method: "POST",
    body: createBody,
  });
  const createPayload = await createResponse.json().catch(() => ({}));
  if (!createResponse.ok || !createPayload.id) {
    throw new Error(createPayload?.error?.message || "Meta failed to create the Instagram media container.");
  }

  const publishBody = new URLSearchParams({
    creation_id: createPayload.id,
    access_token: args.connection.accessToken,
  });

  const publishResponse = await fetch(`${META_GRAPH_URL}/${args.connection.instagramBusinessAccountId}/media_publish`, {
    method: "POST",
    body: publishBody,
  });
  const publishPayload = await publishResponse.json().catch(() => ({}));
  if (!publishResponse.ok || !publishPayload.id) {
    throw new Error(publishPayload?.error?.message || "Meta failed to publish the Instagram media.");
  }

  return {
    creationId: createPayload.id,
    instagramMediaId: publishPayload.id,
  };
}

function buildCaption(caption?: string | null, hashtags?: string[] | null): string {
  const base = (caption || "").trim();
  const tagLine = Array.isArray(hashtags) && hashtags.length
    ? hashtags.map((tag) => tag.startsWith("#") ? tag : `#${tag}`).join(" ")
    : "";
  return [base, tagLine].filter(Boolean).join("\n\n").slice(0, 2200);
}
