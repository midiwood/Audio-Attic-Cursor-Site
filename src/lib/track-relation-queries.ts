import { randomUUID } from "crypto";
import { and, asc, eq, inArray, isNull, like, ne, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { trackRelations, tracks, type Track } from "@/db/schema";
import { getTrackById, getTracksByIds, catalogSearchTokens } from "@/lib/queries";
import {
  isTrackRelationType,
  type DerivedFromLink,
  type TrackRelationNeighbor,
  type TrackRelationView,
} from "@/lib/track-relations";

function toNeighbor(track: Track): TrackRelationNeighbor {
  return {
    id: track.id,
    libraryTitle: track.libraryTitle,
    workingTitle: track.workingTitle,
    license: track.license,
    year: track.year,
    duration: track.duration,
    dropboxDl: track.dropboxDl,
  };
}

function toRelationView(
  row: { id: string; relation: string; note: string | null; fromTrackId: string; toTrackId: string },
  focalId: string,
  neighbor: Track,
): TrackRelationView | null {
  if (!isTrackRelationType(row.relation)) return null;
  const direction: "from" | "to" = row.toTrackId === focalId ? "from" : "to";
  return {
    id: row.id,
    relation: row.relation,
    note: row.note,
    direction,
    neighbor: toNeighbor(neighbor),
  };
}

/** Relations touching a single track (inbound + outbound). */
export function listRelationsForTrack(trackId: string): TrackRelationView[] {
  const rows = db
    .select()
    .from(trackRelations)
    .where(or(eq(trackRelations.fromTrackId, trackId), eq(trackRelations.toTrackId, trackId)))
    .all();
  if (!rows.length) return [];

  const neighborIds = [
    ...new Set(
      rows.map((row) => (row.fromTrackId === trackId ? row.toTrackId : row.fromTrackId)),
    ),
  ];
  const neighbors = new Map(getTracksByIds(neighborIds).map((t) => [t.id, t]));

  return rows
    .map((row) => {
      const neighborId = row.fromTrackId === trackId ? row.toTrackId : row.fromTrackId;
      const neighbor = neighbors.get(neighborId);
      if (!neighbor) return null;
      return toRelationView(row, trackId, neighbor);
    })
    .filter((item): item is TrackRelationView => Boolean(item));
}

/** Batch relations for many tracks (browse expansion). */
export function listRelationsForTrackIds(
  trackIds: string[],
): Record<string, TrackRelationView[]> {
  const result: Record<string, TrackRelationView[]> = {};
  for (const id of trackIds) result[id] = [];
  if (!trackIds.length) return result;

  const rows = db
    .select()
    .from(trackRelations)
    .where(
      or(
        inArray(trackRelations.fromTrackId, trackIds),
        inArray(trackRelations.toTrackId, trackIds),
      ),
    )
    .all();
  if (!rows.length) return result;

  const neighborIds = new Set<string>();
  for (const row of rows) {
    neighborIds.add(row.fromTrackId);
    neighborIds.add(row.toTrackId);
  }
  const neighbors = new Map(getTracksByIds([...neighborIds]).map((t) => [t.id, t]));

  for (const focalId of trackIds) {
    for (const row of rows) {
      if (row.fromTrackId !== focalId && row.toTrackId !== focalId) continue;
      const neighborId = row.fromTrackId === focalId ? row.toTrackId : row.fromTrackId;
      const neighbor = neighbors.get(neighborId);
      if (!neighbor) continue;
      const view = toRelationView(row, focalId, neighbor);
      if (view) result[focalId].push(view);
    }
  }
  return result;
}

/**
 * Undirected family walk (up to 2 hops) for a compact genealogy strip.
 * Returns the focal track's direct relations plus one extra hop of neighbors.
 */
export function listRelationFamily(trackId: string): TrackRelationView[] {
  const direct = listRelationsForTrack(trackId);
  if (!direct.length) return direct;

  const seen = new Set(direct.map((r) => r.id));
  const hopIds = [...new Set(direct.map((r) => r.neighbor.id))];
  for (const hopId of hopIds) {
    for (const rel of listRelationsForTrack(hopId)) {
      if (seen.has(rel.id)) continue;
      if (rel.neighbor.id === trackId || hopIds.includes(rel.neighbor.id)) {
        seen.add(rel.id);
        direct.push(rel);
      }
    }
  }
  return direct;
}

/**
 * Replace "derived from" links for a track (edges where this track is `to_track_id`).
 * Direction: parent → this track.
 */
export function setDerivedFromLinks(trackId: string, links: DerivedFromLink[]): TrackRelationView[] {
  const existing = getTrackById(trackId);
  if (!existing) throw new Error("Track not found");

  const cleaned: DerivedFromLink[] = [];
  const seen = new Set<string>();
  for (const link of links) {
    const parentId = String(link.trackId || "").trim();
    if (!parentId || parentId === trackId) continue;
    if (!isTrackRelationType(link.relation)) continue;
    if (!getTrackById(parentId)) continue;
    const key = `${parentId}\0${link.relation}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push({
      trackId: parentId,
      relation: link.relation,
      note: link.note?.trim() || null,
    });
  }

  db.delete(trackRelations).where(eq(trackRelations.toTrackId, trackId)).run();

  const now = new Date().toISOString();
  for (const link of cleaned) {
    db.insert(trackRelations)
      .values({
        id: randomUUID(),
        fromTrackId: link.trackId,
        toTrackId: trackId,
        relation: link.relation,
        note: link.note || null,
        createdAt: now,
      })
      .onConflictDoNothing()
      .run();
  }

  return listRelationsForTrack(trackId);
}

/** Lightweight title/id search for lineage linkers. */
export function searchTracksForLinker(query: string, excludeId?: string, limit = 12): Track[] {
  const tokens = catalogSearchTokens(query);
  if (!tokens.length) return [];
  const tokenClauses = tokens.map((token) => {
    const term = `%${token}%`;
    return or(
      like(tracks.libraryTitle, term),
      like(tracks.workingTitle, term),
      like(tracks.notes, term),
      like(tracks.id, term),
      like(tracks.client, term),
      like(tracks.project, term),
    )!;
  });
  const clauses: SQL[] = [isNull(tracks.trashedAt), ...tokenClauses];
  if (excludeId) clauses.push(ne(tracks.id, excludeId));
  return db
    .select()
    .from(tracks)
    .where(and(...clauses))
    .orderBy(asc(tracks.libraryTitle))
    .limit(limit)
    .all();
}
