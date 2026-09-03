import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getApiSession, isSubscriber } from "@/lib/auth";
import { resolveAudioRedirectUrl } from "@/lib/audio-access";
import { MAX_ZIP_TRACKS } from "@/lib/audio-download-shared";
import {
  ensureWatermarkedObject,
  formatEvalDownloadLabel,
  shouldWatermarkDownload,
  WatermarkBusyError,
} from "@/lib/audio-watermark";
import { GUEST_PLAYLIST_COOKIE } from "@/lib/guest-playlist";
import { formatAudioDownloadLabel } from "@/lib/tracks";
import { isSubscriberVisible } from "@/lib/publisher";
import { isSpacesObjectKey } from "@/lib/storage/paths";
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

const BATCH_WATERMARK_BUDGET_MS = 100_000;

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

  const watermark = shouldWatermarkDownload(session);
  const deadline = Date.now() + BATCH_WATERMARK_BUDGET_MS;
  const downloads: Array<{ trackId: string; url: string; filename: string }> = [];

  for (const id of trackIds) {
    if (!session) {
      if (!(await guestMayAccessTrack(id))) continue;
    }

    const track = getTrackById(id);
    if (!track) continue;
    if (session && isSubscriber(session) && !isSubscriberVisible(track)) continue;

    let objectKey = track.dropboxPath;
    let label = formatAudioDownloadLabel(track);

    const sourceKey = objectKey?.trim() || "";
    if (watermark && isSpacesObjectKey(sourceKey)) {
      if (Date.now() > deadline) {
        return NextResponse.json(
          { error: "Watermarked download is being prepared. Try again in a moment." },
          { status: 503 },
        );
      }
      try {
        objectKey = await ensureWatermarkedObject(id, sourceKey);
        label = formatEvalDownloadLabel(label);
      } catch (err) {
        if (err instanceof WatermarkBusyError) {
          return NextResponse.json({ error: err.message }, { status: 503 });
        }
        const message = err instanceof Error ? err.message : "Watermark failed";
        console.error("[audio/presign-batch watermark]", id, message, err);
        return NextResponse.json({ error: message }, { status: 502 });
      }
    }

    const ext = objectKey?.toLowerCase().endsWith(".wav") ? "wav" : "mp3";
    const url = await resolveAudioRedirectUrl({
      objectKey,
      legacyDlUrl: track.dropboxDl,
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
