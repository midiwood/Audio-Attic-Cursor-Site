/**
 * Dropbox long-term auth via refresh token.
 *
 * Values resolve from Admin settings first, then env:
 *   DROPBOX_APP_KEY / DROPBOX_APP_SECRET / DROPBOX_REFRESH_TOKEN
 * Optional short-lived fallback:
 *   DROPBOX_ACCESS_TOKEN
 */

import { getDropboxRuntimeConfig } from "@/lib/site-settings";

type CachedToken = {
  accessToken: string;
  /** epoch ms when we should refresh (before Dropbox expiry) */
  expiresAt: number;
};

let cache: CachedToken | null = null;

function hasRefreshConfig() {
  const cfg = getDropboxRuntimeConfig();
  return Boolean(cfg.appKey && cfg.appSecret && cfg.refreshToken);
}

export function dropboxAuthConfigured() {
  const cfg = getDropboxRuntimeConfig();
  return hasRefreshConfig() || Boolean(cfg.accessToken);
}

export function dropboxAuthSetupMessage() {
  if (hasRefreshConfig()) return "";
  const cfg = getDropboxRuntimeConfig();
  if (cfg.accessToken) {
    return "Using short-lived Dropbox access token. For long-term access, set App key, App secret, and Refresh token in Admin → Dropbox.";
  }
  return "Dropbox is not configured. Add credentials in Admin → Dropbox (or set DROPBOX_* in .env.local).";
}

export function clearDropboxAccessTokenCache() {
  cache = null;
}

async function refreshAccessToken(): Promise<CachedToken> {
  const cfg = getDropboxRuntimeConfig();
  const clientId = cfg.appKey;
  const clientSecret = cfg.appSecret;
  const refreshToken = cfg.refreshToken;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail =
      String(data?.error_description || data?.error || "").trim() ||
      `HTTP ${res.status}`;
    clearDropboxAccessTokenCache();
    throw new Error(
      `Dropbox refresh failed (${detail}). Re-authorize with token_access_type=offline and update the refresh token in Admin → Dropbox.`,
    );
  }

  const accessToken = String(data.access_token || "").trim();
  if (!accessToken) {
    throw new Error("Dropbox refresh returned no access_token");
  }

  const expiresInSec = Number(data.expires_in) || 14400;
  // Refresh a minute early so in-flight calls don't race expiry
  const expiresAt = Date.now() + Math.max(60, expiresInSec - 60) * 1000;
  cache = { accessToken, expiresAt };
  return cache;
}

/** Returns a usable Bearer access token (refreshes when needed). */
export async function getDropboxAccessToken(): Promise<string> {
  if (hasRefreshConfig()) {
    if (cache && cache.expiresAt > Date.now()) {
      return cache.accessToken;
    }
    const fresh = await refreshAccessToken();
    return fresh.accessToken;
  }

  const legacy = getDropboxRuntimeConfig().accessToken;
  if (legacy) return legacy;

  throw new Error(dropboxAuthSetupMessage());
}

/**
 * Run a Dropbox API call with a fresh token.
 * On expired_access_token, clears cache, refreshes once, and retries.
 */
export async function withDropboxToken<T>(
  run: (accessToken: string) => Promise<T>,
): Promise<T> {
  const token = await getDropboxAccessToken();
  try {
    return await run(token);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "");
    const expired =
      /expired_access_token|invalid_access_token|401/i.test(message) && hasRefreshConfig();
    if (!expired) throw error;

    clearDropboxAccessTokenCache();
    const retried = await getDropboxAccessToken();
    return run(retried);
  }
}

export function formatDropboxApiError(data: unknown, status: number, fallback: string) {
  const summary = String(
    (data as { error_summary?: string })?.error_summary ||
      (data as { error?: { ".tag"?: string } })?.error?.[".tag"] ||
      "",
  );
  if (summary.includes("expired_access_token") || summary.includes("invalid_access_token")) {
    if (hasRefreshConfig()) {
      return "Dropbox access token expired and refresh failed. Check refresh token / app key & secret in Admin → Dropbox.";
    }
    return "Dropbox access token expired. Prefer refresh-token setup in Admin → Dropbox, or paste a new short-lived access token.";
  }
  if (summary.includes("missing_scope")) {
    return "Dropbox token is missing scopes. In App Console enable: files.metadata.read, sharing.read, sharing.write — then re-authorize (offline) and update the refresh token.";
  }
  return summary || `${fallback} (${status})`;
}
