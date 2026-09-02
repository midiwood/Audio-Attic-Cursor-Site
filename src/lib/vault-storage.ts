/**
 * Vault upload / promote / delete on DigitalOcean Spaces.
 * DB column dropboxPath stores the S3 object key.
 */

import {
  copyObject,
  deleteObject,
  presignGetUrl,
  spacesConfigured,
  spacesSetupMessage,
  uploadObject,
  getObjectBuffer,
} from "@/lib/storage/spaces";
import {
  isSpacesObjectKey,
  isVaultStagingKey,
  vaultStagingMp3Key,
  vaultStemMp3Key,
  vaultTrackMp3Key,
  vaultVersionMp3Key,
} from "@/lib/storage/paths";

export {
  isSpacesObjectKey,
  isVaultStagingKey,
  vaultStagingMp3Key,
  vaultStemMp3Key,
  vaultTrackMp3Key,
  vaultVersionMp3Key,
  vaultStagingFolderKey,
} from "@/lib/storage/paths";

export type VaultUploadResult = {
  dropboxPath: string;
  dropboxLink: string | null;
  dropboxDl: string | null;
};

function emptyLinks(key: string): VaultUploadResult {
  return { dropboxPath: key, dropboxLink: null, dropboxDl: null };
}

export { spacesConfigured, spacesSetupMessage, presignGetUrl, getObjectBuffer };

export async function uploadIntoVault(opts: {
  trackId: string;
  mp3Bytes: Buffer;
}): Promise<VaultUploadResult> {
  const key = vaultTrackMp3Key(opts.trackId);
  await uploadObject(key, opts.mp3Bytes);
  return emptyLinks(key);
}

export async function uploadIntoVaultStaging(opts: {
  stagingId: string;
  mp3Bytes: Buffer;
}): Promise<VaultUploadResult & { stagingId: string }> {
  const stagingId = opts.stagingId.trim();
  if (!stagingId) throw new Error("stagingId is required");
  const key = vaultStagingMp3Key(stagingId);
  await uploadObject(key, opts.mp3Bytes);
  return { stagingId, ...emptyLinks(key) };
}

export async function uploadVaultAudioFile(
  objectKey: string,
  bytes: Buffer,
): Promise<VaultUploadResult> {
  await uploadObject(objectKey, bytes);
  return emptyLinks(objectKey);
}

export async function deleteVaultFile(key: string): Promise<void> {
  try {
    await deleteObject(key);
  } catch {
    // Best-effort
  }
}

export async function promoteVaultStaging(opts: {
  stagingId?: string | null;
  stagingPath?: string | null;
  trackId: string;
}): Promise<VaultUploadResult> {
  const trackId = opts.trackId.trim();
  if (!trackId) throw new Error("trackId is required");

  const stagingId = opts.stagingId?.trim() || "";
  const fromKey = stagingId
    ? vaultStagingMp3Key(stagingId)
    : String(opts.stagingPath || "").trim();

  if (!fromKey || !isVaultStagingKey(fromKey)) {
    throw new Error("Staging key is missing or not under vault/_tmp");
  }

  const toKey = vaultTrackMp3Key(trackId);
  await copyObject(fromKey, toKey);
  try {
    await deleteObject(fromKey);
  } catch {
    // ignore cleanup errors
  }

  return emptyLinks(toKey);
}
