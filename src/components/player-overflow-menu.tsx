"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AutoOpenAddToPlaylist } from "@/components/auto-open-add-to-playlist";
import { IconMoreVertical } from "@/components/icon-more-vertical";
import { SCROLL_TO_CURRENT_EVENT } from "@/components/player-provider";

function MenuItem({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full px-3 py-2.5 text-left text-sm text-[var(--ink)] transition hover:bg-[var(--accent-soft)]"
    >
      {children}
    </button>
  );
}

export function PlayerOverflowMenu({
  trackId,
  trackTitle,
  showAddToPlaylist = true,
  showGoToTrack = true,
  className = "",
}: {
  trackId: string;
  trackTitle: string;
  showAddToPlaylist?: boolean;
  showGoToTrack?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [playlistNonce, setPlaylistNonce] = useState(0);
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      setPos(null);
      return;
    }
    const rect = buttonRef.current.getBoundingClientRect();
    const menuWidth = 200;
    const gap = 8;
    const left = Math.min(
      Math.max(12, rect.right - menuWidth),
      window.innerWidth - menuWidth - 12,
    );
    const top = rect.top - gap;
    setPos({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const menu =
    open && mounted && pos
      ? createPortal(
          <div
            ref={menuRef}
            style={{ top: pos.top, left: pos.left, transform: "translateY(-100%)" }}
            className="fixed z-[100] w-[200px] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] py-1 shadow-[0_16px_40px_rgba(0,0,0,0.5)]"
            role="menu"
          >
            {showGoToTrack ? (
              <MenuItem
                onClick={() => {
                  setOpen(false);
                  window.dispatchEvent(new Event(SCROLL_TO_CURRENT_EVENT));
                }}
              >
                Go to track
              </MenuItem>
            ) : null}
            {showAddToPlaylist ? (
              <MenuItem
                onClick={() => {
                  setOpen(false);
                  setPlaylistNonce((n) => n + 1);
                }}
              >
                Add to playlist
              </MenuItem>
            ) : null}
          </div>,
          document.body,
        )
      : null;

  if (!showGoToTrack && !showAddToPlaylist) return null;

  return (
    <div className={className}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="grid h-9 w-9 place-items-center rounded-full text-[var(--ink-muted)] transition hover:bg-white/5 hover:text-[var(--ink)]"
        aria-label={`More actions for ${trackTitle}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <IconMoreVertical className="h-5 w-5" />
      </button>
      {menu}
      {playlistNonce > 0 ? (
        <AutoOpenAddToPlaylist key={playlistNonce} trackId={trackId} />
      ) : null}
    </div>
  );
}
