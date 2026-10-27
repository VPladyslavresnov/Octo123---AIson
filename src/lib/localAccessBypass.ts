// Disabled: the fresh Supabase backend has working email/password auth again,
// and the MCP connector requires a real AIson account.
export const LOCAL_ACCESS_BYPASS = false;

export function shouldBypassAuth() {
  if (!LOCAL_ACCESS_BYPASS || typeof window === "undefined") return false;
  return window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost";
}

export function getBypassRedirectTarget() {
  return shouldBypassAuth() ? "/home" : "/auth";
}
