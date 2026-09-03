import { NextRequest, NextResponse } from "next/server";
import { getCatalogStaffSession } from "@/lib/auth";
import { formatAudioDuration } from "@/lib/audio-duration";
import { getTrackById, upsertTrack } from "@/lib/queries";
import { isAllowedImportAudioUrl, mp3OnlyErrorMessage } from "@/lib/tracks";
import { ingestTrackToVault } from "@/lib/vault-ingest";
import { spacesConfigured, spacesSetupMessage } from "@/lib/vault-storage";
import { generateWaveformPeaksFromBytes } from "@/lib/waveform-generate";
import { upsertTrackWaveform } from "@/lib/waveform-queries";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Replace the catalog main mix: normalize (gain-only −16 LUFS) and overwrite
 * the vault MP3. Used when a prior convert sounded over-compressed.
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

  const file = form.get("audio");
  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json({ error: "audio file is required" }, { status: 400 });
  }
  if (!isAllowedImportAudioUrl(file.name)) {
    return NextResponse.json({ error: mp3OnlyErrorMessage() }, { status: 400 });
  }

  const sourceBytes = Buffer.from(await file.arrayBuffer());

  try {
    const vault = await ingestTrackToVault({
      trackId: id,
      sourceBytes,
      sourceHint: file.name,
    });

    let duration = existing.duration;
    const generated = await generateWaveformPeaksFromBytes(
      sourceBytes,
      file.type || "audio/mpeg",
      file.name,
    );
    if (generated) {
      upsertTrackWaveform({
        trackId: id,
        peaks: generated.peaks,
        duration: generated.duration,
        peaksLength: generated.peaksLength,
      });
      duration = formatAudioDuration(generated.duration) || duration;
    }

    const saved = upsertTrack({
      ...existing,
      dropboxLink: vault.dropboxLink ?? existing.dropboxLink,
      dropboxDl: vault.dropboxDl ?? existing.dropboxDl,
      dropboxPath: vault.dropboxPath,
      sourceDropboxPath: existing.sourceDropboxPath,
      sourceFolderLink: existing.sourceFolderLink,
      duration,
    });

    return NextResponse.json({ track: saved });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Replace audio failed";
    console.error("[tracks/replace-audio POST]", message, err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
