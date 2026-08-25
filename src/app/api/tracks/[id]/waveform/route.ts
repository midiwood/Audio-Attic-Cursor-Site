import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getApiSession, getCatalogStaffSession } from "@/lib/auth";
import { GUEST_PLAYLIST_COOKIE } from "@/lib/guest-playlist";
import { getPlaylistByGuestToken, playlistContainsTrack } from "@/lib/playlists";
import { getTrackById } from "@/lib/queries";
import { getTrackWaveform, upsertTrackWaveform } from "@/lib/waveform-queries";
import { normalizePeaksPayload } from "@/lib/waveform";

export const runtime = "nodejs";

async function guestMayAccessTrack(trackId: string): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(GUEST_PLAYLIST_COOKIE)?.value;
  if (!token) return false;
  const playlist = getPlaylistByGuestToken(token);
  if (!playlist) return false;
  return playlistContainsTrack(playlist.id, trackId);
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getApiSession();
  const { id } = await context.params;

  if (!session && !(await guestMayAccessTrack(id))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!getTrackById(id)) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  const waveform = getTrackWaveform(id);
  if (!waveform) {
    return NextResponse.json({ error: "Waveform not found" }, { status: 404 });
  }

  return NextResponse.json(
    {
      trackId: waveform.trackId,
      peaks: waveform.peaks,
      duration: waveform.duration,
      peaksLength: waveform.peaksLength,
    },
    {
      headers: {
        "cache-control": "private, max-age=86400",
      },
    },
  );
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const staff = await getCatalogStaffSession();
  if (!staff.ok) {
    return NextResponse.json(
      { error: staff.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: staff.status },
    );
  }

  const { id } = await context.params;
  if (!getTrackById(id)) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  // Already stored — keep first capture (avoids thrashing on remount).
  const existing = getTrackWaveform(id);
  if (existing) {
    return NextResponse.json({
      trackId: existing.trackId,
      peaks: existing.peaks,
      duration: existing.duration,
      peaksLength: existing.peaksLength,
      cached: true,
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const normalized = normalizePeaksPayload(body);
  if (!normalized) {
    return NextResponse.json({ error: "Invalid peaks payload" }, { status: 400 });
  }

  const saved = upsertTrackWaveform({
    trackId: id,
    peaks: normalized.peaks,
    duration: normalized.duration,
    peaksLength: normalized.peaksLength,
  });

  return NextResponse.json({
    trackId: saved.trackId,
    peaks: saved.peaks,
    duration: saved.duration,
    peaksLength: saved.peaksLength,
    cached: false,
  });
}
