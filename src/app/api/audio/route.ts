import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getApiSession, isSubscriber } from "@/lib/auth";
import { GUEST_PLAYLIST_COOKIE } from "@/lib/guest-playlist";
import {
  getPlaylistByGuestToken,
  playlistContainsTrack,
} from "@/lib/playlists";
import { getTrackById } from "@/lib/queries";
import { formatDisplayTitle } from "@/lib/tracks";
import { isSubscriberVisible } from "@/lib/publisher";

export const runtime = "nodejs";

function safeFilename(name: string) {
  return name.replace(/[^\w.\- ()[\]]+/g, "_").slice(0, 120) || "track";
}

async function guestMayAccessTrack(trackId: string): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(GUEST_PLAYLIST_COOKIE)?.value;
  if (!token) return false;
  const playlist = getPlaylistByGuestToken(token);
  if (!playlist) return false;
  return playlistContainsTrack(playlist.id, trackId);
}

export async function GET(req: NextRequest) {
  const session = await getApiSession();
  const id = req.nextUrl.searchParams.get("id");
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
  if (!track?.dropboxDl) {
    return NextResponse.json({ error: "Track or audio not found" }, { status: 404 });
  }
  if (session && isSubscriber(session) && !isSubscriberVisible(track)) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  const range = download ? undefined : (req.headers.get("range") ?? undefined);
  const upstream = await fetch(track.dropboxDl, {
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
    const title = safeFilename(formatDisplayTitle(track));
    const ext = track.dropboxDl.toLowerCase().includes(".wav") ? "wav" : "mp3";
    headers.set("content-disposition", `attachment; filename="${title}.${ext}"`);
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers,
  });
}
