import { randomUUID } from "crypto";
import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  capassoSubmissionTracks,
  capassoSubmissions,
  tracks,
  type CapassoSubmission,
} from "@/db/schema";
import { attachSamroComposerSlots } from "@/lib/composers";
import { getTracksByIds } from "@/lib/queries";
import {
  assessCapassoReadiness,
  isCapassoEligibleLicense,
  isCapassoSubmitted,
  isHousePublisher,
  type CapassoProProfile,
  type CapassoReadiness,
} from "@/lib/capasso";
import { getSamroProProfileFromSiteSettings } from "@/lib/publisher";
import { toTrackListItem, type TrackListItem } from "@/lib/track-list-item";

export type CapassoSubmissionTrackDetail = {
  trackId: string;
  title: string;
  subtitle: string | null;
  project: string | null;
  publisher: string;
  artist: string;
  publisherShare: number | null;
  writerCount: number;
};

export type CapassoSubmissionListItem = CapassoSubmission & {
  trackCount: number;
  trackIds: string[];
  tracks: CapassoSubmissionTrackDetail[];
};

function parseTrackSnapshot(
  trackId: string,
  snapshotJson: string | null,
): CapassoSubmissionTrackDetail {
  let parsed: Record<string, unknown> = {};
  if (snapshotJson) {
    try {
      parsed = JSON.parse(snapshotJson) as Record<string, unknown>;
    } catch {
      parsed = {};
    }
  }
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const writers = Array.isArray(parsed.writers) ? parsed.writers : [];
  const shareRaw = parsed.publisherShare;
  const publisherShare =
    typeof shareRaw === "number" && Number.isFinite(shareRaw) ? shareRaw : null;
  return {
    trackId,
    title: str(parsed.title) || trackId,
    subtitle: str(parsed.subtitle) || null,
    project: str(parsed.project) || null,
    publisher: str(parsed.publisher),
    artist: str(parsed.artist),
    publisherShare,
    writerCount: writers.length,
  };
}

function withLiveProjectFallback(
  details: CapassoSubmissionTrackDetail[],
): CapassoSubmissionTrackDetail[] {
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

function withComposerSlots(items: TrackListItem[]): TrackListItem[] {
  return attachSamroComposerSlots(items, getSamroProProfileFromSiteSettings());
}

export function listCapassoSubmissions(opts?: {
  view?: "active" | "trash" | "archived";
  limit?: number;
}): CapassoSubmissionListItem[] {
  const view = opts?.view ?? "active";
  const limit = Math.max(1, Math.min(opts?.limit ?? 50, 200));
  const where =
    view === "trash"
      ? isNotNull(capassoSubmissions.trashedAt)
      : view === "archived"
        ? and(isNull(capassoSubmissions.trashedAt), isNotNull(capassoSubmissions.archivedAt))
        : and(isNull(capassoSubmissions.trashedAt), isNull(capassoSubmissions.archivedAt));
  const orderColumn =
    view === "trash"
      ? capassoSubmissions.trashedAt
      : view === "archived"
        ? capassoSubmissions.archivedAt
        : capassoSubmissions.createdAt;
  const rows = db
    .select()
    .from(capassoSubmissions)
    .where(where)
    .orderBy(desc(orderColumn))
    .limit(limit)
    .all();

  if (!rows.length) return [];

  const links = db
    .select()
    .from(capassoSubmissionTracks)
    .where(
      inArray(
        capassoSubmissionTracks.submissionId,
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
    const detail = withLiveProjectFallback(
      rowLinks.map((l) => parseTrackSnapshot(l.trackId, l.snapshotJson)),
    );
    return {
      ...row,
      trackCount: detail.length,
      trackIds: detail.map((t) => t.trackId),
      tracks: detail,
    };
  });
}

export function getCapassoSubmission(id: string): CapassoSubmissionListItem | null {
  const row = db.select().from(capassoSubmissions).where(eq(capassoSubmissions.id, id)).get();
  if (!row) return null;
  const links = db
    .select()
    .from(capassoSubmissionTracks)
    .where(eq(capassoSubmissionTracks.submissionId, id))
    .all();
  const detail = withLiveProjectFallback(
    links.map((l) => parseTrackSnapshot(l.trackId, l.snapshotJson)),
  );
  return {
    ...row,
    trackCount: detail.length,
    trackIds: detail.map((t) => t.trackId),
    tracks: detail,
  };
}

export type PreparedCapassoTrack = {
  trackId: string;
  readiness: CapassoReadiness;
  project: string | null;
};

export function prepareCapassoTracks(
  trackIds: string[],
  profile: CapassoProProfile,
): { ok: true; publisher: string; tracks: PreparedCapassoTrack[] } | { ok: false; error: string } {
  const uniqueIds = [...new Set(trackIds.map((id) => id.trim()).filter(Boolean))];
  if (!uniqueIds.length) return { ok: false, error: "Select at least one track" };

  const rows = getTracksByIds(uniqueIds);
  if (rows.length !== uniqueIds.length) {
    return { ok: false, error: "One or more tracks were not found" };
  }

  const items = withComposerSlots(rows.map(toTrackListItem));
  const prepared: PreparedCapassoTrack[] = items.map((track) => ({
    trackId: track.id,
    readiness: assessCapassoReadiness(track, profile),
    project: (track.project || "").trim() || null,
  }));

  const notHouse = prepared.filter(
    (p) => !isHousePublisher(p.readiness.publisher, profile.houseName),
  );
  if (notHouse.length) {
    return {
      ok: false,
      error: `Capasso export is limited to tracks that include ${profile.houseName || "the house publisher"} as a publisher`,
    };
  }

  const already = rows.filter((row) => isCapassoSubmitted(row.capasso));
  if (already.length) {
    return {
      ok: false,
      error: `${already.length} selected track(s) already marked Capasso submitted`,
    };
  }

  const wrongLicense = rows.filter((row) => !isCapassoEligibleLicense(row.license));
  if (wrongLicense.length) {
    return {
      ok: false,
      error: "Capasso export excludes Clear and Personal tracks",
    };
  }

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

  return { ok: true, publisher: profile.houseName.trim(), tracks: prepared };
}

export function createCapassoSubmission(input: {
  trackIds: string[];
  profile: CapassoProProfile;
  createdBy: string;
  notes?: string | null;
}): { ok: true; submission: CapassoSubmissionListItem } | { ok: false; error: string } {
  const prepared = prepareCapassoTracks(input.trackIds, input.profile);
  if (!prepared.ok) return prepared;

  const now = new Date().toISOString();
  const id = randomUUID();
  const fileName = `CAPASSO-SWI-${slugPart(prepared.publisher)}-${now.slice(0, 10)}.xlsx`;

  db.insert(capassoSubmissions)
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
    db.insert(capassoSubmissionTracks)
      .values({
        submissionId: id,
        trackId: row.trackId,
        snapshotJson: JSON.stringify({
          title: row.readiness.title,
          subtitle: row.readiness.subtitle,
          project: row.project,
          publisher: row.readiness.publisher,
          publisherShare: row.readiness.publisherShare,
          publisherCount: row.readiness.publisherCount,
          artist: row.readiness.artist,
          writers: row.readiness.writers,
        }),
      })
      .run();
  }

  const submission = getCapassoSubmission(id);
  if (!submission) return { ok: false, error: "Failed to create submission" };
  return { ok: true, submission };
}

export function markCapassoSubmissionExported(id: string) {
  const submission = getCapassoSubmission(id);
  if (!submission) return;
  if (submission.status === "completed" || submission.status === "cancelled") return;
  const now = new Date().toISOString();
  db.update(capassoSubmissions)
    .set({ status: "exported", exportedAt: now, updatedAt: now })
    .where(eq(capassoSubmissions.id, id))
    .run();
}

export function completeCapassoSubmission(
  id: string,
): { ok: true; trackCount: number } | { ok: false; error: string; status?: number } {
  const submission = getCapassoSubmission(id);
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
      .set({ capasso: "Yes", updatedAt: now })
      .where(eq(tracks.id, trackId))
      .run();
  }

  db.update(capassoSubmissions)
    .set({ status: "completed", completedAt: now, updatedAt: now })
    .where(eq(capassoSubmissions.id, id))
    .run();

  return { ok: true, trackCount: submission.trackIds.length };
}

export function cancelCapassoSubmission(
  id: string,
): { ok: true } | { ok: false; error: string; status?: number } {
  const submission = getCapassoSubmission(id);
  if (!submission) return { ok: false, error: "Submission not found", status: 404 };
  if (submission.status === "completed") {
    return { ok: false, error: "Completed submissions cannot be cancelled", status: 400 };
  }
  const now = new Date().toISOString();
  db.update(capassoSubmissions)
    .set({ status: "cancelled", updatedAt: now })
    .where(eq(capassoSubmissions.id, id))
    .run();
  return { ok: true };
}

export function trashCapassoSubmission(
  id: string,
): { ok: true } | { ok: false; error: string; status?: number } {
  const submission = getCapassoSubmission(id);
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
  db.update(capassoSubmissions)
    .set({ trashedAt: now, updatedAt: now })
    .where(eq(capassoSubmissions.id, id))
    .run();
  return { ok: true };
}

export function archiveCapassoSubmission(
  id: string,
): { ok: true } | { ok: false; error: string; status?: number } {
  const submission = getCapassoSubmission(id);
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
  db.update(capassoSubmissions)
    .set({ archivedAt: now, updatedAt: now })
    .where(eq(capassoSubmissions.id, id))
    .run();
  return { ok: true };
}

export function restoreCapassoSubmission(
  id: string,
): { ok: true } | { ok: false; error: string; status?: number } {
  const row = db.select().from(capassoSubmissions).where(eq(capassoSubmissions.id, id)).get();
  if (!row) return { ok: false, error: "Submission not found", status: 404 };
  if (!row.trashedAt) return { ok: true };
  const now = new Date().toISOString();
  db.update(capassoSubmissions)
    .set({ trashedAt: null, updatedAt: now })
    .where(eq(capassoSubmissions.id, id))
    .run();
  return { ok: true };
}

export function unarchiveCapassoSubmission(
  id: string,
): { ok: true } | { ok: false; error: string; status?: number } {
  const row = db.select().from(capassoSubmissions).where(eq(capassoSubmissions.id, id)).get();
  if (!row) return { ok: false, error: "Submission not found", status: 404 };
  if (!row.archivedAt) return { ok: true };
  const now = new Date().toISOString();
  db.update(capassoSubmissions)
    .set({ archivedAt: null, updatedAt: now })
    .where(eq(capassoSubmissions.id, id))
    .run();
  return { ok: true };
}

export function deleteCapassoSubmissionPermanently(
  id: string,
): { ok: true } | { ok: false; error: string; status?: number } {
  const row = db.select().from(capassoSubmissions).where(eq(capassoSubmissions.id, id)).get();
  if (!row) return { ok: false, error: "Submission not found", status: 404 };
  if (!row.trashedAt) {
    return {
      ok: false,
      error: "Only trashed submissions can be deleted permanently",
      status: 400,
    };
  }
  db.delete(capassoSubmissions).where(eq(capassoSubmissions.id, id)).run();
  return { ok: true };
}

function slugPart(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "publisher"
  );
}
