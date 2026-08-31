import { normalizeToMinus16LufsMp3, transcodeToPlaybackMp3 } from "@/lib/audio-normalize";
import {
  deleteVaultFile,
  uploadVaultAudioFile,
  vaultStemMp3Path,
  vaultVersionMp3Path,
} from "@/lib/dropbox-files";
import type { TrackAssetKind } from "@/lib/track-assets";

export type IngestTrackAssetInput = {
  trackId: string;
  kind: TrackAssetKind;
  slug: string;
  sourceBytes: Buffer;
  sourceHint: string;
};

export type IngestTrackAssetResult = {
  dropboxPath: string;
  dropboxLink: string;
  dropboxDl: string;
};

export async function ingestTrackAsset(input: IngestTrackAssetInput): Promise<IngestTrackAssetResult> {
  const trackId = input.trackId.trim();
  const slug = input.slug.trim();
  if (!trackId || !slug) throw new Error("trackId and slug are required");
  if (!input.sourceBytes.length) throw new Error("No audio file provided");

  const hint = input.sourceHint.trim() || "audio.mp3";
  let mp3Bytes: Buffer;
  if (input.kind === "version") {
    mp3Bytes = await normalizeToMinus16LufsMp3(input.sourceBytes, hint);
  } else {
    mp3Bytes = await transcodeToPlaybackMp3(input.sourceBytes, hint);
  }

  const dropboxPath =
    input.kind === "version"
      ? vaultVersionMp3Path(trackId, slug)
      : vaultStemMp3Path(trackId, slug);

  return uploadVaultAudioFile(dropboxPath, mp3Bytes);
}

export async function removeTrackAssetFile(dropboxPath: string | null | undefined): Promise<void> {
  const path = dropboxPath?.trim();
  if (!path) return;
  try {
    await deleteVaultFile(path);
  } catch {
    // Best-effort cleanup when DB row is removed.
  }
}
