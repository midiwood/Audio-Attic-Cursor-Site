import { NextRequest, NextResponse } from "next/server";
import { getApiSession, isSubscriber } from "@/lib/auth";
import {
  addTrackToPlaylist,
  createPlaylist,
  deletePlaylist,
  disableGuestLink,
  enableGuestLink,
  getPlaylistById,
  listPlaylistsForUser,
  listShareableUsers,
  regenerateGuestLink,
  removeTrackFromPlaylist,
  renamePlaylist,
  sharePlaylistWithUser,
  unsharePlaylistWithUser,
  userCanManagePlaylist,
  guestPlaylistUrl,
} from "@/lib/playlists";
import { getTrackById } from "@/lib/queries";
import { isSubscriberVisible } from "@/lib/publisher";

export const runtime = "nodejs";

export async function GET() {
  const session = await getApiSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    playlists: listPlaylistsForUser(session.user.id),
    shareableUsers: listShareableUsers(session.user.id),
  });
}

export async function POST(req: NextRequest) {
  const session = await getApiSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "create");

  if (action === "create") {
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
    const playlist = createPlaylist(name, userId);
    return NextResponse.json({ playlist });
  }

  if (action === "guestLink") {
    const id = String(body.id || "").trim();
    const mode = String(body.mode || "enable").trim();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const existing = getPlaylistById(id);
    if (!userCanManagePlaylist(existing, userId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (mode === "disable") {
      const result = disableGuestLink(id, userId);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({
        ok: true,
        guestToken: null,
        playlists: listPlaylistsForUser(userId),
      });
    }

    const result =
      mode === "regenerate" ? regenerateGuestLink(id, userId) : enableGuestLink(id, userId);
    if (!result.ok || !result.guestToken) {
      return NextResponse.json({ error: result.error || "Could not update link" }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      guestToken: result.guestToken,
      inviteUrl: guestPlaylistUrl(result.guestToken),
      playlists: listPlaylistsForUser(userId),
    });
  }

  if (action === "share") {
    const id = String(body.id || "").trim();
    const targetUserId = String(body.userId || "").trim();
    if (!id || !targetUserId) {
      return NextResponse.json({ error: "id and userId required" }, { status: 400 });
    }
    const existing = getPlaylistById(id);
    if (!userCanManagePlaylist(existing, userId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const result = sharePlaylistWithUser(id, targetUserId, userId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error || "Could not share" }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      playlists: listPlaylistsForUser(userId),
    });
  }

  if (action === "unshare") {
    const id = String(body.id || "").trim();
    const targetUserId = String(body.userId || "").trim();
    if (!id || !targetUserId) {
      return NextResponse.json({ error: "id and userId required" }, { status: 400 });
    }
    const existing = getPlaylistById(id);
    if (!userCanManagePlaylist(existing, userId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!unsharePlaylistWithUser(id, targetUserId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      playlists: listPlaylistsForUser(userId),
    });
  }

  if (action === "rename") {
    const id = String(body.id || "");
    const name = String(body.name || "").trim();
    if (!id || !name) {
      return NextResponse.json({ error: "id and name required" }, { status: 400 });
    }
    const existing = getPlaylistById(id);
    if (!userCanManagePlaylist(existing, userId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const playlist = renamePlaylist(id, name);
    if (!playlist) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ playlist });
  }

  if (action === "delete") {
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const existing = getPlaylistById(id);
    if (!userCanManagePlaylist(existing, userId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!deletePlaylist(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  if (action === "add") {
    const playlistId = String(body.playlistId || "");
    const trackId = String(body.trackId || "");
    const existing = getPlaylistById(playlistId);
    if (!userCanManagePlaylist(existing, userId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (isSubscriber(session)) {
      const track = getTrackById(trackId);
      if (!track || !isSubscriberVisible(track)) {
        return NextResponse.json({ error: "Track not available" }, { status: 403 });
      }
    }
    const result = addTrackToPlaylist(playlistId, trackId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (action === "remove") {
    const playlistId = String(body.playlistId || "");
    const trackId = String(body.trackId || "");
    const existing = getPlaylistById(playlistId);
    if (!userCanManagePlaylist(existing, userId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!removeTrackFromPlaylist(playlistId, trackId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
