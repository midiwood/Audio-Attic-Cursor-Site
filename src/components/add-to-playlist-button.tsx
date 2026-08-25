"use client";

import { FormEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { setLastPlaylist } from "@/lib/last-playlist";

type PlaylistOption = {
  id: string;
  name: string;
  trackCount: number;
  isOwner?: boolean;
};

type MenuPos = { top: number; left: number };

export function AddToPlaylistButton({ trackId }: { trackId: string }) {
  const [open, setOpen] = useState(false);
  const [playlists, setPlaylists] = useState<PlaylistOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [newName, setNewName] = useState("");
  const [pos, setPos] = useState<MenuPos | null>(null);
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  function placeMenu() {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const menuWidth = 272;
    const gap = 8;
    const left = Math.min(
      Math.max(12, rect.right - menuWidth),
      window.innerWidth - menuWidth - 12,
    );
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const estimatedHeight = 320;
    const openUp = spaceBelow < estimatedHeight && rect.top > spaceBelow;
    const top = openUp ? Math.max(12, rect.top - gap) : rect.bottom + gap;
    setPos({
      top,
      left,
    });
    // If opening upward, we'll flip with transform after measuring
    if (openUp && menuRef.current) {
      const height = menuRef.current.offsetHeight || estimatedHeight;
      setPos({
        top: Math.max(12, rect.top - height - gap),
        left,
      });
    }
  }

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    placeMenu();
    function onReposition() {
      placeMenu();
    }
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !pos || !menuRef.current || !buttonRef.current) return;
    const button = buttonRef.current.getBoundingClientRect();
    const menu = menuRef.current.getBoundingClientRect();
    const gap = 8;
    const spaceBelow = window.innerHeight - button.bottom - gap;
    if (spaceBelow < menu.height && button.top > spaceBelow) {
      const top = Math.max(12, button.top - menu.height - gap);
      if (Math.abs(top - pos.top) > 1) setPos((prev) => (prev ? { ...prev, top } : prev));
    }
  }, [open, pos, playlists, loading, message]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function loadPlaylists() {
    setLoading(true);
    const res = await fetch("/api/playlists");
    const data = await res.json().catch(() => ({}));
    const all = (data.playlists || []) as PlaylistOption[];
    setPlaylists(all.filter((p) => p.isOwner !== false));
    setLoading(false);
  }

  async function openMenu() {
    setMessage("");
    setOpen(true);
    await loadPlaylists();
  }

  async function addTo(playlistId: string, playlistName?: string) {
    setMessage("");
    const res = await fetch("/api/playlists", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "add", playlistId, trackId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error || "Could not add");
      return;
    }
    const name =
      playlistName ||
      playlists.find((p) => p.id === playlistId)?.name ||
      "playlist";
    setLastPlaylist({ id: playlistId, name });
    setMessage("Added");
    await loadPlaylists();
  }

  async function createAndAdd(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const createRes = await fetch("/api/playlists", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "create", name }),
    });
    const createData = await createRes.json().catch(() => ({}));
    if (!createRes.ok) {
      setMessage(createData.error || "Could not create");
      return;
    }
    setNewName("");
    await addTo(createData.playlist.id, createData.playlist.name || name);
  }

  const menu =
    open && mounted && pos
      ? createPortal(
          <div
            ref={menuRef}
            style={{ top: pos.top, left: pos.left }}
            className="fixed z-[100] w-[272px] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] font-sans shadow-[0_20px_50px_rgba(0,0,0,0.55)]"
          >
            <div className="border-b border-[var(--line)] px-3 py-2 text-xs font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
              Add to playlist
            </div>
            <div className="max-h-48 overflow-auto p-1">
              {loading ? (
                <div className="px-3 py-3 text-sm text-[var(--ink-dim)]">Loading…</div>
              ) : playlists.length ? (
                playlists.map((playlist) => (
                  <button
                    key={playlist.id}
                    type="button"
                    onClick={() => void addTo(playlist.id, playlist.name)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-[var(--ink)] transition hover:bg-[var(--accent-soft)]"
                  >
                    <span className="truncate">{playlist.name}</span>
                    <span className="text-xs text-[var(--ink-dim)]">{playlist.trackCount}</span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-3 text-sm text-[var(--ink-dim)]">No playlists yet</div>
              )}
            </div>
            <form onSubmit={createAndAdd} className="border-t border-[var(--line)] p-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="New playlist name"
                className="mb-2 w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-2.5 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
              />
              <button
                type="submit"
                className="w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition hover:brightness-110"
              >
                Create & add
              </button>
              {message ? (
                <p className="mt-2 text-center text-xs text-[var(--available)]">{message}</p>
              ) : null}
            </form>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? setOpen(false) : void openMenu())}
        className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--line)] text-sm text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)]"
        aria-label="Add to playlist"
        title="Add to playlist"
        aria-expanded={open}
      >
        +
      </button>
      {menu}
    </>
  );
}
