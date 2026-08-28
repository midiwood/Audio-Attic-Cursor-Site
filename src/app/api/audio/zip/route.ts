import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getApiSession, isSubscriber } from "@/lib/auth";
import {
  MAX_ZIP_TRACKS,
  safeAudioFilename,
  zipTracksAudio,
} from "@/lib/audio-download";
import { GUEST_PLAYLIST_COOKIE } from "@/lib/guest-playlist";
import { isSubscriberVisible } from "@/lib/publisher";
import {
  getPlaylistByGuestToken,
  getPlaylistById,
  getPlaylistTracks,
  playlistContainsTrack,
  userCanAccessPlaylist,
} from "@/lib/playlists";
import { getTrackById } from "@/lib/queries";
import type { Track } from "@/db/schema";

export const runtime = "nodejs";
/** Zip builds can take a while on shared hosts. */
export const maxDuration = 300;

async function guestPlaylistId(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(GUEST_PLAYLIST_COOKIE)?.value;
  if (!token) return null;
  return getPlaylistByGuestToken(token)?.id ?? null;
}

function resolvePlaylistTracks(
  playlistId: string,
  session: Awaited<ReturnType<typeof getApiSession>>,
  guestPid: string | null,
): { ok: true; tracks: Track[]; zipName: string } | { ok: false; status: number; error: string } {
  const playlist = getPlaylistById(playlistId);
  if (!playlist) {
    return { ok: false, status: 404, error: "Playlist not found" };
  }

  const allowed =
    (session && userCanAccessPlaylist(playlist, session.user.id, session.user.email)) ||
    guestPid === playlistId;
  if (!allowed) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  let tracks = getPlaylistTracks(playlistId);
  if (session && isSubscriber(session)) {
    tracks = tracks.filter((t) => isSubscriberVisible(t));
  }
  return {
    ok: true,
    tracks,
    zipName: `${safeAudioFilename(playlist.name || "playlist")}.zip`,
  };
}

function resolveTrackIds(
  trackIds: string[],
  session: Awaited<ReturnType<typeof getApiSession>>,
  guestPid: string | null,
): { ok: true; tracks: Track[]; zipName: string } | { ok: false; status: number; error: string } {
  if (!session && !guestPid) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  if (trackIds.length > MAX_ZIP_TRACKS) {
    return {
      ok: false,
      status: 400,
      error: `At most ${MAX_ZIP_TRACKS} tracks per download`,
    };
  }

  const tracks: Track[] = [];
  for (const id of trackIds) {
    const track = getTrackById(id);
    if (!track) continue;
    if (session) {
      if (isSubscriber(session) && !isSubscriberVisible(track)) continue;
    } else if (guestPid) {
      if (!playlistContainsTrack(guestPid, id)) continue;
    }
    tracks.push(track);
  }

  if (!tracks.length) {
    return { ok: false, status: 404, error: "No downloadable tracks found" };
  }

  return {
    ok: true,
    tracks,
    zipName: `audio-attic-${tracks.length}-tracks.zip`,
  };
}

async function zipResponse(
  tracks: Track[],
  zipName: string,
): Promise<NextResponse> {
  const downloadable = tracks.filter((t) => t.dropboxDl);
  if (!downloadable.length) {
    return NextResponse.json(
      { error: "No tracks with audio available to download" },
      { status: 404 },
    );
  }

  try {
    const { buffer } = await zipTracksAudio(downloadable);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${zipName}"`,
        "content-length": String(buffer.length),
        "cache-control": "private, no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Zip failed";
    console.error("[audio/zip]", message, err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/** Playlist zip via query string (browser navigate / link). */
export async function GET(req: NextRequest) {
  const session = await getApiSession();
  const guestPid = await guestPlaylistId();
  if (!session && !guestPid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const playlistId = req.nextUrl.searchParams.get("playlistId");
  if (!playlistId) {
    return NextResponse.json({ error: "Missing playlistId" }, { status: 400 });
  }

  const resolved = resolvePlaylistTracks(playlistId, session, guestPid);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  return zipResponse(resolved.tracks, resolved.zipName);
}

/** Bulk zip: `{ playlistId }` or `{ trackIds: string[] }`. */
export async function POST(req: NextRequest) {
  const session = await getApiSession();
  const guestPid = await guestPlaylistId();
  if (!session && !guestPid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    playlistId?: string;
    trackIds?: string[];
  };

  if (body.playlistId) {
    const resolved = resolvePlaylistTracks(body.playlistId, session, guestPid);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }
    return zipResponse(resolved.tracks, resolved.zipName);
  }

  const trackIds = Array.isArray(body.trackIds)
    ? [...new Set(body.trackIds.map(String).filter(Boolean))]
    : [];
  if (!trackIds.length) {
    return NextResponse.json({ error: "Missing playlistId or trackIds" }, { status: 400 });
  }

  const resolved = resolveTrackIds(trackIds, session, guestPid);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  return zipResponse(resolved.tracks, resolved.zipName);
}
