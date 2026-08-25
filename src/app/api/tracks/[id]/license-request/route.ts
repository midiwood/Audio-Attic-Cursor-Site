import { NextRequest, NextResponse } from "next/server";
import { getApiSession, isSubscriber } from "@/lib/auth";
import { createLicenseRequest } from "@/lib/license-requests";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getApiSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSubscriber(session)) {
    return NextResponse.json(
      { error: "License requests are for client accounts" },
      { status: 403 },
    );
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const result = createLicenseRequest({
    trackId: id,
    userId: session.user.id,
    territory: String(body.territory || ""),
    media: String(body.media || ""),
    duration: String(body.duration || ""),
    branding: String(body.branding || ""),
    intendedUse: String(body.intendedUse || body.project || ""),
    message: body.message != null ? String(body.message) : null,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status || 400 },
    );
  }

  return NextResponse.json({
    request: {
      id: result.request.id,
      status: result.request.status,
      scope: result.request.scope,
      territory: result.request.territory,
      media: result.request.media,
      duration: result.request.duration,
      branding: result.request.branding,
      intendedUse: result.request.intendedUse,
      createdAt: result.request.createdAt,
    },
  });
}
