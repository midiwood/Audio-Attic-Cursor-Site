/**
 * Subscriber/guest download watermark: mix a 2s clip after a 10s lead-in,
 * then every 10s of silence, cache in Spaces, presign. Staff stay clean.
 */

import "server-only";

import { spawn } from "child_process";
import { createHash } from "crypto";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { existsSync } from "fs";
import os from "os";
import path from "path";
import type { Session } from "@/lib/auth";
import { canManageCatalog } from "@/lib/auth";
import { isSpacesObjectKey, vaultWatermarkedMp3Key } from "@/lib/storage/paths";
import {
  getObjectBuffer,
  headObject,
  spacesConfigured,
  uploadObject,
} from "@/lib/storage/spaces";

export const WATERMARK_LEAD_IN_SEC = 10;
export const WATERMARK_GAP_SEC = 10;
const WATERMARK_WEIGHT = 0.25;
const MP3_BITRATE = "192k";
const SAMPLE_RATE = 44100;
const TRUE_PEAK_LIMIT = 10 ** (-1.5 / 20);
const FFMPEG_TIMEOUT_MS = 90_000;
const FFPROBE_TIMEOUT_MS = 15_000;

const inflight = new Map<string, Promise<string>>();

export class WatermarkBusyError extends Error {
  constructor(message = "Watermarked download is being prepared. Try again in a moment.") {
    super(message);
    this.name = "WatermarkBusyError";
  }
}

export function shouldWatermarkDownload(session: Session | null | undefined): boolean {
  return !canManageCatalog(session);
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

async function probeDurationSec(filePath: string): Promise<number> {
  const result = await spawnCapture(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", filePath],
    FFPROBE_TIMEOUT_MS,
  );
  if (result.code !== 0) {
    throw new Error(`ffprobe failed: ${result.stderr.trim().slice(-200)}`);
  }
  const duration = Number.parseFloat(result.stdout.toString("utf8").trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Could not read audio duration");
  }
  return duration;
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
  const duration = await probeDurationSec(clipPath);
  clipMetaCache = { path: clipPath, hash, duration };
  return clipMetaCache;
}

function ffmpegMissing(err: unknown, stderr = ""): boolean {
  if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return true;
  return /ENOENT|spawn ffmpeg|spawn ffprobe/i.test(stderr);
}

/**
 * Mix bed MP3 with looping watermark: 10s silence, ~2s clip, 10s gap, repeat.
 */
export async function mixWatermarkedMp3(bedBytes: Buffer, clipPath: string, clipDurationSec: number): Promise<Buffer> {
  if (!bedBytes.length) throw new Error("No audio bytes to watermark");

  const dir = await mkdtemp(path.join(os.tmpdir(), "attic-watermark-"));
  const bedPath = path.join(dir, "bed.mp3");
  const outputPath = path.join(dir, "eval.mp3");

  try {
    await writeFile(bedPath, bedBytes);
    const bedDuration = await probeDurationSec(bedPath);
    if (bedDuration <= WATERMARK_LEAD_IN_SEC) {
      return bedBytes;
    }

    const periodSamples = Math.round((WATERMARK_GAP_SEC + clipDurationSec) * SAMPLE_RATE);
    const filter = [
      `[0:a]aformat=sample_fmts=fltp:channel_layouts=stereo,aresample=${SAMPLE_RATE}[bed]`,
      `[1:a]aformat=sample_fmts=fltp:channel_layouts=stereo,aresample=${SAMPLE_RATE}[wmclip]`,
      `[2:a][wmclip]concat=n=2:v=0:a=1[period]`,
      `[period]aloop=loop=-1:size=${periodSamples}[wmloop]`,
      `[wmloop]atrim=0:${bedDuration.toFixed(6)},asetpts=PTS-STARTPTS[wm]`,
      `[bed][wm]amix=inputs=2:duration=first:dropout_transition=0:normalize=0:weights=1 ${WATERMARK_WEIGHT},alimiter=limit=${TRUE_PEAK_LIMIT.toFixed(6)}:level=false:attack=7:release=100[mix]`,
    ].join(";");

    const result = await spawnCapture(
      "ffmpeg",
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
      if (ffmpegMissing(null, result.stderr)) {
        throw new Error("ffmpeg is not installed or not on PATH");
      }
      const detail = result.stderr.trim().split("\n").slice(-4).join(" ");
      throw new Error(`ffmpeg watermark failed${detail ? `: ${detail}` : ""}`);
    }

    return await readFile(outputPath);
  } catch (err) {
    if (err instanceof WatermarkBusyError) throw err;
    if (ffmpegMissing(err)) {
      throw new Error("ffmpeg is not installed or not on PATH");
    }
    throw err;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function createWatermarkedObject(trackId: string, objectKey: string): Promise<string> {
  const clip = await loadClipMeta();
  const source = await headObject(objectKey);
  if (!source.exists) {
    throw new Error("Track or audio not found");
  }
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

/** Fire-and-forget cache warm after ingest / replace-audio. */
export function warmWatermarkedObject(trackId: string, objectKey: string | null | undefined): void {
  const key = objectKey?.trim();
  const id = trackId.trim();
  if (!id || !key || !isSpacesObjectKey(key)) return;
  void ensureWatermarkedObject(id, key).catch((err) => {
    console.error("[watermark] warm failed", id, err);
  });
}
