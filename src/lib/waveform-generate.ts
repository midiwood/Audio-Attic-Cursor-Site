import "server-only";

import { spawn } from "child_process";
import { mkdtemp, writeFile, rm } from "fs/promises";
import os from "os";
import path from "path";
import { durationSecondsFromSamples } from "@/lib/audio-duration";
import { isSpacesObjectKey } from "@/lib/storage/paths";
import { getObjectBuffer } from "@/lib/storage/spaces";
import {
  WAVEFORM_PEAKS_MAX_LENGTH,
  WAVEFORM_PEAKS_PRECISION,
  type WaveformPeaks,
} from "@/lib/waveform";
import { upsertTrackWaveform, getTrackWaveform } from "@/lib/waveform-queries";
import { setTrackDurationIfEmpty } from "@/lib/duration-backfill";

const PEAKS_SAMPLE_RATE = 8000;
/** Cap download size for peak generation (~100MB). */
const MAX_AUDIO_BYTES = 100 * 1024 * 1024;

function spawnCapture(
  command: string,
  args: string[],
): Promise<{ code: number; stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(chunks),
        stderr,
      });
    });
  });
}

function extForMime(mimeTypeHint: string, urlHint = ""): string {
  const hint = `${mimeTypeHint} ${urlHint}`.toLowerCase();
  if (hint.includes("wav")) return ".wav";
  if (hint.includes("flac")) return ".flac";
  if (hint.includes("aiff") || hint.includes("aif")) return ".aiff";
  if (hint.includes("mp4") || hint.includes("m4a")) return ".m4a";
  if (hint.includes("ogg")) return ".ogg";
  return ".mp3";
}

/** Max-abs envelope, normalized to [0, 1] — matches WaveSurfer mono peaks well. */
export function peaksFromSamples(
  samples: Float32Array,
  maxLength = WAVEFORM_PEAKS_MAX_LENGTH,
): number[] {
  const n = samples.length;
  if (n < 2) return [];

  const length = Math.min(maxLength, n);
  const peaks = new Array<number>(length);
  const block = n / length;
  let globalMax = 0;

  for (let i = 0; i < length; i++) {
    const start = Math.floor(i * block);
    const end = Math.max(start + 1, Math.floor((i + 1) * block));
    let max = 0;
    for (let j = start; j < end && j < n; j++) {
      const v = Math.abs(samples[j]);
      if (v > max) max = v;
    }
    peaks[i] = max;
    if (max > globalMax) globalMax = max;
  }

  if (globalMax > 0) {
    for (let i = 0; i < length; i++) {
      peaks[i] =
        Math.round((peaks[i] / globalMax) * WAVEFORM_PEAKS_PRECISION) /
        WAVEFORM_PEAKS_PRECISION;
    }
  }

  return peaks;
}

export async function generateWaveformPeaksFromBytes(
  bytes: Buffer,
  mimeTypeHint = "audio/mpeg",
  urlHint = "",
): Promise<{ peaks: WaveformPeaks; duration: number; peaksLength: number } | null> {
  if (!bytes.length) return null;

  const dir = await mkdtemp(path.join(os.tmpdir(), "attic-peaks-"));
  const inputPath = path.join(dir, `input${extForMime(mimeTypeHint, urlHint)}`);

  try {
    await writeFile(inputPath, bytes);

    const result = await spawnCapture("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      inputPath,
      "-ac",
      "1",
      "-ar",
      String(PEAKS_SAMPLE_RATE),
      "-f",
      "f32le",
      "pipe:1",
    ]);

    if (result.code !== 0 || result.stdout.length < PEAKS_SAMPLE_RATE) {
      return null;
    }

    const sampleCount = Math.floor(result.stdout.length / 4);
    const samples = new Float32Array(sampleCount);
    for (let i = 0; i < sampleCount; i++) {
      samples[i] = result.stdout.readFloatLE(i * 4);
    }

    const duration = durationSecondsFromSamples(sampleCount, PEAKS_SAMPLE_RATE);
    if (!duration) return null;

    const channel = peaksFromSamples(samples);
    if (channel.length < 2) return null;

    return {
      peaks: [channel],
      duration,
      peaksLength: channel.length,
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function fetchAudioForPeaks(
  objectKeyOrUrl: string,
): Promise<{ bytes: Buffer; mimeType: string } | null> {
  try {
    let bytes: Buffer;
    let mimeType = "audio/mpeg";

    if (isSpacesObjectKey(objectKeyOrUrl)) {
      bytes = await getObjectBuffer(objectKeyOrUrl);
      mimeType = objectKeyOrUrl.toLowerCase().endsWith(".wav") ? "audio/wav" : "audio/mpeg";
    } else {
      const res = await fetch(objectKeyOrUrl, { redirect: "follow" });
      if (!res.ok) return null;
      const arrayBuffer = await res.arrayBuffer();
      if (arrayBuffer.byteLength === 0) return null;
      if (arrayBuffer.byteLength > MAX_AUDIO_BYTES) return null;
      bytes = Buffer.from(arrayBuffer);
      mimeType =
        res.headers.get("content-type")?.split(";")[0]?.trim() || "audio/mpeg";
    }

    if (bytes.length > MAX_AUDIO_BYTES) return null;
    return { bytes, mimeType };
  } catch {
    return null;
  }
}

/**
 * Download + generate peaks and store them. Soft-fail: returns false on any error.
 * Skips if peaks already exist (unless `force`).
 */
export async function ensureTrackWaveform(
  trackId: string,
  source: { dropboxPath?: string | null; dropboxDl?: string | null },
  opts?: { force?: boolean },
): Promise<boolean> {
  const key = source.dropboxPath?.trim() || "";
  const legacy = source.dropboxDl?.trim() || "";
  const fetchTarget = key && isSpacesObjectKey(key) ? key : legacy;
  if (!fetchTarget) return false;
  if (!opts?.force && getTrackWaveform(trackId)) return true;

  try {
    const audio = await fetchAudioForPeaks(fetchTarget);
    if (!audio) return false;
    const generated = await generateWaveformPeaksFromBytes(
      audio.bytes,
      audio.mimeType,
      fetchTarget,
    );
    if (!generated) return false;
    upsertTrackWaveform({
      trackId,
      peaks: generated.peaks,
      duration: generated.duration,
      peaksLength: generated.peaksLength,
    });
    setTrackDurationIfEmpty(trackId, generated.duration);
    return true;
  } catch {
    return false;
  }
}

/** Run peak generation for several tracks with limited concurrency. */
export async function ensureTrackWaveforms(
  items: Array<{ id: string; dropboxPath?: string | null; dropboxDl?: string | null }>,
  concurrency = 2,
): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = items[index++];
      const success = await ensureTrackWaveform(current.id, current);
      if (success) ok += 1;
      else failed += 1;
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, () =>
    worker(),
  );
  await Promise.all(workers);
  return { ok, failed };
}
