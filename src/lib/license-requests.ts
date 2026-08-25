import { randomUUID } from "crypto";
import { and, count, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { licenseRequests, tracks, type LicenseRequest } from "@/db/schema";
import {
  formatLicenseScopeSummary,
  normalizeLicenseScopeInput,
  type LicenseScopeFields,
} from "@/lib/license-scope";
import { formatDisplayTitle } from "@/lib/tracks";
import { isSubscriberVisible } from "@/lib/publisher";

export const LICENSE_REQUEST_STATUSES = ["pending", "accepted", "declined", "archived"] as const;
export type LicenseRequestStatus = (typeof LICENSE_REQUEST_STATUSES)[number];

export function isLicenseRequestStatus(value: string): value is LicenseRequestStatus {
  return (LICENSE_REQUEST_STATUSES as readonly string[]).includes(value);
}

export function countPendingLicenseRequests(): number {
  const row = db
    .select({ value: count() })
    .from(licenseRequests)
    .where(and(eq(licenseRequests.status, "pending"), isNull(licenseRequests.trashedAt)))
    .get();
  return Number(row?.value ?? 0);
}

/** Accepted licenses the subscriber hasn’t opened on /licenses yet. */
export function countUnseenAcceptedLicenseRequests(userId: string): number {
  const row = db
    .select({ value: count() })
    .from(licenseRequests)
    .where(
      and(
        eq(licenseRequests.userId, userId),
        eq(licenseRequests.status, "accepted"),
        isNull(licenseRequests.trashedAt),
        isNull(licenseRequests.subscriberSeenAt),
      ),
    )
    .get();
  return Number(row?.value ?? 0);
}

/** Clear accepted-license nav alert when the subscriber visits Licenses. */
export function markAcceptedLicenseRequestsSeen(userId: string): number {
  const now = new Date().toISOString();
  const result = db
    .update(licenseRequests)
    .set({ subscriberSeenAt: now, updatedAt: now })
    .where(
      and(
        eq(licenseRequests.userId, userId),
        eq(licenseRequests.status, "accepted"),
        isNull(licenseRequests.trashedAt),
        isNull(licenseRequests.subscriberSeenAt),
      ),
    )
    .run();
  return result.changes;
}

export function getLicenseRequestById(id: string): LicenseRequest | undefined {
  return db.select().from(licenseRequests).where(eq(licenseRequests.id, id)).get();
}

export type LicenseRequestListItem = {
  id: string;
  trackId: string;
  trackTitle: string;
  userId: string;
  userName: string;
  userEmail: string;
  scope: string;
  territory: string;
  media: string;
  duration: string;
  branding: string;
  intendedUse: string;
  message: string | null;
  status: string;
  trashedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function toListItem(
  row: LicenseRequest,
  trackTitle: string,
  userName: string,
  userEmail: string,
): LicenseRequestListItem {
  const scopeFields: LicenseScopeFields = {
    territory: row.territory || "",
    media: row.media || "",
    duration: row.duration || "",
    branding: row.branding || "",
  };
  return {
    id: row.id,
    trackId: row.trackId,
    trackTitle,
    userId: row.userId,
    userName,
    userEmail,
    scope: formatLicenseScopeSummary({ ...scopeFields, scope: row.scope }),
    territory: scopeFields.territory,
    media: scopeFields.media,
    duration: scopeFields.duration,
    branding: scopeFields.branding,
    intendedUse: row.intendedUse,
    message: row.message,
    status: row.status,
    trashedAt: row.trashedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function hydrateListItems(rows: LicenseRequest[]): LicenseRequestListItem[] {
  if (!rows.length) return [];
  const trackIds = [...new Set(rows.map((r) => r.trackId))];
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const trackRows = db.select().from(tracks).where(inArray(tracks.id, trackIds)).all();
  const userRows = db.select().from(user).where(inArray(user.id, userIds)).all();
  const trackMap = new Map(trackRows.map((t) => [t.id, t]));
  const userMap = new Map(userRows.map((u) => [u.id, u]));

  return rows.map((row) => {
    const t = trackMap.get(row.trackId);
    const u = userMap.get(row.userId);
    return toListItem(
      row,
      t ? formatDisplayTitle(t) : row.trackId,
      u?.name || "Unknown",
      u?.email || "",
    );
  });
}

export function listLicenseRequests(opts?: {
  status?: LicenseRequestStatus;
  /** When true, only trashed; default active (not trashed). */
  trashed?: boolean;
}): LicenseRequestListItem[] {
  const trashClause = opts?.trashed
    ? isNotNull(licenseRequests.trashedAt)
    : isNull(licenseRequests.trashedAt);

  const rows = opts?.status
    ? db
        .select()
        .from(licenseRequests)
        .where(and(eq(licenseRequests.status, opts.status), trashClause))
        .orderBy(desc(opts.trashed ? licenseRequests.trashedAt : licenseRequests.createdAt))
        .all()
    : db
        .select()
        .from(licenseRequests)
        .where(trashClause)
        .orderBy(desc(opts?.trashed ? licenseRequests.trashedAt : licenseRequests.createdAt))
        .all();

  return hydrateListItems(rows);
}

export function countTrashedLicenseRequests(): number {
  const row = db
    .select({ value: count() })
    .from(licenseRequests)
    .where(isNotNull(licenseRequests.trashedAt))
    .get();
  return Number(row?.value ?? 0);
}

export function createLicenseRequest(opts: {
  trackId: string;
  userId: string;
  territory: string;
  media: string;
  duration: string;
  branding: string;
  intendedUse: string;
  message?: string | null;
}): { ok: true; request: LicenseRequest } | { ok: false; error: string; status?: number } {
  const track = db.select().from(tracks).where(eq(tracks.id, opts.trackId)).get();
  if (!track || track.trashedAt) {
    return { ok: false, error: "Track not found", status: 404 };
  }
  if (!isSubscriberVisible(track)) {
    return { ok: false, error: "This track is not available for licensing", status: 400 };
  }

  const scopeFields = normalizeLicenseScopeInput(opts);
  if ("error" in scopeFields) return { ok: false, error: scopeFields.error, status: 400 };

  const intendedUse = String(opts.intendedUse || "").trim();
  if (!intendedUse) return { ok: false, error: "Project is required", status: 400 };

  const existing = db
    .select()
    .from(licenseRequests)
    .where(
      and(
        eq(licenseRequests.trackId, opts.trackId),
        eq(licenseRequests.userId, opts.userId),
        eq(licenseRequests.status, "pending"),
        isNull(licenseRequests.trashedAt),
      ),
    )
    .get();
  if (existing) {
    return { ok: false, error: "You already have a pending request for this track", status: 409 };
  }

  const now = new Date().toISOString();
  const id = randomUUID();
  db.insert(licenseRequests)
    .values({
      id,
      trackId: opts.trackId,
      userId: opts.userId,
      scope: formatLicenseScopeSummary(scopeFields),
      territory: scopeFields.territory,
      media: scopeFields.media,
      duration: scopeFields.duration,
      branding: scopeFields.branding,
      intendedUse,
      message: String(opts.message || "").trim() || null,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return { ok: true, request: getLicenseRequestById(id)! };
}

export function updateLicenseRequestStatus(
  id: string,
  status: LicenseRequestStatus,
): { ok: true; request: LicenseRequest } | { ok: false; error: string } {
  const existing = getLicenseRequestById(id);
  if (!existing) return { ok: false, error: "Request not found" };

  const now = new Date().toISOString();
  // New acceptances should alert the subscriber until they open Licenses.
  const subscriberSeenAt =
    status === "accepted" && existing.status !== "accepted"
      ? null
      : existing.subscriberSeenAt;

  db.update(licenseRequests)
    .set({ status, subscriberSeenAt, updatedAt: now })
    .where(eq(licenseRequests.id, id))
    .run();

  return { ok: true, request: getLicenseRequestById(id)! };
}

export type LicenseRequestUpdateInput = {
  territory?: string;
  media?: string;
  duration?: string;
  branding?: string;
  intendedUse?: string;
  message?: string | null;
  status?: LicenseRequestStatus;
};

export function updateLicenseRequest(
  id: string,
  input: LicenseRequestUpdateInput,
): { ok: true; request: LicenseRequest } | { ok: false; error: string } {
  const existing = getLicenseRequestById(id);
  if (!existing) return { ok: false, error: "Request not found" };

  const scopeFields = normalizeLicenseScopeInput({
    territory: input.territory ?? existing.territory,
    media: input.media ?? existing.media,
    duration: input.duration ?? existing.duration,
    branding: input.branding ?? existing.branding,
  });
  if ("error" in scopeFields) return { ok: false, error: scopeFields.error };

  const intendedUse = String(
    input.intendedUse !== undefined ? input.intendedUse : existing.intendedUse,
  ).trim();
  if (!intendedUse) return { ok: false, error: "Project is required" };

  const status =
    input.status !== undefined
      ? input.status
      : (existing.status as LicenseRequestStatus);
  if (!isLicenseRequestStatus(status)) return { ok: false, error: "Invalid status" };

  const message =
    input.message !== undefined
      ? String(input.message || "").trim() || null
      : existing.message;

  const subscriberSeenAt =
    status === "accepted" && existing.status !== "accepted"
      ? null
      : existing.subscriberSeenAt;

  const now = new Date().toISOString();
  db.update(licenseRequests)
    .set({
      scope: formatLicenseScopeSummary(scopeFields),
      territory: scopeFields.territory,
      media: scopeFields.media,
      duration: scopeFields.duration,
      branding: scopeFields.branding,
      intendedUse,
      message,
      status,
      subscriberSeenAt,
      updatedAt: now,
    })
    .where(eq(licenseRequests.id, id))
    .run();

  return { ok: true, request: getLicenseRequestById(id)! };
}

/** Soft-delete — move to Trash. */
export function trashLicenseRequest(
  id: string,
): { ok: true; request: LicenseRequest } | { ok: false; error: string } {
  const existing = getLicenseRequestById(id);
  if (!existing) return { ok: false, error: "Request not found" };
  if (existing.trashedAt) return { ok: true, request: existing };

  const now = new Date().toISOString();
  db.update(licenseRequests)
    .set({ trashedAt: now, updatedAt: now })
    .where(eq(licenseRequests.id, id))
    .run();

  return { ok: true, request: getLicenseRequestById(id)! };
}

export function restoreLicenseRequest(
  id: string,
): { ok: true; request: LicenseRequest } | { ok: false; error: string } {
  const existing = getLicenseRequestById(id);
  if (!existing) return { ok: false, error: "Request not found" };
  if (!existing.trashedAt) return { ok: true, request: existing };

  const now = new Date().toISOString();
  db.update(licenseRequests)
    .set({ trashedAt: null, updatedAt: now })
    .where(eq(licenseRequests.id, id))
    .run();

  return { ok: true, request: getLicenseRequestById(id)! };
}

/** Permanently remove a request that is already in Trash. */
export function permanentlyDeleteLicenseRequest(
  id: string,
): { ok: true } | { ok: false; error: string } {
  const existing = getLicenseRequestById(id);
  if (!existing) return { ok: false, error: "Request not found" };
  if (!existing.trashedAt) {
    return { ok: false, error: "Move to Trash before permanently deleting" };
  }
  db.delete(licenseRequests).where(eq(licenseRequests.id, id)).run();
  return { ok: true };
}

/** @deprecated Prefer trashLicenseRequest — kept as alias for soft-delete. */
export function deleteLicenseRequest(
  id: string,
): { ok: true; request?: LicenseRequest } | { ok: false; error: string } {
  return trashLicenseRequest(id);
}

export function listLicenseRequestsForUser(userId: string): Array<
  LicenseRequestListItem & {
    dropboxDl: string | null;
    trackDuration: string | null;
  }
> {
  const rows = db
    .select()
    .from(licenseRequests)
    .where(and(eq(licenseRequests.userId, userId), isNull(licenseRequests.trashedAt)))
    .orderBy(desc(licenseRequests.createdAt))
    .all();

  if (!rows.length) return [];

  const trackIds = [...new Set(rows.map((r) => r.trackId))];
  const trackRows = db.select().from(tracks).where(inArray(tracks.id, trackIds)).all();
  const trackMap = new Map(trackRows.map((t) => [t.id, t]));
  const u = db.select().from(user).where(eq(user.id, userId)).get();

  return rows.map((row) => {
    const t = trackMap.get(row.trackId);
    return {
      ...toListItem(
        row,
        t ? formatDisplayTitle(t) : row.trackId,
        u?.name || "Unknown",
        u?.email || "",
      ),
      dropboxDl: t?.dropboxDl ?? null,
      trackDuration: t?.duration ?? null,
    };
  });
}

export function userHasPendingLicenseRequest(trackId: string, userId: string): boolean {
  return Boolean(
    db
      .select()
      .from(licenseRequests)
      .where(
        and(
          eq(licenseRequests.trackId, trackId),
          eq(licenseRequests.userId, userId),
          eq(licenseRequests.status, "pending"),
          isNull(licenseRequests.trashedAt),
        ),
      )
      .get(),
  );
}

export type UserTrackLicenseStatus = {
  trackId: string;
  requestId: string;
  status: string;
  scope: string;
  territory: string;
  media: string;
  duration: string;
  branding: string;
  intendedUse: string;
  message: string | null;
  createdAt: string;
};

/**
 * Best request per track for this user: accepted > pending > declined > archived.
 * Used for subscriber licensing icon badges / panel.
 */
export function getUserLicenseRequestStatusByTrack(
  userId: string,
  trackIds: string[],
): Record<string, UserTrackLicenseStatus> {
  if (!trackIds.length) return {};
  const rows = db
    .select()
    .from(licenseRequests)
    .where(
      and(
        eq(licenseRequests.userId, userId),
        inArray(licenseRequests.trackId, trackIds),
        isNull(licenseRequests.trashedAt),
      ),
    )
    .orderBy(desc(licenseRequests.createdAt))
    .all();

  const rank: Record<string, number> = {
    accepted: 4,
    pending: 3,
    declined: 2,
    archived: 1,
  };

  const out: Record<string, UserTrackLicenseStatus> = {};
  for (const row of rows) {
    const existing = out[row.trackId];
    const score = rank[row.status] ?? 0;
    const existingScore = existing ? (rank[existing.status] ?? 0) : -1;
    if (existing && existingScore >= score) continue;
    const scopeFields: LicenseScopeFields = {
      territory: row.territory || "",
      media: row.media || "",
      duration: row.duration || "",
      branding: row.branding || "",
    };
    out[row.trackId] = {
      trackId: row.trackId,
      requestId: row.id,
      status: row.status,
      scope: formatLicenseScopeSummary({ ...scopeFields, scope: row.scope }),
      territory: scopeFields.territory,
      media: scopeFields.media,
      duration: scopeFields.duration,
      branding: scopeFields.branding,
      intendedUse: row.intendedUse,
      message: row.message,
      createdAt: row.createdAt,
    };
  }
  return out;
}

export function getLatestLicenseRequestForUserTrack(
  userId: string,
  trackId: string,
): LicenseRequest | undefined {
  return db
    .select()
    .from(licenseRequests)
    .where(
      and(
        eq(licenseRequests.userId, userId),
        eq(licenseRequests.trackId, trackId),
        isNull(licenseRequests.trashedAt),
      ),
    )
    .orderBy(desc(licenseRequests.createdAt))
    .get();
}
