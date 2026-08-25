/** Shared WaveSurfer peak export settings (must match save + load). */
export const WAVEFORM_PEAKS_MAX_LENGTH = 800;
export const WAVEFORM_PEAKS_CHANNELS = 1;
export const WAVEFORM_PEAKS_PRECISION = 1000;

export type WaveformPeaks = number[][];

export type StoredWaveform = {
  trackId: string;
  peaks: WaveformPeaks;
  duration: number;
  peaksLength: number;
};

export function waveformApiUrl(trackId: string) {
  return `/api/tracks/${encodeURIComponent(trackId)}/waveform`;
}

/** Validate + normalize peaks from a client PUT body. */
export function normalizePeaksPayload(raw: unknown): {
  peaks: WaveformPeaks;
  duration: number;
  peaksLength: number;
} | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as { peaks?: unknown; duration?: unknown };
  const duration = Number(body.duration);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 60 * 60 * 6) {
    return null;
  }
  if (!Array.isArray(body.peaks) || body.peaks.length === 0) return null;

  const peaks: WaveformPeaks = [];
  for (const channel of body.peaks.slice(0, WAVEFORM_PEAKS_CHANNELS)) {
    if (!Array.isArray(channel) || channel.length < 2) return null;
    if (channel.length > WAVEFORM_PEAKS_MAX_LENGTH * 2) return null;
    const nums: number[] = [];
    for (const v of channel) {
      const n = Number(v);
      if (!Number.isFinite(n)) return null;
      // Clamp to [-1, 1] — WaveSurfer peak range
      nums.push(Math.max(-1, Math.min(1, Math.round(n * WAVEFORM_PEAKS_PRECISION) / WAVEFORM_PEAKS_PRECISION)));
    }
    peaks.push(nums);
  }
  if (!peaks.length) return null;
  return { peaks, duration, peaksLength: peaks[0].length };
}
