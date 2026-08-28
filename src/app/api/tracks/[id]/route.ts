import { NextRequest, NextResponse } from "next/server";
import { getApiSession, getCatalogStaffSession, isSubscriber } from "@/lib/auth";
import {
  getComposerAssignmentsForTrack,
  parseComposerAssignments,
  syncTrackComposers,
} from "@/lib/composers";
import {
  getTrackById,
  upsertTrack,
} from "@/lib/queries";
import { listRelationsForTrack, setDerivedFromLinks } from "@/lib/track-relation-queries";
import {
  canonicalizeLicense,
  isMp3AudioUrl,
  licenseFieldVisibility,
  mp3OnlyErrorMessage,
  normalizeMusicalKey,
  parseBpm,
  parseYear,
  toDropboxDlUrl,
} from "@/lib/tracks";
import { isSubscriberVisible } from "@/lib/publisher";
import { isTrackRelationType, type DerivedFromLink } from "@/lib/track-relations";
import { constrainToVocabulary } from "@/lib/vocabulary";

export const runtime = "nodejs";

type UpdateBody = {
  workingTitle?: string;
  libraryTitle?: string;
  dropboxLink?: string;
  client?: string;
  project?: string;
  description?: string;
  notes?: string;
  year?: string | number | null;
  duration?: string;
  bpm?: string | number | null;
  musicalKey?: string;
  artist?: string;
  composers?: Array<{ composerId?: string; perfShare?: number }>;
  publisher?: string;
  genre?: string;
  mood?: string;
  instruments?: string;
  attributes?: string;
  samro?: string;
  license?: string;
  licenseDetail?: string;
  perpetuity?: string;
  licenseExpires?: string;
  derivedFrom?: Array<{
    trackId?: string;
    relation?: string;
    note?: string | null;
  }>;
};

function parseDerivedFrom(raw: UpdateBody["derivedFrom"]): DerivedFromLink[] | null {
  if (raw === undefined) return null;
  if (!Array.isArray(raw)) return [];
  const links: DerivedFromLink[] = [];
  for (const item of raw) {
    const trackId = String(item?.trackId || "").trim();
    const relation = String(item?.relation || "").trim();
    if (!trackId || !isTrackRelationType(relation)) continue;
    links.push({
      trackId,
      relation,
      note: item?.note ? String(item.note) : null,
    });
  }
  return links;
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getApiSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const track = getTrackById(id);
  if (!track) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }
  if (isSubscriber(session) && !isSubscriberVisible(track)) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }
  return NextResponse.json({
    track,
    relations: isSubscriber(session) ? [] : listRelationsForTrack(id),
    composerAssignments: isSubscriber(session) ? [] : getComposerAssignmentsForTrack(id),
  });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const staff = await getCatalogStaffSession();
  if (!staff.ok) {
    return NextResponse.json(
      { error: staff.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: staff.status },
    );
  }

  const { id } = await context.params;
  const existing = getTrackById(id);
  if (!existing) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => null)) as UpdateBody | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const dropboxLinkProvided = typeof body.dropboxLink === "string";
  const dropboxLink = dropboxLinkProvided
    ? String(body.dropboxLink ?? "").trim()
    : (existing.dropboxLink ?? "").trim();
  if (!dropboxLink) {
    return NextResponse.json({ error: "Track has no vault audio link" }, { status: 400 });
  }
  if (dropboxLinkProvided && !isMp3AudioUrl(dropboxLink)) {
    return NextResponse.json({ error: mp3OnlyErrorMessage() }, { status: 400 });
  }

  const license = canonicalizeLicense(body.license ?? existing.license);  const fields = licenseFieldVisibility(license);
  const perpetuity = fields.perpetuity ? String(body.perpetuity ?? "").trim() : "";
  const showExpires = fields.perpetuity && perpetuity.toLowerCase() === "no";

  const genre = constrainToVocabulary(body.genre ?? existing.genre, "genres") || null;
  const mood = constrainToVocabulary(body.mood ?? existing.mood, "moods") || null;
  const instruments =
    constrainToVocabulary(body.instruments ?? existing.instruments, "instruments") || null;
  const attributes =
    constrainToVocabulary(body.attributes ?? existing.attributes, "attributes") || null;

  const workingTitle =
    String(body.workingTitle ?? existing.workingTitle ?? "").trim() || existing.workingTitle;
  const libraryTitle =
    String(body.libraryTitle ?? existing.libraryTitle ?? "").trim() ||
    workingTitle ||
    existing.libraryTitle;

  const composerAssignments = parseComposerAssignments(body.composers);

  let saved = upsertTrack({
    id: existing.id,
    date: existing.date,
    dropboxLink,
    dropboxDl: toDropboxDlUrl(dropboxLink),
    workingTitle,
    libraryTitle,
    client: String(body.client ?? existing.client ?? "").trim() || null,
    project: String(body.project ?? existing.project ?? "").trim() || null,
    description: String(body.description ?? existing.description ?? "").trim() || null,
    notes: String(body.notes ?? existing.notes ?? "").trim() || null,
    year: parseYear(body.year ?? existing.year),
    duration: String(body.duration ?? existing.duration ?? "").trim() || null,
    bpm: parseBpm(body.bpm ?? existing.bpm),
    musicalKey: normalizeMusicalKey(body.musicalKey ?? existing.musicalKey) || null,
    artist: String(body.artist ?? existing.artist ?? "").trim() || null,
    publisher: String(body.publisher ?? existing.publisher ?? "").trim() || null,
    genre,
    mood,
    instruments,
    attributes,
    samro: String(body.samro ?? existing.samro ?? "No").trim() || "No",
    license,
    licenseDetail: fields.detail
      ? String(body.licenseDetail ?? "").trim() || null
      : null,
    perpetuity: fields.perpetuity ? perpetuity || null : null,
    licenseExpires: showExpires
      ? String(body.licenseExpires ?? "").trim() || null
      : null,
    createdAt: existing.createdAt,
  });

  if (composerAssignments !== null) {
    const sync = syncTrackComposers(saved.id, composerAssignments);
    if (!sync.ok) {
      return NextResponse.json({ error: sync.error }, { status: 400 });
    }
    saved = getTrackById(saved.id)!;
  }

  const derivedFrom = parseDerivedFrom(body.derivedFrom);
  const relations =
    derivedFrom === null
      ? listRelationsForTrack(id)
      : setDerivedFromLinks(id, derivedFrom);

  return NextResponse.json({
    track: saved,
    relations,
    composerAssignments: getComposerAssignmentsForTrack(saved.id),
  });
}
