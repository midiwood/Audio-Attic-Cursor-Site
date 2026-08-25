"use client";

/**
 * Visual-only waveform for the bottom player.
 *
 * CRITICAL: Never pass the PlayerProvider <audio> as WaveSurfer `media`.
 * WaveSurfer.destroy() pauses the media and removes its src — that was
 * causing play → waveform mount → audio killed → second click needed.
 *
 * When peaks exist in the DB, render instantly (no audio decode).
 * First play still decodes once, then POSTs peaks for next time.
 */

import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { usePlayer, usePlayerProgress } from "@/components/player-provider";
import {
  WAVEFORM_PEAKS_CHANNELS,
  WAVEFORM_PEAKS_MAX_LENGTH,
  WAVEFORM_PEAKS_PRECISION,
  waveformApiUrl,
  type WaveformPeaks,
} from "@/lib/waveform";

const WAVE_COLOR = "#5b6f88";
const PROGRESS_COLOR = "#ffffff";
const CURSOR_COLOR = "#ffffff";

const savingPeaks = new Set<string>();

async function fetchStoredPeaks(
  trackId: string,
): Promise<{ peaks: WaveformPeaks; duration: number } | null> {
  try {
    const res = await fetch(waveformApiUrl(trackId), {
      credentials: "same-origin",
      cache: "force-cache",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      peaks?: WaveformPeaks;
      duration?: number;
    };
    if (!Array.isArray(data.peaks) || !data.peaks.length) return null;
    const duration = Number(data.duration);
    if (!Number.isFinite(duration) || duration <= 0) return null;
    return { peaks: data.peaks, duration };
  } catch {
    return null;
  }
}

function persistPeaks(trackId: string, ws: WaveSurfer) {
  if (savingPeaks.has(trackId)) return;
  savingPeaks.add(trackId);
  try {
    const peaks = ws.exportPeaks({
      channels: WAVEFORM_PEAKS_CHANNELS,
      maxLength: WAVEFORM_PEAKS_MAX_LENGTH,
      precision: WAVEFORM_PEAKS_PRECISION,
    });
    const duration = ws.getDuration();
    if (!peaks?.length || !Number.isFinite(duration) || duration <= 0) {
      savingPeaks.delete(trackId);
      return;
    }
    void fetch(waveformApiUrl(trackId), {
      method: "PUT",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ peaks, duration }),
    })
      .catch(() => {})
      .finally(() => {
        // Allow retry later if save failed; success keeps id in set for session.
      });
  } catch {
    savingPeaks.delete(trackId);
  }
}

export function PlayerWaveform({ height = 36 }: { height?: number }) {
  const { current, seek } = usePlayer();
  const { progress } = usePlayerProgress();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const seekRef = useRef(seek);
  const progressRef = useRef(progress);
  const seekingRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const trackId = current?.id ?? null;
  const audioSrc = current?.audioSrc ?? null;
  const isPreview = Boolean(current?.preview || audioSrc);

  useEffect(() => {
    seekRef.current = seek;
  }, [seek]);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !trackId) return;

    let cancelled = false;
    setReady(false);
    setFailed(false);
    el.innerHTML = "";

    const baseOptions = {
      container: el,
      height,
      barWidth: 2,
      barGap: 1,
      barRadius: 1,
      waveColor: WAVE_COLOR,
      progressColor: PROGRESS_COLOR,
      cursorColor: CURSOR_COLOR,
      cursorWidth: 2,
      normalize: true,
      fillParent: true,
      dragToSeek: true,
      interact: true,
    } as const;

    const bindCommon = (ws: WaveSurfer, persist: boolean) => {
      wsRef.current = ws;

      const onReady = () => {
        if (cancelled) return;
        ws.setOptions({
          waveColor: WAVE_COLOR,
          progressColor: PROGRESS_COLOR,
          cursorColor: CURSOR_COLOR,
        });
        try {
          const total = ws.getDuration();
          if (total > 0) {
            ws.setTime(Math.max(0, Math.min(progressRef.current, total)));
          }
        } catch {
          // ignore
        }
        if (persist && !isPreview) persistPeaks(trackId, ws);
        setReady(true);
      };

      const onInteraction = (time: number) => {
        seekingRef.current = true;
        seekRef.current(time);
        requestAnimationFrame(() => {
          seekingRef.current = false;
        });
      };

      const onPlay = () => {
        if (ws.isPlaying()) ws.pause();
      };

      const onError = (err: Error) => {
        if (cancelled) return;
        const message = String(err?.message || err || "");
        if (/abort/i.test(message)) return;
        setFailed(true);
      };

      ws.on("ready", onReady);
      ws.on("interaction", onInteraction);
      ws.on("play", onPlay);
      ws.on("error", onError);

      return () => {
        try {
          ws.un("ready", onReady);
          ws.un("interaction", onInteraction);
          ws.un("play", onPlay);
          ws.un("error", onError);
          ws.destroy();
        } catch {
          // ignore
        }
      };
    };

    let cleanupWs: (() => void) | null = null;

    void (async () => {
      if (!isPreview) {
        const stored = await fetchStoredPeaks(trackId);
        if (cancelled) return;

        if (stored) {
          // Peaks-only: no silent media, no Dropbox fetch for the waveform.
          const ws = WaveSurfer.create({
            ...baseOptions,
            peaks: stored.peaks,
            duration: stored.duration,
          });
          if (cancelled) {
            try {
              ws.destroy();
            } catch {
              // ignore
            }
            return;
          }
          cleanupWs = bindCommon(ws, false);
          return;
        }
      }

      const url = audioSrc || `/api/audio?id=${encodeURIComponent(trackId)}`;
      const ws = WaveSurfer.create({
        ...baseOptions,
        url,
        sampleRate: 8000,
        fetchParams: {
          credentials: "same-origin",
          cache: "force-cache",
        },
      });
      if (cancelled) {
        try {
          ws.destroy();
        } catch {
          // ignore
        }
        return;
      }
      try {
        ws.setVolume(0);
        ws.getMediaElement().muted = true;
      } catch {
        // ignore
      }
      cleanupWs = bindCommon(ws, !isPreview);
    })();

    return () => {
      cancelled = true;
      wsRef.current = null;
      cleanupWs?.();
    };
  }, [trackId, audioSrc, isPreview, height]);

  // Sync visual playhead from the real player clock.
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || !ready || seekingRef.current) return;
    const total = ws.getDuration();
    if (!total || !Number.isFinite(total)) return;
    const next = Math.max(0, Math.min(progress, total));
    if (Math.abs(ws.getCurrentTime() - next) > 0.05) {
      ws.setTime(next);
    }
  }, [progress, ready]);

  return (
    <div className="player-waveform-inner relative min-w-0 w-full" style={{ minHeight: height }}>
      {/* Seek is always the interactive control until waveform is ready (and if it fails). */}
      <div
        className={`absolute inset-0 z-10 flex items-center transition-opacity duration-200 ${
          ready && !failed ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        <PlayerSeekBar />
      </div>

      <div
        ref={containerRef}
        className={`w-full min-w-0 cursor-pointer transition-opacity duration-200 ${
          ready && !failed ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        style={{ height, minHeight: height }}
        aria-hidden={!ready || failed}
        aria-label="Seek waveform"
      />
    </div>
  );
}

function PlayerSeekBar() {
  const { seek } = usePlayer();
  const { progress, duration } = usePlayerProgress();
  const max = duration > 0 ? duration : 0;
  const value = max > 0 ? Math.min(progress, max) : 0;

  return (
    <input
      type="range"
      min={0}
      max={max || 1}
      step={0.1}
      value={value}
      disabled={max <= 0}
      onChange={(e) => seek(Number(e.target.value))}
      className="h-1.5 w-full min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-[var(--bg-soft)] accent-[var(--accent)] disabled:cursor-default disabled:opacity-50"
      aria-label="Seek"
    />
  );
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function PlayerTime({
  which,
  className = "",
}: {
  which: "current" | "duration";
  className?: string;
}) {
  const { progress, duration } = usePlayerProgress();
  return (
    <span className={`shrink-0 text-xs tabular-nums text-[var(--ink-dim)] ${className}`}>
      {formatTime(which === "current" ? progress : duration)}
    </span>
  );
}
