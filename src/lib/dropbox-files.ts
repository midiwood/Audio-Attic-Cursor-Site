/**
 * Dropbox file download / upload / share helpers for the catalog vault.
 * Final layout:  {uploadFolder}/{trackId}/track.mp3
 * Staging layout:{uploadFolder}/_tmp/{stagingId}/track.mp3  (before import confirm)
 */

import {
  formatDropboxApiError,
  withDropboxToken,
} from "@/lib/dropbox-auth";
import { getDropboxRuntimeConfig } from "@/lib/site-settings";
import { toDropboxDlUrl } from "@/lib/tracks";

const MAX_DOWNLOAD_BYTES = 500 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 150 * 1024 * 1024; // Dropbox simple upload limit

export type DropboxSearchMatch = {
  path: string;
  name: string;
  size?: number;
};

function vaultRoot(): string {
  const raw = getDropboxRuntimeConfig().uploadFolder || "/_Business/Audio Attic/Vault";
  const trimmed = raw.trim().replace(/\/+$/, "");
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function vaultTrackMp3Path(trackId: string): string {
  const id = trackId.trim();
  if (!id) throw new Error("trackId is required");
  return `${vaultRoot()}/${id}/track.mp3`;
}

export function vaultStagingFolderPath(stagingId: string): string {
  const id = stagingId.trim();
  if (!id) throw new Error("stagingId is required");
  return `${vaultRoot()}/_tmp/${id}`;
}

export function vaultStagingMp3Path(stagingId: string): string {
  return `${vaultStagingFolderPath(stagingId)}/track.mp3`;
}

export function isVaultStagingPath(path: string | null | undefined): boolean {
  const p = String(path || "").replace(/\\/g, "/");
  const root = vaultRoot().toLowerCase();
  const lower = p.toLowerCase();
  return lower.startsWith(`${root}/_tmp/`) || lower.includes("/_tmp/");
}

function parentPath(filePath: string): string {
  const parts = filePath.replace(/\/+$/, "").split("/").filter(Boolean);
  parts.pop();
  return parts.length ? `/${parts.join("/")}` : "";
}

async function dropboxJson<T>(
  token: string,
  url: string,
  body: unknown,
): Promise<{ ok: true; data: T } | { ok: false; status: number; data: unknown }> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, data };
  return { ok: true, data: data as T };
}

export async function ensureFolder(folderPath: string): Promise<void> {
  const normalized = folderPath.replace(/\/+$/, "");
  if (!normalized || normalized === "/") return;

  await withDropboxToken(async (token) => {
    const segments = normalized.split("/").filter(Boolean);
    let current = "";
    for (const segment of segments) {
      current += `/${segment}`;
      const result = await dropboxJson<{ metadata?: unknown }>(
        token,
        "https://api.dropboxapi.com/2/files/create_folder_v2",
        { path: current, autorename: false },
      );
      if (result.ok) continue;
      const summary = String(
        (result.data as { error_summary?: string })?.error_summary || "",
      ).toLowerCase();
      // Folder (or something) already exists at this path — continue.
      if (summary.includes("conflict") || summary.includes("folder")) continue;
      if (/expired_access_token|invalid_access_token/i.test(summary)) {
        throw new Error(summary);
      }
      throw new Error(
        formatDropboxApiError(result.data, result.status, `Could not create folder ${current}`),
      );
    }
  });
}

export async function uploadFile(path: string, bytes: Buffer): Promise<void> {
  if (bytes.length > MAX_UPLOAD_BYTES) {
    throw new Error(
      `Vault upload exceeds Dropbox simple-upload limit (${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))}MB)`,
    );
  }

  const folder = parentPath(path);
  if (folder) await ensureFolder(folder);

  await withDropboxToken(async (token) => {
    const res = await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": JSON.stringify({
          path,
          mode: "overwrite",
          autorename: false,
          mute: true,
        }),
      },
      body: new Uint8Array(bytes),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(formatDropboxApiError(data, res.status, "Dropbox upload failed"));
    }
  });
}

export async function createOrGetSharedLink(path: string): Promise<string> {
  return withDropboxToken(async (token) => {
    const createRes = await fetch(
      "https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          path,
          settings: {
            requested_visibility: "public",
            audience: "public",
            access: "viewer",
          },
        }),
      },
    );

    if (createRes.ok) {
      const data = await createRes.json();
      return String(data.url || "");
    }

    const err = await createRes.json().catch(() => ({}));
    const alreadyExists =
      String(err?.error_summary || "").includes("shared_link_already_exists") ||
      err?.error?.[".tag"] === "shared_link_already_exists";

    if (alreadyExists) {
      const listRes = await fetch("https://api.dropboxapi.com/2/sharing/list_shared_links", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path, direct_only: true }),
      });
      const listData = await listRes.json().catch(() => ({}));
      const url = listData?.links?.[0]?.url;
      if (url) return String(url);
    }

    throw new Error(formatDropboxApiError(err, createRes.status, "Dropbox share failed"));
  });
}

export async function sharedLinkForParentFolder(filePath: string): Promise<string | null> {
  const folder = parentPath(filePath);
  if (!folder) return null;
  try {
    return await createOrGetSharedLink(folder);
  } catch {
    return null;
  }
}

export async function downloadFile(opts: {
  path?: string | null;
  sharedOrDlUrl?: string | null;
}): Promise<Buffer> {
  const path = opts.path?.trim() || "";
  if (path) {
    return withDropboxToken(async (token) => {
      const res = await fetch("https://content.dropboxapi.com/2/files/download", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Dropbox-API-Arg": JSON.stringify({ path }),
        },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(formatDropboxApiError(data, res.status, "Dropbox download failed"));
      }
      const ab = await res.arrayBuffer();
      if (ab.byteLength > MAX_DOWNLOAD_BYTES) {
        throw new Error("Source audio is too large to vault");
      }
      return Buffer.from(ab);
    });
  }

  const url = opts.sharedOrDlUrl?.trim();
  if (!url) throw new Error("No Dropbox path or URL to download");

  const dl = toDropboxDlUrl(url) || url;
  const res = await fetch(dl, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Could not download source audio (${res.status})`);
  }
  const ab = await res.arrayBuffer();
  if (ab.byteLength > MAX_DOWNLOAD_BYTES) {
    throw new Error("Source audio is too large to vault");
  }
  return Buffer.from(ab);
}

export async function searchDropboxByFilename(filename: string): Promise<DropboxSearchMatch[]> {
  const query = filename.trim();
  if (!query) return [];

  return withDropboxToken(async (token) => {
    const res = await fetch("https://api.dropboxapi.com/2/files/search_v2", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        options: { filename_only: true, max_results: 25 },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(formatDropboxApiError(data, res.status, "Dropbox search failed"));
    }

    const matches: DropboxSearchMatch[] = [];
    for (const item of data?.matches || []) {
      const metadata = item?.metadata?.metadata || item?.metadata;
      if (!metadata || metadata[".tag"] === "deleted") continue;
      const name = String(metadata.name || "");
      if (name.toLowerCase() !== query.toLowerCase()) continue;
      matches.push({
        path: String(metadata.path_display || metadata.path_lower || ""),
        name,
        size: typeof metadata.size === "number" ? metadata.size : undefined,
      });
    }
    return matches.filter((m) => m.path);
  });
}

/** Upload normalized MP3 only — no source WAV/MP3 archive in the vault. */
export async function uploadIntoVault(opts: {
  trackId: string;
  mp3Bytes: Buffer;
}): Promise<{ dropboxPath: string; dropboxLink: string; dropboxDl: string }> {
  const dropboxPath = vaultTrackMp3Path(opts.trackId);
  await uploadFile(dropboxPath, opts.mp3Bytes);
  const dropboxLink = await createOrGetSharedLink(dropboxPath);
  if (!dropboxLink) throw new Error("Vault upload succeeded but no shared link was created");
  return {
    dropboxPath,
    dropboxLink,
    dropboxDl: toDropboxDlUrl(dropboxLink),
  };
}

/** Stage normalized MP3 under Vault/_tmp until import is confirmed. */
export async function uploadIntoVaultStaging(opts: {
  stagingId: string;
  mp3Bytes: Buffer;
}): Promise<{ dropboxPath: string; dropboxLink: string; dropboxDl: string; stagingId: string }> {
  const stagingId = opts.stagingId.trim();
  if (!stagingId) throw new Error("stagingId is required");
  const dropboxPath = vaultStagingMp3Path(stagingId);
  await uploadFile(dropboxPath, opts.mp3Bytes);
  const dropboxLink = await createOrGetSharedLink(dropboxPath);
  if (!dropboxLink) throw new Error("Staging upload succeeded but no shared link was created");
  return {
    stagingId,
    dropboxPath,
    dropboxLink,
    dropboxDl: toDropboxDlUrl(dropboxLink),
  };
}

async function deletePath(path: string): Promise<void> {
  const normalized = path.replace(/\/+$/, "");
  if (!normalized) return;
  await withDropboxToken(async (token) => {
    const result = await dropboxJson(
      token,
      "https://api.dropboxapi.com/2/files/delete_v2",
      { path: normalized },
    );
    if (result.ok) return;
    const summary = String(
      (result.data as { error_summary?: string })?.error_summary || "",
    ).toLowerCase();
    if (summary.includes("not_found") || summary.includes("path/not_found")) return;
    throw new Error(
      formatDropboxApiError(result.data, result.status, `Could not delete ${normalized}`),
    );
  });
}

/**
 * Move staged MP3 into the permanent vault folder for a confirmed catalog id.
 * Creates a fresh share link (old staging links are abandoned with the tmp path).
 */
export async function promoteVaultStaging(opts: {
  stagingId?: string | null;
  stagingPath?: string | null;
  trackId: string;
}): Promise<{ dropboxPath: string; dropboxLink: string; dropboxDl: string }> {
  const trackId = opts.trackId.trim();
  if (!trackId) throw new Error("trackId is required");

  const stagingId = opts.stagingId?.trim() || "";
  const fromFolder = stagingId
    ? vaultStagingFolderPath(stagingId)
    : parentPath(String(opts.stagingPath || "").trim());
  const fromFile = stagingId
    ? vaultStagingMp3Path(stagingId)
    : String(opts.stagingPath || "").trim();

  if (!fromFile || !isVaultStagingPath(fromFile)) {
    throw new Error("Staging path is missing or not under Vault/_tmp");
  }

  const toPath = vaultTrackMp3Path(trackId);
  const toFolder = parentPath(toPath);

  await withDropboxToken(async (token) => {
    // Move whole staging folder → {trackId}/ so we never create an empty dest first.
    if (fromFolder && toFolder && fromFolder === parentPath(fromFile)) {
      const folderMove = await dropboxJson(
        token,
        "https://api.dropboxapi.com/2/files/move_v2",
        {
          from_path: fromFolder,
          to_path: toFolder,
          autorename: false,
          allow_ownership_transfer: false,
        },
      );
      if (folderMove.ok) return;

      const summary = String(
        (folderMove.data as { error_summary?: string })?.error_summary || "",
      ).toLowerCase();
      if (!summary.includes("conflict") && !summary.includes("not_found")) {
        throw new Error(
          formatDropboxApiError(
            folderMove.data,
            folderMove.status,
            `Could not promote staging folder to ${toFolder}`,
          ),
        );
      }
    }

    if (toFolder) await ensureFolder(toFolder);

    const fileMove = await dropboxJson(
      token,
      "https://api.dropboxapi.com/2/files/move_v2",
      {
        from_path: fromFile,
        to_path: toPath,
        autorename: false,
        allow_ownership_transfer: false,
      },
    );
    if (!fileMove.ok) {
      throw new Error(
        formatDropboxApiError(
          fileMove.data,
          fileMove.status,
          `Could not promote staging file to ${toPath}`,
        ),
      );
    }
  });

  // Best-effort cleanup if file-move left an empty staging folder behind.
  if (fromFolder && fromFolder !== toFolder) {
    try {
      await deletePath(fromFolder);
    } catch {
      // ignore
    }
  }

  const dropboxLink = await createOrGetSharedLink(toPath);
  if (!dropboxLink) throw new Error("Vault promote succeeded but no shared link was created");
  return {
    dropboxPath: toPath,
    dropboxLink,
    dropboxDl: toDropboxDlUrl(dropboxLink),
  };
}
