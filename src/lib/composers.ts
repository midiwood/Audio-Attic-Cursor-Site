import { randomUUID } from "crypto";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { composers, trackComposers, tracks, type Composer } from "@/db/schema";
import {
  parseSamroComposers,
  splitSamroPerfShare,
  type SamroComposerSlot,
  type SamroProProfile,
} from "@/lib/samro";
import type { TrackListItem } from "@/lib/track-list-item";
import type { ComposerAssignmentInput } from "@/lib/composer-types";

export type { ComposerAssignmentInput } from "@/lib/composer-types";

export type ComposerInput = {
  displayName: string;
  ipiPa: string;
  ipiBase?: string | null;
  proSociety?: string;
  notes?: string | null;
};

export type TrackComposerAssignment = {
  composerId: string;
  perfShare: number;
};

export type TrackComposerRow = {
  composerId: string;
  perfShare: number;
  sortOrder: number;
  composer: Composer;
};

const MAX_COMPOSERS_PER_TRACK = 12;

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

export function formatArtistFromComposers(names: string[]): string {
  const list = names.map((n) => n.trim()).filter(Boolean);
  if (!list.length) return "";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} & ${list[1]}`;
  return `${list.slice(0, -1).join(", ")} & ${list[list.length - 1]}`;
}

export function validateComposerAssignments(
  assignments: ComposerAssignmentInput[],
): { ok: true } | { ok: false; error: string } {
  if (!assignments.length) {
    return { ok: false, error: "Select at least one composer" };
  }
  if (assignments.length > MAX_COMPOSERS_PER_TRACK) {
    return { ok: false, error: `Max ${MAX_COMPOSERS_PER_TRACK} composers per track` };
  }
  const ids = new Set<string>();
  let total = 0;
  for (const row of assignments) {
    const id = String(row.composerId || "").trim();
    if (!id) return { ok: false, error: "Invalid composer id" };
    if (ids.has(id)) return { ok: false, error: "Duplicate composer on track" };
    ids.add(id);
    const share = Number(row.perfShare);
    if (!Number.isFinite(share) || share < 1 || share > 100) {
      return { ok: false, error: "Perf share must be 1–100 per composer" };
    }
    total += share;
  }
  if (total !== 100) {
    return { ok: false, error: `Perf share must total 100% (currently ${total}%)` };
  }
  return { ok: true };
}

export function listComposers(opts?: { includeDisabled?: boolean }): Composer[] {
  const where = opts?.includeDisabled ? undefined : isNull(composers.disabledAt);
  return db
    .select()
    .from(composers)
    .where(where)
    .orderBy(asc(composers.displayName))
    .all();
}

export function getComposerById(id: string): Composer | undefined {
  return db.select().from(composers).where(eq(composers.id, id)).get();
}

export function findComposerByName(name: string): Composer | undefined {
  const key = normalizeName(name);
  if (!key) return undefined;
  const matches = db
    .select()
    .from(composers)
    .where(sql`lower(trim(${composers.displayName})) = ${key}`)
    .orderBy(asc(composers.disabledAt), asc(composers.createdAt))
    .all();
  if (!matches.length) return undefined;
  const active = matches.filter((row) => !row.disabledAt);
  const withIpi = active.filter((row) => row.ipiPa.trim());
  return withIpi[0] || active[0] || matches[0];
}

export function createComposer(input: ComposerInput): Composer {
  const now = new Date().toISOString();
  const row: Composer = {
    id: randomUUID(),
    displayName: input.displayName.trim(),
    ipiPa: input.ipiPa.trim(),
    ipiBase: input.ipiBase?.trim() || null,
    proSociety: (input.proSociety || "SAMRO").trim() || "SAMRO",
    notes: input.notes?.trim() || null,
    disabledAt: null,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(composers).values(row).run();
  return row;
}

export function updateComposer(
  id: string,
  input: Partial<ComposerInput> & { disabled?: boolean },
): Composer | null {
  const existing = getComposerById(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  const next = {
    displayName:
      input.displayName !== undefined ? input.displayName.trim() : existing.displayName,
    ipiPa: input.ipiPa !== undefined ? input.ipiPa.trim() : existing.ipiPa,
    ipiBase:
      input.ipiBase !== undefined ? input.ipiBase?.trim() || null : existing.ipiBase,
    proSociety:
      input.proSociety !== undefined
        ? (input.proSociety || "SAMRO").trim() || "SAMRO"
        : existing.proSociety,
    notes: input.notes !== undefined ? input.notes?.trim() || null : existing.notes,
    disabledAt:
      input.disabled === true
        ? existing.disabledAt || now
        : input.disabled === false
          ? null
          : existing.disabledAt,
    updatedAt: now,
  };
  db.update(composers).set(next).where(eq(composers.id, id)).run();
  return { ...existing, ...next };
}

/** Ensure house composer exists in registry from publisher settings. */
export function ensureHouseComposer(input: {
  displayName: string;
  ipiPa: string;
  ipiBase?: string;
}): Composer {
  const name = input.displayName.trim();
  if (!name) {
    throw new Error("House composer name required");
  }
  const existing = findComposerByName(name);
  if (existing) {
    const ipiPa = input.ipiPa.trim() || existing.ipiPa;
    const ipiBase = input.ipiBase?.trim() || existing.ipiBase;
    if (ipiPa !== existing.ipiPa || ipiBase !== existing.ipiBase) {
      return updateComposer(existing.id, { ipiPa, ipiBase })!;
    }
    return existing;
  }
  return createComposer({
    displayName: name,
    ipiPa: input.ipiPa.trim(),
    ipiBase: input.ipiBase?.trim() || null,
    proSociety: "SAMRO",
    notes: "House composer (from Publisher / PRO settings)",
  });
}

export function getTrackComposers(trackId: string): TrackComposerRow[] {
  const rows = db
    .select({
      composerId: trackComposers.composerId,
      perfShare: trackComposers.perfShare,
      sortOrder: trackComposers.sortOrder,
      composer: composers,
    })
    .from(trackComposers)
    .innerJoin(composers, eq(composers.id, trackComposers.composerId))
    .where(eq(trackComposers.trackId, trackId))
    .orderBy(asc(trackComposers.sortOrder), asc(composers.displayName))
    .all();
  return rows;
}

export function getTrackComposersForTracks(
  trackIds: string[],
): Map<string, TrackComposerRow[]> {
  const unique = [...new Set(trackIds.filter(Boolean))];
  const map = new Map<string, TrackComposerRow[]>();
  if (!unique.length) return map;

  const rows = db
    .select({
      trackId: trackComposers.trackId,
      composerId: trackComposers.composerId,
      perfShare: trackComposers.perfShare,
      sortOrder: trackComposers.sortOrder,
      composer: composers,
    })
    .from(trackComposers)
    .innerJoin(composers, eq(composers.id, trackComposers.composerId))
    .where(inArray(trackComposers.trackId, unique))
    .orderBy(asc(trackComposers.sortOrder), asc(composers.displayName))
    .all();

  for (const row of rows) {
    const list = map.get(row.trackId) || [];
    list.push({
      composerId: row.composerId,
      perfShare: row.perfShare,
      sortOrder: row.sortOrder,
      composer: row.composer,
    });
    map.set(row.trackId, list);
  }
  return map;
}

export function syncTrackComposers(
  trackId: string,
  assignments: ComposerAssignmentInput[],
): { ok: true; artist: string } | { ok: false; error: string } {
  const validated = validateComposerAssignments(assignments);
  if (!validated.ok) return validated;

  const composerRows = db
    .select()
    .from(composers)
    .where(
      inArray(
        composers.id,
        assignments.map((a) => a.composerId),
      ),
    )
    .all();
  if (composerRows.length !== assignments.length) {
    return { ok: false, error: "One or more composers not found" };
  }
  const byId = new Map(composerRows.map((c) => [c.id, c]));

  db.delete(trackComposers).where(eq(trackComposers.trackId, trackId)).run();

  const names: string[] = [];
  assignments.forEach((assignment, index) => {
    const composer = byId.get(assignment.composerId)!;
    names.push(composer.displayName);
    db.insert(trackComposers)
      .values({
        trackId,
        composerId: assignment.composerId,
        perfShare: assignment.perfShare,
        sortOrder: index,
      })
      .run();
  });

  const artist = formatArtistFromComposers(names);
  const now = new Date().toISOString();
  db.update(tracks)
    .set({ artist, updatedAt: now })
    .where(eq(tracks.id, trackId))
    .run();

  return { ok: true, artist };
}

/** Parse legacy artist text → registry matches with even perf shares. */
export function inferAssignmentsFromArtistText(
  artistText: string | null | undefined,
): {
  assignments: ComposerAssignmentInput[];
  unmatched: string[];
} {
  const names = parseSamroComposers(artistText);
  if (!names.length) return { assignments: [], unmatched: [] };

  const shares = splitSamroPerfShare(names.length);
  const assignments: ComposerAssignmentInput[] = [];
  const unmatched: string[] = [];

  names.forEach((name, index) => {
    const match = findComposerByName(name);
    if (match) {
      assignments.push({ composerId: match.id, perfShare: shares[index] });
    } else {
      unmatched.push(name);
    }
  });

  return { assignments, unmatched };
}

export type BackfillResult = {
  scanned: number;
  linked: number;
  skipped: number;
  unmatchedNames: string[];
};

/** Discover composer names from catalog artist text and add missing registry rows. */
export function seedComposersFromCatalogArtists(): { created: string[]; skipped: number } {
  const rows = db
    .select({ artist: tracks.artist })
    .from(tracks)
    .where(
      and(isNull(tracks.trashedAt), sql`trim(coalesce(${tracks.artist}, '')) != ''`),
    )
    .all();

  const names = new Set<string>();
  for (const row of rows) {
    for (const name of parseSamroComposers(row.artist)) {
      names.add(name);
    }
  }

  const created: string[] = [];
  let skipped = 0;
  for (const name of [...names].sort((a, b) => a.localeCompare(b))) {
    if (findComposerByName(name)) {
      skipped += 1;
      continue;
    }
    createComposer({
      displayName: name,
      ipiPa: "",
      proSociety: "SAMRO",
      notes: "Auto-added from catalog artist text during backfill",
    });
    created.push(name);
  }

  return { created, skipped };
}

/** Backfill track_composers from tracks.artist for tracks with no junction rows. */
export function backfillTrackComposersFromArtist(limit = 200): BackfillResult {
  const capped = Math.max(1, Math.min(limit, 500));
  const candidates = db
    .select({ id: tracks.id, artist: tracks.artist })
    .from(tracks)
    .leftJoin(trackComposers, eq(trackComposers.trackId, tracks.id))
    .where(
      and(
        isNull(tracks.trashedAt),
        isNull(trackComposers.trackId),
        sql`trim(coalesce(${tracks.artist}, '')) != ''`,
      ),
    )
    .limit(capped)
    .all();

  let linked = 0;
  let skipped = 0;
  const unmatchedNames = new Set<string>();

  for (const row of candidates) {
    const { assignments, unmatched } = inferAssignmentsFromArtistText(row.artist);
    for (const name of unmatched) unmatchedNames.add(name);
    if (!assignments.length) {
      skipped += 1;
      continue;
    }
    const names = assignments.map((a) => getComposerById(a.composerId)!.displayName);
    if (assignments.reduce((s, a) => s + a.perfShare, 0) !== 100) {
      skipped += 1;
      continue;
    }
    db.delete(trackComposers).where(eq(trackComposers.trackId, row.id)).run();
    assignments.forEach((assignment, index) => {
      db.insert(trackComposers)
        .values({
          trackId: row.id,
          composerId: assignment.composerId,
          perfShare: assignment.perfShare,
          sortOrder: index,
        })
        .run();
    });
    const artist = formatArtistFromComposers(names);
    db.update(tracks)
      .set({ artist, updatedAt: new Date().toISOString() })
      .where(eq(tracks.id, row.id))
      .run();
    linked += 1;
  }

  return {
    scanned: candidates.length,
    linked,
    skipped,
    unmatchedNames: [...unmatchedNames].sort((a, b) => a.localeCompare(b)),
  };
}

/** Run backfill in batches until no unlinked tracks remain. */
export function backfillAllTrackComposersFromArtist(
  batchSize = 500,
): BackfillResult & { passes: number } {
  let scanned = 0;
  let linked = 0;
  let skipped = 0;
  const unmatchedNames = new Set<string>();
  let passes = 0;

  while (passes < 100) {
    passes += 1;
    const batch = backfillTrackComposersFromArtist(batchSize);
    scanned += batch.scanned;
    linked += batch.linked;
    skipped += batch.skipped;
    for (const name of batch.unmatchedNames) unmatchedNames.add(name);
    if (batch.scanned === 0) break;
  }

  return {
    scanned,
    linked,
    skipped,
    unmatchedNames: [...unmatchedNames].sort((a, b) => a.localeCompare(b)),
    passes,
  };
}

/** Assign house composer at 100% to tracks with blank artist and no junction rows. */
export function backfillTracksWithEmptyArtist(
  composerId: string,
  limit = 500,
): { linked: number; scanned: number } {
  const composer = getComposerById(composerId);
  if (!composer) return { linked: 0, scanned: 0 };

  const capped = Math.max(1, Math.min(limit, 500));
  const candidates = db
    .select({ id: tracks.id })
    .from(tracks)
    .leftJoin(trackComposers, eq(trackComposers.trackId, tracks.id))
    .where(
      and(
        isNull(tracks.trashedAt),
        isNull(trackComposers.trackId),
        sql`trim(coalesce(${tracks.artist}, '')) = ''`,
      ),
    )
    .limit(capped)
    .all();

  let linked = 0;
  for (const row of candidates) {
    db.insert(trackComposers)
      .values({
        trackId: row.id,
        composerId,
        perfShare: 100,
        sortOrder: 0,
      })
      .run();
    db.update(tracks)
      .set({
        artist: composer.displayName,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(tracks.id, row.id))
      .run();
    linked += 1;
  }

  return { linked, scanned: candidates.length };
}

export function parseComposerAssignments(raw: unknown): ComposerAssignmentInput[] | null {
  if (raw === undefined) return null;
  if (!Array.isArray(raw)) return [];
  const out: ComposerAssignmentInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const composerId = String(row.composerId || "").trim();
    const perfShare = Number(row.perfShare);
    if (!composerId || !Number.isFinite(perfShare)) continue;
    out.push({ composerId, perfShare: Math.round(perfShare) });
  }
  return out;
}

export function getComposerAssignmentsForTrack(trackId: string): ComposerAssignmentInput[] {
  return getTrackComposers(trackId).map((row) => ({
    composerId: row.composerId,
    perfShare: row.perfShare,
  }));
}

export function listComposersForPicker() {
  return listComposers({ includeDisabled: true }).map((c) => ({
    id: c.id,
    displayName: c.displayName,
    ipiPa: c.ipiPa,
    proSociety: c.proSociety,
    disabledAt: c.disabledAt,
  }));
}

/** Point track assignments off a disabled duplicate onto the canonical composer. */
export function remapComposerAssignments(fromId: string, toId: string): number {
  if (!fromId || !toId || fromId === toId) return 0;
  const from = getComposerById(fromId);
  const to = getComposerById(toId);
  if (!from || !to) return 0;

  const rows = db
    .select()
    .from(trackComposers)
    .where(eq(trackComposers.composerId, fromId))
    .all();

  let remapped = 0;
  for (const row of rows) {
    const already = db
      .select()
      .from(trackComposers)
      .where(
        and(eq(trackComposers.trackId, row.trackId), eq(trackComposers.composerId, toId)),
      )
      .get();
    if (already) {
      db.delete(trackComposers)
        .where(
          and(
            eq(trackComposers.trackId, row.trackId),
            eq(trackComposers.composerId, fromId),
          ),
        )
        .run();
      continue;
    }
    db.update(trackComposers)
      .set({ composerId: toId })
      .where(
        and(eq(trackComposers.trackId, row.trackId), eq(trackComposers.composerId, fromId)),
      )
      .run();
    remapped += 1;
  }
  return remapped;
}

function slotsFromTrackComposerRows(rows: TrackComposerRow[]): SamroComposerSlot[] {
  return rows.map((row) => ({
    name: row.composer.displayName,
    ipi: (row.composer.ipiPa || row.composer.ipiBase || "").trim(),
    proSociety: (row.composer.proSociety || "SAMRO").trim() || "SAMRO",
    perfShare: row.perfShare,
  }));
}

function slotsFromLegacyArtistWithRegistry(
  artist: string | null | undefined,
  profile: SamroProProfile,
): SamroComposerSlot[] {
  const names = parseSamroComposers(artist);
  if (!names.length) return [];
  const shares = splitSamroPerfShare(names.length);
  const profileIpi = (profile.ipiNumber || "").trim();

  return names.map((name, index) => {
    const match = findComposerByName(name);
    const ipi =
      (match?.ipiPa || match?.ipiBase || "").trim() ||
      (index === 0 ? profileIpi : "");
    return {
      name,
      ipi,
      proSociety: (match?.proSociety || "SAMRO").trim() || "SAMRO",
      perfShare: shares[index],
    };
  });
}

/** Resolve registry + custom shares (or legacy artist text) for SAMRO export/readiness. */
export function attachSamroComposerSlots(
  tracks: TrackListItem[],
  profile: SamroProProfile,
): TrackListItem[] {
  const byTrack = getTrackComposersForTracks(tracks.map((track) => track.id));
  return tracks.map((track) => {
    const rows = byTrack.get(track.id) || [];
    return {
      ...track,
      composerSlots: rows.length
        ? slotsFromTrackComposerRows(rows)
        : slotsFromLegacyArtistWithRegistry(track.artist, profile),
    };
  });
}
