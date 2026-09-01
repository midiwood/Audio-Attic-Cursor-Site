import { NextRequest, NextResponse } from "next/server";
import { getCatalogStaffSession } from "@/lib/auth";
import {
  parseComposerAssignments,
  syncTrackComposers,
  validateComposerAssignments,
} from "@/lib/composers";
import {
  createLicenseEntry,
  listLicenseEntriesForTrack,
  type LicenseEntryInput,
} from "@/lib/license-entries";
import { getTrackById, upsertTrack } from "@/lib/queries";
import type { Track } from "@/db/schema";
import {
  canonicalizeLicense,
  licenseFieldVisibility,
  parseYear,
  toDropboxDlUrl,
} from "@/lib/tracks";

export const runtime = "nodejs";

const MAX_BATCH = 200;

type BatchPatch = {
  client?: string;
  project?: string;
  publisher?: string;
  artist?: string;
  composers?: Array<{ composerId?: string; perfShare?: number }>;
  year?: string | number;
  license?: string;
  /** First publication date (ISO or display). */
  date?: string;
  notes?: string;
};

function parseLicenseEntry(raw: unknown): LicenseEntryInput | { error: string } | null {
  if (raw == null) return null;
  if (!raw || typeof raw !== "object") return { error: "Invalid license entry" };
  const row = raw as Record<string, unknown>;
  return {
    client: String(row.client || ""),
    usedFor: String(row.usedFor || ""),
    territory: String(row.territory || ""),
    media: String(row.media || ""),
    duration: String(row.duration || ""),
    branding: String(row.branding || ""),
    notes: row.notes != null ? String(row.notes) : null,
    licensedAt: String(row.licensedAt || ""),
    perpetuity: row.perpetuity != null ? String(row.perpetuity) : null,
    expiresAt: row.expiresAt != null ? String(row.expiresAt) : null,
  };
}

function patchHasValues(patch: BatchPatch | undefined): boolean {
  if (!patch) return false;
  return (
    Boolean(String(patch.client || "").trim()) ||
    Boolean(String(patch.project || "").trim()) ||
    Boolean(patch.publisher?.trim()) ||
    Boolean(patch.artist?.trim()) ||
    Boolean(patch.composers?.length) ||
    Boolean(String(patch.year ?? "").trim()) ||
    Boolean(patch.license?.trim()) ||
    Boolean(patch.date?.trim()) ||
    Boolean(String(patch.notes || "").trim())
  );
}

function wantsLicenseEntry(entry: LicenseEntryInput | null): boolean {
  if (!entry) return false;
  return Boolean(entry.client.trim() || entry.usedFor.trim());
}

function applyPatch(existing: Track, patch: BatchPatch): Track {
  const license = patch.license?.trim()
    ? canonicalizeLicense(patch.license)
    : canonicalizeLicense(existing.license);
  const fields = licenseFieldVisibility(license);

  return upsertTrack({
    id: existing.id,
    date: patch.date?.trim() ? patch.date.trim() : existing.date,
    dropboxLink: existing.dropboxLink || "",
    dropboxDl: existing.dropboxDl || toDropboxDlUrl(existing.dropboxLink || ""),
    workingTitle: existing.workingTitle,
    libraryTitle: existing.libraryTitle,
    client: patch.client?.trim() ? patch.client.trim() : existing.client,
    project: patch.project?.trim() ? patch.project.trim() : existing.project,
    description: existing.description,
    notes: patch.notes?.trim() ? patch.notes.trim() : existing.notes,
    year: String(patch.year ?? "").trim()
      ? parseYear(patch.year)
      : existing.year,
    duration: existing.duration,
    bpm: existing.bpm,
    musicalKey: existing.musicalKey,
    artist: patch.artist?.trim() ? patch.artist.trim() : existing.artist,
    publisher: patch.publisher?.trim() ? patch.publisher.trim() : existing.publisher,
    genre: existing.genre,
    mood: existing.mood,
    instruments: existing.instruments,
    attributes: existing.attributes,
    samro: existing.samro,
    license: patch.license?.trim() ? license : existing.license,
    licenseDetail: fields.detail ? existing.licenseDetail : null,
    perpetuity: fields.perpetuity ? existing.perpetuity : null,
    licenseExpires: fields.perpetuity ? existing.licenseExpires : null,
    createdAt: existing.createdAt,
  });
}

export async function POST(req: NextRequest) {
  const staff = await getCatalogStaffSession();
  if (!staff.ok) {
    return NextResponse.json(
      { error: staff.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: staff.status },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const rawIds = Array.isArray(body.trackIds) ? body.trackIds : [];
  const trackIds = [
    ...new Set(
      rawIds.map((id: unknown) => String(id || "").trim()).filter(Boolean),
    ),
  ] as string[];
  if (!trackIds.length) {
    return NextResponse.json({ error: "Provide at least one track id" }, { status: 400 });
  }
  if (trackIds.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `Max ${MAX_BATCH} tracks per batch update` },
      { status: 400 },
    );
  }

  const patch = (body.patch || {}) as BatchPatch;
  const parsedEntry = parseLicenseEntry(body.licenseEntry);

  if (!patchHasValues(patch) && !wantsLicenseEntry(parsedEntry && !("error" in parsedEntry) ? parsedEntry : null)) {
    return NextResponse.json(
      { error: "Provide at least one field to update or a license entry" },
      { status: 400 },
    );
  }

  if (parsedEntry && "error" in parsedEntry) {
    return NextResponse.json({ error: parsedEntry.error }, { status: 400 });
  }

  const licenseEntry =
    parsedEntry && !("error" in parsedEntry) && wantsLicenseEntry(parsedEntry)
      ? parsedEntry
      : null;

  const composerAssignments = parseComposerAssignments(patch.composers);
  if (composerAssignments && composerAssignments.length) {
    const validated = validateComposerAssignments(composerAssignments);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }
  }

  const results: Array<{ trackId: string; ok: boolean; error?: string }> = [];
  let updated = 0;
  let failed = 0;

  for (const trackId of trackIds) {
    let existing = getTrackById(trackId);
    if (!existing) {
      results.push({ trackId, ok: false, error: "Track not found" });
      failed += 1;
      continue;
    }

    let trackError: string | undefined;

    if (patchHasValues(patch)) {
      existing = applyPatch(existing, patch);
    }

    if (composerAssignments && composerAssignments.length) {
      const sync = syncTrackComposers(trackId, composerAssignments);
      if (!sync.ok) {
        trackError = sync.error;
      } else {
        existing = getTrackById(trackId)!;
      }
    }

    if (licenseEntry) {
      const entryResult = createLicenseEntry(trackId, licenseEntry);
      if (!entryResult.ok) {
        trackError = entryResult.error;
      }
    }

    if (trackError) {
      results.push({ trackId, ok: false, error: trackError });
      failed += 1;
    } else {
      results.push({ trackId, ok: true });
      updated += 1;
    }
  }

  return NextResponse.json({
    updated,
    failed,
    results,
    licenseEntryCounts: Object.fromEntries(
      trackIds.map((id) => [id, listLicenseEntriesForTrack(id).length]),
    ),
  });
}
