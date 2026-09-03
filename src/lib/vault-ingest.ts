/**
 * Orchestrate normalize → DigitalOcean Spaces vault upload.
 * Prepare/AI stage uploads under vault/_tmp/{stagingId}/.
 * Confirmed import promotes into vault/{trackId}/.
 */

import { randomBytes } from "crypto";
import { normalizeToMinus16LufsMp3 } from "@/lib/audio-normalize";
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
};

export type VaultIngestResult = {
  dropboxPath: string;
  dropboxLink: string | null;
  dropboxDl: string | null;
  sourceDropboxPath: string | null;
  sourceFolderLink: string | null;
};

export type VaultStageInput = {
  stagingId?: string | null;
  sourceBytes?: Buffer | null;
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
  sourceHint?: string | null;
}): Promise<{ sourceBytes: Buffer; hint: string }> {
  const sourceBytes = input.sourceBytes?.length ? input.sourceBytes : null;
  const hint = input.sourceHint?.trim() || "audio.mp3";

  if (!sourceBytes?.length) {
    throw new Error("No audio file provided for vault ingest");
  }

  return { sourceBytes, hint };
}

export async function stageTrackToVault(input: VaultStageInput): Promise<VaultStageResult> {
  const stagingId = input.stagingId?.trim() || newStagingId();
  const resolved = await resolveSourceBytes(input);
  const mp3Bytes = await normalizeToMinus16LufsMp3(resolved.sourceBytes, resolved.hint);
  const uploaded = await uploadIntoVaultStaging({ stagingId, mp3Bytes });

  return {
    stagingId,
    dropboxPath: uploaded.dropboxPath,
    dropboxLink: uploaded.dropboxLink,
    dropboxDl: uploaded.dropboxDl,
    sourceDropboxPath: null,
    sourceFolderLink: null,
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
  sourceBytes?: Buffer | null;
  sourceHint?: string | null;
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
    });
    const result = {
      dropboxPath: promoted.dropboxPath,
      dropboxLink: promoted.dropboxLink,
      dropboxDl: promoted.dropboxDl,
      sourceDropboxPath: input.sourceDropboxPath?.trim() || null,
      sourceFolderLink: input.sourceFolderLink?.trim() || null,
    };
    return result;
  }

  if (input.dropboxPath?.trim() && !isVaultStagingKey(input.dropboxPath)) {
    return {
      dropboxPath: input.dropboxPath.trim(),
      dropboxLink: input.dropboxLink?.trim() || null,
      dropboxDl: input.dropboxDl?.trim() || null,
      sourceDropboxPath: input.sourceDropboxPath?.trim() || null,
      sourceFolderLink: input.sourceFolderLink?.trim() || null,
    };
  }

  return ingestTrackToVault({
    trackId,
    sourceBytes: input.sourceBytes,
    sourceHint: input.sourceHint,
  });
}

export async function ingestTrackToVault(input: VaultIngestInput): Promise<VaultIngestResult> {
  const trackId = input.trackId.trim();
  if (!trackId) throw new Error("trackId is required for vault ingest");

  const resolved = await resolveSourceBytes(input);
  const mp3Bytes = await normalizeToMinus16LufsMp3(resolved.sourceBytes, resolved.hint);
  const uploaded = await uploadIntoVault({ trackId, mp3Bytes });

  return {
    dropboxPath: uploaded.dropboxPath,
    dropboxLink: uploaded.dropboxLink,
    dropboxDl: uploaded.dropboxDl,
    sourceDropboxPath: null,
    sourceFolderLink: null,
  };
}
