import { NextRequest, NextResponse } from "next/server";
import { getCatalogStaffSession } from "@/lib/auth";
import { getNextTrackIds, upsertTrack } from "@/lib/queries";
import { setDerivedFromLinks } from "@/lib/track-relation-queries";
import {
  createLicenseEntry,
  type LicenseEntryInput,
} from "@/lib/license-entries";
import { canIssueSyncLicenses, getHousePublisherName } from "@/lib/publisher";
import {
  canonicalizeLicense,
  normalizeLicenseStatus,
  normalizeMusicalKey,
  parseBpm,
  parseYear,
  titleFromDropboxUrl,
  titleFromFilename,
  isAllowedImportAudioUrl,
  mp3OnlyErrorMessage,
} from "@/lib/tracks";
import { isTrackRelationType, type DerivedFromLink } from "@/lib/track-relations";
import { constrainToVocabulary } from "@/lib/vocabulary";
import { ensureTrackWaveforms } from "@/lib/waveform-generate";
import {
  spacesConfigured,
  spacesSetupMessage,
} from "@/lib/vault-storage";
import { ingestTrackToVault, finalizeVaultForTrack } from "@/lib/vault-ingest";
import { isVaultStagingKey } from "@/lib/vault-storage";
import {
  formatArtistFromComposers,
  getComposerById,
  parseComposerAssignments,
  syncTrackComposers,
  validateComposerAssignments,
} from "@/lib/composers";

function parseDerivedFrom(raw: unknown): DerivedFromLink[] {
  if (!Array.isArray(raw)) return [];
  const links: DerivedFromLink[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as { trackId?: string; relation?: string; note?: string | null };
    const trackId = String(row.trackId || "").trim();
    const relation = String(row.relation || "").trim();
    if (!trackId || !isTrackRelationType(relation)) continue;
    links.push({
      trackId,
      relation,
      note: row.note ? String(row.note) : null,
    });
  }
  return links;
}

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

export async function POST(req: NextRequest) {
  const staff = await getCatalogStaffSession();
  if (!staff.ok) {
    return NextResponse.json(
      { error: staff.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: staff.status },
    );
  }

  const contentType = req.headers.get("content-type") || "";
  const audioByIndex = new Map<number, { bytes: Buffer; filename: string }>();
  let body: Record<string, unknown> | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    body = JSON.parse(String(form.get("payload") || "{}")) as Record<string, unknown>;
    for (const [key, value] of form.entries()) {
      const match = /^audio_(\d+)$/.exec(key);
      if (!match || !(value instanceof File)) continue;
      const index = Number(match[1]);
      const bytes = Buffer.from(await value.arrayBuffer());
      audioByIndex.set(index, {
        bytes,
        filename: value.name || `track-${index}.mp3`,
      });
    }
  } else {
    body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  }

  if (!body || !Array.isArray(body.tracks)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const shared = (body.shared || {}) as Record<string, unknown>;
  const sharedComposerAssignments = parseComposerAssignments(shared.composers) ?? [];
  const tracksInput = body.tracks as Array<{
    id?: string;
    stagingId?: string;
    workingTitle?: string;
    libraryTitle?: string;
    dropboxLink?: string;
    dropboxDl?: string;
    dropboxPath?: string;
    sourceDropboxPath?: string;
    sourceFolderLink?: string;
    vaultReady?: boolean;
    localOnly?: boolean;
    duration?: string;
    description?: string;
    genre?: string;
    mood?: string;
    instruments?: string;
    attributes?: string;
    bpm?: string;
    musicalKey?: string;
  }>;

  if (!tracksInput.length) {
    return NextResponse.json({ error: "At least one track is required" }, { status: 400 });
  }

  if (!spacesConfigured()) {
    return NextResponse.json({ error: spacesSetupMessage() }, { status: 500 });
  }

  for (let index = 0; index < tracksInput.length; index++) {
    const track = tracksInput[index];
    const localAudio = audioByIndex.get(index);
    const vaultReady = Boolean(track.vaultReady && track.dropboxPath?.trim());

    if (vaultReady) continue;

    if (!localAudio?.bytes.length) {
      return NextResponse.json(
        { error: `Track ${index + 1} needs a prepared vault file or local audio upload` },
        { status: 400 },
      );
    }
    if (!isAllowedImportAudioUrl(localAudio.filename)) {
      return NextResponse.json({ error: mp3OnlyErrorMessage() }, { status: 400 });
    }
  }

  const housePublisherName = getHousePublisherName();
  const publisher =
    String(shared.publisher || "").trim() || housePublisherName || null;
  const license = canonicalizeLicense(String(shared.license || ""));
  const parsedEntry = parseLicenseEntry(body.licenseEntry);
  if (parsedEntry && "error" in parsedEntry) {
    return NextResponse.json({ error: parsedEntry.error }, { status: 400 });
  }
  if (parsedEntry && !canIssueSyncLicenses({ publisher, license }, undefined, { existingCount: 0 })) {
    const status = normalizeLicenseStatus(license);
    const house = getHousePublisherName();
    let error =
      "This track can’t log a sync deal with the current license status and publisher.";
    if (!house.trim()) {
      error = "Set House publisher in Admin → Publisher / PRO before logging sync deals.";
    } else if ((publisher || "").trim().toLowerCase() !== house.trim().toLowerCase()) {
      error = `Sync deals only for house publisher “${house}”. Change Publisher or leave the deal blank.`;
    } else if (status === "clear") {
      error = "Clear means no sync deals — set status to Library or Exclusive to log a license.";
    } else if (status === "hold") {
      error = "On Hold tracks can’t log new sync deals.";
    } else if (status === "personal") {
      error = "Personal tracks are private and can’t log sync deals.";
    }
    return NextResponse.json({ error }, { status: 400 });
  }
  const needsLicense = Boolean(parsedEntry);
  if (sharedComposerAssignments.length) {
    const validated = validateComposerAssignments(sharedComposerAssignments);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }
  }

  // Catalog ids are allocated only on Import confirm (not during prepare/AI staging).
  const needsFreshId = (track: (typeof tracksInput)[number]) => {
    const id = String(track.id || "").trim();
    if (!id || id.startsWith("stg_")) return true;
    if (track.stagingId?.trim() || isVaultStagingKey(track.dropboxPath)) return true;
    return false;
  };
  const freshCount = tracksInput.filter(needsFreshId).length;
  const freshIds = freshCount ? getNextTrackIds(freshCount) : [];
  let freshIndex = 0;
  const ids = tracksInput.map((track) =>
    needsFreshId(track) ? freshIds[freshIndex++]! : String(track.id || "").trim(),
  );
  const nowDisplay = new Date().toUTCString();
  const derivedFrom = parseDerivedFrom(body.derivedFrom);

  // Validate license once before creating any tracks.
  if (needsLicense && parsedEntry) {
    if (!parsedEntry.client.trim()) {
      return NextResponse.json({ error: "License client is required" }, { status: 400 });
    }
    if (!parsedEntry.usedFor.trim()) {
      return NextResponse.json({ error: "Used for is required" }, { status: 400 });
    }
    if (!parsedEntry.territory.trim()) {
      return NextResponse.json({ error: "Territory is required" }, { status: 400 });
    }
    if (!parsedEntry.media.trim()) {
      return NextResponse.json({ error: "Media is required" }, { status: 400 });
    }
    if (!parsedEntry.duration.trim()) {
      return NextResponse.json({ error: "Duration is required" }, { status: 400 });
    }
    if (!parsedEntry.licensedAt.trim()) {
      return NextResponse.json({ error: "Start date is required" }, { status: 400 });
    }
    if (parsedEntry.perpetuity === "No" && !String(parsedEntry.expiresAt || "").trim()) {
      return NextResponse.json(
        { error: "End date is required when perpetuity is No" },
        { status: 400 },
      );
    }
  }

  let created;
  try {
    created = [];
    for (let index = 0; index < tracksInput.length; index++) {
      const track = tracksInput[index];
      const sourceLink = track.dropboxLink?.trim() || "";
      const sourceDropboxPath = track.sourceDropboxPath?.trim() || null;
      const localAudio = audioByIndex.get(index);
      const fallbackTitle =
        titleFromFilename(localAudio?.filename || "") ||
        titleFromDropboxUrl(sourceLink) ||
        ids[index];
      const libraryTitle =
        titleFromFilename(track.libraryTitle?.trim() || "") || fallbackTitle;
      const workingTitle =
        titleFromFilename(track.workingTitle?.trim() || "") || libraryTitle;

      const genre = constrainToVocabulary(track.genre || String(shared.genre || ""), "genres") || null;
      const mood = constrainToVocabulary(track.mood || String(shared.mood || ""), "moods") || null;
      const instruments =
        constrainToVocabulary(track.instruments || String(shared.instruments || ""), "instruments") ||
        null;
      const attributes =
        constrainToVocabulary(track.attributes || String(shared.attributes || ""), "attributes") ||
        null;

      // Prefer license-form client/project for catalog metadata when logging a deal.
      const catalogClient =
        (needsLicense && parsedEntry?.client.trim()) ||
        String(shared.client || "").trim() ||
        null;
      const catalogProject =
        (needsLicense && parsedEntry?.usedFor.trim()) ||
        String(shared.project || "").trim() ||
        null;

      const artistFromComposers = sharedComposerAssignments.length
        ? formatArtistFromComposers(
            sharedComposerAssignments.map((a) => getComposerById(a.composerId)!.displayName),
          )
        : String(shared.artist || "").trim() || "Richard Vossgatter";

      const vaultReady = Boolean(track.vaultReady && track.dropboxPath?.trim());

      const vault = vaultReady
        ? await finalizeVaultForTrack({
            trackId: ids[index],
            stagingId: track.stagingId?.trim() || null,
            stagingPath: track.dropboxPath?.trim() || null,
            dropboxLink: track.dropboxLink?.trim() || null,
            dropboxDl: track.dropboxDl?.trim() || null,
            dropboxPath: track.dropboxPath?.trim() || null,
            sourceDropboxPath: track.sourceDropboxPath?.trim() || null,
            sourceFolderLink: track.sourceFolderLink?.trim() || null,
          })
        : await ingestTrackToVault({
            trackId: ids[index],
            sourceBytes: localAudio?.bytes || null,
            sourceHint: localAudio?.filename || libraryTitle,
          });

      const saved = upsertTrack({
        id: ids[index],
        date: nowDisplay,
        dropboxLink: vault.dropboxLink,
        dropboxDl: vault.dropboxDl,
        dropboxPath: vault.dropboxPath,
        sourceDropboxPath: vault.sourceDropboxPath,
        sourceFolderLink: vault.sourceFolderLink,
        workingTitle,
        libraryTitle,
        client: catalogClient,
        project: catalogProject,
        description: track.description?.trim() || String(shared.description || "").trim() || null,
        notes: String(shared.notes || "").trim() || null,
        year: parseYear(String(shared.year ?? "")),
        duration: track.duration?.trim() || null,
        bpm: parseBpm(track.bpm ?? String(shared.bpm ?? "")),
        musicalKey: normalizeMusicalKey(String(track.musicalKey || shared.musicalKey || "")) || null,
        artist: artistFromComposers,
        publisher,
        genre,
        mood,
        instruments,
        attributes,
        samro: String(shared.samro || "").trim() || "No",
        license,
        licenseDetail: needsLicense && parsedEntry ? parsedEntry.usedFor.trim() || null : null,
        perpetuity: needsLicense && parsedEntry ? parsedEntry.perpetuity || null : null,
        licenseExpires:
          needsLicense && parsedEntry && parsedEntry.perpetuity === "No"
            ? parsedEntry.expiresAt || null
            : null,
      });

      if (needsLicense && parsedEntry) {
        const result = createLicenseEntry(saved.id, parsedEntry);
        if (!result.ok) {
          throw new Error(result.error);
        }
      }

      if (sharedComposerAssignments.length) {
        const sync = syncTrackComposers(saved.id, sharedComposerAssignments);
        if (!sync.ok) {
          throw new Error(sync.error);
        }
      }

      created.push(saved);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Single-track import can attach lineage; multi-track ignores for now
  if (created.length === 1 && derivedFrom.length) {
    setDerivedFromLinks(created[0].id, derivedFrom);
  }

  // Precompute player waveforms so first play paints instantly (soft-fail).
  const waveforms = await ensureTrackWaveforms(
    created.map((track) => ({
      id: track.id,
      dropboxPath: track.dropboxPath,
      dropboxDl: track.dropboxDl,
    })),
    created.length === 1 ? 1 : 2,
  );

  return NextResponse.json({
    count: created.length,
    ids: created.map((t) => t.id),
    waveforms,
  });
}
