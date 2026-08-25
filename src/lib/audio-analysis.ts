import { spawn } from "child_process";
import { mkdtemp, writeFile, rm } from "fs/promises";
import os from "os";
import path from "path";
import { normalizeMusicalKey } from "@/lib/tracks";

export type AudioAnalysis = {
  bpm: string;
  musicalKey: string;
  bpmConfidence: number;
  keyConfidence: number;
  analyzedSeconds: number;
};

const ANALYSIS_SAMPLE_RATE = 22050;
const ANALYSIS_MAX_SECONDS = 75;
const BPM_MIN = 60;
const BPM_MAX = 200;

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
 * Decode a representative mono clip to Float32 PCM via ffmpeg.
 * Uses the opening section — sufficient for BPM/key analysis without ffprobe.
 */
export async function decodeAnalysisClip(
  bytes: Buffer,
  mimeTypeHint = "audio/mpeg",
): Promise<{ samples: Float32Array; sampleRate: number; analyzedSeconds: number } | null> {
  const ext =
    mimeTypeHint.includes("wav")
      ? ".wav"
      : mimeTypeHint.includes("flac")
        ? ".flac"
        : mimeTypeHint.includes("aiff") || mimeTypeHint.includes("aif")
          ? ".aiff"
          : mimeTypeHint.includes("mp4") || mimeTypeHint.includes("m4a")
            ? ".m4a"
            : mimeTypeHint.includes("ogg")
              ? ".ogg"
              : ".mp3";

  const dir = await mkdtemp(path.join(os.tmpdir(), "attic-audio-"));
  const inputPath = path.join(dir, `input${ext}`);
  try {
    await writeFile(inputPath, bytes);

    const result = await spawnCapture("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-t",
      String(ANALYSIS_MAX_SECONDS),
      "-i",
      inputPath,
      "-ac",
      "1",
      "-ar",
      String(ANALYSIS_SAMPLE_RATE),
      "-f",
      "f32le",
      "pipe:1",
    ]);

    if (result.code !== 0 || result.stdout.length < ANALYSIS_SAMPLE_RATE) {
      return null;
    }

    const sampleCount = Math.floor(result.stdout.length / 4);
    const samples = new Float32Array(sampleCount);
    for (let i = 0; i < sampleCount; i++) {
      samples[i] = result.stdout.readFloatLE(i * 4);
    }

    return {
      samples,
      sampleRate: ANALYSIS_SAMPLE_RATE,
      analyzedSeconds: sampleCount / ANALYSIS_SAMPLE_RATE,
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function hann(n: number, N: number) {
  return 0.5 * (1 - Math.cos((2 * Math.PI * n) / (N - 1)));
}

/** Cooley–Tukey radix-2 FFT (in-place on separate real/imag arrays). */
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let j = 0; j < len / 2; j++) {
        const uRe = re[i + j];
        const uIm = im[i + j];
        const vRe = re[i + j + len / 2] * wRe - im[i + j + len / 2] * wIm;
        const vIm = re[i + j + len / 2] * wIm + im[i + j + len / 2] * wRe;
        re[i + j] = uRe + vRe;
        im[i + j] = uIm + vIm;
        re[i + j + len / 2] = uRe - vRe;
        im[i + j + len / 2] = uIm - vIm;
        const nextWRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nextWRe;
      }
    }
  }
}

function estimateBpm(samples: Float32Array, sampleRate: number): { bpm: number; confidence: number } {
  // Smaller hop → finer lag resolution (helps the common ±1 BPM error).
  const frameSize = 1024;
  const hop = 256;
  const frameCount = Math.max(0, Math.floor((samples.length - frameSize) / hop));
  if (frameCount < 96) return { bpm: 0, confidence: 0 };

  const prevMag = new Float64Array(frameSize / 2);
  const flux: number[] = [];
  const re = new Float64Array(frameSize);
  const im = new Float64Array(frameSize);

  for (let f = 0; f < frameCount; f++) {
    const offset = f * hop;
    for (let i = 0; i < frameSize; i++) {
      re[i] = samples[offset + i] * hann(i, frameSize);
      im[i] = 0;
    }
    fft(re, im);
    let sum = 0;
    for (let k = 1; k < frameSize / 2; k++) {
      const mag = Math.hypot(re[k], im[k]);
      const diff = mag - prevMag[k];
      if (diff > 0) sum += diff;
      prevMag[k] = mag;
    }
    flux.push(sum);
  }

  const mean = flux.reduce((a, b) => a + b, 0) / flux.length;
  const centered = flux.map((v) => Math.max(0, v - mean));

  const hopSeconds = hop / sampleRate;
  const minLag = Math.round(60 / BPM_MAX / hopSeconds);
  const maxLag = Math.round(60 / BPM_MIN / hopSeconds);
  if (maxLag <= minLag + 2 || maxLag >= centered.length) {
    return { bpm: 0, confidence: 0 };
  }

  const scores = new Float64Array(maxLag + 1);
  let bestLag = minLag;
  let bestScore = -Infinity;
  let secondScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    let norm = 0;
    for (let i = 0; i + lag < centered.length; i++) {
      corr += centered[i] * centered[i + lag];
      norm += centered[i] * centered[i];
    }
    const score = norm > 0 ? corr / norm : 0;
    scores[lag] = score;
    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      bestLag = lag;
    } else if (score > secondScore) {
      secondScore = score;
    }
  }

  // Sub-lag parabolic peak → reduces integer lag quantization (~±1 BPM).
  let refinedLag = bestLag;
  if (bestLag > minLag && bestLag < maxLag) {
    const y0 = scores[bestLag - 1];
    const y1 = scores[bestLag];
    const y2 = scores[bestLag + 1];
    const denom = y0 - 2 * y1 + y2;
    if (Math.abs(denom) > 1e-12) {
      const delta = (0.5 * (y0 - y2)) / denom;
      refinedLag = bestLag + Math.max(-0.6, Math.min(0.6, delta));
    }
  }

  let bpmFloat = 60 / (refinedLag * hopSeconds);

  // Prefer production range; evaluate half/double on the float before rounding.
  const foldCandidates = [bpmFloat, bpmFloat / 2, bpmFloat * 2, (bpmFloat * 2) / 3, (bpmFloat * 3) / 2]
    .filter((v) => v >= BPM_MIN && v <= BPM_MAX)
    .map((v) => {
      const inSweet = v >= 72 && v <= 168 ? 1.2 : 0;
      const nearOriginal = Math.abs(Math.log2(v / bpmFloat)) < 0.05 ? 0.35 : 0;
      return { v, score: inSweet + nearOriginal };
    })
    .sort((a, b) => b.score - a.score || Math.abs(a.v - 110) - Math.abs(b.v - 110));

  if (foldCandidates[0]) bpmFloat = foldCandidates[0].v;

  // Round to nearest BPM; if fractional part is near .5, bias toward autocorrelation neighbor.
  let bpm = Math.round(bpmFloat);
  const frac = bpmFloat - Math.floor(bpmFloat);
  if (frac > 0.45 && frac < 0.55) {
    const lo = Math.floor(bpmFloat);
    const hi = Math.ceil(bpmFloat);
    const scoreFor = (candidate: number) => {
      const lag = 60 / candidate / hopSeconds;
      const i = Math.round(lag);
      if (i < minLag || i > maxLag) return -Infinity;
      return scores[i] ?? -Infinity;
    };
    bpm = scoreFor(hi) >= scoreFor(lo) ? hi : lo;
  }

  if (bpm < BPM_MIN || bpm > BPM_MAX) return { bpm: 0, confidence: 0 };

  const prominence = Math.max(0, Math.min(1, bestScore / Math.max(secondScore, 1e-6) - 1));
  const soft = Math.max(0, Math.min(1, (bestScore - 0.04) / 0.3));
  return { bpm, confidence: Math.max(soft, prominence * 0.55) };
}

/** Krumhansl–Schmuckler key profiles (major / minor). */
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const NOTE_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

function correlate(a: number[], b: number[]) {
  const n = a.length;
  let meanA = 0;
  let meanB = 0;
  for (let i = 0; i < n; i++) {
    meanA += a[i];
    meanB += b[i];
  }
  meanA /= n;
  meanB /= n;
  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const den = Math.sqrt(denA * denB);
  return den > 0 ? num / den : 0;
}

function estimateKey(samples: Float32Array, sampleRate: number): { key: string; confidence: number } {
  const frameSize = 4096;
  const hop = 2048;
  const frameCount = Math.max(0, Math.floor((samples.length - frameSize) / hop));
  if (frameCount < 6) return { key: "", confidence: 0 };

  const chroma = new Array(12).fill(0) as number[];
  const re = new Float64Array(frameSize);
  const im = new Float64Array(frameSize);
  const A4 = 440;

  for (let f = 0; f < frameCount; f++) {
    const offset = f * hop;
    for (let i = 0; i < frameSize; i++) {
      re[i] = samples[offset + i] * hann(i, frameSize);
      im[i] = 0;
    }
    fft(re, im);

    for (let k = 2; k < frameSize / 2 - 1; k++) {
      const freq = (k * sampleRate) / frameSize;
      if (freq < 70 || freq > 3500) continue;
      const mag = Math.hypot(re[k], im[k]);
      if (mag <= 1e-9) continue;
      const left = Math.hypot(re[k - 1], im[k - 1]);
      const right = Math.hypot(re[k + 1], im[k + 1]);
      // Local spectral peaks only — rejects broadband/percussive energy.
      if (mag < left || mag < right) continue;

      const logMagL = Math.log(left + 1e-12);
      const logMagC = Math.log(mag + 1e-12);
      const logMagR = Math.log(right + 1e-12);
      const delta = (0.5 * (logMagL - logMagR)) / (logMagL - 2 * logMagC + logMagR + 1e-12);
      const refinedFreq =
        ((k + Math.max(-0.5, Math.min(0.5, delta))) * sampleRate) / frameSize;
      const midi = 69 + 12 * Math.log2(refinedFreq / A4);
      const pcFloat = ((midi % 12) + 12) % 12;
      const pc0 = Math.floor(pcFloat) % 12;
      const pc1 = (pc0 + 1) % 12;
      const frac = pcFloat - Math.floor(pcFloat);
      const energy = mag * mag;
      chroma[pc0] += energy * (1 - frac);
      chroma[pc1] += energy * frac;
    }
  }

  const sum = chroma.reduce((a, b) => a + b, 0);
  if (sum <= 0) return { key: "", confidence: 0 };
  const normalized = chroma.map((v) => v / sum);

  const ranked = [...normalized].sort((a, b) => b - a);
  const top3 = ranked[0] + ranked[1] + ranked[2];
  if (ranked[0] < 0.1 || top3 < 0.32) {
    return { key: "", confidence: 0 };
  }

  // Entropy gate: skip noise-like / click-train chroma.
  const entropy = -normalized.reduce((s, p) => (p > 1e-12 ? s + p * Math.log(p) : s), 0);
  if (entropy > 2.2) {
    return { key: "", confidence: 0 };
  }

  let bestKey = "";
  let bestScore = -Infinity;
  let secondScore = -Infinity;

  for (let tonic = 0; tonic < 12; tonic++) {
    const majorRotated = MAJOR_PROFILE.map((_, i) => MAJOR_PROFILE[(i - tonic + 12) % 12]);
    const minorRotated = MINOR_PROFILE.map((_, i) => MINOR_PROFILE[(i - tonic + 12) % 12]);
    const majorScore = correlate(normalized, majorRotated);
    const minorScore = correlate(normalized, minorRotated);

    const consider = (score: number, label: string) => {
      if (score > bestScore) {
        secondScore = bestScore;
        bestScore = score;
        bestKey = label;
      } else if (score > secondScore) {
        secondScore = score;
      }
    };
    consider(majorScore, NOTE_NAMES[tonic]);
    consider(minorScore, `${NOTE_NAMES[tonic]}m`);
  }

  const gap = bestScore - secondScore;
  if (bestScore < 0.18 || (gap < 0.015 && bestScore < 0.45)) {
    return { key: "", confidence: 0 };
  }

  const confidence = Math.max(0, Math.min(1, gap * 3.5 + (bestScore - 0.15) / 0.85));
  return {
    key: normalizeMusicalKey(bestKey),
    confidence: Number.isFinite(confidence) ? Math.max(confidence, 0.18) : 0,
  };
}

/** Optional filename hints like "120bpm" / "120 BPM" to resolve double/half tempo. */
export function bpmHintFromText(...parts: Array<string | null | undefined>): number | null {
  for (const part of parts) {
    const text = String(part || "");
    const match = text.match(/(\d{2,3})\s*(?:bpm|BPM)\b/) || text.match(/\b(\d{2,3})\s*bpm\b/i);
    if (!match) continue;
    const bpm = Number.parseInt(match[1], 10);
    if (bpm >= BPM_MIN && bpm <= BPM_MAX) return bpm;
  }
  return null;
}

function resolveWithHint(estimated: number, hint: number | null): number {
  if (!hint || !estimated) return estimated;
  const options = [estimated, Math.round(estimated / 2), Math.round(estimated * 2)];
  let best = estimated;
  let bestDist = Math.abs(estimated - hint);
  for (const opt of options) {
    if (opt < BPM_MIN || opt > BPM_MAX) continue;
    const dist = Math.abs(opt - hint);
    if (dist < bestDist) {
      bestDist = dist;
      best = opt;
    }
  }
  if (Math.abs(hint - best) <= 2) return hint;
  return best;
}

export async function analyzeAudioBytes(
  bytes: Buffer,
  opts?: {
    mimeType?: string;
    titleHint?: string;
    notesHint?: string;
  },
): Promise<AudioAnalysis | null> {
  const decoded = await decodeAnalysisClip(bytes, opts?.mimeType || "audio/mpeg");
  if (!decoded) return null;

  const { samples, sampleRate, analyzedSeconds } = decoded;
  const bpmEst = estimateBpm(samples, sampleRate);
  const keyEst = estimateKey(samples, sampleRate);
  const hint = bpmHintFromText(opts?.titleHint, opts?.notesHint);
  const bpm = resolveWithHint(bpmEst.bpm, hint);

  return {
    bpm: bpm > 0 && bpmEst.confidence >= 0.14 ? String(bpm) : "",
    musicalKey: keyEst.key && keyEst.confidence >= 0.4 ? keyEst.key : "",
    bpmConfidence: bpmEst.confidence,
    keyConfidence: keyEst.confidence,
    analyzedSeconds,
  };
}

/** Used in tests / diagnostics without ffmpeg. */
export function analyzePcmMono(
  samples: Float32Array,
  sampleRate: number,
  hints?: { titleHint?: string; notesHint?: string },
): AudioAnalysis {
  const bpmEst = estimateBpm(samples, sampleRate);
  const keyEst = estimateKey(samples, sampleRate);
  const hint = bpmHintFromText(hints?.titleHint, hints?.notesHint);
  const bpm = resolveWithHint(bpmEst.bpm, hint);
  return {
    bpm: bpm > 0 && bpmEst.confidence >= 0.14 ? String(bpm) : "",
    musicalKey: keyEst.key && keyEst.confidence >= 0.4 ? keyEst.key : "",
    bpmConfidence: bpmEst.confidence,
    keyConfidence: keyEst.confidence,
    analyzedSeconds: samples.length / sampleRate,
  };
}
