import { randomUUID } from "crypto";
import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  samroSubmissionTracks,
  samroSubmissions,
  tracks,
  type SamroSubmission,
} from "@/db/schema";
import { attachSamroComposerSlots } from "@/lib/composers";
import { getTracksByIds } from "@/lib/queries";
import {
  assessSamroReadiness,
  type SamroProProfile,
  type SamroReadiness,
} from "@/lib/samro";
import { toTrackListItem } from "@/lib/track-list-item";

export type SamroSubmissionTrackDetail = {
  trackId: string;
  title: string;
  subtitle: string | null;
  project: string | null;
  publisher: string;
  artist: string;
  durationMin: number | null;
  durationSec: number | null;
  firstPublicationDate: string | null;
  genre: string | null;
  instrumentation: string | null;
};

export type SamroSubmissionListItem = SamroSubmission & {
  trackCount: number;
  trackIds: string[];
  tracks: SamroSubmissionTrackDetail[];
};

function parseTrackSnapshot(
  trackId: string,
  snapshotJson: string | null,
): SamroSubmissionTrackDetail {
  let parsed: Record<string, unknown> = {};
  if (snapshotJson) {
    try {
      parsed = JSON.parse(snapshotJson) as Record<string, unknown>;
    } catch {
      parsed = {};
    }
  }
  const numOrNull = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    trackId,
    title: str(parsed.title) || trackId,
    subtitle: str(parsed.subtitle) || null,
    project: str(parsed.project) || null,
    publisher: str(parsed.publisher),
    artist: str(parsed.artist),
    durationMin: numOrNull(parsed.durationMin),
    durationSec: numOrNull(parsed.durationSec),
    firstPublicationDate:
      typeof parsed.firstPublicationDate === "string"
        ? parsed.firstPublicationDate
        : null,
    genre: typeof parsed.genre === "string" ? parsed.genre : null,
    instrumentation:
      typeof parsed.instrumentation === "string" ? parsed.instrumentation : null,
  };
}

function withLiveProjectFallback(
  details: SamroSubmissionTrackDetail[],
): SamroSubmissionTrackDetail[] {
  const missingIds = details.filter((row) => !row.project).map((row) => row.trackId);
  if (!missingIds.length) return details;
  const live = getTracksByIds(missingIds);
  const byId = new Map(
    live.map((track) => [track.id, (track.project || "").trim() || null]),
  );
  return details.map((row) =>
    row.project ? row : { ...row, project: byId.get(row.trackId) ?? null },
  );
}

export function listSamroSubmissions(opts?: {
  /** @deprecated use `view` */
  trashed?: boolean;
  view?: "active" | "trash" | "archived";
  limit?: number;
}): SamroSubmissionListItem[] {
  const view = opts?.view ?? (opts?.trashed ? "trash" : "active");
  const limit = Math.max(1, Math.min(opts?.limit ?? 50, 200));
  const where =
    view === "trash"
      ? isNotNull(samroSubmissions.trashedAt)
      : view === "archived"
        ? and(isNull(samroSubmissions.trashedAt), isNotNull(samroSubmissions.archivedAt))
        : and(isNull(samroSubmissions.trashedAt), isNull(samroSubmissions.archivedAt));
  const orderColumn =
    view === "trash"
      ? samroSubmissions.trashedAt
      : view === "archived"
        ? samroSubmissions.archivedAt
        : samroSubmissions.createdAt;
  const rows = db
    .select()
    .from(samroSubmissions)
    .where(where)
    .orderBy(desc(orderColumn))
    .limit(limit)
    .all();

  if (!rows.length) return [];

  const links = db
    .select()
    .from(samroSubmissionTracks)
    .where(
      inArray(
        samroSubmissionTracks.submissionId,
        rows.map((r) => r.id),
      ),
    )
    .all();

  const bySub = new Map<string, typeof links>();
  for (const link of links) {
    const list = bySub.get(link.submissionId) || [];
    list.push(link);
    bySub.set(link.submissionId, list);
  }

  return rows.map((row) => {
    const rowLinks = bySub.get(row.id) || [];
    const tracks = withLiveProjectFallback(
      rowLinks.map((l) => parseTrackSnapshot(l.trackId, l.snapshotJson)),
    );
    return {
      ...row,
      trackCount: tracks.length,
      trackIds: tracks.map((t) => t.trackId),
      tracks,
    };
  });
}

export function getSamroSubmission(id: string): SamroSubmissionListItem | null {
  const row = db.select().from(samroSubmissions).where(eq(samroSubmissions.id, id)).get();
  if (!row) return null;
  const links = db
    .select()
    .from(samroSubmissionTracks)
    .where(eq(samroSubmissionTracks.submissionId, id))
    .all();
  const tracks = withLiveProjectFallback(
    links.map((l) => parseTrackSnapshot(l.trackId, l.snapshotJson)),
  );
  return {
    ...row,
    trackCount: tracks.length,
    trackIds: tracks.map((t) => t.trackId),
    tracks,
  };
}

export type PreparedSamroTrack = {
  trackId: string;
  readiness: SamroReadiness;
  project: string | null;
};

export function prepareSamroTracks(
  trackIds: string[],
  profile: SamroProProfile,
): { ok: true; publisher: string; tracks: PreparedSamroTrack[] } | { ok: false; error: string } {
  const uniqueIds = [...new Set(trackIds.map((id) => id.trim()).filter(Boolean))];
  if (!uniqueIds.length) return { ok: false, error: "Select at least one track" };

  const rows = getTracksByIds(uniqueIds);
  if (rows.length !== uniqueIds.length) {
    return { ok: false, error: "One or more tracks were not found" };
  }

  const items = attachSamroComposerSlots(rows.map(toTrackListItem), profile);
  const prepared: PreparedSamroTrack[] = items.map((track) => ({
    trackId: track.id,
    readiness: assessSamroReadiness(track, profile),
    project: (track.project || "").trim() || null,
  }));

  const incomplete = prepared.filter((p) => !p.readiness.ready);
  if (incomplete.length) {
    const detail = incomplete
      .slice(0, 5)
      .map((p) => `${p.trackId}: ${p.readiness.missing.join(", ")}`)
      .join("; ");
    return {
      ok: false,
      error: `${incomplete.length} track(s) incomplete — ${detail}`,
    };
  }

  const publishers = [...new Set(prepared.map((p) => p.readiness.publisher))];
  if (publishers.length !== 1) {
    return {
      ok: false,
      error: `One publisher per form — selection has: ${publishers.join(", ") || "(none)"}`,
    };
  }

  return { ok: true, publisher: publishers[0], tracks: prepared };
}

export function createSamroSubmission(input: {
  trackIds: string[];
  profile: SamroProProfile;
  createdBy: string;
  notes?: string | null;
}): { ok: true; submission: SamroSubmissionListItem } | { ok: false; error: string } {
  const prepared = prepareSamroTracks(input.trackIds, input.profile);
  if (!prepared.ok) return prepared;

  const now = new Date().toISOString();
  const id = randomUUID();
  const fileName = `SAMRO-NOW-${slugPart(prepared.publisher)}-${now.slice(0, 10)}.xlsx`;

  db.insert(samroSubmissions)
    .values({
      id,
      publisherName: prepared.publisher,
      status: "draft",
      createdBy: input.createdBy,
      fileName,
      notes: input.notes?.trim() || null,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  for (const row of prepared.tracks) {
    db.insert(samroSubmissionTracks)
      .values({
        submissionId: id,
        trackId: row.trackId,
        snapshotJson: JSON.stringify({
          title: row.readiness.title,
          subtitle: row.readiness.subtitle,
          project: row.project,
          publisher: row.readiness.publisher,
          artist: row.readiness.artist,
          composers: row.readiness.composers,
          composerSlots: row.readiness.composerSlots,
          durationMin: row.readiness.durationMin,
          durationSec: row.readiness.durationSec,
          firstPublicationDate: row.readiness.firstPublicationDate,
          genre: row.readiness.genre,
          instrumentation: row.readiness.instrumentation,
        }),
      })
      .run();
  }

  const submission = getSamroSubmission(id);
  if (!submission) return { ok: false, error: "Failed to create submission" };
  return { ok: true, submission };
}

export function markSamroSubmissionExported(id: string) {
  const submission = getSamroSubmission(id);
  if (!submission) return;
  // Don't regress completed/cancelled forms when re-downloading.
  if (submission.status === "completed" || submission.status === "cancelled") return;
  const now = new Date().toISOString();
  db.update(samroSubmissions)
    .set({ status: "exported", exportedAt: now, updatedAt: now })
    .where(eq(samroSubmissions.id, id))
    .run();
}

export function completeSamroSubmission(
  id: string,
): { ok: true; trackCount: number } | { ok: false; error: string; status?: number } {
  const submission = getSamroSubmission(id);
  if (!submission) return { ok: false, error: "Submission not found", status: 404 };
  if (submission.status === "cancelled") {
    return { ok: false, error: "Cancelled submission cannot be completed", status: 400 };
  }
  if (submission.status === "completed") {
    return { ok: true, trackCount: submission.trackIds.length };
  }

  const now = new Date().toISOString();
  for (const trackId of submission.trackIds) {
    db.update(tracks)
      .set({ samro: "Yes", updatedAt: now })
      .where(eq(tracks.id, trackId))
      .run();
  }

  db.update(samroSubmissions)
    .set({ status: "completed", completedAt: now, updatedAt: now })
    .where(eq(samroSubmissions.id, id))
    .run();

  return { ok: true, trackCount: submission.trackIds.length };
}

export function cancelSamroSubmission(
  id: string,
): { ok: true } | { ok: false; error: string; status?: number } {
  const submission = getSamroSubmission(id);
  if (!submission) return { ok: false, error: "Submission not found", status: 404 };
  if (submission.status === "completed") {
    return { ok: false, error: "Completed submissions cannot be cancelled", status: 400 };
  }
  const now = new Date().toISOString();
  db.update(samroSubmissions)
    .set({ status: "cancelled", updatedAt: now })
    .where(eq(samroSubmissions.id, id))
    .run();
  return { ok: true };
}

export function trashSamroSubmission(
  id: string,
): { ok: true } | { ok: false; error: string; status?: number } {
  const submission = getSamroSubmission(id);
  if (!submission) return { ok: false, error: "Submission not found", status: 404 };
  if (submission.status === "completed") {
    return {
      ok: false,
      error: "Completed submissions cannot be trashed — archive instead",
      status: 400,
    };
  }
  if (submission.trashedAt) return { ok: true };
  const now = new Date().toISOString();
  db.update(samroSubmissions)
    .set({ trashedAt: now, updatedAt: now })
    .where(eq(samroSubmissions.id, id))
    .run();
  return { ok: true };
}

export function archiveSamroSubmission(
  id: string,
): { ok: true } | { ok: false; error: string; status?: number } {
  const submission = getSamroSubmission(id);
  if (!submission) return { ok: false, error: "Submission not found", status: 404 };
  if (submission.status !== "completed") {
    return {
      ok: false,
      error: "Only completed submissions can be archived",
      status: 400,
    };
  }
  if (submission.archivedAt) return { ok: true };
  const now = new Date().toISOString();
  db.update(samroSubmissions)
    .set({ archivedAt: now, updatedAt: now })
    .where(eq(samroSubmissions.id, id))
    .run();
  return { ok: true };
}

export function restoreSamroSubmission(
  id: string,
): { ok: true } | { ok: false; error: string; status?: number } {
  const row = db.select().from(samroSubmissions).where(eq(samroSubmissions.id, id)).get();
  if (!row) return { ok: false, error: "Submission not found", status: 404 };
  if (!row.trashedAt) return { ok: true };
  const now = new Date().toISOString();
  db.update(samroSubmissions)
    .set({ trashedAt: null, updatedAt: now })
    .where(eq(samroSubmissions.id, id))
    .run();
  return { ok: true };
}

export function unarchiveSamroSubmission(
  id: string,
): { ok: true } | { ok: false; error: string; status?: number } {
  const row = db.select().from(samroSubmissions).where(eq(samroSubmissions.id, id)).get();
  if (!row) return { ok: false, error: "Submission not found", status: 404 };
  if (!row.archivedAt) return { ok: true };
  const now = new Date().toISOString();
  db.update(samroSubmissions)
    .set({ archivedAt: null, updatedAt: now })
    .where(eq(samroSubmissions.id, id))
    .run();
  return { ok: true };
}

export function deleteSamroSubmissionPermanently(
  id: string,
): { ok: true } | { ok: false; error: string; status?: number } {
  const row = db.select().from(samroSubmissions).where(eq(samroSubmissions.id, id)).get();
  if (!row) return { ok: false, error: "Submission not found", status: 404 };
  if (!row.trashedAt) {
    return {
      ok: false,
      error: "Only trashed submissions can be deleted permanently",
      status: 400,
    };
  }
  db.delete(samroSubmissions).where(eq(samroSubmissions.id, id)).run();
  return { ok: true };
}

function slugPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "publisher";
}
