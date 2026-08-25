/** Format seconds as m:ss for track duration fields. */
export function formatAudioDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/** Derive duration from decoded PCM sample count (server-side). */
export function durationSecondsFromSamples(
  sampleCount: number,
  sampleRate: number,
): number | null {
  if (!Number.isFinite(sampleCount) || !Number.isFinite(sampleRate)) return null;
  if (sampleCount <= 0 || sampleRate <= 0) return null;
  const seconds = sampleCount / sampleRate;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

/** Read duration from browser audio metadata (client-side only). */
export function readDurationFromAudioUrl(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = "metadata";

    const finish = (value: number | null) => {
      audio.onloadedmetadata = null;
      audio.onerror = null;
      audio.src = "";
      resolve(value);
    };

    audio.onloadedmetadata = () => {
      const d = audio.duration;
      finish(Number.isFinite(d) && d > 0 ? d : null);
    };
    audio.onerror = () => finish(null);
    audio.src = url;
  });
}
