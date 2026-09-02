import { randomBytes } from "crypto";
import { and, asc, count, desc, eq, max, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/auth-schema";
import {
  playlistShares,
  playlistTracks,
  playlists,
  tracks,
  type Playlist,
  type Track,
} from "@/db/schema";
import { formatDisplayTitle, hasPlayableAudio } from "@/lib/tracks";

function playlistId() {
  return `pl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function newGuestToken() {
  return randomBytes(24).toString("base64url");
}

export type ShareRecipient = {
  userId: string;
  name: string;
  email: string;
};

export type ShareableUser = {
  id: string;
  name: string;
  email: string;
};

export type PlaylistWithCount = Playlist & {
  trackCount: number;
  isOwner: boolean;
  /** Present when this playlist was shared with the current user. */
  sharedBy?: { id: string; name: string; email: string } | null;
  /** Users the owner has shared with (owned playlists only). */
  sharedWith?: ShareRecipient[];
};

function withTrackCount(playlist: Playlist): { trackCount: number } & Playlist {
  const row = db
    .select({ value: count() })
    .from(playlistTracks)
    .where(eq(playlistTracks.playlistId, playlist.id))
    .get();
  return { ...playlist, trackCount: row?.value ?? 0 };
}

function listSharesForPlaylist(playlistId: string): ShareRecipient[] {
  return db
    .select({
      userId: playlistShares.userId,
      name: user.name,
      email: user.email,
    })
    .from(playlistShares)
    .innerJoin(user, eq(user.id, playlistShares.userId))
    .where(eq(playlistShares.playlistId, playlistId))
    .orderBy(asc(user.email))
    .all()
    .map((row) => ({
      userId: row.userId,
      name: row.name || "",
      email: row.email || "",
    }));
}

function isSharedWithUser(playlistId: string, userId: string): boolean {
  return Boolean(
    db
      .select({ playlistId: playlistShares.playlistId })
      .from(playlistShares)
      .where(
        and(eq(playlistShares.playlistId, playlistId), eq(playlistShares.userId, userId)),
      )
      .get(),
  );
}

/** Active (non-banned / non-pending) users that can be added to a share. */
export function listShareableUsers(excludeUserId: string): ShareableUser[] {
  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      banned: user.banned,
      banReason: user.banReason,
    })
    .from(user)
    .where(ne(user.id, excludeUserId))
    .orderBy(asc(user.email))
    .all()
    .filter((row) => !row.banned)
    .map((row) => ({
      id: row.id,
      name: row.name || "",
      email: row.email || "",
    }));
}

/** Playlists the user owns or that were shared to their account. */
export function listPlaylistsForUser(userId: string): PlaylistWithCount[] {
  const owned = db
    .select()
    .from(playlists)
    .where(eq(playlists.userId, userId))
    .orderBy(desc(playlists.updatedAt))
    .all()
    .map((playlist) => ({
      ...withTrackCount(playlist),
      isOwner: true,
      sharedWith: listSharesForPlaylist(playlist.id),
    }));

  const sharedRows = db
    .select({
      playlist: playlists,
      ownerId: user.id,
      ownerName: user.name,
      ownerEmail: user.email,
    })
    .from(playlistShares)
    .innerJoin(playlists, eq(playlists.id, playlistShares.playlistId))
    .leftJoin(user, eq(user.id, playlists.userId))
    .where(eq(playlistShares.userId, userId))
    .orderBy(desc(playlists.updatedAt))
    .all();

  const shared = sharedRows
    .filter((row) => row.playlist.userId !== userId)
    .map((row) => ({
      ...withTrackCount(row.playlist),
      isOwner: false,
      sharedBy: row.ownerId
        ? { id: row.ownerId, name: row.ownerName || "", email: row.ownerEmail || "" }
        : null,
    }));

  const byId = new Map<string, PlaylistWithCount>();
  for (const row of [...owned, ...shared]) {
    byId.set(row.id, row);
  }
  return [...byId.values()].sort((a, b) =>
    (b.updatedAt || "").localeCompare(a.updatedAt || ""),
  );
}

export function getPlaylistById(id: string): Playlist | undefined {
  return db.select().from(playlists).where(eq(playlists.id, id)).get();
}

export function getPlaylistByGuestToken(token: string): Playlist | undefined {
  const trimmed = token.trim();
  if (!trimmed) return undefined;
  return db.select().from(playlists).where(eq(playlists.guestToken, trimmed)).get();
}

export function playlistContainsTrack(playlistId: string, trackId: string): boolean {
  return Boolean(
    db
      .select({ trackId: playlistTracks.trackId })
      .from(playlistTracks)
      .where(
        and(eq(playlistTracks.playlistId, playlistId), eq(playlistTracks.trackId, trackId)),
      )
      .get(),
  );
}

export function userOwnsPlaylist(playlist: Playlist | undefined, userId: string): boolean {
  return Boolean(playlist && playlist.userId === userId);
}

export function userCanAccessPlaylist(
  playlist: Playlist | undefined,
  userId: string,
  _email?: string | null,
): boolean {
  if (!playlist) return false;
  if (playlist.userId === userId) return true;
  return isSharedWithUser(playlist.id, userId);
}

/** Owner only — rename / delete / share. */
export function userCanManagePlaylist(
  playlist: Playlist | undefined,
  userId: string,
): boolean {
  return userOwnsPlaylist(playlist, userId);
}

export function getPlaylistTracks(playlistId: string): Track[] {
  return db
    .select({ track: tracks })
    .from(playlistTracks)
    .innerJoin(tracks, eq(tracks.id, playlistTracks.trackId))
    .where(
      and(eq(playlistTracks.playlistId, playlistId), isNull(tracks.trashedAt)),
    )
    .orderBy(asc(playlistTracks.position))
    .all()
    .map((row) => row.track);
}

export function createPlaylist(name: string, userId: string): Playlist {
  const now = new Date().toISOString();
  const playlist = {
    id: playlistId(),
    name: name.trim() || "Untitled playlist",
    userId,
    guestToken: null as string | null,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(playlists).values(playlist).run();
  return playlist;
}

export function renamePlaylist(id: string, name: string): Playlist | undefined {
  const existing = getPlaylistById(id);
  if (!existing) return undefined;
  const updatedAt = new Date().toISOString();
  db.update(playlists)
    .set({ name: name.trim() || existing.name, updatedAt })
    .where(eq(playlists.id, id))
    .run();
  return getPlaylistById(id);
}

export function deletePlaylist(id: string): boolean {
  const existing = getPlaylistById(id);
  if (!existing) return false;
  db.delete(playlists).where(eq(playlists.id, id)).run();
  return true;
}

export function enableGuestLink(
  playlistId: string,
  ownerUserId: string,
): { ok: boolean; error?: string; guestToken?: string } {
  const playlist = getPlaylistById(playlistId);
  if (!playlist) return { ok: false, error: "Playlist not found" };
  if (playlist.userId !== ownerUserId) return { ok: false, error: "Forbidden" };
  if (playlist.guestToken) {
    return { ok: true, guestToken: playlist.guestToken };
  }
  const token = newGuestToken();
  db.update(playlists)
    .set({ guestToken: token, updatedAt: new Date().toISOString() })
    .where(eq(playlists.id, playlistId))
    .run();
  return { ok: true, guestToken: token };
}

export function regenerateGuestLink(
  playlistId: string,
  ownerUserId: string,
): { ok: boolean; error?: string; guestToken?: string } {
  const playlist = getPlaylistById(playlistId);
  if (!playlist) return { ok: false, error: "Playlist not found" };
  if (playlist.userId !== ownerUserId) return { ok: false, error: "Forbidden" };
  const token = newGuestToken();
  db.update(playlists)
    .set({ guestToken: token, updatedAt: new Date().toISOString() })
    .where(eq(playlists.id, playlistId))
    .run();
  return { ok: true, guestToken: token };
}

export function disableGuestLink(
  playlistId: string,
  ownerUserId: string,
): { ok: boolean; error?: string } {
  const playlist = getPlaylistById(playlistId);
  if (!playlist) return { ok: false, error: "Playlist not found" };
  if (playlist.userId !== ownerUserId) return { ok: false, error: "Forbidden" };
  db.update(playlists)
    .set({ guestToken: null, updatedAt: new Date().toISOString() })
    .where(eq(playlists.id, playlistId))
    .run();
  return { ok: true };
}

export function sharePlaylistWithUser(
  playlistId: string,
  targetUserId: string,
  ownerUserId: string,
): { ok: boolean; error?: string } {
  const playlist = getPlaylistById(playlistId);
  if (!playlist) return { ok: false, error: "Playlist not found" };
  if (playlist.userId !== ownerUserId) return { ok: false, error: "Forbidden" };
  if (targetUserId === ownerUserId) {
    return { ok: false, error: "That’s already your playlist" };
  }

  const account = db
    .select({ id: user.id, banned: user.banned, banReason: user.banReason })
    .from(user)
    .where(eq(user.id, targetUserId))
    .get();
  if (!account) return { ok: false, error: "User not found" };
  if (account.banned) return { ok: false, error: "That user isn’t active yet" };

  const existing = db
    .select()
    .from(playlistShares)
    .where(
      and(eq(playlistShares.playlistId, playlistId), eq(playlistShares.userId, targetUserId)),
    )
    .get();
  if (existing) return { ok: true };

  db.insert(playlistShares)
    .values({
      playlistId,
      userId: targetUserId,
      createdAt: new Date().toISOString(),
    })
    .run();
  db.update(playlists)
    .set({ updatedAt: new Date().toISOString() })
    .where(eq(playlists.id, playlistId))
    .run();
  return { ok: true };
}

export function unsharePlaylistWithUser(playlistId: string, targetUserId: string): boolean {
  const result = db
    .delete(playlistShares)
    .where(
      and(eq(playlistShares.playlistId, playlistId), eq(playlistShares.userId, targetUserId)),
    )
    .run();
  if (result.changes > 0) {
    db.update(playlists)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(playlists.id, playlistId))
      .run();
    return true;
  }
  return false;
}

export function addTrackToPlaylist(
  playlistId: string,
  trackId: string,
): { ok: boolean; error?: string } {
  const playlist = getPlaylistById(playlistId);
  if (!playlist) return { ok: false, error: "Playlist not found" };
  const track = db
    .select({ id: tracks.id, trashedAt: tracks.trashedAt })
    .from(tracks)
    .where(eq(tracks.id, trackId))
    .get();
  if (!track) return { ok: false, error: "Track not found" };
  if (track.trashedAt) return { ok: false, error: "Track is in Trash" };

  const existing = db
    .select()
    .from(playlistTracks)
    .where(and(eq(playlistTracks.playlistId, playlistId), eq(playlistTracks.trackId, trackId)))
    .get();
  if (existing) return { ok: true };

  const maxPos = db
    .select({ value: max(playlistTracks.position) })
    .from(playlistTracks)
    .where(eq(playlistTracks.playlistId, playlistId))
    .get();
  const position = (maxPos?.value ?? -1) + 1;

  db.insert(playlistTracks).values({ playlistId, trackId, position }).run();
  db.update(playlists)
    .set({ updatedAt: new Date().toISOString() })
    .where(eq(playlists.id, playlistId))
    .run();
  return { ok: true };
}

export function removeTrackFromPlaylist(playlistId: string, trackId: string): boolean {
  const result = db
    .delete(playlistTracks)
    .where(and(eq(playlistTracks.playlistId, playlistId), eq(playlistTracks.trackId, trackId)))
    .run();
  if (result.changes > 0) {
    db.update(playlists)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(playlists.id, playlistId))
      .run();
    return true;
  }
  return false;
}

export function toPlayerQueue(trackList: Track[]) {
  return trackList
    .filter((t) => hasPlayableAudio(t))
    .map((t) => ({
      id: t.id,
      title: formatDisplayTitle(t),
      subtitle: [t.client, t.year].filter(Boolean).join(" · ") || null,
      duration: t.duration,
      dropboxDl: t.dropboxDl,
      dropboxPath: t.dropboxPath,
      license: t.license,
    }));
}

export function appBaseUrl(): string {
  return (
    process.env.BETTER_AUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export function guestPlaylistUrl(token: string): string {
  return `${appBaseUrl()}/guest/playlist/${encodeURIComponent(token)}`;
}
