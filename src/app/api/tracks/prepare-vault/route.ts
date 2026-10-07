import { NextRequest, NextResponse } from "next/server";
import { getCatalogStaffSession } from "@/lib/auth";
import { isAllowedImportAudioUrl, mp3OnlyErrorMessage } from "@/lib/tracks";
import { spacesConfigured, spacesSetupMessage } from "@/lib/vault-storage";
import { stageTrackToVault } from "@/lib/vault-ingest";
import { resolveAudioNormalizeMode } from "@/lib/audio-normalize";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Stage −16 LUFS MP3 (+ optional master) under vault/_tmp/{stagingId}.
 *
 * Default (AUDIO_NORMALIZE_MODE=client): expects browser-normalized MP3
 * (`normalized=1`) and optional `master` original. Server ffmpeg is muted.
 *
 * Restore server convert: AUDIO_NORMALIZE_MODE=server and send raw `audio`.
 */
export async function POST(req: NextRequest) {
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

  const contentType = req.headers.get("content-type") || "";
  let sourceBytes: Buffer | null = null;
  let preNormalizedMp3: Buffer | null = null;
  let masterBytes: Buffer | null = null;
  let filename = "";
  let masterFilename = "";
  let preferredStagingId = "";
  let clientNormalized = false;

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      preferredStagingId = String(form.get("stagingId") || form.get("trackId") || "").trim();
      if (preferredStagingId && !preferredStagingId.startsWith("stg_")) {
        preferredStagingId = "";
      }
      clientNormalized =
        String(form.get("normalized") || "").trim() === "1" ||
        String(form.get("clientNormalized") || "").trim() === "1";

      const audio = form.get("audio");
      if (audio instanceof File && audio.size > 0) {
        const buf = Buffer.from(await audio.arrayBuffer());
        filename = audio.name || "audio.mp3";
        if (clientNormalized) {
          preNormalizedMp3 = buf;
        } else {
          sourceBytes = buf;
        }
      }

      const master = form.get("master");
      if (master instanceof File && master.size > 0) {
        masterBytes = Buffer.from(await master.arrayBuffer());
        masterFilename = master.name || filename || "original.wav";
      }
    } else {
      return NextResponse.json({ error: "Expected multipart form data with audio file" }, { status: 400 });
    }

    if (!preNormalizedMp3?.length && !sourceBytes?.length) {
      return NextResponse.json({ error: "Provide a local audio file" }, { status: 400 });
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

    const checkName = filename || masterFilename || "track.mp3";
    if (!isAllowedImportAudioUrl(checkName)) {
      return NextResponse.json({ error: mp3OnlyErrorMessage() }, { status: 400 });
    }

    const vault = await stageTrackToVault({
      stagingId: preferredStagingId || null,
      sourceBytes,
      sourceHint: filename || "audio.mp3",
      preNormalizedMp3,
      masterBytes,
      masterHint: masterFilename || filename || "original.wav",
    });

    return NextResponse.json({
      stagingId: vault.stagingId,
      // Keep `id` unset — catalog id is assigned only on Import confirm.
      dropboxLink: vault.dropboxLink,
      dropboxDl: vault.dropboxDl,
      dropboxPath: vault.dropboxPath,
      sourceDropboxPath: vault.sourceDropboxPath,
      sourceFolderLink: vault.sourceFolderLink,
      masterObjectKey: vault.masterObjectKey,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Vault prepare failed";
    console.error("[prepare-vault]", message, err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
