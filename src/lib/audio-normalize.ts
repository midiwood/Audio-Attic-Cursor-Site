/**
 * Normalize audio to -16 LUFS (two-pass loudnorm) and encode MP3.
 */

import { spawn } from "child_process";
import { mkdtemp, writeFile, readFile, rm } from "fs/promises";
import os from "os";
import path from "path";

const TARGET_I = -16;
const TARGET_TP = -1.5;
const TARGET_LRA = 11;
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
  input_lra: string;
  input_thresh: string;
  target_offset: string;
};

function parseLoudnormJson(stderr: string): LoudnormMeasured {
  const match = stderr.match(/\{[\s\S]*"input_i"[\s\S]*\}/);
  if (!match) {
    throw new Error("ffmpeg loudnorm did not return measurement JSON");
  }
  const parsed = JSON.parse(match[0]) as LoudnormMeasured;
  for (const key of ["input_i", "input_tp", "input_lra", "input_thresh", "target_offset"] as const) {
    if (parsed[key] == null || String(parsed[key]).trim() === "") {
      throw new Error(`ffmpeg loudnorm missing ${key}`);
    }
  }
  return parsed;
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
      `loudnorm=I=${TARGET_I}:TP=${TARGET_TP}:LRA=${TARGET_LRA}:print_format=json`,
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

    const apply = await spawnCapture("ffmpeg", [
      "-hide_banner",
      "-y",
      "-i",
      inputPath,
      "-af",
      [
        `loudnorm=I=${TARGET_I}:TP=${TARGET_TP}:LRA=${TARGET_LRA}`,
        `measured_I=${measured.input_i}`,
        `measured_TP=${measured.input_tp}`,
        `measured_LRA=${measured.input_lra}`,
        `measured_thresh=${measured.input_thresh}`,
        `offset=${measured.target_offset}`,
        "linear=true",
        "print_format=summary",
      ].join(":"),
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
