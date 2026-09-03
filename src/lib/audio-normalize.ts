/**
 * Normalize audio to −16 LUFS and encode MP3.
 *
 * Pass 1 measures integrated loudness (EBU R128 / loudnorm). Pass 2 applies
 * gain only (`volume=`). We do not use loudnorm’s LRA=11 dynamic mode — that
 * is a broadcast default and silently compresses wide library cues when
 * `linear=true` cannot be honored. −16 LUFS here is a level match, not
 * radio-style compression. A true-peak limiter runs only if gain would push
 * peaks above −1.5 dBTP.
 */

import { spawn } from "child_process";
import { mkdtemp, writeFile, readFile, rm } from "fs/promises";
import os from "os";
import path from "path";

const TARGET_I = -16;
const TARGET_TP = -1.5;
/** Linear amplitude for −1.5 dBTP (10^(dB/20)). */
const TARGET_TP_LINEAR = 10 ** (TARGET_TP / 20);
const MP3_BITRATE = "192k";

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

function extForHint(hint: string): string {
  const lower = hint.toLowerCase();
  if (lower.includes("wav")) return ".wav";
  if (lower.includes("flac")) return ".flac";
  if (lower.includes("aiff") || lower.includes("aif")) return ".aiff";
  if (lower.includes("m4a") || lower.includes("mp4")) return ".m4a";
  if (lower.includes("ogg")) return ".ogg";
  return ".mp3";
}

type LoudnormMeasured = {
  input_i: string;
  input_tp: string;
  input_lra?: string;
  input_thresh?: string;
  target_offset?: string;
};

function parseLoudnormJson(stderr: string): LoudnormMeasured {
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
function parseLoudnormNumber(value: string): number | null {
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

  const gainDb = TARGET_I - inputI;
  const filters: string[] = [];
  if (Math.abs(gainDb) >= 0.05) {
    filters.push(`volume=${gainDb.toFixed(2)}dB`);
  }

  const predictedTp = inputTp == null ? null : inputTp + gainDb;
  if (predictedTp != null && predictedTp > TARGET_TP) {
    filters.push(
      `alimiter=limit=${TARGET_TP_LINEAR.toFixed(6)}:level=false:attack=7:release=100`,
    );
  }

  return filters.length ? filters.join(",") : undefined;
}

/**
 * Convert any ffmpeg-readable audio to a -16 LUFS MP3.
 */
export async function normalizeToMinus16LufsMp3(
  bytes: Buffer,
  mimeOrFilenameHint = "audio/mpeg",
): Promise<Buffer> {
  if (!bytes.length) throw new Error("No audio bytes to normalize");

  const dir = await mkdtemp(path.join(os.tmpdir(), "attic-loudnorm-"));
  const inputPath = path.join(dir, `input${extForHint(mimeOrFilenameHint)}`);
  const outputPath = path.join(dir, "track.mp3");

  try {
    await writeFile(inputPath, bytes);

    const measure = await spawnCapture("ffmpeg", [
      "-hide_banner",
      "-y",
      "-i",
      inputPath,
      "-af",
      `loudnorm=I=${TARGET_I}:TP=${TARGET_TP}:print_format=json`,
      "-f",
      "null",
      "-",
    ]);

    if (measure.code !== 0 && !measure.stderr.includes("input_i")) {
      if (/ENOENT|spawn ffmpeg/i.test(measure.stderr) || measure.code === 127) {
        throw new Error("ffmpeg is not installed or not on PATH");
      }
      // loudnorm prints JSON on stderr even when writing to null; code may still be 0
    }

    let measured: LoudnormMeasured;
    try {
      measured = parseLoudnormJson(measure.stderr);
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
        throw new Error("ffmpeg is not installed or not on PATH");
      }
      throw err;
    }

    const af = buildNormalizeAf(
      parseLoudnormNumber(measured.input_i),
      parseLoudnormNumber(measured.input_tp),
    );

    const applyArgs = [
      "-hide_banner",
      "-y",
      "-i",
      inputPath,
      ...(af ? (["-af", af] as const) : []),
      "-ar",
      "44100",
      "-ac",
      "2",
      "-c:a",
      "libmp3lame",
      "-b:a",
      MP3_BITRATE,
      outputPath,
    ];

    const apply = await spawnCapture("ffmpeg", applyArgs);

    if (apply.code !== 0) {
      const detail = apply.stderr.trim().split("\n").slice(-4).join(" ");
      throw new Error(`ffmpeg normalize failed${detail ? `: ${detail}` : ""}`);
    }

    return await readFile(outputPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
      throw new Error("ffmpeg is not installed or not on PATH");
    }
    throw err;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function guessSourceExt(hint: string): string {
  const lower = hint.toLowerCase();
  if (/\.wav(?:$|\?)/i.test(lower) || lower.includes("wav")) return "wav";
  if (/\.flac(?:$|\?)/i.test(lower) || lower.includes("flac")) return "flac";
  if (/\.aiff?(?:$|\?)/i.test(lower) || lower.includes("aiff")) return "aiff";
  if (/\.m4a(?:$|\?)/i.test(lower) || lower.includes("m4a")) return "m4a";
  return "mp3";
}

/** Transcode to MP3 for browser playback — no loudness normalization. */
export async function transcodeToPlaybackMp3(
  bytes: Buffer,
  mimeOrFilenameHint = "audio/mpeg",
): Promise<Buffer> {
  if (!bytes.length) throw new Error("No audio bytes to transcode");
  const lower = mimeOrFilenameHint.toLowerCase();
  if (/\.mp3(?:$|\?)/i.test(lower) || (lower.includes("mpeg") && !lower.includes("wav"))) {
    return bytes;
  }

  const dir = await mkdtemp(path.join(os.tmpdir(), "attic-transcode-"));
  const inputPath = path.join(dir, `input${extForHint(mimeOrFilenameHint)}`);
  const outputPath = path.join(dir, "output.mp3");

  try {
    await writeFile(inputPath, bytes);
    const result = await spawnCapture("ffmpeg", [
      "-hide_banner",
      "-y",
      "-i",
      inputPath,
      "-ar",
      "44100",
      "-ac",
      "2",
      "-c:a",
      "libmp3lame",
      "-b:a",
      MP3_BITRATE,
      outputPath,
    ]);
    if (result.code !== 0) {
      const detail = result.stderr.trim().split("\n").slice(-4).join(" ");
      throw new Error(`ffmpeg transcode failed${detail ? `: ${detail}` : ""}`);
    }
    return await readFile(outputPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
      throw new Error("ffmpeg is not installed or not on PATH");
    }
    throw err;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
