/**
 * Loudnorm targets shared by server CLI and browser ffmpeg.wasm.
 * Keep in sync: −16 LUFS level match (not LRA compression).
 */

export const LOUDNORM_TARGET_I = -16;
export const LOUDNORM_TARGET_TP = -1.5;
/** Linear amplitude for −1.5 dBTP (10^(dB/20)). */
export const LOUDNORM_TARGET_TP_LINEAR = 10 ** (LOUDNORM_TARGET_TP / 20);
export const LOUDNORM_MP3_BITRATE = "192k";

export type LoudnormMeasured = {
  input_i: string;
  input_tp: string;
  input_lra?: string;
  input_thresh?: string;
  target_offset?: string;
};

export function parseLoudnormJson(stderr: string): LoudnormMeasured {
  const match = stderr.match(/\{[\s\S]*"input_i"[\s\S]*\}/);
  if (!match) {
    throw new Error("ffmpeg loudnorm did not return measurement JSON");
  }
  const parsed = JSON.parse(match[0]) as LoudnormMeasured;
  for (const key of ["input_i", "input_tp"] as const) {
    if (parsed[key] == null || String(parsed[key]).trim() === "") {
      throw new Error(`ffmpeg loudnorm missing ${key}`);
    }
  }
  return parsed;
}

/** ffmpeg prints -inf / inf for silence or unusable loudness. */
export function parseLoudnormNumber(value: string): number | null {
  const n = Number.parseFloat(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * Gain-only filter chain. No LRA compressor.
 * Returns undefined when the file is already at target and peaks are safe,
 * or when integrated loudness cannot be measured (silence).
 */
export function buildNormalizeAf(
  inputI: number | null,
  inputTp: number | null,
): string | undefined {
  if (inputI == null) return undefined;

  const gainDb = LOUDNORM_TARGET_I - inputI;
  const filters: string[] = [];
  if (Math.abs(gainDb) >= 0.05) {
    filters.push(`volume=${gainDb.toFixed(2)}dB`);
  }

  const predictedTp = inputTp == null ? null : inputTp + gainDb;
  if (predictedTp != null && predictedTp > LOUDNORM_TARGET_TP) {
    filters.push(
      `alimiter=limit=${LOUDNORM_TARGET_TP_LINEAR.toFixed(6)}:level=false:attack=7:release=100`,
    );
  }

  return filters.length ? filters.join(",") : undefined;
}

export function extForAudioHint(hint: string): string {
  const lower = hint.toLowerCase();
  if (lower.includes("wav")) return ".wav";
  if (lower.includes("flac")) return ".flac";
  if (lower.includes("aiff") || lower.includes("aif")) return ".aiff";
  if (lower.includes("m4a") || lower.includes("mp4")) return ".m4a";
  if (lower.includes("ogg")) return ".ogg";
  return ".mp3";
}

export function masterExtFromHint(hint: string): string {
  const ext = extForAudioHint(hint).replace(/^\./, "");
  if (ext === "aiff") return "aiff";
  if (ext === "wav") return "wav";
  if (ext === "flac") return "flac";
  return "mp3";
}

export function contentTypeForMasterExt(ext: string): string {
  const e = ext.replace(/^\./, "").toLowerCase();
  if (e === "wav") return "audio/wav";
  if (e === "aiff" || e === "aif") return "audio/aiff";
  if (e === "flac") return "audio/flac";
  return "audio/mpeg";
}

/**
 * `client` (default) = browser ffmpeg.wasm; server CLI muted.
 * `server` = restore legacy Passenger/CLI normalize (USE_SERVER_FFMPEG=1 also enables).
 */
export function resolveAudioNormalizeMode(): "client" | "server" {
  const raw = String(process.env["AUDIO_NORMALIZE_MODE"] || "").trim().toLowerCase();
  if (raw === "server") return "server";
  if (raw === "client") return "client";
  if (String(process.env["USE_SERVER_FFMPEG"] || "").trim() === "1") return "server";
  return "client";
}
