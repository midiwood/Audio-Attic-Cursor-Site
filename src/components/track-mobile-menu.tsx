"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AutoOpenAddToPlaylist } from "@/components/auto-open-add-to-playlist";
import { IconMoreVertical } from "@/components/icon-more-vertical";
import { placeMenuBesideAnchor, type MenuPos } from "@/lib/fixed-menu-position";

const MENU_WIDTH = 200;

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

export function TrackMobileMenu({
  trackTitle,
  trackId,
  showAddToPlaylist = false,
  onRemoveFromPlaylist,
  onTrackInfo,
  expanded = false,
}: {
  trackTitle: string;
  trackId: string;
  showAddToPlaylist?: boolean;
  onRemoveFromPlaylist?: () => void;
  onTrackInfo: () => void;
  expanded?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [playlistNonce, setPlaylistNonce] = useState(0);
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<MenuPos | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  function placeMenu() {
    const button = buttonRef.current;
    if (!button) return;
    setPos(
      placeMenuBesideAnchor(button.getBoundingClientRect(), {
        width: MENU_WIDTH,
        height: menuRef.current?.offsetHeight || 140,
      }),
    );
  }

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      setPos(null);
      return;
    }
    placeMenu();
    const frame = requestAnimationFrame(() => placeMenu());
    function onReposition() {
      placeMenu();
    }
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    window.visualViewport?.addEventListener("resize", onReposition);
    window.visualViewport?.addEventListener("scroll", onReposition);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
      window.visualViewport?.removeEventListener("resize", onReposition);
      window.visualViewport?.removeEventListener("scroll", onReposition);
    };
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
            style={{ top: pos.top, left: pos.left }}
            className="fixed z-[100] w-[200px] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] py-1 shadow-[0_16px_40px_rgba(0,0,0,0.5)]"
            role="menu"
          >
            <MenuItem
              onClick={() => {
                setOpen(false);
                onTrackInfo();
              }}
            >
              {expanded ? "Hide track info" : "Track info"}
            </MenuItem>
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
            {onRemoveFromPlaylist ? (
              <MenuItem
                onClick={() => {
                  setOpen(false);
                  onRemoveFromPlaylist();
                }}
              >
                Remove from playlist
              </MenuItem>
            ) : null}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="lg:hidden">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="grid h-9 w-9 place-items-center rounded-lg text-[var(--ink-dim)] transition hover:bg-white/5 hover:text-[var(--ink)]"
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
