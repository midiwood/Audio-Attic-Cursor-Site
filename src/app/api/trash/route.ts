import { NextRequest, NextResponse } from "next/server";
import { getCatalogStaffSession } from "@/lib/auth";
import {
  permanentlyDeleteTracks,
  restoreTrack,
  trashTrack,
} from "@/lib/trash";
import { toTrackListItem } from "@/lib/track-list-item";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const staff = await getCatalogStaffSession();
  if (!staff.ok) {
    return NextResponse.json(
      { error: staff.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: staff.status },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    trackId?: string;
    trackIds?: string[];
  };
  const action = String(body.action || "").trim();

  if (action === "trash") {
    const trackId = String(body.trackId || "").trim();
    if (!trackId) {
      return NextResponse.json({ error: "trackId required" }, { status: 400 });
    }
    const track = trashTrack(trackId);
    if (!track) {
      return NextResponse.json({ error: "Track not found" }, { status: 404 });
    }
    return NextResponse.json({ track: toTrackListItem(track) });
  }

  if (action === "restore") {
    const ids = Array.isArray(body.trackIds)
      ? body.trackIds.map((id) => String(id))
      : body.trackId
        ? [String(body.trackId)]
        : [];
    if (!ids.length) {
      return NextResponse.json({ error: "trackIds required" }, { status: 400 });
    }
    const restored = ids
      .map((id) => restoreTrack(id))
      .filter(Boolean)
      .map((track) => toTrackListItem(track!));
    return NextResponse.json({ restored, count: restored.length });
  }

  if (action === "purge") {
    const ids = Array.isArray(body.trackIds)
      ? body.trackIds.map((id) => String(id))
      : [];
    if (!ids.length) {
      return NextResponse.json({ error: "trackIds required" }, { status: 400 });
    }
    const result = permanentlyDeleteTracks(ids);
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
