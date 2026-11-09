import { NextRequest, NextResponse } from "next/server";
import { getCatalogStaffSession } from "@/lib/auth";
import { formatAudioDuration } from "@/lib/audio-duration";
import { resolveAudioNormalizeMode } from "@/lib/audio-normalize";
import { getTrackById, upsertTrack } from "@/lib/queries";
import { isAllowedImportAudioUrl, mp3OnlyErrorMessage } from "@/lib/tracks";
import { listMixRevisions, snapshotCurrentMix } from "@/lib/mix-revisions";
import { ingestTrackToVault } from "@/lib/vault-ingest";
import { spacesConfigured, spacesSetupMessage } from "@/lib/vault-storage";
import { normalizePeaksPayload } from "@/lib/waveform";
import { upsertTrackWaveform } from "@/lib/waveform-queries";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Replace the catalog main mix and overwrite the vault MP3.
 * Default: browser already normalized (`normalized=1`) plus optional master.
 * Server ffmpeg only when AUDIO_NORMALIZE_MODE=server.
 */
export async function POST(req: NextRequest, context: RouteContext) {
  const staff = await getCatalogStaffSession();
  if (!staff.ok) {
    return NextResponse.json(
      { error: staff.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: staff.status },
    );
  }

  if (!spacesConfigured()) {
    return NextResponse.json({ error: spacesSetupMessage() }, { status: 500 });
  }

  const { id } = await context.params;
  const existing = getTrackById(id);
  if (!existing) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const clientNormalized =
    String(form.get("normalized") || "").trim() === "1" ||
    String(form.get("clientNormalized") || "").trim() === "1";

  const file = form.get("audio");
  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json({ error: "audio file is required" }, { status: 400 });
  }

  const master = form.get("master");
  const masterFile = master instanceof File && master.size > 0 ? master : null;
  const checkName = masterFile?.name || file.name;
  if (!isAllowedImportAudioUrl(checkName)) {
    return NextResponse.json({ error: mp3OnlyErrorMessage() }, { status: 400 });
  }

  if (!clientNormalized && resolveAudioNormalizeMode() !== "server") {
    return NextResponse.json(
      {
        error:
          "Server ffmpeg is muted. Normalize in the browser first, or set AUDIO_NORMALIZE_MODE=server.",
      },
      { status: 400 },
    );
  }

  const audioBytes = Buffer.from(await file.arrayBuffer());
  const masterBytes = masterFile
    ? Buffer.from(await masterFile.arrayBuffer())
    : clientNormalized
      ? null
      : audioBytes;

  try {
    const replacedBy =
      staff.session.user.name?.trim() || staff.session.user.email?.trim() || null;
    await snapshotCurrentMix(existing, {
      replacedWith: checkName,
      replacedBy,
    });

    const vault = await ingestTrackToVault({
      trackId: id,
      sourceBytes: clientNormalized ? null : audioBytes,
      sourceHint: checkName,
      preNormalizedMp3: clientNormalized ? audioBytes : null,
      masterBytes,
      masterHint: masterFile?.name || checkName,
    });

    let duration = existing.duration;
    const waveformRaw = form.get("waveform");
    if (typeof waveformRaw === "string" && waveformRaw.trim()) {
      try {
        const generated = normalizePeaksPayload(JSON.parse(waveformRaw));
        if (generated) {
          upsertTrackWaveform({
            trackId: id,
            peaks: generated.peaks,
            duration: generated.duration,
            peaksLength: generated.peaksLength,
          });
          duration = formatAudioDuration(generated.duration) || duration;
        }
      } catch {
        // Peaks are optional — replace must succeed without them.
      }
    }

    const saved = upsertTrack({
      ...existing,
      dropboxLink: vault.dropboxLink ?? existing.dropboxLink,
      dropboxDl: vault.dropboxDl ?? existing.dropboxDl,
      dropboxPath: vault.dropboxPath,
      sourceDropboxPath: existing.sourceDropboxPath,
      sourceFolderLink: existing.sourceFolderLink,
      masterObjectKey: vault.masterObjectKey ?? existing.masterObjectKey,
      duration,
    });

    return NextResponse.json({ track: saved, revisions: listMixRevisions(id) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Replace audio failed";
    console.error("[tracks/replace-audio POST]", message, err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
