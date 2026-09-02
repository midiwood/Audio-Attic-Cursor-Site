import { NextRequest, NextResponse } from "next/server";
import { isSiteAdmin, getSession } from "@/lib/auth";
import { testSpacesConnection } from "@/lib/storage/spaces";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!isSiteAdmin(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const result = await testSpacesConnection({
    key: typeof body.key === "string" ? body.key : undefined,
    secret: typeof body.secret === "string" ? body.secret : undefined,
    bucket: typeof body.bucket === "string" ? body.bucket : undefined,
    region: typeof body.region === "string" ? body.region : undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({
    ok: true,
    region: result.region,
    bucket: result.bucket,
    regionCorrected: result.regionCorrected,
  });
}
