import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import {
  playlistTracks,
  playlists,
  trackDeleteLogs,
  tracks,
  type Track,
} from "@/db/schema";
import { purgeVaultForTrack } from "@/lib/vault-storage";

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

export type PermanentDeleteResult = {
  deleted: number;
  spacesDeleted: number;
  spacesErrors: string[];
};

/**
 * Permanently remove trashed tracks:
 * audit log → Spaces vault/watermark purge → SQLite delete (cascades).
 * DB delete proceeds even if Spaces cleanup partially fails.
 */
export async function permanentlyDeleteTracks(
  trackIds: string[],
  opts?: { deletedBy?: string | null },
): Promise<PermanentDeleteResult> {
  const ids = [...new Set(trackIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) {
    return { deleted: 0, spacesDeleted: 0, spacesErrors: [] };
  }

  const eligible = db
    .select()
    .from(tracks)
    .where(and(inArray(tracks.id, ids), isNotNull(tracks.trashedAt)))
    .all();

  if (!eligible.length) {
    return { deleted: 0, spacesDeleted: 0, spacesErrors: [] };
  }

  const deletedBy = opts?.deletedBy?.trim() || null;
  const allSpacesErrors: string[] = [];
  let spacesDeleted = 0;
  const now = new Date().toISOString();

  for (const track of eligible) {
    const purge = await purgeVaultForTrack(track.id);
    spacesDeleted += purge.deletedKeys.length;
    allSpacesErrors.push(...purge.errors.map((e) => `${track.id}: ${e}`));

    try {
      db.insert(trackDeleteLogs)
        .values({
          trackId: track.id,
          workingTitle: track.workingTitle,
          libraryTitle: track.libraryTitle,
          client: track.client,
          project: track.project,
          dropboxPath: track.dropboxPath,
          masterObjectKey: track.masterObjectKey,
          deletedObjectKeys: JSON.stringify(purge.deletedKeys),
          spacesErrors: JSON.stringify(purge.errors),
          deletedBy,
          deletedAt: now,
        })
        .run();
    } catch (err) {
      console.error("[trash] failed to write track_delete_logs", track.id, err);
    }

    if (purge.errors.length) {
      console.error(
        `[trash] Spaces purge errors for ${track.id}:`,
        purge.errors.slice(0, 5).join("; "),
      );
    } else {
      console.info(
        `[trash] purged ${track.id} (${purge.deletedKeys.length} Spaces object(s)) by ${deletedBy || "unknown"}`,
      );
    }
  }

  const eligibleIds = eligible.map((t) => t.id);
  const result = db.delete(tracks).where(inArray(tracks.id, eligibleIds)).run();

  return {
    deleted: result.changes,
    spacesDeleted,
    spacesErrors: allSpacesErrors,
  };
}

export function isTrackTrashed(track: Pick<Track, "trashedAt"> | null | undefined): boolean {
  return Boolean(track?.trashedAt);
}
