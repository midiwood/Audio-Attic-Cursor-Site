import { eq, isNull, and, sql } from "drizzle-orm";
import { db } from "@/db";
import { tracks, trackWaveforms } from "@/db/schema";
import type { StoredWaveform, WaveformPeaks } from "@/lib/waveform";

export function getTrackWaveform(trackId: string): StoredWaveform | null {
  const row = db
    .select()
    .from(trackWaveforms)
    .where(eq(trackWaveforms.trackId, trackId))
    .get();
  if (!row) return null;

  let peaks: WaveformPeaks;
  try {
    const parsed = JSON.parse(row.peaksJson) as unknown;
    if (!Array.isArray(parsed) || !parsed.length) return null;
    peaks = parsed as WaveformPeaks;
  } catch {
    return null;
  }

  const duration = Number(row.durationSec);
  if (!Number.isFinite(duration) || duration <= 0) return null;

  return {
    trackId: row.trackId,
    peaks,
    duration,
    peaksLength: row.peaksLength,
  };
}

export function upsertTrackWaveform(input: {
  trackId: string;
  peaks: WaveformPeaks;
  duration: number;
  peaksLength: number;
}): StoredWaveform {
  const now = new Date().toISOString();
  const peaksJson = JSON.stringify(input.peaks);
  const durationSec = String(input.duration);

  const existing = db
    .select({ trackId: trackWaveforms.trackId })
    .from(trackWaveforms)
    .where(eq(trackWaveforms.trackId, input.trackId))
    .get();

  if (existing) {
    db.update(trackWaveforms)
      .set({
        peaksJson,
        durationSec,
        peaksLength: input.peaksLength,
        updatedAt: now,
      })
      .where(eq(trackWaveforms.trackId, input.trackId))
      .run();
  } else {
    db.insert(trackWaveforms)
      .values({
        trackId: input.trackId,
        peaksJson,
        durationSec,
        peaksLength: input.peaksLength,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  return {
    trackId: input.trackId,
    peaks: input.peaks,
    duration: input.duration,
    peaksLength: input.peaksLength,
  };
}

/** Active catalog tracks that have Dropbox audio but no stored waveform peaks. */
export function listTracksMissingWaveforms(limit = 25): Array<{ id: string; dropboxDl: string }> {
  const capped = Math.max(1, Math.min(limit, 100));
  const rows = db
    .select({
      id: tracks.id,
      dropboxDl: tracks.dropboxDl,
    })
    .from(tracks)
    .leftJoin(trackWaveforms, eq(trackWaveforms.trackId, tracks.id))
    .where(
      and(
        isNull(tracks.trashedAt),
        sql`${tracks.dropboxDl} IS NOT NULL AND ${tracks.dropboxDl} != ''`,
        isNull(trackWaveforms.trackId),
      ),
    )
    .limit(capped)
    .all();

  return rows
    .filter((row): row is { id: string; dropboxDl: string } => Boolean(row.dropboxDl))
    .map((row) => ({ id: row.id, dropboxDl: row.dropboxDl }));
}

export function countTracksMissingWaveforms(): number {
  const row = db
    .select({ value: sql<number>`count(*)` })
    .from(tracks)
    .leftJoin(trackWaveforms, eq(trackWaveforms.trackId, tracks.id))
    .where(
      and(
        isNull(tracks.trashedAt),
        sql`${tracks.dropboxDl} IS NOT NULL AND ${tracks.dropboxDl} != ''`,
        isNull(trackWaveforms.trackId),
      ),
    )
    .get();
  return Number(row?.value ?? 0);
}
