"use client";

import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { formatAudioDuration } from "@/lib/tag-tones";
import {
  WAVEFORM_PEAKS_CHANNELS,
  WAVEFORM_PEAKS_MAX_LENGTH,
  WAVEFORM_PEAKS_PRECISION,
  waveformApiUrl,
  type WaveformPeaks,
} from "@/lib/waveform";

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${mins}:${secs}`;
}

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
    }).catch(() => {
      savingPeaks.delete(trackId);
    });
  } catch {
    savingPeaks.delete(trackId);
  }
}

export function AudioWaveform({
  url,
  trackId,
  playing = false,
  onPlayingChange,
  onDuration,
  height = 36,
}: {
  url: string;
  /** When set, load/save peaks from DB so decode only happens once. */
  trackId?: string | null;
  playing?: boolean;
  onPlayingChange?: (playing: boolean) => void;
  /** Fired once audio is decoded — seconds, and formatted m:ss */
  onDuration?: (seconds: number, formatted: string) => void;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const onPlayingChangeRef = useRef(onPlayingChange);
  const onDurationRef = useRef(onDuration);
  const reportedDurationRef = useRef("");
  const [ready, setReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    onPlayingChangeRef.current = onPlayingChange;
  }, [onPlayingChange]);

  useEffect(() => {
    onDurationRef.current = onDuration;
  }, [onDuration]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !url) return;

    let cancelled = false;
    let cleanupWs: (() => void) | null = null;
    setReady(false);
    setError("");
    setCurrentTime(0);
    setDuration(0);
    reportedDurationRef.current = "";
    el.innerHTML = "";

    const reportDuration = (secs: number) => {
      const formatted = formatAudioDuration(secs);
      if (!formatted || reportedDurationRef.current === formatted) return;
      reportedDurationRef.current = formatted;
      onDurationRef.current?.(secs, formatted);
    };

    const bind = (ws: WaveSurfer, persist: boolean) => {
      wsRef.current = ws;

      const onReady = () => {
        if (cancelled) return;
        const secs = ws.getDuration();
        setReady(true);
        setDuration(secs);
        reportDuration(secs);
        if (persist && trackId) persistPeaks(trackId, ws);
      };
      const onPlay = () => onPlayingChangeRef.current?.(true);
      const onPause = () => onPlayingChangeRef.current?.(false);
      const onFinish = () => onPlayingChangeRef.current?.(false);
      const onTime = (t: number) => setCurrentTime(t);
      const onError = (err: Error) => {
        if (cancelled) return;
        const message = String(err?.message || err || "");
        if (/abort/i.test(message)) return;
        if (!/failed to fetch/i.test(message)) {
          console.error("WaveSurfer error", err);
        }
        setError("Could not load audio preview");
        try {
          const audio = new Audio();
          audio.preload = "metadata";
          audio.src = url;
          audio.onloadedmetadata = () => {
            if (cancelled) return;
            if (Number.isFinite(audio.duration) && audio.duration > 0) {
              setDuration(audio.duration);
              reportDuration(audio.duration);
            }
          };
        } catch {
          // ignore
        }
      };

      ws.on("ready", onReady);
      ws.on("play", onPlay);
      ws.on("pause", onPause);
      ws.on("finish", onFinish);
      ws.on("timeupdate", onTime);
      ws.on("error", onError);

      return () => {
        try {
          ws.un("ready", onReady);
          ws.un("play", onPlay);
          ws.un("pause", onPause);
          ws.un("finish", onFinish);
          ws.un("timeupdate", onTime);
          ws.un("error", onError);
          ws.destroy();
        } catch {
          // ignore
        }
        wsRef.current = null;
      };
    };

    void (async () => {
      const stored = trackId ? await fetchStoredPeaks(trackId) : null;
      if (cancelled) return;

      // Peaks alone can't play — always pass url, optionally with peaks to skip decode.
      const ws = WaveSurfer.create({
        container: el,
        url,
        ...(stored
          ? { peaks: stored.peaks, duration: stored.duration }
          : {}),
        height,
        barWidth: 2,
        barGap: 1,
        barRadius: 1,
        waveColor: "rgba(255,255,255,0.28)",
        progressColor: "#ec4899",
        cursorColor: "#f472b6",
        cursorWidth: 1,
        normalize: true,
        fillParent: true,
        dragToSeek: true,
        interact: true,
        fetchParams: {
          credentials: "same-origin",
          cache: "no-store",
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
      if (stored) {
        setDuration(stored.duration);
        reportDuration(stored.duration);
      }
      cleanupWs = bind(ws, !stored);
    })();

    return () => {
      cancelled = true;
      cleanupWs?.();
    };
  }, [url, trackId, height]);

  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || !ready) return;
    if (playing && !ws.isPlaying()) {
      void ws.play().catch(() => onPlayingChangeRef.current?.(false));
    } else if (!playing && ws.isPlaying()) {
      ws.pause();
    }
  }, [playing, ready]);

  return (
    <div className="min-w-0 w-full">
      <div className="mb-1 flex items-baseline justify-between gap-3 text-[10px] tabular-nums text-[var(--ink-dim)]">
        <span>
          {formatTime(currentTime)}
          <span className="mx-1 opacity-40">/</span>
          <span>{formatTime(duration)}</span>
        </span>
        {!ready && !error ? <span className="opacity-60">Loading…</span> : null}
        {error ? <span className="text-[var(--exclusive)]">{error}</span> : null}
      </div>
      <div
        ref={containerRef}
        className="w-full min-w-0 bg-transparent"
        style={{ minHeight: height }}
      />
    </div>
  );
}
