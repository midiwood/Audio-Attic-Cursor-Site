import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Deprecated — bulk downloads use presigned URLs via POST /api/audio/presign-batch. */
export async function GET() {
  return NextResponse.json(
    { error: "Server-side zip is disabled. Use presigned batch download instead." },
    { status: 410 },
  );
}

export async function POST() {
  return NextResponse.json(
    { error: "Server-side zip is disabled. Use POST /api/audio/presign-batch instead." },
    { status: 410 },
  );
}
