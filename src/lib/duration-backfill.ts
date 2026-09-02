import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { trackWaveforms, tracks } from "@/db/schema";
import { formatAudioDuration } from "@/lib/audio-duration";
import { hasPlayableAudio } from "@/lib/tracks";
import { ensureTrackWaveform } from "@/lib/waveform-generate";
import { getTrackWaveform } from "@/lib/waveform-queries";

const missingDurationWhere = and(
  isNull(tracks.trashedAt),
  or(isNull(tracks.duration), sql`trim(${tracks.duration}) = ''`),
);

export function countTracksMissingDuration(): number {
  const row = db
    .select({ value: sql<number>`count(*)` })
    .from(tracks)
    .where(missingDurationWhere)
    .get();
  return Number(row?.value ?? 0);
}

export function listTracksMissingDuration(
  limit = 25,
): Array<{ id: string; dropboxPath: string | null; dropboxDl: string | null }> {
  const capped = Math.max(1, Math.min(limit, 100));
  return db
    .select({
      id: tracks.id,
      dropboxPath: tracks.dropboxPath,
      dropboxDl: tracks.dropboxDl,
    })
    .from(tracks)
    .where(missingDurationWhere)
    .limit(capped)
    .all();
}

/** Copy duration from stored waveform peaks when the track field is empty. */
export function backfillDurationsFromWaveforms(limit = 100): {
  scanned: number;
  updated: number;
  ids: string[];
} {
  const capped = Math.max(1, Math.min(limit, 500));
  const rows = db
    .select({
      id: tracks.id,
      durationSec: trackWaveforms.durationSec,
    })
    .from(tracks)
    .innerJoin(trackWaveforms, eq(trackWaveforms.trackId, tracks.id))
    .where(missingDurationWhere)
    .limit(capped)
    .all();

  const now = new Date().toISOString();
  const ids: string[] = [];
  let updated = 0;

  for (const row of rows) {
    const seconds = Number(row.durationSec);
    const formatted = formatAudioDuration(seconds);
    if (!formatted) continue;
    db.update(tracks)
      .set({ duration: formatted, updatedAt: now })
      .where(eq(tracks.id, row.id))
      .run();
    ids.push(row.id);
    updated += 1;
  }

  return { scanned: rows.length, updated, ids };
}

export function setTrackDurationIfEmpty(trackId: string, seconds: number): boolean {
  if (!Number.isFinite(seconds) || seconds <= 0) return false;
  const formatted = formatAudioDuration(seconds);
  if (!formatted) return false;

  const existing = db
    .select({ duration: tracks.duration })
    .from(tracks)
    .where(eq(tracks.id, trackId))
    .get();
  if (!existing || String(existing.duration || "").trim()) return false;

  db.update(tracks)
    .set({ duration: formatted, updatedAt: new Date().toISOString() })
    .where(eq(tracks.id, trackId))
    .run();
  return true;
}

/** Decode audio and fill track duration (reuses waveform generation when peaks are missing). */
export async function backfillDurationsFromAudio(
  limit = 10,
): Promise<{ processed: number; updated: number; failed: number; ids: string[] }> {
  const batch = listTracksMissingDuration(limit).filter((row) => hasPlayableAudio(row));
  let updated = 0;
  let failed = 0;
  const ids: string[] = [];

  for (const row of batch) {
    let seconds: number | null = getTrackWaveform(row.id)?.duration ?? null;

    if (!seconds) {
      await ensureTrackWaveform(row.id, row);
      seconds = getTrackWaveform(row.id)?.duration ?? null;
    }

    if (!seconds) {
      failed += 1;
      continue;
    }

    const didSet = setTrackDurationIfEmpty(row.id, seconds);
    if (didSet) {
      updated += 1;
      ids.push(row.id);
      continue;
    }

    const existing = db
      .select({ duration: tracks.duration })
      .from(tracks)
      .where(eq(tracks.id, row.id))
      .get();
    if (String(existing?.duration || "").trim()) {
      updated += 1;
      ids.push(row.id);
    } else {
      failed += 1;
    }
  }

  return { processed: batch.length, updated, failed, ids };
}
