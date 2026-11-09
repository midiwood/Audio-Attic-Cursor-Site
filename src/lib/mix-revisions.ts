/**
 * Snapshot / restore catalog main mixes.
 * Copies the current vault MP3 (+ master) before Replace so staff can revert.
 */

import "server-only";

import { randomUUID } from "crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { trackMixRevisions, type Track, type TrackMixRevision } from "@/db/schema";
import { contentTypeForMasterExt } from "@/lib/audio-normalize-shared";
import { getTrackById, upsertTrack } from "@/lib/queries";
import {
  isSpacesObjectKey,
  masterExtFromObjectKey,
  vaultMasterKey,
  vaultMixRevisionMasterKey,
  vaultMixRevisionMp3Key,
  vaultTrackMp3Key,
} from "@/lib/storage/paths";
import { copyObject, headObject } from "@/lib/storage/spaces";
import { normalizePeaksPayload } from "@/lib/waveform";
import { getTrackWaveform, upsertTrackWaveform } from "@/lib/waveform-queries";

export type MixRevisionListItem = {
  id: string;
  createdAt: string;
  replacedWith: string | null;
  replacedBy: string | null;
  duration: string | null;
};

async function copyIfExists(
  fromKey: string | null | undefined,
  toKey: string,
  contentType: string,
): Promise<string | null> {
  const from = fromKey?.trim() || "";
  if (!from || !isSpacesObjectKey(from)) return null;
  const head = await headObject(from);
  if (!head.exists) return null;
  await copyObject(from, toKey, contentType);
  return toKey;
}

export function listMixRevisions(trackId: string): MixRevisionListItem[] {
  return db
    .select({
      id: trackMixRevisions.id,
      createdAt: trackMixRevisions.createdAt,
      replacedWith: trackMixRevisions.replacedWith,
      replacedBy: trackMixRevisions.replacedBy,
      duration: trackMixRevisions.duration,
    })
    .from(trackMixRevisions)
    .where(eq(trackMixRevisions.trackId, trackId.trim()))
    .orderBy(desc(trackMixRevisions.createdAt))
    .all();
}

function revisionForTrack(
  trackId: string,
  revisionId: string,
): TrackMixRevision | null {
  const row =
    db
      .select()
      .from(trackMixRevisions)
      .where(eq(trackMixRevisions.id, revisionId.trim()))
      .get() ?? null;
  if (!row || row.trackId !== trackId.trim()) return null;
  return row;
}

export async function snapshotCurrentMix(
  track: Track,
  opts?: { replacedWith?: string | null; replacedBy?: string | null },
): Promise<TrackMixRevision | null> {
  const trackId = track.id.trim();
  const currentKey = track.dropboxPath?.trim() || vaultTrackMp3Key(trackId);
  if (!isSpacesObjectKey(currentKey)) return null;

  const revisionId = randomUUID();
  const snapshotMp3 = await copyIfExists(
    currentKey,
    vaultMixRevisionMp3Key(trackId, revisionId),
    "audio/mpeg",
  );
  if (!snapshotMp3) return null;

  let snapshotMaster: string | null = null;
  const masterKey = track.masterObjectKey?.trim() || null;
  if (masterKey) {
    const ext = masterExtFromObjectKey(masterKey);
    snapshotMaster = await copyIfExists(
      masterKey,
      vaultMixRevisionMasterKey(trackId, revisionId, ext),
      contentTypeForMasterExt(ext),
    );
  }

  const waveform = getTrackWaveform(trackId);
  const now = new Date().toISOString();
  const row: TrackMixRevision = {
    id: revisionId,
    trackId,
    replacedWith: opts?.replacedWith?.trim() || null,
    replacedBy: opts?.replacedBy?.trim() || null,
    duration: track.duration?.trim() || null,
    dropboxPath: snapshotMp3,
    masterObjectKey: snapshotMaster,
    peaksJson: waveform ? JSON.stringify({ peaks: waveform.peaks, duration: waveform.duration }) : null,
    createdAt: now,
  };
  db.insert(trackMixRevisions).values(row).run();
  return row;
}

export async function restoreMixRevision(
  trackId: string,
  revisionId: string,
  opts?: { restoredBy?: string | null },
): Promise<Track> {
  const id = trackId.trim();
  const existing = getTrackById(id);
  if (!existing) throw new Error("Track not found");

  const revision = revisionForTrack(id, revisionId);
  if (!revision?.dropboxPath) throw new Error("Mix revision not found");

  await snapshotCurrentMix(existing, {
    replacedWith: "Reverted",
    replacedBy: opts?.restoredBy || null,
  });

  const liveMp3 = vaultTrackMp3Key(id);
  const copied = await copyIfExists(revision.dropboxPath, liveMp3, "audio/mpeg");
  if (!copied) throw new Error("Could not restore previous mix from storage");

  let masterObjectKey = existing.masterObjectKey ?? null;
  if (revision.masterObjectKey) {
    const ext = masterExtFromObjectKey(revision.masterObjectKey);
    const liveMaster = vaultMasterKey(id, ext);
    const restoredMaster = await copyIfExists(
      revision.masterObjectKey,
      liveMaster,
      contentTypeForMasterExt(ext),
    );
    if (restoredMaster) masterObjectKey = restoredMaster;
  }

  if (revision.peaksJson) {
    try {
      const generated = normalizePeaksPayload(JSON.parse(revision.peaksJson));
      if (generated) {
        upsertTrackWaveform({
          trackId: id,
          peaks: generated.peaks,
          duration: generated.duration,
          peaksLength: generated.peaksLength,
        });
      }
    } catch {
      // Waveform is optional.
    }
  }

  return upsertTrack({
    ...existing,
    dropboxPath: liveMp3,
    masterObjectKey,
    duration: revision.duration ?? existing.duration,
  });
}
