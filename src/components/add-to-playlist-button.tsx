"use client";

import { FormEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { setLastPlaylist } from "@/lib/last-playlist";
import { placeMenuBesideAnchor, type MenuPos } from "@/lib/fixed-menu-position";

type PlaylistOption = {
  id: string;
  name: string;
  trackCount: number;
  isOwner?: boolean;
};

const MENU_WIDTH = 272;

function useIsMobileFrame() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return mobile;
}

function PickerBody({
  playlists,
  loading,
  message,
  newName,
  setNewName,
  onAdd,
  onCreate,
}: {
  playlists: PlaylistOption[];
  loading: boolean;
  message: string;
  newName: string;
  setNewName: (value: string) => void;
  onAdd: (id: string, name?: string) => void;
  onCreate: (e: FormEvent) => void;
}) {
  return (
    <>
      <div className="max-h-48 overflow-auto p-1">
        {loading ? (
          <div className="px-3 py-3 text-sm text-[var(--ink-dim)]">Loading…</div>
        ) : playlists.length ? (
          playlists.map((playlist) => (
            <button
              key={playlist.id}
              type="button"
              onClick={() => onAdd(playlist.id, playlist.name)}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm text-[var(--ink)] transition hover:bg-[var(--accent-soft)]"
            >
              <span className="truncate">{playlist.name}</span>
              <span className="text-xs text-[var(--ink-dim)]">{playlist.trackCount}</span>
            </button>
          ))
        ) : (
          <div className="px-3 py-3 text-sm text-[var(--ink-dim)]">No playlists yet</div>
        )}
      </div>
      <form onSubmit={onCreate} className="border-t border-[var(--line)] p-2">
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
    </>
  );
}

export function AddToPlaylistButton({
  trackId,
  autoOpen = false,
}: {
  trackId: string;
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [playlists, setPlaylists] = useState<PlaylistOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [newName, setNewName] = useState("");
  const [pos, setPos] = useState<MenuPos | null>(null);
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const isMobile = useIsMobileFrame();
  const useSheet = autoOpen || isMobile;

  useEffect(() => {
    setMounted(true);
  }, []);

  function placeMenu() {
    const button = buttonRef.current;
    const menu = menuRef.current;
    if (!button) return;
    const next = placeMenuBesideAnchor(button.getBoundingClientRect(), {
      width: MENU_WIDTH,
      height: menu?.offsetHeight || 320,
    });
    setPos(next);
  }

  useLayoutEffect(() => {
    if (!open || useSheet) {
      if (!open) setPos(null);
      return;
    }
    placeMenu();
    function onReposition() {
      placeMenu();
    }
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    window.visualViewport?.addEventListener("resize", onReposition);
    window.visualViewport?.addEventListener("scroll", onReposition);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
      window.visualViewport?.removeEventListener("resize", onReposition);
      window.visualViewport?.removeEventListener("scroll", onReposition);
    };
  }, [open, useSheet, playlists, loading, message]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      if (useSheet) return;
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
  }, [open, useSheet]);

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

  useEffect(() => {
    if (!autoOpen) return;
    void openMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open once on mount
  }, [autoOpen]);

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
      playlistName || playlists.find((p) => p.id === playlistId)?.name || "playlist";
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

  const picker = (
    <PickerBody
      playlists={playlists}
      loading={loading}
      message={message}
      newName={newName}
      setNewName={setNewName}
      onAdd={(id, name) => void addTo(id, name)}
      onCreate={(e) => void createAndAdd(e)}
    />
  );

  const sheet =
    open && mounted && useSheet
      ? createPortal(
          <div className="fixed inset-x-0 top-[var(--mobile-chrome-top)] bottom-[var(--mobile-chrome-bottom)] z-[100] flex items-end justify-center p-3 lg:items-center">
            <button
              type="button"
              className="absolute inset-0 bg-black/50"
              aria-label="Close"
              onClick={() => setOpen(false)}
            />
            <div
              ref={menuRef}
              role="dialog"
              aria-modal="true"
              aria-label="Add to playlist"
              className="relative z-[1] w-full max-w-lg max-h-full overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] font-sans shadow-[0_20px_50px_rgba(0,0,0,0.55)]"
            >
              <div className="flex items-center justify-between border-b border-[var(--line)] px-3 py-2.5">
                <span className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
                  Add to playlist
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md px-2 py-1 text-sm text-[var(--accent)]"
                >
                  Done
                </button>
              </div>
              {picker}
            </div>
          </div>,
          document.body,
        )
      : null;

  const popover =
    open && mounted && !useSheet && pos
      ? createPortal(
          <div
            ref={menuRef}
            style={{ top: pos.top, left: pos.left }}
            className="fixed z-[100] w-[272px] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] font-sans shadow-[0_20px_50px_rgba(0,0,0,0.55)]"
          >
            <div className="border-b border-[var(--line)] px-3 py-2 text-xs font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
              Add to playlist
            </div>
            {picker}
          </div>,
          document.body,
        )
      : null;

  if (autoOpen) {
    return sheet;
  }

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
      {useSheet ? sheet : popover}
    </>
  );
}
