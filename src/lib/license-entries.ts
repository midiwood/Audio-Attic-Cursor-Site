import { randomUUID } from "crypto";
import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  trackLicenseEntries,
  tracks,
  type NewTrackLicenseEntry,
  type TrackLicenseEntry,
} from "@/db/schema";
import {
  formatLicenseScopeSummary,
  normalizeLicenseScopeInput,
  perpetuityFromDuration,
  type LicenseScopeFields,
} from "@/lib/license-scope";
import { canonicalizeLicense, normalizeLicenseStatus } from "@/lib/tracks";
import { canIssueSyncLicenses } from "@/lib/publisher";

export type LicenseEntryInput = {
  client: string;
  usedFor: string;
  territory: string;
  media: string;
  duration: string;
  branding: string;
  notes?: string | null;
  licensedAt: string;
  perpetuity?: string | null;
  expiresAt?: string | null;
};

type NormalizedEntry = LicenseEntryInput & { scope: string };

function normalizeEntryInput(input: LicenseEntryInput): NormalizedEntry | { error: string } {
  const client = String(input.client || "").trim();
  const usedFor = String(input.usedFor || "").trim();
  const licensedAt = String(input.licensedAt || "").trim();
  if (!client) return { error: "Client is required" };
  if (!usedFor) return { error: "Used for is required" };
  if (!licensedAt) return { error: "Start date is required" };

  const scopeFields = normalizeLicenseScopeInput(input);
  if ("error" in scopeFields) return scopeFields;

  let perpetuity = String(input.perpetuity || "").trim();
  if (!perpetuity) {
    perpetuity = perpetuityFromDuration(scopeFields.duration) || "";
  }
  const expiresAt =
    perpetuity === "No" ? String(input.expiresAt || "").trim() || null : null;

  if (perpetuity === "No" && !expiresAt) {
    return { error: "End date is required when perpetuity is No" };
  }
  if (perpetuity === "No" && expiresAt && /^\d{4}-\d{2}-\d{2}$/.test(licensedAt) && /^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) {
    if (expiresAt < licensedAt) {
      return { error: "End date must be on or after start date" };
    }
  }

  return {
    client,
    usedFor,
    ...scopeFields,
    scope: formatLicenseScopeSummary(scopeFields),
    notes: String(input.notes || "").trim() || null,
    licensedAt,
    perpetuity: perpetuity || null,
    expiresAt,
  };
}

/** If track is Clear, promote to Library after logging a deal. */
export function promoteTrackToLibraryIfClear(trackId: string) {
  const track = db.select().from(tracks).where(eq(tracks.id, trackId)).get();
  if (!track) return;
  if (normalizeLicenseStatus(track.license) !== "clear") return;
  const now = new Date().toISOString();
  db.update(tracks)
    .set({ license: canonicalizeLicense("Library"), updatedAt: now })
    .where(eq(tracks.id, trackId))
    .run();
}

export function listLicenseEntriesForTrack(
  trackId: string,
  opts?: { trashed?: boolean },
): TrackLicenseEntry[] {
  const trashClause = opts?.trashed
    ? isNotNull(trackLicenseEntries.trashedAt)
    : isNull(trackLicenseEntries.trashedAt);
  return db
    .select()
    .from(trackLicenseEntries)
    .where(and(eq(trackLicenseEntries.trackId, trackId), trashClause))
    .orderBy(
      desc(opts?.trashed ? trackLicenseEntries.trashedAt : trackLicenseEntries.licensedAt),
      desc(trackLicenseEntries.createdAt),
    )
    .all();
}

export function getLicenseEntryById(entryId: string): TrackLicenseEntry | undefined {
  return db.select().from(trackLicenseEntries).where(eq(trackLicenseEntries.id, entryId)).get();
}

/** Counts of active (non-trashed) license entries keyed by track id (for catalog icons). */
export function getLicenseEntryCounts(trackIds: string[]): Record<string, number> {
  if (!trackIds.length) return {};
  const rows = db
    .select({
      trackId: trackLicenseEntries.trackId,
      value: sql<number>`count(*)`.mapWith(Number),
    })
    .from(trackLicenseEntries)
    .where(
      and(inArray(trackLicenseEntries.trackId, trackIds), isNull(trackLicenseEntries.trashedAt)),
    )
    .groupBy(trackLicenseEntries.trackId)
    .all();
  const out: Record<string, number> = {};
  for (const row of rows) out[row.trackId] = row.value;
  return out;
}

export function createLicenseEntry(
  trackId: string,
  input: LicenseEntryInput,
): { ok: true; entry: TrackLicenseEntry } | { ok: false; error: string } {
  const track = db.select().from(tracks).where(eq(tracks.id, trackId)).get();
  if (!track) return { ok: false, error: "Track not found" };

  const existingCount = listLicenseEntriesForTrack(trackId).length;
  if (!canIssueSyncLicenses(track, undefined, { existingCount })) {
    const status = normalizeLicenseStatus(track.license);
    if (status === "exclusive" && existingCount >= 1) {
      return { ok: false, error: "Exclusive tracks allow only one license" };
    }
    if (status === "clear") {
      return {
        ok: false,
        error: "Clear tracks have no licenses — set status to Library or Exclusive first",
      };
    }
    if (status === "hold") {
      return { ok: false, error: "On Hold tracks can’t log new sync deals" };
    }
    if (status === "personal") {
      return { ok: false, error: "Personal tracks are private and can’t log sync deals" };
    }
    return {
      ok: false,
      error:
        "Sync deals only for house-published Library or Exclusive tracks — check Publisher matches Admin house name",
    };
  }

  const normalized = normalizeEntryInput(input);
  if ("error" in normalized) return { ok: false, error: normalized.error };

  const now = new Date().toISOString();
  const payload: NewTrackLicenseEntry = {
    id: randomUUID(),
    trackId,
    client: normalized.client,
    usedFor: normalized.usedFor,
    scope: normalized.scope,
    territory: normalized.territory,
    media: normalized.media,
    duration: normalized.duration,
    branding: normalized.branding,
    notes: normalized.notes,
    licensedAt: normalized.licensedAt,
    perpetuity: normalized.perpetuity,
    expiresAt: normalized.expiresAt,
    createdAt: now,
    updatedAt: now,
  };

  db.insert(trackLicenseEntries).values(payload).run();
  // Clear→Library promote kept for legacy callers; Clear can no longer create entries.

  const entry = getLicenseEntryById(payload.id)!;
  return { ok: true, entry };
}

/** Fields formerly stored on the track row (pre license-history). */
export type LegacyTrackLicenseFields = {
  client?: string | null;
  project?: string | null;
  licenseDetail?: string | null;
  perpetuity?: string | null;
  licenseExpires?: string | null;
  /** ISO or display date — falls back to today. */
  licensedAt?: string | null;
  /** Track status label for default used-for text. */
  licenseLabel?: string | null;
};

/**
 * Create a license history entry from legacy track fields / import settings.
 * Scope (territory/media/…) may be empty — staff can flesh out later.
 * Does not change Exclusive/Hold status (only promotes Clear → Library when asked).
 */
export function createLegacyLicenseEntry(
  trackId: string,
  fields: LegacyTrackLicenseFields,
  opts?: { id?: string; promoteIfClear?: boolean },
): { ok: true; entry: TrackLicenseEntry } | { ok: false; error: string } {
  const track = db.select().from(tracks).where(eq(tracks.id, trackId)).get();
  if (!track) return { ok: false, error: "Track not found" };

  const client = String(fields.client || "").trim() || "Unknown";
  const project = String(fields.project || "").trim();
  const detail = String(fields.licenseDetail || "").trim();
  const statusHint = String(fields.licenseLabel || track.license || "license").trim();
  const usedFor =
    project ||
    detail ||
    (normalizeLicenseStatus(statusHint) === "exclusive"
      ? "Prior exclusive license"
      : normalizeLicenseStatus(statusHint) === "hold"
        ? "Prior hold / license"
        : "Prior library license");
  const notes = project && detail ? detail : null;

  const perpetuity = String(fields.perpetuity || "").trim() || null;
  const expiresAt =
    perpetuity === "No"
      ? String(fields.licenseExpires || "").trim() || null
      : String(fields.licenseExpires || "").trim() || null;

  let licensedAt = String(fields.licensedAt || "").trim();
  if (!licensedAt) {
    licensedAt = new Date().toISOString().slice(0, 10);
  } else if (licensedAt.length > 10) {
    licensedAt = licensedAt.slice(0, 10);
  }

  const now = new Date().toISOString();
  const payload: NewTrackLicenseEntry = {
    id: opts?.id || randomUUID(),
    trackId,
    client,
    usedFor,
    scope: "",
    territory: "",
    media: "",
    duration: "",
    branding: "",
    notes,
    licensedAt,
    perpetuity,
    expiresAt,
    createdAt: now,
    updatedAt: now,
  };

  db.insert(trackLicenseEntries).values(payload).run();
  if (opts?.promoteIfClear !== false) {
    promoteTrackToLibraryIfClear(trackId);
  }

  const entry = getLicenseEntryById(payload.id)!;
  return { ok: true, entry };
}

/** True when Library / Exclusive / Hold import should log a history entry. */
export function shouldCreateLicenseEntryForStatus(
  license: string | null | undefined,
): boolean {
  const status = normalizeLicenseStatus(license);
  return status === "library" || status === "exclusive" || status === "hold";
}


export function updateLicenseEntry(
  entryId: string,
  input: Partial<LicenseEntryInput>,
): { ok: true; entry: TrackLicenseEntry } | { ok: false; error: string } {
  const existing = getLicenseEntryById(entryId);
  if (!existing) return { ok: false, error: "License entry not found" };

  const merged = normalizeEntryInput({
    client: input.client ?? existing.client,
    usedFor: input.usedFor ?? existing.usedFor,
    territory: input.territory ?? existing.territory,
    media: input.media ?? existing.media,
    duration: input.duration ?? existing.duration,
    branding: input.branding ?? existing.branding,
    notes: input.notes !== undefined ? input.notes : existing.notes,
    licensedAt: input.licensedAt ?? existing.licensedAt,
    perpetuity: input.perpetuity !== undefined ? input.perpetuity : existing.perpetuity,
    expiresAt: input.expiresAt !== undefined ? input.expiresAt : existing.expiresAt,
  });
  if ("error" in merged) return { ok: false, error: merged.error };

  const now = new Date().toISOString();
  db.update(trackLicenseEntries)
    .set({
      client: merged.client,
      usedFor: merged.usedFor,
      scope: merged.scope,
      territory: merged.territory,
      media: merged.media,
      duration: merged.duration,
      branding: merged.branding,
      notes: merged.notes,
      licensedAt: merged.licensedAt,
      perpetuity: merged.perpetuity,
      expiresAt: merged.expiresAt,
      updatedAt: now,
    })
    .where(eq(trackLicenseEntries.id, entryId))
    .run();

  return { ok: true, entry: getLicenseEntryById(entryId)! };
}

export function trashLicenseEntry(
  entryId: string,
): { ok: true; entry: TrackLicenseEntry } | { ok: false; error: string } {
  const existing = getLicenseEntryById(entryId);
  if (!existing) return { ok: false, error: "License entry not found" };
  if (existing.trashedAt) return { ok: true, entry: existing };

  const now = new Date().toISOString();
  db.update(trackLicenseEntries)
    .set({ trashedAt: now, updatedAt: now })
    .where(eq(trackLicenseEntries.id, entryId))
    .run();

  return { ok: true, entry: getLicenseEntryById(entryId)! };
}

export function restoreLicenseEntry(
  entryId: string,
): { ok: true; entry: TrackLicenseEntry } | { ok: false; error: string } {
  const existing = getLicenseEntryById(entryId);
  if (!existing) return { ok: false, error: "License entry not found" };
  if (!existing.trashedAt) return { ok: true, entry: existing };

  const now = new Date().toISOString();
  db.update(trackLicenseEntries)
    .set({ trashedAt: null, updatedAt: now })
    .where(eq(trackLicenseEntries.id, entryId))
    .run();

  return { ok: true, entry: getLicenseEntryById(entryId)! };
}

export function permanentlyDeleteLicenseEntry(
  entryId: string,
): { ok: true } | { ok: false; error: string } {
  const existing = getLicenseEntryById(entryId);
  if (!existing) return { ok: false, error: "License entry not found" };
  if (!existing.trashedAt) {
    return { ok: false, error: "Move to Trash before permanently deleting" };
  }
  db.delete(trackLicenseEntries).where(eq(trackLicenseEntries.id, entryId)).run();
  return { ok: true };
}

/** Soft-delete alias. */
export function deleteLicenseEntry(
  entryId: string,
): { ok: true; entry?: TrackLicenseEntry } | { ok: false; error: string } {
  return trashLicenseEntry(entryId);
}

export function serializeLicenseEntry(entry: TrackLicenseEntry) {
  const scopeFields: LicenseScopeFields = {
    territory: entry.territory || "",
    media: entry.media || "",
    duration: entry.duration || "",
    branding: entry.branding || "",
  };
  return {
    id: entry.id,
    trackId: entry.trackId,
    client: entry.client,
    usedFor: entry.usedFor,
    scope: formatLicenseScopeSummary({ ...scopeFields, scope: entry.scope }),
    territory: scopeFields.territory,
    media: scopeFields.media,
    duration: scopeFields.duration,
    branding: scopeFields.branding,
    notes: entry.notes,
    licensedAt: entry.licensedAt,
    perpetuity: entry.perpetuity,
    expiresAt: entry.expiresAt,
    trashedAt: entry.trashedAt ?? null,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}
