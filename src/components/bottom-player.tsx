"use client";

import { useLayoutEffect, useRef } from "react";
import { PlayerOverflowMenu } from "@/components/player-overflow-menu";
import { AddToPlaylistButton } from "@/components/add-to-playlist-button";
import { isPlayableTrack, SCROLL_TO_CURRENT_EVENT, usePlayer } from "@/components/player-provider";
import { PlayerProgressBar, PlayerTime, PlayerWaveform } from "@/components/player-waveform";
import { authClient } from "@/lib/auth-client";
import { licenseLabel, normalizeLicenseStatus } from "@/lib/tracks";

function setPlayerHeightVar(px: number) {
  document.documentElement.style.setProperty(
    "--bottom-player-height",
    `${Math.max(0, Math.ceil(px))}px`,
  );
}

function isStaffRole(role: unknown): boolean {
  if (role === "admin" || role === "editor") return true;
  if (typeof role === "string") {
    const parts = role.split(",");
    return parts.includes("admin") || parts.includes("editor");
  }
  return false;
}

function TransportControls({
  isPlaying,
  toggle,
  playPrev,
  playNext,
  compact = false,
}: {
  isPlaying: boolean;
  toggle: () => void;
  playPrev: () => void;
  playNext: () => void;
  compact?: boolean;
}) {
  const btnClass = compact
    ? "grid h-10 w-10 place-items-center rounded-full text-[var(--ink-muted)] transition hover:bg-white/5 hover:text-[var(--ink)]"
    : "grid h-9 w-9 place-items-center rounded-full text-[var(--ink-muted)] transition hover:bg-white/5 hover:text-[var(--ink)]";
  const playClass = compact
    ? "grid h-10 w-10 place-items-center rounded-full bg-[var(--accent)] text-white shadow-[0_0_0_3px_var(--accent-soft)] transition hover:brightness-110"
    : "grid h-10 w-10 place-items-center rounded-full bg-[var(--accent)] text-white shadow-[0_0_0_4px_var(--accent-soft)] transition hover:brightness-110";

  return (
    <div className={`flex items-center ${compact ? "shrink-0 gap-1" : "justify-start gap-1.5 md:justify-center"}`}>
      <button
        type="button"
        onClick={playPrev}
        className={btnClass}
        aria-label="Previous track"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M6 6h2v12H6V6zm3.5 6 8.5 6V6l-8.5 6z" />
        </svg>
      </button>
      <button
        type="button"
        onClick={toggle}
        className={playClass}
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M7 6h3v12H7V6zm7 0h3v12h-3V6z" />
          </svg>
        ) : (
          <svg className="ml-0.5 h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M8 5.5v13l11-6.5L8 5.5z" />
          </svg>
        )}
      </button>
      <button
        type="button"
        onClick={playNext}
        className={btnClass}
        aria-label="Next track"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M16 6h2v12h-2V6zM6 18l8.5-6L6 6v12z" />
        </svg>
      </button>
    </div>
  );
}

export function BottomPlayer() {
  const { current, isPlaying, toggle, playNext, playPrev, flashMessage } = usePlayer();
  const { data: session } = authClient.useSession();
  const showLicense = isStaffRole(session?.user?.role);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const trackId = current?.id ?? null;

  useLayoutEffect(() => {
    if (!trackId) {
      setPlayerHeightVar(0);
      return;
    }

    let ro: ResizeObserver | null = null;
    let raf = 0;

    const attach = () => {
      const el = shellRef.current;
      if (!el) {
        raf = requestAnimationFrame(attach);
        return;
      }
      const apply = () => {
        const shell = shellRef.current;
        if (!shell) return;
        let h = 0;
        for (const child of shell.children) {
          const node = child as HTMLElement;
          if (getComputedStyle(node).display === "none") continue;
          h = Math.max(h, Math.ceil(node.getBoundingClientRect().height));
        }
        const next = h > 0 ? h : 72;
        setPlayerHeightVar(next);
      };
      apply();
      ro = new ResizeObserver(apply);
      ro.observe(el);
    };

    attach();

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [trackId]);

  if (!current) return null;

  const status = normalizeLicenseStatus(current.license);

  return (
      <div
        ref={shellRef}
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 lg:left-[var(--nav-width)]"
      >
        {/* Mobile: title + transport */}
        <div className="player-mobile pointer-events-auto bg-[rgba(8,14,22,0.94)] pb-[max(0.625rem,env(safe-area-inset-bottom,0px))] shadow-[0_-12px_40px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
          <PlayerProgressBar className="player-progress-bar-edge" />
          <div className="flex min-h-14 items-center gap-2 px-4 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold tracking-tight text-[var(--ink)]">
                {current.title}
              </div>
              {flashMessage ? (
                <div className="truncate text-[11px] text-[var(--available)]">{flashMessage}</div>
              ) : showLicense && !current.preview ? (
                <div
                  className={`truncate text-[11px] ${
                    status === "clear"
                      ? "text-[var(--available)]"
                      : status === "library"
                        ? "text-[var(--library)]"
                        : status === "exclusive"
                          ? "text-[var(--exclusive)]"
                          : status === "personal"
                            ? "text-[var(--personal)]"
                            : "text-[var(--hold)]"
                  }`}
                >
                  {licenseLabel(current.license)}
                </div>
              ) : null}
            </div>
            <TransportControls
              compact
              isPlaying={isPlaying}
              toggle={toggle}
              playPrev={playPrev}
              playNext={playNext}
            />
            {!current.preview ? (
              <PlayerOverflowMenu
                trackId={current.id}
                trackTitle={current.title}
                showGoToTrack
                showAddToPlaylist
                className="shrink-0"
              />
            ) : null}
          </div>
        </div>

        {/* Desktop: full player */}
        <div className="player-desktop pointer-events-auto border-t border-[var(--line)] bg-[rgba(8,14,22,0.94)] shadow-[0_-12px_40px_rgba(0,0,0,0.35)] backdrop-blur-2xl lg:border-l lg:border-[var(--line)]">
          <div className="mx-auto grid max-w-[1600px] items-center gap-5 px-6 py-2.5 grid-cols-[minmax(0,1fr)_auto_minmax(0,1.4fr)_auto]">
            <div className="min-w-0 order-1">
              <div className="truncate text-sm font-semibold tracking-tight text-[var(--ink)] md:text-[15px]">
                {current.title}
              </div>
              <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[11px] text-[var(--ink-dim)]">
                {flashMessage ? (
                  <span className="min-w-0 truncate text-[var(--available)]">{flashMessage}</span>
                ) : current.subtitle ? (
                  <span className="min-w-0 truncate">{current.subtitle}</span>
                ) : null}
                {!flashMessage && showLicense && !current.preview ? (
                  <span
                    className={`shrink-0 ${
                      status === "clear"
                        ? "text-[var(--available)]"
                        : status === "library"
                          ? "text-[var(--library)]"
                          : status === "exclusive"
                            ? "text-[var(--exclusive)]"
                            : status === "personal"
                              ? "text-[var(--personal)]"
                              : "text-[var(--hold)]"
                    }`}
                  >
                    {licenseLabel(current.license)}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="order-2">
              <TransportControls
                isPlaying={isPlaying}
                toggle={toggle}
                playPrev={playPrev}
                playNext={playNext}
              />
            </div>

            <div className="order-4 flex min-w-0 items-center gap-2.5 md:order-3">
              <PlayerTime which="current" className="w-9 text-right text-[11px]" />
              <div className="player-waveform min-w-0 flex-1 overflow-hidden">
                <PlayerWaveform height={36} />
              </div>
              <PlayerTime which="duration" className="w-9 text-[11px]" />
            </div>

            <div className="order-3 ml-auto flex items-center gap-1 md:order-4 md:ml-0">
              {!current.preview ? (
                <button
                  type="button"
                  onClick={() => {
                    window.dispatchEvent(new Event(SCROLL_TO_CURRENT_EVENT));
                  }}
                  className="grid h-9 w-9 place-items-center rounded-full text-[var(--ink-muted)] transition hover:bg-white/5 hover:text-[var(--ink)]"
                  aria-label="Go to track in list"
                  title="Go to track"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M12 4v4m0 8v4M4 12h4m8 0h4"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                    />
                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
                  </svg>
                </button>
              ) : null}
              {!current.preview && isPlayableTrack(current) ? (
                <a
                  href={`/api/audio?id=${encodeURIComponent(current.id)}&download=1`}
                  className="grid h-9 w-9 place-items-center rounded-full text-[var(--ink-muted)] transition hover:bg-white/5 hover:text-[var(--ink)]"
                  aria-label="Download track"
                  title="Download"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M12 4v10m0 0 4-4m-4 4-4-4M5 18h14"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </a>
              ) : null}
              {!current.preview ? (
                <div className="player-playlist-btn [&_button]:grid [&_button]:h-9 [&_button]:w-9 [&_button]:place-items-center [&_button]:rounded-full [&_button]:border-0 [&_button]:bg-transparent [&_button]:text-[var(--ink-muted)] [&_button]:shadow-none [&_button]:hover:bg-white/5 [&_button]:hover:text-[var(--ink)]">
                  <AddToPlaylistButton trackId={current.id} />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
  );
}
