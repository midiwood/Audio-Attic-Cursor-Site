import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tracks } from "@/db/schema";
import { headObject } from "@/lib/storage/spaces";
import { vaultTrackMp3Key } from "@/lib/storage/paths";
import { isSpacesObjectKey, presignGetUrl, spacesConfigured } from "@/lib/vault-storage";

function safeFilename(name: string) {
  return name.replace(/[^\w.\- ()[\]]+/g, "_").slice(0, 120) || "track";
}

export type AudioRedirectInput = {
  objectKey?: string | null;
  legacyDlUrl?: string | null;
  download?: boolean;
  downloadLabel?: string;
};

/**
 * Prefer a Spaces vault key. If the DB still has a legacy Dropbox absolute path
 * but `vault/{trackId}/track.mp3` already exists in the bucket, heal the row and
 * return the vault key (same bucket as local after migration).
 */
export async function resolvePlayableObjectKey(opts: {
  trackId: string;
  objectKey?: string | null;
}): Promise<{ key: string | null; healed: boolean }> {
  const raw = opts.objectKey?.trim() || "";
  if (raw && isSpacesObjectKey(raw)) {
    return { key: raw, healed: false };
  }
  if (!spacesConfigured()) {
    return { key: null, healed: false };
  }
  const trackId = opts.trackId.trim();
  if (!trackId) return { key: null, healed: false };

  const canonical = vaultTrackMp3Key(trackId);
  const head = await headObject(canonical);
  if (!head.exists) {
    return { key: null, healed: false };
  }

  try {
    db.update(tracks)
      .set({
        dropboxPath: canonical,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(tracks.id, trackId))
      .run();
  } catch {
    // Best-effort heal; still serve the vault object this request.
  }

  return { key: canonical, healed: true };
}

/** Resolve a redirect URL for playback/download without proxying bytes through cPanel. */
export async function resolveAudioRedirectUrl(input: AudioRedirectInput): Promise<string | null> {
  const key = input.objectKey?.trim() || "";
  const legacy = input.legacyDlUrl?.trim() || "";

  if (key && isSpacesObjectKey(key)) {
    if (!spacesConfigured()) return null;
    const ext = key.toLowerCase().endsWith(".wav") ? "wav" : "mp3";
    const downloadFilename =
      input.download && input.downloadLabel
        ? `${safeFilename(input.downloadLabel)}.${ext}`
        : undefined;
    return presignGetUrl(key, { downloadFilename });
  }

  if (legacy) return legacy;
  return null;
}
