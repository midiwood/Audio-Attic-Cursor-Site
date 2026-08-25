/** Remember the playlist used most recently for quick-add (P key). Client-safe. */

const STORAGE_KEY = "audio-attic:last-playlist";
const SESSION_CHOSEN_KEY = "audio-attic:playlist-session-chosen";

export type LastPlaylist = {
  id: string;
  name: string;
};

export type PlaylistOption = {
  id: string;
  name: string;
  trackCount?: number;
};

export function getLastPlaylist(): LastPlaylist | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastPlaylist;
    if (!parsed?.id || !parsed?.name) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setLastPlaylist(playlist: LastPlaylist) {
  try {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(playlist));
    markPlaylistChosenThisSession();
  } catch {
    // ignore
  }
}

export function clearLastPlaylist() {
  try {
    if (typeof window === "undefined") return;
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(SESSION_CHOSEN_KEY);
  } catch {
    // ignore
  }
}

/** True after the user has picked (or used) a playlist once this browser tab session. */
export function hasChosenPlaylistThisSession(): boolean {
  try {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(SESSION_CHOSEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markPlaylistChosenThisSession() {
  try {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(SESSION_CHOSEN_KEY, "1");
  } catch {
    // ignore
  }
}

export async function listPlaylistsForPicker(): Promise<PlaylistOption[]> {
  const res = await fetch("/api/playlists", { credentials: "same-origin" });
  const data = (await res.json().catch(() => ({}))) as {
    playlists?: Array<PlaylistOption & { isOwner?: boolean }>;
  };
  const all = Array.isArray(data.playlists) ? data.playlists : [];
  // Only owned playlists are valid add destinations (shared = view only).
  return all.filter((p) => p.isOwner !== false);
}

async function promptPlaylistPick(): Promise<{
  ok: false;
  needsPick?: boolean;
  playlists?: PlaylistOption[];
  error?: string;
}> {
  const playlists = await listPlaylistsForPicker();
  if (!playlists.length) {
    return { ok: false, error: "No playlist yet — press L to create one" };
  }
  return { ok: false, needsPick: true, playlists };
}

export async function addTrackToPlaylistId(
  trackId: string,
  playlist: LastPlaylist,
): Promise<{ ok: boolean; playlistName?: string; error?: string }> {
  const res = await fetch("/api/playlists", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "add", playlistId: playlist.id, trackId }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    return { ok: false, error: data.error || "Could not add to playlist" };
  }
  setLastPlaylist(playlist);
  return { ok: true, playlistName: playlist.name };
}

/**
 * Quick-add (P key).
 * First use in a browser session → needsPick so the UI can prompt for a playlist.
 * Later in the session → uses the remembered last playlist (if still owned).
 */
export async function addTrackToCurrentPlaylist(trackId: string): Promise<{
  ok: boolean;
  needsPick?: boolean;
  playlists?: PlaylistOption[];
  playlistName?: string;
  error?: string;
}> {
  const sessionReady = hasChosenPlaylistThisSession();
  const last = getLastPlaylist();

  if (!sessionReady || !last) {
    return promptPlaylistPick();
  }

  // Ownership / reassignment can invalidate a remembered playlist (common after
  // playlists became per-user, or when switching accounts in the same browser).
  const playlists = await listPlaylistsForPicker();
  const stillMine = playlists.some((p) => p.id === last.id);
  if (!stillMine) {
    clearLastPlaylist();
    if (!playlists.length) {
      return { ok: false, error: "No playlist yet — press L to create one" };
    }
    return { ok: false, needsPick: true, playlists };
  }

  const result = await addTrackToPlaylistId(trackId, last);
  if (!result.ok) {
    clearLastPlaylist();
    if (playlists.length) {
      return { ok: false, needsPick: true, playlists };
    }
    return result;
  }
  return result;
}
