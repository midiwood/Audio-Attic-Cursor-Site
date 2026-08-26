/**
 * Orchestrate download → -16 LUFS MP3 → Dropbox vault upload → share links.
 * Vault stores only the normalized MP3 (no source WAV archive).
 */

import { normalizeToMinus16LufsMp3 } from "@/lib/audio-normalize";
import {
  downloadFile,
  searchDropboxByFilename,
  sharedLinkForParentFolder,
  uploadIntoVault,
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

export async function ingestTrackToVault(input: VaultIngestInput): Promise<VaultIngestResult> {
  const trackId = input.trackId.trim();
  if (!trackId) throw new Error("trackId is required for vault ingest");

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

  // Best-effort: resolve path from filename if we only had a share link.
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

  const mp3Bytes = await normalizeToMinus16LufsMp3(sourceBytes, hint);
  const uploaded = await uploadIntoVault({
    trackId,
    mp3Bytes,
  });

  const sourceFolderLink = sourceDropboxPath
    ? await sharedLinkForParentFolder(sourceDropboxPath)
    : null;

  return {
    dropboxPath: uploaded.dropboxPath,
    dropboxLink: uploaded.dropboxLink,
    dropboxDl: uploaded.dropboxDl,
    sourceDropboxPath,
    sourceFolderLink,
  };
}
