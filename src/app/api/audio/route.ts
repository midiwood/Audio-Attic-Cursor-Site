import { NextRequest, NextResponse } from "next/server";
import { getApiSession, isSubscriber } from "@/lib/auth";
import { resolveAudioRedirectUrl } from "@/lib/audio-access";
import {
  ensureWatermarkedObject,
  formatEvalDownloadLabel,
  shouldWatermarkDownload,
  WatermarkBusyError,
} from "@/lib/audio-watermark";
import { guestMayAccessTrack } from "@/lib/guest-playlist-access";
import { getTrackById } from "@/lib/queries";
import { formatAudioDownloadLabel } from "@/lib/tracks";
import { isSubscriberVisible } from "@/lib/publisher";
import { isSpacesObjectKey } from "@/lib/storage/paths";
import { getTrackAssetForTrack } from "@/lib/track-assets";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function GET(req: NextRequest) {
  const session = await getApiSession();
  const id = req.nextUrl.searchParams.get("id");
  const assetId = req.nextUrl.searchParams.get("asset")?.trim() || "";
  const download = req.nextUrl.searchParams.get("download") === "1";
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  if (!session) {
    if (!(await guestMayAccessTrack(id))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const track = getTrackById(id);
  if (!track) {
    return NextResponse.json({ error: "Track or audio not found" }, { status: 404 });
  }
  if (session && isSubscriber(session) && !isSubscriberVisible(track)) {
    return NextResponse.json({ error: "Track or audio not found" }, { status: 404 });
  }

  let objectKey = track.dropboxPath;
  let legacyDlUrl = track.dropboxDl;
  let downloadLabel = formatAudioDownloadLabel(track);

  if (assetId) {
    const asset = getTrackAssetForTrack(id, assetId);
    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }
    objectKey = asset.dropboxPath;
    legacyDlUrl = asset.dropboxDl;
    downloadLabel = formatAudioDownloadLabel(
      track,
      asset.label,
      asset.kind === "stem" || asset.kind === "version" ? asset.kind : null,
    );
  }

  if (download && shouldWatermarkDownload(session)) {
    const sourceKey = objectKey?.trim() || "";
    if (isSpacesObjectKey(sourceKey)) {
      try {
        objectKey = await ensureWatermarkedObject(id, sourceKey);
        downloadLabel = formatEvalDownloadLabel(downloadLabel);
      } catch (err) {
        if (err instanceof WatermarkBusyError) {
          return NextResponse.json({ error: err.message }, { status: 503 });
        }
        const message = err instanceof Error ? err.message : "Watermark failed";
        console.error("[audio GET watermark]", message, err);
        return NextResponse.json({ error: message }, { status: 502 });
      }
    }
  }

  const redirectUrl = await resolveAudioRedirectUrl({
    objectKey,
    legacyDlUrl,
    download,
    downloadLabel,
  });

  if (!redirectUrl) {
    return NextResponse.json({ error: "Track or audio not found" }, { status: 404 });
  }

  return NextResponse.redirect(redirectUrl, 302);
}
