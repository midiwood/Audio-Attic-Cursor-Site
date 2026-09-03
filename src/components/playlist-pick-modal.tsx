"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  addTrackToPlaylistId,
  type PlaylistOption,
  setLastPlaylist,
} from "@/lib/last-playlist";

export function PlaylistPickModal({
  open,
  trackId,
  playlists: initialPlaylists,
  onClose,
  onAdded,
}: {
  open: boolean;
  trackId: string;
  playlists: PlaylistOption[];
  onClose: () => void;
  onAdded: (playlistName: string) => void;
}) {
  const [playlists, setPlaylists] = useState(initialPlaylists);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (open) {
      setPlaylists(initialPlaylists);
      setError("");
      setNewName("");
    }
  }, [open, initialPlaylists]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function choose(playlist: PlaylistOption) {
    setBusy(true);
    setError("");
    const result = await addTrackToPlaylistId(trackId, {
      id: playlist.id,
      name: playlist.name,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "Could not add");
      return;
    }
    onAdded(result.playlistName || playlist.name);
  }

  async function createAndAdd(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setError("");
    const createRes = await fetch("/api/playlists", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "create", name }),
    });
    const createData = await createRes.json().catch(() => ({}));
    if (!createRes.ok) {
      setBusy(false);
      setError(createData.error || "Could not create playlist");
      return;
    }
    const playlist = {
      id: String(createData.playlist.id),
      name: String(createData.playlist.name || name),
    };
    setLastPlaylist(playlist);
    const result = await addTrackToPlaylistId(trackId, playlist);
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "Could not add");
      return;
    }
    onAdded(result.playlistName || playlist.name);
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center p-3 pt-[var(--mobile-chrome-top)] pb-[var(--mobile-chrome-bottom)] lg:items-center lg:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/55"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="playlist-pick-title"
        className="relative w-full max-w-sm max-h-full overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] shadow-2xl"
      >
        <div className="border-b border-[var(--line)] px-4 py-3">
          <h2
            id="playlist-pick-title"
            className="text-sm font-medium text-[var(--ink)]"
          >
            Choose a playlist
          </h2>
          <p className="mt-1 text-[11px] text-[var(--ink-dim)]">
            Pick an existing playlist or create a new one for this track.
          </p>
        </div>

        <div className="max-h-56 overflow-y-auto p-1.5">
          {playlists.length ? (
            playlists.map((playlist) => (
              <button
                key={playlist.id}
                type="button"
                disabled={busy}
                onClick={() => void choose(playlist)}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm text-[var(--ink)] transition hover:bg-[var(--accent-soft)] disabled:opacity-50"
              >
                <span className="truncate">{playlist.name}</span>
                {typeof playlist.trackCount === "number" ? (
                  <span className="ml-2 shrink-0 text-xs text-[var(--ink-dim)]">
                    {playlist.trackCount}
                  </span>
                ) : null}
              </button>
            ))
          ) : (
            <p className="px-3 py-4 text-sm text-[var(--ink-dim)]">No playlists yet</p>
          )}
        </div>

        <form onSubmit={createAndAdd} className="border-t border-[var(--line)] p-3">
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
              Or create new
            </span>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Playlist name"
              disabled={busy}
              className="mb-2 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
              autoFocus
            />
          </label>
          <button
            type="submit"
            disabled={busy || !newName.trim()}
            className="w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-50"
          >
            Create & add
          </button>
          {error ? <p className="mt-2 text-center text-xs text-[var(--exclusive)]">{error}</p> : null}
        </form>
      </div>
    </div>
  );
}
