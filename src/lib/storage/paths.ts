import { getSpacesRuntimeConfig } from "@/lib/site-settings";

function vaultPrefix(): string {
  const raw = getSpacesRuntimeConfig().prefix || "vault";
  return raw.trim().replace(/^\/+|\/+$/g, "") || "vault";
}

export function vaultTrackMp3Key(trackId: string): string {
  const id = trackId.trim();
  if (!id) throw new Error("trackId is required");
  return `${vaultPrefix()}/${id}/track.mp3`;
}

export function vaultStagingFolderKey(stagingId: string): string {
  const id = stagingId.trim();
  if (!id) throw new Error("stagingId is required");
  return `${vaultPrefix()}/_tmp/${id}`;
}

export function vaultStagingMp3Key(stagingId: string): string {
  return `${vaultStagingFolderKey(stagingId)}/track.mp3`;
}

export function vaultVersionMp3Key(trackId: string, slug: string): string {
  const id = trackId.trim();
  const key = slug.trim();
  if (!id || !key) throw new Error("trackId and slug are required");
  return `${vaultPrefix()}/${id}/versions/${key}.mp3`;
}

export function vaultStemMp3Key(trackId: string, slug: string): string {
  const id = trackId.trim();
  const key = slug.trim();
  if (!id || !key) throw new Error("trackId and slug are required");
  return `${vaultPrefix()}/${id}/stems/${key}.mp3`;
}

export function isVaultStagingKey(key: string | null | undefined): boolean {
  const normalized = String(key || "").replace(/\\/g, "/");
  const prefix = vaultPrefix().toLowerCase();
  const lower = normalized.toLowerCase();
  return lower.startsWith(`${prefix}/_tmp/`) || lower.includes("/_tmp/");
}

/** True when path is a Spaces object key (not a legacy Dropbox absolute path). */
export function isSpacesObjectKey(path: string | null | undefined): boolean {
  const p = String(path || "").trim();
  if (!p) return false;
  if (p.startsWith("/")) return false;
  const prefix = vaultPrefix();
  return p.startsWith(`${prefix}/`) || p.startsWith("vault/");
}
