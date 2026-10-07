/**
 * Orchestrate normalize → DigitalOcean Spaces vault upload.
 * Prepare/AI stage uploads under vault/_tmp/{stagingId}/.
 * Confirmed import promotes into vault/{trackId}/.
 *
 * Default: client (browser) already normalized MP3 + optional master.
 * Server ffmpeg path is muted unless AUDIO_NORMALIZE_MODE=server.
 */

import { randomBytes } from "crypto";
import { normalizeToMinus16LufsMp3, resolveAudioNormalizeMode } from "@/lib/audio-normalize";
import {
  isVaultStagingKey,
  promoteVaultStaging,
  uploadIntoVault,
  uploadIntoVaultStaging,
} from "@/lib/vault-storage";

export type VaultIngestInput = {
  trackId: string;
  sourceBytes?: Buffer | null;
  sourceHint?: string | null;
  /** Already −16 LUFS MP3 from browser wasm (preferred). */
  preNormalizedMp3?: Buffer | null;
  masterBytes?: Buffer | null;
  masterHint?: string | null;
};

export type VaultIngestResult = {
  dropboxPath: string;
  dropboxLink: string | null;
  dropboxDl: string | null;
  sourceDropboxPath: string | null;
  sourceFolderLink: string | null;
  masterObjectKey?: string | null;
};

export type VaultStageInput = {
  stagingId?: string | null;
  sourceBytes?: Buffer | null;
  sourceHint?: string | null;
  preNormalizedMp3?: Buffer | null;
  masterBytes?: Buffer | null;
  masterHint?: string | null;
};

export type VaultStageResult = VaultIngestResult & {
  stagingId: string;
};

function newStagingId(): string {
  return `stg_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}

async function resolveSourceBytes(input: {
  sourceBytes?: Buffer | null;
  sourceHint?: string | null;
}): Promise<{ sourceBytes: Buffer; hint: string }> {
  const sourceBytes = input.sourceBytes?.length ? input.sourceBytes : null;
  const hint = input.sourceHint?.trim() || "audio.mp3";

  if (!sourceBytes?.length) {
    throw new Error("No audio file provided for vault ingest");
  }

  return { sourceBytes, hint };
}

async function resolveMp3Bytes(input: {
  sourceBytes?: Buffer | null;
  sourceHint?: string | null;
  preNormalizedMp3?: Buffer | null;
}): Promise<{ mp3Bytes: Buffer; hint: string }> {
  if (input.preNormalizedMp3?.length) {
    return {
      mp3Bytes: input.preNormalizedMp3,
      hint: input.sourceHint?.trim() || "audio.mp3",
    };
  }

  if (resolveAudioNormalizeMode() !== "server") {
    throw new Error(
      "Server ffmpeg is muted. Normalize in the browser (Upload), or set AUDIO_NORMALIZE_MODE=server to restore.",
    );
  }

  const resolved = await resolveSourceBytes(input);
  const mp3Bytes = await normalizeToMinus16LufsMp3(resolved.sourceBytes, resolved.hint);
  return { mp3Bytes, hint: resolved.hint };
}

export async function stageTrackToVault(input: VaultStageInput): Promise<VaultStageResult> {
  const stagingId = input.stagingId?.trim() || newStagingId();
  const { mp3Bytes, hint } = await resolveMp3Bytes(input);
  const uploaded = await uploadIntoVaultStaging({
    stagingId,
    mp3Bytes,
    masterBytes: input.masterBytes,
    masterHint: input.masterHint || input.sourceHint || hint,
  });

  return {
    stagingId,
    dropboxPath: uploaded.dropboxPath,
    dropboxLink: uploaded.dropboxLink,
    dropboxDl: uploaded.dropboxDl,
    sourceDropboxPath: null,
    sourceFolderLink: null,
    masterObjectKey: uploaded.masterObjectKey ?? null,
  };
}

export async function finalizeVaultForTrack(input: {
  trackId: string;
  stagingId?: string | null;
  stagingPath?: string | null;
  dropboxLink?: string | null;
  dropboxDl?: string | null;
  dropboxPath?: string | null;
  sourceDropboxPath?: string | null;
  sourceFolderLink?: string | null;
  masterObjectKey?: string | null;
  sourceBytes?: Buffer | null;
  sourceHint?: string | null;
  preNormalizedMp3?: Buffer | null;
  masterBytes?: Buffer | null;
  masterHint?: string | null;
}): Promise<VaultIngestResult> {
  const trackId = input.trackId.trim();
  if (!trackId) throw new Error("trackId is required");

  const stagingId = input.stagingId?.trim() || "";
  const stagingPath = input.stagingPath?.trim() || input.dropboxPath?.trim() || "";

  if (stagingId || isVaultStagingKey(stagingPath)) {
    const promoted = await promoteVaultStaging({
      stagingId: stagingId || null,
      stagingPath: stagingPath || null,
      trackId,
      masterObjectKey: input.masterObjectKey?.trim() || null,
    });
    return {
      dropboxPath: promoted.dropboxPath,
      dropboxLink: promoted.dropboxLink,
      dropboxDl: promoted.dropboxDl,
      sourceDropboxPath: input.sourceDropboxPath?.trim() || null,
      sourceFolderLink: input.sourceFolderLink?.trim() || null,
      masterObjectKey: promoted.masterObjectKey ?? input.masterObjectKey?.trim() ?? null,
    };
  }

  if (input.dropboxPath?.trim() && !isVaultStagingKey(input.dropboxPath)) {
    return {
      dropboxPath: input.dropboxPath.trim(),
      dropboxLink: input.dropboxLink?.trim() || null,
      dropboxDl: input.dropboxDl?.trim() || null,
      sourceDropboxPath: input.sourceDropboxPath?.trim() || null,
      sourceFolderLink: input.sourceFolderLink?.trim() || null,
      masterObjectKey: input.masterObjectKey?.trim() || null,
    };
  }

  return ingestTrackToVault({
    trackId,
    sourceBytes: input.sourceBytes,
    sourceHint: input.sourceHint,
    preNormalizedMp3: input.preNormalizedMp3,
    masterBytes: input.masterBytes,
    masterHint: input.masterHint,
  });
}

export async function ingestTrackToVault(input: VaultIngestInput): Promise<VaultIngestResult> {
  const trackId = input.trackId.trim();
  if (!trackId) throw new Error("trackId is required for vault ingest");

  const { mp3Bytes, hint } = await resolveMp3Bytes(input);
  const uploaded = await uploadIntoVault({
    trackId,
    mp3Bytes,
    masterBytes: input.masterBytes,
    masterHint: input.masterHint || input.sourceHint || hint,
  });

  return {
    dropboxPath: uploaded.dropboxPath,
    dropboxLink: uploaded.dropboxLink,
    dropboxDl: uploaded.dropboxDl,
    sourceDropboxPath: null,
    sourceFolderLink: null,
    masterObjectKey: uploaded.masterObjectKey ?? null,
  };
}
