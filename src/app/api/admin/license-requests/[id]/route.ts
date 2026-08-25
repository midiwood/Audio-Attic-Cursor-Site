import { NextRequest, NextResponse } from "next/server";
import { getCatalogStaffSession } from "@/lib/auth";
import {
  getLicenseRequestById,
  isLicenseRequestStatus,
  permanentlyDeleteLicenseRequest,
  restoreLicenseRequest,
  trashLicenseRequest,
  updateLicenseRequest,
  updateLicenseRequestStatus,
} from "@/lib/license-requests";

function serializeRequest(request: NonNullable<ReturnType<typeof getLicenseRequestById>>) {
  return {
    id: request.id,
    status: request.status,
    trackId: request.trackId,
    intendedUse: request.intendedUse,
    message: request.message,
    scope: request.scope,
    territory: request.territory,
    media: request.media,
    duration: request.duration,
    branding: request.branding,
    trashedAt: request.trashedAt ?? null,
    updatedAt: request.updatedAt,
  };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const staff = await getCatalogStaffSession();
  if (!staff.ok) {
    return NextResponse.json(
      { error: staff.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: staff.status },
    );
  }

  const { id } = await params;
  const existing = getLicenseRequestById(id);
  if (!existing) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const action = String(body.action || "").trim();
  if (action === "restore") {
    const result = restoreLicenseRequest(id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ request: serializeRequest(result.request) });
  }
  if (action === "trash") {
    const result = trashLicenseRequest(id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ request: serializeRequest(result.request) });
  }

  const hasFieldUpdate =
    body.territory != null ||
    body.media != null ||
    body.duration != null ||
    body.branding != null ||
    body.intendedUse != null ||
    body.project != null ||
    body.message !== undefined;

  // Status-only updates (Accept flow / Decline) keep the simple path.
  if (!hasFieldUpdate && body.status != null) {
    const status = String(body.status || "").trim();
    if (!isLicenseRequestStatus(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    const result = updateLicenseRequestStatus(id, status);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ request: serializeRequest(result.request) });
  }

  const statusRaw = body.status != null ? String(body.status).trim() : undefined;
  if (statusRaw != null && !isLicenseRequestStatus(statusRaw)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const result = updateLicenseRequest(id, {
    territory: body.territory != null ? String(body.territory) : undefined,
    media: body.media != null ? String(body.media) : undefined,
    duration: body.duration != null ? String(body.duration) : undefined,
    branding: body.branding != null ? String(body.branding) : undefined,
    intendedUse:
      body.intendedUse != null
        ? String(body.intendedUse)
        : body.project != null
          ? String(body.project)
          : undefined,
    message: body.message !== undefined ? (body.message == null ? null : String(body.message)) : undefined,
    status: statusRaw,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ request: serializeRequest(result.request) });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const staff = await getCatalogStaffSession();
  if (!staff.ok) {
    return NextResponse.json(
      { error: staff.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: staff.status },
    );
  }

  const { id } = await params;
  const permanent =
    req.nextUrl.searchParams.get("permanent") === "1" ||
    req.nextUrl.searchParams.get("permanent") === "true";

  if (permanent) {
    const result = permanentlyDeleteLicenseRequest(id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, permanent: true });
  }

  const result = trashLicenseRequest(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json({ ok: true, request: serializeRequest(result.request) });
}
