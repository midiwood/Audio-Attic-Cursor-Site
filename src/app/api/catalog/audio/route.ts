import { NextRequest, NextResponse } from "next/server";
import { resolveAudioRedirectUrl, resolvePlayableObjectKey } from "@/lib/audio-access";
import { isPartnerClearTrack, verifyCatalogPlaySignature } from "@/lib/catalog-partner";
import { getTrackById } from "@/lib/queries";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")?.trim() || "";
  const sig = req.nextUrl.searchParams.get("sig");
  if (!id || !verifyCatalogPlaySignature(id, sig)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const track = getTrackById(id);
  if (!track || !isPartnerClearTrack(track)) {
    return NextResponse.json({ error: "Track or audio not found" }, { status: 404 });
  }

  let objectKey = track.dropboxPath;
  let legacyDlUrl = track.dropboxDl;
  const resolved = await resolvePlayableObjectKey({ trackId: id, objectKey });
  if (resolved.key) {
    objectKey = resolved.key;
    if (resolved.healed) legacyDlUrl = null;
  }

  const redirectUrl = await resolveAudioRedirectUrl({
    objectKey,
    legacyDlUrl,
    download: false,
  });

  if (!redirectUrl) {
    return NextResponse.json({ error: "Track or audio not found" }, { status: 404 });
  }

  return NextResponse.redirect(redirectUrl, 302);
}
