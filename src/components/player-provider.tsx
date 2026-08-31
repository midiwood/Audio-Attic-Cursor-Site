"use client";

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { PlaylistPickModal } from "@/components/playlist-pick-modal";
import {
  addTrackToCurrentPlaylist,
  listPlaylistsForPicker,
  type PlaylistOption,
} from "@/lib/last-playlist";

export type PlayerTrack = {
  id: string;
  title: string;
  subtitle?: string | null;
  duration?: string | null;
  dropboxDl?: string | null;
  license?: string | null;
  /** Version or stem asset id for /api/audio?id=&asset= */
  assetId?: string | null;
  /**
   * Stream URL for tracks not yet in the catalog (import preview / blob).
   * When set, the bottom player uses this instead of `/api/audio?id=…`.
   */
  audioSrc?: string | null;
  /** Ephemeral preview — hide download / playlist actions. */
  preview?: boolean;
};

function resolveStreamUrl(track: PlayerTrack): string | null {
  if (track.audioSrc) return track.audioSrc;
  if (track.dropboxDl || track.assetId) return audioUrlFor(track.id, track.assetId);
  return null;
}

function isPlayableTrack(track: PlayerTrack): boolean {
  return Boolean(track.audioSrc || track.dropboxDl || track.assetId);
}

export { isPlayableTrack };

function absoluteMediaUrl(src: string): string {
  if (src.startsWith("blob:") || /^https?:\/\//i.test(src)) return src;
  if (typeof window === "undefined") return src;
  return `${window.location.origin}${src.startsWith("/") ? src : `/${src}`}`;
}

type PlayerContextValue = {
  current: PlayerTrack | null;
  queue: PlayerTrack[];
  isPlaying: boolean;
  flashMessage: string;
  playTrack: (track: PlayerTrack, queue?: PlayerTrack[]) => void;
  /** Keep the play queue in sync when Browse loads more rows (infinite scroll). */
  syncQueue: (list: PlayerTrack[]) => void;
  toggle: () => void;
  playNext: () => void;
  playPrev: () => void;
  seek: (time: number) => void;
  /** Stop audio and clear the player (e.g. on sign out). */
  clearPlayer: () => void;
  getAudioElement: () => HTMLAudioElement | null;
};

type PlayerProgressValue = {
  progress: number;
  duration: number;
};

/** Fired when next is pressed at the end of the loaded queue — Browse should load more. */
export const NEED_MORE_QUEUE_EVENT = "attic:need-more-queue";
/** Browse has nothing left to load — cancel pending auto-advance. */
export const QUEUE_EXHAUSTED_EVENT = "attic:queue-exhausted";
/** Scroll the current player track into view in the visible track list. */
export const SCROLL_TO_CURRENT_EVENT = "attic:scroll-to-current";

const PlayerContext = createContext<PlayerContextValue | null>(null);
/** Isolated so timeupdate does not re-render nav / track lists. */
const PlayerProgressContext = createContext<PlayerProgressValue | null>(null);

const PROGRESS_FLUSH_EVENT = "attic:player-progress-flush";

/** Sign-out / external clear without subscribing the nav to player state. */
let clearPlayerHandler: (() => void) | null = null;
export function clearAudioPlayer() {
  clearPlayerHandler?.();
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}

/** Progress/duration only — subscribe from waveform / time labels, not the page chrome. */
export function usePlayerProgress() {
  const ctx = useContext(PlayerProgressContext);
  if (!ctx) throw new Error("usePlayerProgress must be used within PlayerProvider");
  return ctx;
}

function flushPlayerProgress() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PROGRESS_FLUSH_EVENT));
}

/**
 * Owns progress React state in a nested provider so the main PlayerProvider
 * (and thus page chrome via children bailout) does not re-render on the clock.
 */
function PlayerProgressHost({
  audioRef,
  children,
}: {
  audioRef: RefObject<HTMLAudioElement | null>;
  children: ReactNode;
}) {
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const lastEmit = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let detach: (() => void) | null = null;

    const attach = () => {
      const audio = audioRef.current;
      if (!audio) {
        // Parent creates <audio> in an effect — retry once on the next frame.
        requestAnimationFrame(() => {
          if (!cancelled) attach();
        });
        return;
      }

      const emit = (force: boolean) => {
        const now = performance.now();
        // ~5 Hz is enough for the clock label; keeps the main thread free for clicks.
        if (!force && now - lastEmit.current < 200) return;
        lastEmit.current = now;
        const nextProgress = audio.currentTime || 0;
        const nextDuration =
          Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
        // Low-priority updates so a nav click is never stuck behind the playhead.
        startTransition(() => {
          setProgress(nextProgress);
          if (nextDuration) setDuration(nextDuration);
        });
      };

      const onTime = () => emit(false);
      const onMeta = () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          startTransition(() => setDuration(audio.duration));
        }
      };
      const onFlush = () => emit(true);

      audio.addEventListener("timeupdate", onTime);
      audio.addEventListener("loadedmetadata", onMeta);
      audio.addEventListener("durationchange", onMeta);
      audio.addEventListener("seeked", onFlush);
      window.addEventListener(PROGRESS_FLUSH_EVENT, onFlush);

      detach = () => {
        audio.removeEventListener("timeupdate", onTime);
        audio.removeEventListener("loadedmetadata", onMeta);
        audio.removeEventListener("durationchange", onMeta);
        audio.removeEventListener("seeked", onFlush);
        window.removeEventListener(PROGRESS_FLUSH_EVENT, onFlush);
      };
    };

    attach();

    return () => {
      cancelled = true;
      detach?.();
    };
  }, [audioRef]);

  const value = useMemo(() => ({ progress, duration }), [progress, duration]);

  return (
    <PlayerProgressContext.Provider value={value}>{children}</PlayerProgressContext.Provider>
  );
}

export function audioUrlFor(trackId: string, assetId?: string | null) {
  const params = new URLSearchParams({ id: trackId });
  if (assetId) params.set("asset", assetId);
  return `/api/audio?${params.toString()}`;
}

function waveformUrlFor(trackId: string) {
  return `/api/tracks/${encodeURIComponent(trackId)}/waveform`;
}

/** Warm browser/CDN cache for the next track(s) without blocking playback. */
export function prefetchTrackAudio(trackId: string) {
  const url = audioUrlFor(trackId);
  try {
    // Range request: enough to open the stream / fill cache headers quickly.
    void fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-262143" },
      credentials: "same-origin",
      cache: "force-cache",
      priority: "low",
    } as RequestInit).catch(() => {});
    // Peaks JSON is tiny — warm so the waveform can paint without audio decode.
    void fetch(waveformUrlFor(trackId), {
      method: "GET",
      credentials: "same-origin",
      cache: "force-cache",
      priority: "low",
    } as RequestInit).catch(() => {});
  } catch {
    // ignore
  }
}

const warmedAudioIds = new Set<string>();

/** Prefetch the first N playable tracks in list order (Browse top-of-list priority). */
export function prefetchTopPlayable(
  tracks: Array<{ id: string; dropboxDl?: string | null }>,
  count = 5,
) {
  let warmed = 0;
  for (const track of tracks) {
    if (warmed >= count) break;
    if (!track.dropboxDl) continue;
    if (warmedAudioIds.has(track.id)) continue;
    warmedAudioIds.add(track.id);
    prefetchTrackAudio(track.id);
    warmed += 1;
  }
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prefetchRef = useRef<Set<string>>(new Set());
  const currentRef = useRef<PlayerTrack | null>(null);
  const queueRef = useRef<PlayerTrack[]>([]);
  const advanceAfterExtendRef = useRef(false);
  const [current, setCurrent] = useState<PlayerTrack | null>(null);
  const [queue, setQueue] = useState<PlayerTrack[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [flashMessage, setFlashMessage] = useState("");
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [pickTrackId, setPickTrackId] = useState<string | null>(null);
  const [pickPlaylists, setPickPlaylists] = useState<PlaylistOption[]>([]);

  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    const onExhausted = () => {
      advanceAfterExtendRef.current = false;
    };
    window.addEventListener(QUEUE_EXHAUSTED_EVENT, onExhausted);
    return () => window.removeEventListener(QUEUE_EXHAUSTED_EVENT, onExhausted);
  }, []);

  const showFlash = useCallback((message: string) => {
    setFlashMessage(message);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashMessage(""), 2200);
  }, []);

  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;

    const onEnded = () => {
      setIsPlaying(false);
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener("ended", onEnded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);

    return () => {
      audio.pause();
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audioRef.current = null;
    };
  }, []);

  const prefetchNeighbors = useCallback((track: PlayerTrack, list: PlayerTrack[]) => {
    if (!list.length) return;
    const idx = list.findIndex((t) => t.id === track.id);
    const candidates = [list[idx + 1], list[idx + 2], list[idx - 1]].filter(
      Boolean,
    ) as PlayerTrack[];
    for (const next of candidates) {
      if (!isPlayableTrack(next) || next.preview || next.audioSrc) continue;
      if (prefetchRef.current.has(next.id)) continue;
      prefetchRef.current.add(next.id);
      prefetchTrackAudio(next.id);
    }
  }, []);

  const loadAndPlay = useCallback(
    async (track: PlayerTrack, list?: PlayerTrack[]) => {
      const audio = audioRef.current;
      const src = resolveStreamUrl(track);
      if (!audio || !src) return;
      const absolute = absoluteMediaUrl(src);
      const isSameSrc =
        audio.src === absolute ||
        (!src.startsWith("blob:") && !/^https?:\/\//i.test(src) && audio.src.endsWith(src));

      setCurrent(track);
      if (!isSameSrc) {
        // Setting src starts load; do not call audio.load() — it aborts an in-flight play().
        audio.src = src;
        flushPlayerProgress();
      }

      try {
        await audio.play();
      } catch {
        // Autoplay / aborted play — UI still shows the track; user can press play.
        setIsPlaying(false);
      }
      prefetchNeighbors(track, list ?? queueRef.current);
    },
    [prefetchNeighbors],
  );

  const playTrack = useCallback(
    (track: PlayerTrack, nextQueue?: PlayerTrack[]) => {
      advanceAfterExtendRef.current = false;
      if (nextQueue) {
        queueRef.current = nextQueue;
        setQueue(nextQueue);
      }
      void loadAndPlay(track, nextQueue ?? queueRef.current);
    },
    [loadAndPlay],
  );

  const syncQueue = useCallback(
    (list: PlayerTrack[]) => {
      const cur = currentRef.current;
      if (!cur) return;
      const playable = list.filter((t) => isPlayableTrack(t));
      const idx = playable.findIndex((t) => t.id === cur.id);
      if (idx < 0) return;

      const prev = queueRef.current;
      const same =
        prev.length === playable.length && prev.every((t, i) => t.id === playable[i]?.id);
      if (!same) {
        queueRef.current = playable;
        setQueue(playable);
      }

      // After ↑↓ hit the end of a loaded page, advance once more rows appear.
      if (advanceAfterExtendRef.current && idx < playable.length - 1) {
        advanceAfterExtendRef.current = false;
        const next = playable[idx + 1];
        if (next) void loadAndPlay(next, playable);
      }
    },
    [loadAndPlay],
  );

  const playNext = useCallback(() => {
    const cur = currentRef.current;
    const list = queueRef.current;
    if (!cur || !list.length) return;
    const idx = list.findIndex((t) => t.id === cur.id);
    if (idx < 0) return;
    if (idx >= list.length - 1) {
      // End of loaded page — ask Browse to fetch more, then advance when queue grows.
      advanceAfterExtendRef.current = true;
      window.dispatchEvent(
        new CustomEvent(NEED_MORE_QUEUE_EVENT, { detail: { trackId: cur.id } }),
      );
      return;
    }
    const next = list[idx + 1];
    if (next) void loadAndPlay(next, list);
  }, [loadAndPlay]);

  const playPrev = useCallback(() => {
    const cur = currentRef.current;
    const list = queueRef.current;
    if (!cur || !list.length) return;
    const idx = list.findIndex((t) => t.id === cur.id);
    if (idx <= 0) return;
    const prev = list[idx - 1];
    if (prev) void loadAndPlay(prev, list);
  }, [loadAndPlay]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => playNext();
    audio.addEventListener("ended", onEnded);
    return () => audio.removeEventListener("ended", onEnded);
  }, [playNext]);

  // Prefetch when queue/current change (e.g. after playTrack set queue)
  useEffect(() => {
    if (!current) return;
    prefetchNeighbors(current, queue);
  }, [current, queue, prefetchNeighbors]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  }, [current]);

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = time;
    flushPlayerProgress();
  }, []);

  const seekBy = useCallback(
    (deltaSec: number) => {
      const audio = audioRef.current;
      if (!audio || !current) return;
      const total =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : Infinity;
      const next = Math.max(0, Math.min((audio.currentTime || 0) + deltaSec, total));
      audio.currentTime = next;
      flushPlayerProgress();
    },
    [current],
  );

  const clearPlayer = useCallback(() => {
    advanceAfterExtendRef.current = false;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      try {
        audio.load();
      } catch {
        // ignore
      }
    }
    currentRef.current = null;
    queueRef.current = [];
    setCurrent(null);
    setQueue([]);
    setIsPlaying(false);
    setFlashMessage("");
    setPickOpen(false);
    setPickTrackId(null);
    setPickPlaylists([]);
    flushPlayerProgress();
    document.documentElement.style.setProperty("--bottom-player-height", "0px");
  }, []);

  useEffect(() => {
    clearPlayerHandler = clearPlayer;
    return () => {
      if (clearPlayerHandler === clearPlayer) clearPlayerHandler = null;
    };
  }, [clearPlayer]);

  // Transport keys: Space play/pause · P quick-add · L choose/create playlist · ↑↓ ←→
  useEffect(() => {
    if (!current) return;

    const isTypingTarget = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (el.isContentEditable) return true;
      return Boolean(el.closest("[contenteditable='true']"));
    };

    const openPlaylistPicker = (trackId: string) => {
      void listPlaylistsForPicker().then((playlists) => {
        setPickTrackId(trackId);
        setPickPlaylists(playlists);
        setPickOpen(true);
      });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (pickOpen) return;

      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        toggle();
        return;
      }

      if (e.key === "p" || e.key === "P") {
        if (current.preview) return;
        e.preventDefault();
        const trackId = current.id;
        void addTrackToCurrentPlaylist(trackId).then((result) => {
          if (result.needsPick) {
            setPickTrackId(trackId);
            setPickPlaylists(result.playlists || []);
            setPickOpen(true);
            return;
          }
          if (result.ok) {
            showFlash(`Added to ${result.playlistName}`);
          } else {
            showFlash(result.error || "Could not add");
          }
        });
        return;
      }

      if (e.key === "l" || e.key === "L") {
        if (current.preview) return;
        e.preventDefault();
        openPlaylistPicker(current.id);
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          playNext();
          break;
        case "ArrowUp":
          e.preventDefault();
          playPrev();
          break;
        case "ArrowRight":
          e.preventDefault();
          seekBy(10);
          break;
        case "ArrowLeft":
          e.preventDefault();
          seekBy(-10);
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [current, playNext, playPrev, seekBy, toggle, showFlash, pickOpen]);

  const getAudioElement = useCallback(() => audioRef.current, []);

  const value = useMemo(
    () => ({
      current,
      queue,
      isPlaying,
      flashMessage,
      playTrack,
      syncQueue,
      toggle,
      playNext,
      playPrev,
      seek,
      clearPlayer,
      getAudioElement,
    }),
    [
      current,
      queue,
      isPlaying,
      flashMessage,
      playTrack,
      syncQueue,
      toggle,
      playNext,
      playPrev,
      seek,
      clearPlayer,
      getAudioElement,
    ],
  );

  return (
    <PlayerContext.Provider value={value}>
      <PlayerProgressHost audioRef={audioRef}>
        {children}
        {pickTrackId ? (
          <PlaylistPickModal
            open={pickOpen}
            trackId={pickTrackId}
            playlists={pickPlaylists}
            onClose={() => {
              setPickOpen(false);
              setPickTrackId(null);
            }}
            onAdded={(playlistName) => {
              setPickOpen(false);
              setPickTrackId(null);
              showFlash(`Added to ${playlistName}`);
            }}
          />
        ) : null}
      </PlayerProgressHost>
    </PlayerContext.Provider>
  );
}
