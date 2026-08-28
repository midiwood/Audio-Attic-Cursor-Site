import { NextRequest, NextResponse } from "next/server";
import { getCatalogStaffSession } from "@/lib/auth";
import {
  dropboxAuthConfigured,
  dropboxAuthSetupMessage,
} from "@/lib/dropbox-auth";
import { isAllowedImportAudioUrl, mp3OnlyErrorMessage } from "@/lib/tracks";
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

  if (!dropboxAuthConfigured()) {
    return NextResponse.json({ error: dropboxAuthSetupMessage() }, { status: 500 });
  }

  const contentType = req.headers.get("content-type") || "";
  let sourceBytes: Buffer | null = null;
  let filename = "";
  let dropboxLink = "";
  let sourceDropboxPath = "";
  let preferredStagingId = "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      dropboxLink = String(form.get("dropboxLink") || "").trim();
      sourceDropboxPath = String(form.get("sourceDropboxPath") || "").trim();
      preferredStagingId = String(form.get("stagingId") || form.get("trackId") || "").trim();
      // Ignore legacy catalog ids sent as trackId — only reuse staging ids.
      if (preferredStagingId && !preferredStagingId.startsWith("stg_")) {
        preferredStagingId = "";
      }
      const audio = form.get("audio");
      if (audio instanceof File && audio.size > 0) {
        sourceBytes = Buffer.from(await audio.arrayBuffer());
        filename = audio.name || "audio.mp3";
      }
    } else {
      const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
      dropboxLink = String(body?.dropboxLink || "").trim();
      sourceDropboxPath = String(body?.sourceDropboxPath || "").trim();
      preferredStagingId = String(body?.stagingId || "").trim();
      if (preferredStagingId && !preferredStagingId.startsWith("stg_")) {
        preferredStagingId = "";
      }
    }

    if (!sourceBytes?.length && !dropboxLink && !sourceDropboxPath) {
      return NextResponse.json(
        { error: "Provide a local audio file or a Dropbox link/path" },
        { status: 400 },
      );
    }

    if (sourceBytes?.length) {
      if (!isAllowedImportAudioUrl(filename || "track.mp3")) {
        return NextResponse.json({ error: mp3OnlyErrorMessage() }, { status: 400 });
      }
    } else if (!isAllowedImportAudioUrl(dropboxLink, sourceDropboxPath)) {
      return NextResponse.json({ error: mp3OnlyErrorMessage() }, { status: 400 });
    }

    const vault = await stageTrackToVault({
      stagingId: preferredStagingId || null,
      sourceBytes,
      sourceDropboxPath: sourceDropboxPath || null,
      sourceUrl: dropboxLink || null,
      sourceHint: filename || sourceDropboxPath || dropboxLink || "audio.mp3",
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
