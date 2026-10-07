/**
 * Build WaveSurfer-compatible peaks from a local Blob/File (import path).
 * Soft-fails: returns null if decode fails — import must still succeed.
 */

import WaveSurfer from "wavesurfer.js";
import {
  WAVEFORM_PEAKS_CHANNELS,
  WAVEFORM_PEAKS_MAX_LENGTH,
  WAVEFORM_PEAKS_PRECISION,
  type WaveformPeaks,
} from "@/lib/waveform";

export type ClientWaveformPeaks = {
  peaks: WaveformPeaks;
  duration: number;
};

/**
 * Decode audio in an off-DOM WaveSurfer instance and export peaks.
 */
export async function waveformPeaksFromBlob(
  blob: Blob,
): Promise<ClientWaveformPeaks | null> {
  if (!blob?.size || typeof document === "undefined") return null;

  const objectUrl = URL.createObjectURL(blob);
  const container = document.createElement("div");
  container.style.cssText =
    "position:absolute;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;left:-9999px";
  document.body.appendChild(container);

  const wsRef: { current: WaveSurfer | null } = { current: null };
  try {
    const result = await new Promise<ClientWaveformPeaks | null>((resolve) => {
      let settled = false;
      const finish = (value: ClientWaveformPeaks | null) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      try {
        wsRef.current = WaveSurfer.create({
          container,
          url: objectUrl,
          height: 1,
          sampleRate: 8000,
          interact: false,
          normalize: true,
        });
      } catch {
        finish(null);
        return;
      }

      const ws = wsRef.current;
      if (!ws) {
        finish(null);
        return;
      }

      const onReady = () => {
        try {
          const peaks = ws.exportPeaks({
            channels: WAVEFORM_PEAKS_CHANNELS,
            maxLength: WAVEFORM_PEAKS_MAX_LENGTH,
            precision: WAVEFORM_PEAKS_PRECISION,
          });
          const duration = ws.getDuration();
          if (
            !peaks?.length ||
            !Array.isArray(peaks[0]) ||
            peaks[0].length < 2 ||
            !Number.isFinite(duration) ||
            duration <= 0
          ) {
            finish(null);
            return;
          }
          finish({ peaks, duration });
        } catch {
          finish(null);
        }
      };

      const onError = () => finish(null);

      ws.on("ready", onReady);
      ws.on("error", onError);
    });

    return result;
  } catch {
    return null;
  } finally {
    try {
      wsRef.current?.destroy();
    } catch {
      /* ignore */
    }
    try {
      container.remove();
    } catch {
      /* ignore */
    }
    URL.revokeObjectURL(objectUrl);
  }
}
