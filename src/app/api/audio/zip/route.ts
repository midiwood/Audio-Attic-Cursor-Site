import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/auth";
import { resolveZipAudioEntries, zipAudioEntriesResponse } from "@/lib/audio-zip";

export const runtime = "nodejs";
export const maxDuration = 300;

function errorStatus(err: unknown): number {
  const status = (err as { status?: number })?.status;
  return typeof status === "number" ? status : 502;
}

/** Zip catalog audio, upload to Spaces, return a presigned download URL. */
export async function POST(req: NextRequest) {
  const session = await getApiSession();
  const body = (await req.json().catch(() => ({}))) as {
    trackIds?: string[];
    playlistId?: string;
  };

  try {
    const { entries, zipFilename } = await resolveZipAudioEntries({
      session,
      playlistId: body.playlistId,
      trackIds: body.trackIds,
    });
    return await zipAudioEntriesResponse(entries, zipFilename);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Zip failed";
    const status = errorStatus(err);
    if (status >= 500) {
      console.error("[audio/zip POST]", message, err);
    }
    return NextResponse.json({ error: message }, { status });
  }
}
