import { NextRequest, NextResponse } from "next/server";
import { getApiSession, isSubscriber } from "@/lib/auth";
import { guestMayAccessTrack } from "@/lib/guest-playlist-access";
import { getTrackById } from "@/lib/queries";
import { formatAudioDownloadLabel } from "@/lib/tracks";
import { isSubscriberVisible } from "@/lib/publisher";
import { getTrackAssetForTrack } from "@/lib/track-assets";

export const runtime = "nodejs";

function safeFilename(name: string) {
  return name.replace(/[^\w.\- ()[\]]+/g, "_").slice(0, 120) || "track";
}

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
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  let dropboxDl = track.dropboxDl;
  let downloadLabel = formatAudioDownloadLabel(track);

  if (assetId) {
    const asset = getTrackAssetForTrack(id, assetId);
    if (!asset?.dropboxDl) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }
    dropboxDl = asset.dropboxDl;
    downloadLabel = formatAudioDownloadLabel(
      track,
      asset.label,
      asset.kind === "stem" || asset.kind === "version" ? asset.kind : null,
    );
  } else if (!dropboxDl) {
    return NextResponse.json({ error: "Track or audio not found" }, { status: 404 });
  }

  const range = download ? undefined : (req.headers.get("range") ?? undefined);
  const upstream = await fetch(dropboxDl, {
    headers: range ? { Range: range } : undefined,
    redirect: "follow",
  });

  if (!upstream.ok && upstream.status !== 206) {
    return NextResponse.json(
      { error: `Upstream audio failed: ${upstream.status}` },
      { status: 502 },
    );
  }

  const headers = new Headers();
  const passThrough = [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "etag",
    "last-modified",
  ];
  for (const key of passThrough) {
    const value = upstream.headers.get(key);
    if (value) headers.set(key, value);
  }
  if (!headers.has("content-type")) {
    headers.set("content-type", "audio/mpeg");
  }
  if (!headers.has("accept-ranges")) {
    headers.set("accept-ranges", "bytes");
  }
  headers.set(
    "cache-control",
    download
      ? "private, no-store"
      : "public, max-age=86400, stale-while-revalidate=604800",
  );
  if (!download) {
    headers.set("vary", "Range");
  }

  if (download) {
    const title = safeFilename(downloadLabel);
    const ext = dropboxDl.toLowerCase().includes(".wav") ? "wav" : "mp3";
    headers.set("content-disposition", `attachment; filename="${title}.${ext}"`);
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers,
  });
}
