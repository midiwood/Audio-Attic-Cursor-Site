import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getApiSession, isSubscriber } from "@/lib/auth";
import { resolveAudioRedirectUrl, resolvePlayableObjectKey } from "@/lib/audio-access";
import { MAX_ZIP_TRACKS } from "@/lib/audio-download-shared";
import { GUEST_PLAYLIST_COOKIE } from "@/lib/guest-playlist";
import { formatAudioDownloadLabel } from "@/lib/tracks";
import { isSubscriberVisible } from "@/lib/publisher";
import {
  getPlaylistByGuestToken,
  playlistContainsTrack,
} from "@/lib/playlists";
import { getTrackById } from "@/lib/queries";

export const runtime = "nodejs";
export const maxDuration = 180;

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

/** Return presigned download URLs — browser fetches directly from Spaces. */
export async function POST(req: NextRequest) {
  const session = await getApiSession();

  const body = (await req.json().catch(() => ({}))) as { trackIds?: string[] };
  const trackIds = Array.isArray(body.trackIds)
    ? [...new Set(body.trackIds.map(String).filter(Boolean))]
    : [];

  if (!trackIds.length) {
    return NextResponse.json({ error: "trackIds required" }, { status: 400 });
  }
  if (trackIds.length > MAX_ZIP_TRACKS) {
    return NextResponse.json(
      { error: `At most ${MAX_ZIP_TRACKS} tracks per download` },
      { status: 400 },
    );
  }

  const downloads: Array<{ trackId: string; url: string; filename: string }> = [];

  for (const id of trackIds) {
    if (!session) {
      if (!(await guestMayAccessTrack(id))) continue;
    }

    const track = getTrackById(id);
    if (!track) continue;
    if (session && isSubscriber(session) && !isSubscriberVisible(track)) continue;

    let objectKey = track.dropboxPath;
    const label = formatAudioDownloadLabel(track);

    const resolved = await resolvePlayableObjectKey({ trackId: id, objectKey });
    if (resolved.key) objectKey = resolved.key;

    const ext = objectKey?.toLowerCase().endsWith(".wav") ? "wav" : "mp3";
    const url = await resolveAudioRedirectUrl({
      objectKey,
      legacyDlUrl: resolved.healed ? null : track.dropboxDl,
      download: true,
      downloadLabel: label,
    });
    if (!url) continue;

    downloads.push({
      trackId: id,
      url,
      filename: `${safeFilename(label)}.${ext}`,
    });
  }

  if (!downloads.length) {
    return NextResponse.json({ error: "No downloadable tracks found" }, { status: 404 });
  }

  return NextResponse.json({ downloads });
}
