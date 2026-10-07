/**
 * Vault upload / promote / delete on DigitalOcean Spaces.
 * DB column dropboxPath stores the S3 object key.
 */

import {
  copyObject,
  deleteObject,
  deleteObjectsByPrefix,
  headObject,
  presignGetUrl,
  spacesConfigured,
  spacesSetupMessage,
  uploadObject,
  getObjectBuffer,
  type DeleteByPrefixResult,
} from "@/lib/storage/spaces";
import {
  contentTypeForMasterExt,
  masterExtFromHint,
} from "@/lib/audio-normalize-shared";
import {
  isSpacesObjectKey,
  isVaultStagingKey,
  masterExtFromObjectKey,
  vaultMasterKey,
  vaultStagingMasterKey,
  vaultStagingMp3Key,
  vaultStemMp3Key,
  vaultTrackFolderPrefix,
  vaultTrackMp3Key,
  vaultVersionMp3Key,
  vaultWatermarkedFolderPrefix,
} from "@/lib/storage/paths";

export {
  isSpacesObjectKey,
  isVaultStagingKey,
  masterExtFromObjectKey,
  vaultMasterKey,
  vaultStagingMasterKey,
  vaultStagingMp3Key,
  vaultStemMp3Key,
  vaultTrackFolderPrefix,
  vaultTrackMp3Key,
  vaultVersionMp3Key,
  vaultWatermarkedFolderPrefix,
  vaultWatermarkedMp3Key,
  vaultStagingFolderKey,
} from "@/lib/storage/paths";

export type VaultUploadResult = {
  dropboxPath: string;
  dropboxLink: string | null;
  dropboxDl: string | null;
  masterObjectKey?: string | null;
};

function emptyLinks(key: string, masterObjectKey?: string | null): VaultUploadResult {
  return {
    dropboxPath: key,
    dropboxLink: null,
    dropboxDl: null,
    masterObjectKey: masterObjectKey ?? null,
  };
}

export { spacesConfigured, spacesSetupMessage, presignGetUrl, getObjectBuffer, headObject };

export async function uploadIntoVault(opts: {
  trackId: string;
  mp3Bytes: Buffer;
  masterBytes?: Buffer | null;
  masterHint?: string | null;
}): Promise<VaultUploadResult> {
  const key = vaultTrackMp3Key(opts.trackId);
  await uploadObject(key, opts.mp3Bytes);
  let masterObjectKey: string | null = null;
  if (opts.masterBytes?.length) {
    const ext = masterExtFromHint(opts.masterHint || "audio.wav");
    masterObjectKey = vaultMasterKey(opts.trackId, ext);
    await uploadObject(
      masterObjectKey,
      opts.masterBytes,
      contentTypeForMasterExt(ext),
    );
  }
  return emptyLinks(key, masterObjectKey);
}

export async function uploadIntoVaultStaging(opts: {
  stagingId: string;
  mp3Bytes: Buffer;
  masterBytes?: Buffer | null;
  masterHint?: string | null;
}): Promise<VaultUploadResult & { stagingId: string }> {
  const stagingId = opts.stagingId.trim();
  if (!stagingId) throw new Error("stagingId is required");
  const key = vaultStagingMp3Key(stagingId);
  await uploadObject(key, opts.mp3Bytes);
  let masterObjectKey: string | null = null;
  if (opts.masterBytes?.length) {
    const ext = masterExtFromHint(opts.masterHint || "audio.wav");
    masterObjectKey = vaultStagingMasterKey(stagingId, ext);
    await uploadObject(
      masterObjectKey,
      opts.masterBytes,
      contentTypeForMasterExt(ext),
    );
  }
  return { stagingId, ...emptyLinks(key, masterObjectKey) };
}

export async function uploadVaultAudioFile(
  objectKey: string,
  bytes: Buffer,
  contentType = "audio/mpeg",
): Promise<VaultUploadResult> {
  await uploadObject(objectKey, bytes, contentType);
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
  masterObjectKey?: string | null;
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
  await copyObject(fromKey, toKey, "audio/mpeg");
  try {
    await deleteObject(fromKey);
  } catch {
    // ignore cleanup errors
  }

  let masterObjectKey: string | null = null;
  const stagingMaster =
    opts.masterObjectKey?.trim() ||
    (stagingId ? await findStagingMasterKey(stagingId) : null);

  if (stagingMaster && isVaultStagingKey(stagingMaster)) {
    const ext = masterExtFromObjectKey(stagingMaster);
    const finalMaster = vaultMasterKey(trackId, ext);
    await copyObject(stagingMaster, finalMaster, contentTypeForMasterExt(ext));
    try {
      await deleteObject(stagingMaster);
    } catch {
      // ignore
    }
    masterObjectKey = finalMaster;
  }

  return emptyLinks(toKey, masterObjectKey);
}

async function findStagingMasterKey(stagingId: string): Promise<string | null> {
  for (const ext of ["wav", "aiff", "aif", "flac", "mp3", "m4a"]) {
    const key = vaultStagingMasterKey(stagingId, ext === "aif" ? "aiff" : ext);
    try {
      const head = await headObject(key);
      if (head.exists) return key;
    } catch {
      // continue
    }
  }
  return null;
}

/**
 * Permanently remove Spaces objects for a catalog track:
 * vault/{id}/** and vault/watermarked/{id}/**
 */
export async function purgeVaultForTrack(trackId: string): Promise<DeleteByPrefixResult> {
  const id = trackId.trim();
  if (!id) return { deletedKeys: [], errors: ["trackId is required"] };

  if (!spacesConfigured()) {
    return { deletedKeys: [], errors: [spacesSetupMessage()] };
  }

  const main = await deleteObjectsByPrefix(vaultTrackFolderPrefix(id));
  const watermarked = await deleteObjectsByPrefix(vaultWatermarkedFolderPrefix(id));

  return {
    deletedKeys: [...main.deletedKeys, ...watermarked.deletedKeys],
    errors: [...main.errors, ...watermarked.errors],
  };
}
