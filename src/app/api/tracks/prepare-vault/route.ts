import { NextRequest, NextResponse } from "next/server";
import { getCatalogStaffSession } from "@/lib/auth";
import { isAllowedImportAudioUrl, mp3OnlyErrorMessage } from "@/lib/tracks";
import { spacesConfigured, spacesSetupMessage } from "@/lib/vault-storage";
import { stageTrackToVault } from "@/lib/vault-ingest";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Convert/normalize to −16 LUFS MP3 and stage under Vault/_tmp/{stagingId}.
 * Does not allocate a catalog track id or final vault folder — Import confirms that.
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
  let filename = "";
  let preferredStagingId = "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      preferredStagingId = String(form.get("stagingId") || form.get("trackId") || "").trim();
      if (preferredStagingId && !preferredStagingId.startsWith("stg_")) {
        preferredStagingId = "";
      }
      const audio = form.get("audio");
      if (audio instanceof File && audio.size > 0) {
        sourceBytes = Buffer.from(await audio.arrayBuffer());
        filename = audio.name || "audio.mp3";
      }
    } else {
      return NextResponse.json({ error: "Expected multipart form data with audio file" }, { status: 400 });
    }

    if (!sourceBytes?.length) {
      return NextResponse.json({ error: "Provide a local audio file" }, { status: 400 });
    }

    if (!isAllowedImportAudioUrl(filename || "track.mp3")) {
      return NextResponse.json({ error: mp3OnlyErrorMessage() }, { status: 400 });
    }

    const vault = await stageTrackToVault({
      stagingId: preferredStagingId || null,
      sourceBytes,
      sourceHint: filename || "audio.mp3",
    });

    return NextResponse.json({
      stagingId: vault.stagingId,
      // Keep `id` unset — catalog id is assigned only on Import confirm.
      dropboxLink: vault.dropboxLink,
      dropboxDl: vault.dropboxDl,
      dropboxPath: vault.dropboxPath,
      sourceDropboxPath: vault.sourceDropboxPath,
      sourceFolderLink: vault.sourceFolderLink,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Vault prepare failed";
    console.error("[prepare-vault]", message, err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
