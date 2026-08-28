/**
 * Orchestrate download → -16 LUFS MP3 → Dropbox vault upload → share links.
 * Vault stores only the normalized MP3 (no source WAV archive).
 *
 * Prepare/AI stage uploads under Vault/_tmp/{stagingId}/.
 * Confirmed import promotes into Vault/{trackId}/ and allocates the catalog id.
 */

import { randomBytes } from "crypto";
import { normalizeToMinus16LufsMp3 } from "@/lib/audio-normalize";
import {
  downloadFile,
  isVaultStagingPath,
  promoteVaultStaging,
  searchDropboxByFilename,
  sharedLinkForParentFolder,
  uploadIntoVault,
  uploadIntoVaultStaging,
} from "@/lib/dropbox-files";
import { filenameFromDropboxUrl } from "@/lib/tracks";

export type VaultIngestInput = {
  trackId: string;
  /** Preferred: raw bytes already in hand (local upload). */
  sourceBytes?: Buffer | null;
  /** Dropbox path of the original file (from resolve-link). */
  sourceDropboxPath?: string | null;
  /** Shared / dl URL of the original (fallback download). */
  sourceUrl?: string | null;
  /** Filename or mime hint for extension / ffmpeg. */
  sourceHint?: string | null;
};

export type VaultIngestResult = {
  dropboxPath: string;
  dropboxLink: string;
  dropboxDl: string;
  sourceDropboxPath: string | null;
  sourceFolderLink: string | null;
};

export type VaultStageInput = {
  /** Optional reuse of an existing staging id (re-prepare). */
  stagingId?: string | null;
  sourceBytes?: Buffer | null;
  sourceDropboxPath?: string | null;
  sourceUrl?: string | null;
  sourceHint?: string | null;
};

export type VaultStageResult = VaultIngestResult & {
  stagingId: string;
};

function newStagingId(): string {
  return `stg_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}

async function resolveSourceBytes(input: {
  sourceBytes?: Buffer | null;
  sourceDropboxPath?: string | null;
  sourceUrl?: string | null;
  sourceHint?: string | null;
}): Promise<{
  sourceBytes: Buffer;
  sourceDropboxPath: string | null;
  hint: string;
}> {
  let sourceBytes = input.sourceBytes?.length ? input.sourceBytes : null;
  let sourceDropboxPath = input.sourceDropboxPath?.trim() || null;
  const sourceUrl = input.sourceUrl?.trim() || null;
  const hint =
    input.sourceHint?.trim() ||
    sourceDropboxPath ||
    (sourceUrl ? filenameFromDropboxUrl(sourceUrl) : "") ||
    "audio.mp3";

  if (!sourceBytes) {
    sourceBytes = await downloadFile({
      path: sourceDropboxPath,
      sharedOrDlUrl: sourceUrl,
    });
  }

  if (!sourceBytes.length) {
    throw new Error("Could not download source audio for vault ingest");
  }

  if (!sourceDropboxPath && sourceUrl) {
    const name = filenameFromDropboxUrl(sourceUrl);
    if (name) {
      try {
        const matches = await searchDropboxByFilename(name);
        if (matches.length === 1) {
          sourceDropboxPath = matches[0].path;
        } else if (matches.length > 1) {
          const bySize = matches.find((m) => m.size === sourceBytes!.length);
          sourceDropboxPath = (bySize || matches[0]).path;
        }
      } catch {
        // leave null
      }
    }
  }

  return { sourceBytes, sourceDropboxPath, hint };
}

/** Normalize and upload under Vault/_tmp — does not allocate a catalog track id. */
export async function stageTrackToVault(input: VaultStageInput): Promise<VaultStageResult> {
  const stagingId = input.stagingId?.trim() || newStagingId();
  const resolved = await resolveSourceBytes(input);
  const mp3Bytes = await normalizeToMinus16LufsMp3(resolved.sourceBytes, resolved.hint);
  const uploaded = await uploadIntoVaultStaging({
    stagingId,
    mp3Bytes,
  });

  const sourceFolderLink = resolved.sourceDropboxPath
    ? await sharedLinkForParentFolder(resolved.sourceDropboxPath)
    : null;

  return {
    stagingId,
    dropboxPath: uploaded.dropboxPath,
    dropboxLink: uploaded.dropboxLink,
    dropboxDl: uploaded.dropboxDl,
    sourceDropboxPath: resolved.sourceDropboxPath,
    sourceFolderLink,
  };
}

/**
 * After import confirm: move staged MP3 into Vault/{trackId}, or ingest fresh
 * when no staging path was provided.
 */
export async function finalizeVaultForTrack(input: {
  trackId: string;
  stagingId?: string | null;
  stagingPath?: string | null;
  /** Already-final vault paths (legacy prepare that wrote under track id). */
  dropboxLink?: string | null;
  dropboxDl?: string | null;
  dropboxPath?: string | null;
  sourceDropboxPath?: string | null;
  sourceFolderLink?: string | null;
  sourceBytes?: Buffer | null;
  sourceUrl?: string | null;
  sourceHint?: string | null;
}): Promise<VaultIngestResult> {
  const trackId = input.trackId.trim();
  if (!trackId) throw new Error("trackId is required");

  const stagingId = input.stagingId?.trim() || "";
  const stagingPath = input.stagingPath?.trim() || input.dropboxPath?.trim() || "";

  if (stagingId || isVaultStagingPath(stagingPath)) {
    const promoted = await promoteVaultStaging({
      stagingId: stagingId || null,
      stagingPath: stagingPath || null,
      trackId,
    });
    return {
      dropboxPath: promoted.dropboxPath,
      dropboxLink: promoted.dropboxLink,
      dropboxDl: promoted.dropboxDl,
      sourceDropboxPath: input.sourceDropboxPath?.trim() || null,
      sourceFolderLink: input.sourceFolderLink?.trim() || null,
    };
  }

  // Legacy: prepare already wrote under the final track folder.
  if (
    input.dropboxPath?.trim() &&
    input.dropboxLink?.trim() &&
    input.dropboxDl?.trim() &&
    !isVaultStagingPath(input.dropboxPath)
  ) {
    return {
      dropboxPath: input.dropboxPath.trim(),
      dropboxLink: input.dropboxLink.trim(),
      dropboxDl: input.dropboxDl.trim(),
      sourceDropboxPath: input.sourceDropboxPath?.trim() || null,
      sourceFolderLink: input.sourceFolderLink?.trim() || null,
    };
  }

  return ingestTrackToVault({
    trackId,
    sourceBytes: input.sourceBytes,
    sourceDropboxPath: input.sourceDropboxPath,
    sourceUrl: input.sourceUrl,
    sourceHint: input.sourceHint,
  });
}

export async function ingestTrackToVault(input: VaultIngestInput): Promise<VaultIngestResult> {
  const trackId = input.trackId.trim();
  if (!trackId) throw new Error("trackId is required for vault ingest");

  const resolved = await resolveSourceBytes(input);
  const mp3Bytes = await normalizeToMinus16LufsMp3(resolved.sourceBytes, resolved.hint);
  const uploaded = await uploadIntoVault({
    trackId,
    mp3Bytes,
  });

  const sourceFolderLink = resolved.sourceDropboxPath
    ? await sharedLinkForParentFolder(resolved.sourceDropboxPath)
    : null;

  return {
    dropboxPath: uploaded.dropboxPath,
    dropboxLink: uploaded.dropboxLink,
    dropboxDl: uploaded.dropboxDl,
    sourceDropboxPath: resolved.sourceDropboxPath,
    sourceFolderLink,
  };
}
