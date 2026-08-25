import { NextRequest, NextResponse } from "next/server";
import { getSession, isSiteAdmin } from "@/lib/auth";
import {
  countTracksMissingWaveforms,
  listTracksMissingWaveforms,
} from "@/lib/waveform-queries";
import { ensureTrackWaveforms } from "@/lib/waveform-generate";

export const runtime = "nodejs";
/** Peak gen downloads + ffmpeg — allow a longer window for batches. */
export const maxDuration = 300;

export async function GET() {
  const session = await getSession();
  if (!isSiteAdmin(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    missing: countTracksMissingWaveforms(),
  });
}

/** Process up to `limit` tracks missing waveforms (default 10). */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!isSiteAdmin(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const limitRaw = Number(body?.limit ?? 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(Math.floor(limitRaw), 50)) : 10;

  const missingBefore = countTracksMissingWaveforms();
  const batch = listTracksMissingWaveforms(limit);
  const result = await ensureTrackWaveforms(batch, 2);
  const missingAfter = countTracksMissingWaveforms();

  return NextResponse.json({
    processed: batch.length,
    ok: result.ok,
    failed: result.failed,
    missingBefore,
    missingAfter,
    ids: batch.map((t) => t.id),
  });
}
