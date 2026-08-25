import { and, asc, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import { playlistTracks, playlists, tracks, type Track } from "@/db/schema";

import { TRASH_HREF, TRASH_LABEL } from "@/lib/trash-constants";

/** Soft-delete is track.trashedAt — not a real playlist row. */
export const TRASH_PLAYLIST_ID = "__trash__";
export const TRASH_PLAYLIST_NAME = TRASH_LABEL;
export { TRASH_HREF, TRASH_LABEL };

/** Move track to Trash — soft-delete and remove from regular playlists. */
export function trashTrack(trackId: string): Track | null {
  const existing = db.select().from(tracks).where(eq(tracks.id, trackId)).get();
  if (!existing) return null;
  if (existing.trashedAt) return existing;

  const now = new Date().toISOString();
  db.update(tracks)
    .set({ trashedAt: now, updatedAt: now })
    .where(eq(tracks.id, trackId))
    .run();

  // Drop from every regular playlist membership.
  const memberships = db
    .select({ playlistId: playlistTracks.playlistId })
    .from(playlistTracks)
    .where(eq(playlistTracks.trackId, trackId))
    .all();
  db.delete(playlistTracks).where(eq(playlistTracks.trackId, trackId)).run();
  const touched = new Set(memberships.map((m) => m.playlistId));
  for (const playlistId of touched) {
    db.update(playlists)
      .set({ updatedAt: now })
      .where(eq(playlists.id, playlistId))
      .run();
  }

  return db.select().from(tracks).where(eq(tracks.id, trackId)).get() ?? null;
}

export function restoreTrack(trackId: string): Track | null {
  const existing = db.select().from(tracks).where(eq(tracks.id, trackId)).get();
  if (!existing) return null;
  if (!existing.trashedAt) return existing;

  const now = new Date().toISOString();
  db.update(tracks)
    .set({ trashedAt: null, updatedAt: now })
    .where(eq(tracks.id, trackId))
    .run();

  return db.select().from(tracks).where(eq(tracks.id, trackId)).get() ?? null;
}

export function listTrashedTracks(): Track[] {
  return db
    .select()
    .from(tracks)
    .where(isNotNull(tracks.trashedAt))
    .orderBy(desc(tracks.trashedAt), asc(tracks.libraryTitle))
    .all();
}

export function countTrashedTracks(): number {
  return listTrashedTracks().length;
}

/** Permanently remove tracks (and cascaded relations / waveforms / playlist rows). */
export function permanentlyDeleteTracks(trackIds: string[]): { deleted: number } {
  const ids = [...new Set(trackIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) return { deleted: 0 };

  // Only allow permanent delete of tracks already in trash.
  const eligible = db
    .select({ id: tracks.id })
    .from(tracks)
    .where(and(inArray(tracks.id, ids), isNotNull(tracks.trashedAt)))
    .all()
    .map((row) => row.id);

  if (!eligible.length) return { deleted: 0 };

  const result = db.delete(tracks).where(inArray(tracks.id, eligible)).run();
  return { deleted: result.changes };
}

export function isTrackTrashed(track: Pick<Track, "trashedAt"> | null | undefined): boolean {
  return Boolean(track?.trashedAt);
}
