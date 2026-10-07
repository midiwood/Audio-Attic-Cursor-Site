/**
 * Browser ffmpeg.wasm: convert → −16 LUFS MP3 (same targets as server CLI).
 * Server CLI path is muted by default; set AUDIO_NORMALIZE_MODE=server to restore.
 */

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import {
  LOUDNORM_MP3_BITRATE,
  LOUDNORM_TARGET_I,
  LOUDNORM_TARGET_TP,
  buildNormalizeAf,
  extForAudioHint,
  parseLoudnormJson,
  parseLoudnormNumber,
} from "@/lib/audio-normalize-shared";

let ffmpegSingleton: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

async function getFfmpeg(onLog?: (line: string) => void): Promise<FFmpeg> {
  if (ffmpegSingleton?.loaded) {
    if (onLog) {
      ffmpegSingleton.on("log", ({ message }) => onLog(message));
    }
    return ffmpegSingleton;
  }
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const ffmpeg = new FFmpeg();
        // Use UMD CDN URLs directly — toBlobURL breaks under Next.js
        // ("Cannot find module 'blob:…'"). UMD loads as classic scripts.
        const baseURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd";
        await ffmpeg.load({
          coreURL: `${baseURL}/ffmpeg-core.js`,
          wasmURL: `${baseURL}/ffmpeg-core.wasm`,
        });
        ffmpegSingleton = ffmpeg;
        return ffmpeg;
      } catch (err) {
        loadPromise = null;
        ffmpegSingleton = null;
        throw err;
      }
    })();
  }
  const ffmpeg = await loadPromise;
  if (onLog) {
    ffmpeg.on("log", ({ message }) => onLog(message));
  }
  return ffmpeg;
}

export type ClientNormalizeResult = {
  mp3: Blob;
  /** Original file kept as vault master (WAV/AIFF/MP3). */
  master: File;
  masterExt: string;
};

/**
 * Convert any ffmpeg-readable File to −16 LUFS stereo 44.1k MP3 in the browser.
 */
export async function normalizeFileToMinus16LufsMp3(
  file: File,
  opts?: { onProgress?: (message: string) => void },
): Promise<ClientNormalizeResult> {
  if (!file.size) throw new Error("No audio file to normalize");

  opts?.onProgress?.("Loading ffmpeg in the browser…");
  let logBuf = "";
  const ffmpeg = await getFfmpeg((line) => {
    logBuf += `${line}\n`;
  });

  const hint = file.name || file.type || "audio.mp3";
  const inExt = extForAudioHint(hint);
  const inputName = `input${inExt}`;
  const outputName = "track.mp3";

  await ffmpeg.writeFile(inputName, await fetchFile(file));

  opts?.onProgress?.("Measuring loudness…");
  logBuf = "";
  await ffmpeg.exec([
    "-hide_banner",
    "-y",
    "-i",
    inputName,
    "-af",
    `loudnorm=I=${LOUDNORM_TARGET_I}:TP=${LOUDNORM_TARGET_TP}:print_format=json`,
    "-f",
    "null",
    "-",
  ]);

  let measured;
  try {
    measured = parseLoudnormJson(logBuf);
  } catch {
    throw new Error(
      "Browser ffmpeg could not measure loudness. Try a smaller file or Chrome on desktop.",
    );
  }

  const af = buildNormalizeAf(
    parseLoudnormNumber(measured.input_i),
    parseLoudnormNumber(measured.input_tp),
  );

  opts?.onProgress?.("Encoding −16 LUFS MP3…");
  const applyArgs = [
    "-hide_banner",
    "-y",
    "-i",
    inputName,
    ...(af ? (["-af", af] as const) : []),
    "-ar",
    "44100",
    "-ac",
    "2",
    "-c:a",
    "libmp3lame",
    "-b:a",
    LOUDNORM_MP3_BITRATE,
    outputName,
  ];
  const applyCode = await ffmpeg.exec([...applyArgs]);
  if (applyCode !== 0) {
    throw new Error("Browser ffmpeg failed to encode MP3");
  }

  const data = await ffmpeg.readFile(outputName);
  const bytes =
    data instanceof Uint8Array
      ? data
      : new TextEncoder().encode(String(data));
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const mp3 = new Blob([copy.buffer], { type: "audio/mpeg" });

  try {
    await ffmpeg.deleteFile(inputName);
  } catch {
    /* ignore */
  }
  try {
    await ffmpeg.deleteFile(outputName);
  } catch {
    /* ignore */
  }

  const masterExt = inExt.replace(/^\./, "") || "wav";
  return { mp3, master: file, masterExt };
}

