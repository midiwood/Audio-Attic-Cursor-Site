import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { trackAudioAssets, type TrackAudioAsset } from "@/db/schema";

export type TrackAssetKind = "version" | "stem";

export type TrackAssetRecord = TrackAudioAsset;

export function slugFromLabel(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return base || "asset";
}

export function uniqueAssetSlug(
  trackId: string,
  kind: TrackAssetKind,
  label: string,
): string {
  const base = slugFromLabel(label);
  const existing = db
    .select({ slug: trackAudioAssets.slug })
    .from(trackAudioAssets)
    .where(and(eq(trackAudioAssets.trackId, trackId), eq(trackAudioAssets.kind, kind)))
    .all()
    .map((row) => row.slug);

  if (!existing.includes(base)) return base;
  for (let i = 2; i < 100; i++) {
    const candidate = `${base}-${i}`.slice(0, 64);
    if (!existing.includes(candidate)) return candidate;
  }
  return `${base}-${randomUUID().slice(0, 6)}`;
}

function kindSortOrder(kind: string): number {
  return kind === "version" ? 0 : 1;
}

export function listTrackAssets(trackId: string): TrackAssetRecord[] {
  const rows = db
    .select()
    .from(trackAudioAssets)
    .where(eq(trackAudioAssets.trackId, trackId))
    .all();
  return rows.sort((a, b) => {
    const byKind = kindSortOrder(a.kind) - kindSortOrder(b.kind);
    if (byKind !== 0) return byKind;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.label.localeCompare(b.label);
  });
}

export function nextVersionLabel(trackId: string): string {
  const count = listTrackAssets(trackId).filter((row) => row.kind === "version").length;
  return `Version${count + 1}`;
}

export function stemLabelFromFilename(filename: string): string {
  const base = filename
    .replace(/\.[^.]+$/i, "")
    .replace(/[^\w.\- ]+/g, "")
    .trim()
    .replace(/\s+/g, " ");
  return base || `Stem ${randomUUID().slice(0, 6)}`;
}

/** User-entered stem name, or filename fallback — stored without a stem_ prefix. */
export function resolveStemLabel(name: string, filename: string): string {
  const trimmed = name.trim();
  if (!trimmed) return stemLabelFromFilename(filename);
  const base = trimmed
    .replace(/^stem_/i, "")
    .replace(/[^\w.\- ]+/g, "")
    .trim()
    .replace(/\s+/g, " ");
  return base || stemLabelFromFilename(filename);
}

export function getTrackAssetById(assetId: string): TrackAssetRecord | null {
  return (
    db.select().from(trackAudioAssets).where(eq(trackAudioAssets.id, assetId)).get() ?? null
  );
}

export function getTrackAssetForTrack(
  trackId: string,
  assetId: string,
): TrackAssetRecord | null {
  return (
    db
      .select()
      .from(trackAudioAssets)
      .where(and(eq(trackAudioAssets.trackId, trackId), eq(trackAudioAssets.id, assetId)))
      .get() ?? null
  );
}

export function insertTrackAsset(input: {
  trackId: string;
  kind: TrackAssetKind;
  label: string;
  slug: string;
  dropboxLink: string | null;
  dropboxDl: string | null;
  dropboxPath: string;
  duration?: string | null;
  sortOrder?: number;
}): TrackAssetRecord {
  const now = new Date().toISOString();
  const row = {
    id: randomUUID(),
    trackId: input.trackId,
    kind: input.kind,
    label: input.label.trim(),
    slug: input.slug,
    dropboxLink: input.dropboxLink,
    dropboxDl: input.dropboxDl,
    dropboxPath: input.dropboxPath,
    duration: input.duration?.trim() || null,
    sortOrder: input.sortOrder ?? 0,
    createdAt: now,
  };
  db.insert(trackAudioAssets).values(row).run();
  return row;
}

export function deleteTrackAsset(assetId: string): TrackAssetRecord | null {
  const existing = getTrackAssetById(assetId);
  if (!existing) return null;
  db.delete(trackAudioAssets).where(eq(trackAudioAssets.id, assetId)).run();
  return existing;
}

export function isTrackAssetKind(value: string): value is TrackAssetKind {
  return value === "version" || value === "stem";
}
