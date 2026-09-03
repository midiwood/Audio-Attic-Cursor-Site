/**
 * Eval watermark helpers (mix + Spaces cache).
 * Not applied on download right now — subscribers get the clean vault master.
 * Kept for a later preview/eval download option.
 */

import { spawn } from "child_process";
import { createHash } from "crypto";
import { accessSync, constants as fsConstants, existsSync } from "fs";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import type { Session } from "@/lib/auth";
import { isSpacesObjectKey, vaultWatermarkedMp3Key } from "@/lib/storage/paths";
import {
  getObjectBuffer,
  headObject,
  spacesConfigured,
  uploadObject,
} from "@/lib/storage/spaces-core";

export const WATERMARK_LEAD_IN_SEC = 10;
export const WATERMARK_GAP_SEC = 10;
const WATERMARK_WEIGHT = 0.25;
const MP3_BITRATE = "192k";
const SAMPLE_RATE = 44100;
const TRUE_PEAK_LIMIT = 10 ** (-1.5 / 20);
const FFMPEG_TIMEOUT_MS = 90_000;

const inflight = new Map<string, Promise<string>>();

export class WatermarkBusyError extends Error {
  constructor(message = "Watermarked download is being prepared. Try again in a moment.") {
    super(message);
    this.name = "WatermarkBusyError";
  }
}

/** Disabled: all roles download the clean vault master until preview mode returns. */
export function shouldWatermarkDownload(_session: Session | null | undefined): boolean {
  return false;
}

export function formatEvalDownloadLabel(base: string): string {
  const trimmed = base.trim() || "track";
  return `${trimmed}_Audio Attic Preview`;
}

function watermarkClipPath(): string {
  const fromEnv = process.env.WATERMARK_WAV_PATH?.trim();
  if (fromEnv) return fromEnv;
  return path.join(process.cwd(), "data", "watermark.wav");
}

function sourceKeyToken(objectKey: string): string {
  return createHash("sha256").update(objectKey).digest("hex").slice(0, 16);
}

let resolvedFfmpeg: string | null = null;

function resolveFfmpegBin(): string {
  if (resolvedFfmpeg) return resolvedFfmpeg;
  const candidates = [
    process.env.FFMPEG_PATH?.trim(),
    "/usr/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "ffmpeg",
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (candidate === "ffmpeg") {
      resolvedFfmpeg = candidate;
      return candidate;
    }
    try {
      accessSync(candidate, fsConstants.X_OK);
      resolvedFfmpeg = candidate;
      return candidate;
    } catch {
      // try next
    }
  }
  resolvedFfmpeg = "ffmpeg";
  return resolvedFfmpeg;
}

function spawnCapture(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<{ code: number; stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new WatermarkBusyError());
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(chunks),
        stderr,
      });
    });
  });
}

/** Parse PCM WAV duration from RIFF chunks (no ffprobe). */
function wavDurationSec(bytes: Buffer): number {
  if (bytes.length < 44 || bytes.toString("ascii", 0, 4) !== "RIFF") {
    throw new Error("Watermark clip is not a RIFF WAV");
  }
  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let dataBytes = 0;
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    if (id === "fmt " && size >= 16) {
      channels = bytes.readUInt16LE(dataStart + 2);
      sampleRate = bytes.readUInt32LE(dataStart + 4);
      bitsPerSample = bytes.readUInt16LE(dataStart + 14);
    } else if (id === "data") {
      dataBytes = size;
      break;
    }
    offset = dataStart + size + (size % 2);
  }
  const bytesPerSec = sampleRate * channels * (bitsPerSample / 8);
  if (!bytesPerSec || !dataBytes) throw new Error("Could not read watermark WAV duration");
  return dataBytes / bytesPerSec;
}

type ClipMeta = { path: string; hash: string; duration: number };

let clipMetaCache: ClipMeta | null = null;

async function loadClipMeta(): Promise<ClipMeta> {
  const clipPath = watermarkClipPath();
  if (clipMetaCache?.path === clipPath) return clipMetaCache;
  if (!existsSync(clipPath)) {
    throw new Error(`Watermark clip not found: ${clipPath}`);
  }
  const bytes = await readFile(clipPath);
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
  const duration = wavDurationSec(bytes);
  clipMetaCache = { path: clipPath, hash, duration };
  return clipMetaCache;
}

function ffmpegSpawnError(err: unknown, stderr = ""): Error | null {
  const code = (err as NodeJS.ErrnoException)?.code;
  const msg = err instanceof Error ? err.message : String(err || "");
  if (code === "EACCES" || /spawn .* EACCES/i.test(msg) || /EACCES/i.test(stderr)) {
    return new Error(
      "ffmpeg is not executable by the Node app (EACCES). On cPanel enable ffmpeg for this user/CageFS, or set FFMPEG_PATH to a +x binary.",
    );
  }
  if (code === "ENOENT" || /ENOENT|spawn ffmpeg/i.test(msg) || /ENOENT|spawn ffmpeg/i.test(stderr)) {
    return new Error("ffmpeg is not installed or not on PATH");
  }
  return null;
}

/**
 * Mix bed MP3 with looping watermark: 10s silence, ~2s clip, 10s gap, repeat.
 */
export async function mixWatermarkedMp3(
  bedBytes: Buffer,
  clipPath: string,
  clipDurationSec: number,
): Promise<Buffer> {
  if (!bedBytes.length) throw new Error("No audio bytes to watermark");

  const dir = await mkdtemp(path.join(os.tmpdir(), "attic-watermark-"));
  const bedPath = path.join(dir, "bed.mp3");
  const outputPath = path.join(dir, "eval.mp3");

  try {
    await writeFile(bedPath, bedBytes);

    const periodSamples = Math.round((WATERMARK_GAP_SEC + clipDurationSec) * SAMPLE_RATE);
    const filter = [
      `[0:a]aformat=sample_fmts=fltp:channel_layouts=stereo,aresample=${SAMPLE_RATE}[bed]`,
      `[1:a]aformat=sample_fmts=fltp:channel_layouts=stereo,aresample=${SAMPLE_RATE}[wmclip]`,
      `[2:a][wmclip]concat=n=2:v=0:a=1[period]`,
      `[period]aloop=loop=-1:size=${periodSamples},asetpts=PTS-STARTPTS[wm]`,
      `[bed][wm]amix=inputs=2:duration=first:dropout_transition=0:normalize=0:weights=1 ${WATERMARK_WEIGHT},alimiter=limit=${TRUE_PEAK_LIMIT.toFixed(6)}:level=false:attack=7:release=100[mix]`,
    ].join(";");

    const result = await spawnCapture(
      resolveFfmpegBin(),
      [
        "-hide_banner",
        "-y",
        "-i",
        bedPath,
        "-i",
        clipPath,
        "-f",
        "lavfi",
        "-t",
        String(WATERMARK_LEAD_IN_SEC),
        "-i",
        `anullsrc=r=${SAMPLE_RATE}:cl=stereo`,
        "-filter_complex",
        filter,
        "-map",
        "[mix]",
        "-ar",
        String(SAMPLE_RATE),
        "-ac",
        "2",
        "-c:a",
        "libmp3lame",
        "-b:a",
        MP3_BITRATE,
        outputPath,
      ],
      FFMPEG_TIMEOUT_MS,
    );

    if (result.code !== 0) {
      const mapped = ffmpegSpawnError(null, result.stderr);
      if (mapped) throw mapped;
      const detail = result.stderr.trim().split("\n").slice(-4).join(" ");
      throw new Error(`ffmpeg watermark failed${detail ? `: ${detail}` : ""}`);
    }

    return await readFile(outputPath);
  } catch (err) {
    if (err instanceof WatermarkBusyError) throw err;
    const mapped = ffmpegSpawnError(err);
    if (mapped) throw mapped;
    throw err;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function createWatermarkedObject(trackId: string, objectKey: string): Promise<string> {
  const source = await headObject(objectKey);
  if (!source.exists) {
    throw new Error("Track or audio not found");
  }

  const clip = await loadClipMeta();
  const etag = source.etag || "na";
  const destKey = vaultWatermarkedMp3Key(
    trackId,
    sourceKeyToken(objectKey),
    `${clip.hash}-${etag}`,
  );

  let cached = { exists: false as boolean };
  try {
    cached = await headObject(destKey);
  } catch {
    cached = { exists: false };
  }
  if (cached.exists) return destKey;

  const bedBytes = await getObjectBuffer(objectKey);
  const mixed = await mixWatermarkedMp3(bedBytes, clip.path, clip.duration);
  await uploadObject(destKey, mixed, "audio/mpeg");
  return destKey;
}

/** Return Spaces key for the watermarked eval file, generating and caching on miss. */
export async function ensureWatermarkedObject(trackId: string, objectKey: string): Promise<string> {
  const key = objectKey.trim();
  const id = trackId.trim();
  if (!id || !key) throw new Error("trackId and objectKey are required");
  if (!spacesConfigured() || !isSpacesObjectKey(key)) return key;

  const existing = inflight.get(`${id}:${key}`);
  if (existing) return existing;

  const pending = createWatermarkedObject(id, key).finally(() => {
    inflight.delete(`${id}:${key}`);
  });
  inflight.set(`${id}:${key}`, pending);
  return pending;
}

/** Fire-and-forget cache warm (unused while downloads are clean). */
export function warmWatermarkedObject(trackId: string, objectKey: string | null | undefined): void {
  const key = objectKey?.trim();
  const id = trackId.trim();
  if (!id || !key || !isSpacesObjectKey(key)) return;
  void ensureWatermarkedObject(id, key).catch((err) => {
    console.error("[watermark] warm failed", id, err);
  });
}
