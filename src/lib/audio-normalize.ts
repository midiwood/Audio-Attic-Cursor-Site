/**
 * Normalize audio to −16 LUFS and encode MP3 (server CLI / ffmpeg binary).
 *
 * MUTED BY DEFAULT — live/cPanel cannot spawn ffmpeg (CageFS EACCES).
 * Browser path: `audio-normalize-client.ts` (ffmpeg.wasm).
 * Restore this path: AUDIO_NORMALIZE_MODE=server (or USE_SERVER_FFMPEG=1).
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
import {
  LOUDNORM_MP3_BITRATE,
  LOUDNORM_TARGET_I,
  LOUDNORM_TARGET_TP,
  buildNormalizeAf,
  extForAudioHint,
  parseLoudnormJson,
  parseLoudnormNumber,
  resolveAudioNormalizeMode,
} from "@/lib/audio-normalize-shared";

export {
  buildNormalizeAf,
  LOUDNORM_TARGET_I,
  LOUDNORM_TARGET_TP,
  resolveAudioNormalizeMode,
} from "@/lib/audio-normalize-shared";

function assertServerNormalizeEnabled(): void {
  if (resolveAudioNormalizeMode() !== "server") {
    throw new Error(
      "Server ffmpeg normalize is muted (default). Use browser ffmpeg.wasm on Upload, or set AUDIO_NORMALIZE_MODE=server to restore this path.",
    );
  }
}

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

/**
 * Convert any ffmpeg-readable audio to a -16 LUFS MP3.
 * Requires AUDIO_NORMALIZE_MODE=server.
 */
export async function normalizeToMinus16LufsMp3(
  bytes: Buffer,
  mimeOrFilenameHint = "audio/mpeg",
): Promise<Buffer> {
  assertServerNormalizeEnabled();
  if (!bytes.length) throw new Error("No audio bytes to normalize");

  const dir = await mkdtemp(path.join(os.tmpdir(), "attic-loudnorm-"));
  const inputPath = path.join(dir, `input${extForAudioHint(mimeOrFilenameHint)}`);
  const outputPath = path.join(dir, "track.mp3");

  try {
    await writeFile(inputPath, bytes);

    const measure = await spawnCapture("ffmpeg", [
      "-hide_banner",
      "-y",
      "-i",
      inputPath,
      "-af",
      `loudnorm=I=${LOUDNORM_TARGET_I}:TP=${LOUDNORM_TARGET_TP}:print_format=json`,
      "-f",
      "null",
      "-",
    ]);

    if (measure.code !== 0 && !measure.stderr.includes("input_i")) {
      if (/ENOENT|spawn ffmpeg/i.test(measure.stderr) || measure.code === 127) {
        throw new Error("ffmpeg is not installed or not on PATH");
      }
    }

    let measured;
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
      LOUDNORM_MP3_BITRATE,
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

/** Transcode to MP3 for browser playback — no loudness normalization. Also muted unless server mode. */
export async function transcodeToPlaybackMp3(
  bytes: Buffer,
  mimeOrFilenameHint = "audio/mpeg",
): Promise<Buffer> {
  assertServerNormalizeEnabled();
  if (!bytes.length) throw new Error("No audio bytes to transcode");
  const lower = mimeOrFilenameHint.toLowerCase();
  if (/\.mp3(?:$|\?)/i.test(lower) || (lower.includes("mpeg") && !lower.includes("wav"))) {
    return bytes;
  }

  const dir = await mkdtemp(path.join(os.tmpdir(), "attic-transcode-"));
  const inputPath = path.join(dir, `input${extForAudioHint(mimeOrFilenameHint)}`);
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
      LOUDNORM_MP3_BITRATE,
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
