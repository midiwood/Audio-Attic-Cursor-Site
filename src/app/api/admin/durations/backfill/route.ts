import { NextRequest, NextResponse } from "next/server";
import { getSession, isSiteAdmin } from "@/lib/auth";
import {
  backfillDurationsFromAudio,
  backfillDurationsFromWaveforms,
  countTracksMissingDuration,
} from "@/lib/duration-backfill";

export const runtime = "nodejs";
/** Audio decode batches can be slow — allow a longer window. */
export const maxDuration = 300;

export async function GET() {
  const session = await getSession();
  if (!isSiteAdmin(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    missing: countTracksMissingDuration(),
  });
}

/**
 * Backfill empty track durations.
 * - `mode: "waveforms"` — copy from stored waveform duration (fast)
 * - `mode: "audio"` — decode from Dropbox file when still empty (slow)
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!isSiteAdmin(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const mode = body?.mode === "audio" ? "audio" : "waveforms";
  const limitRaw = Number(body?.limit ?? (mode === "audio" ? 10 : 100));
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(Math.floor(limitRaw), mode === "audio" ? 50 : 500))
    : mode === "audio"
      ? 10
      : 100;

  const missingBefore = countTracksMissingDuration();
  const result =
    mode === "audio"
      ? await backfillDurationsFromAudio(limit)
      : backfillDurationsFromWaveforms(limit);
  const missingAfter = countTracksMissingDuration();

  return NextResponse.json({
    mode,
    missingBefore,
    missingAfter,
    ...result,
  });
}
