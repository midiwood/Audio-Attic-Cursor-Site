import { NextRequest, NextResponse } from "next/server";
import { getCatalogStaffSession } from "@/lib/auth";
import {
  getLicenseEntryById,
  permanentlyDeleteLicenseEntry,
  restoreLicenseEntry,
  serializeLicenseEntry,
  trashLicenseEntry,
  updateLicenseEntry,
} from "@/lib/license-entries";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  const staff = await getCatalogStaffSession();
  if (!staff.ok) {
    return NextResponse.json(
      { error: staff.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: staff.status },
    );
  }

  const { id, entryId } = await params;
  const existing = getLicenseEntryById(entryId);
  if (!existing || existing.trackId !== id) {
    return NextResponse.json({ error: "License entry not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const action = String(body.action || "").trim();
  if (action === "restore") {
    const result = restoreLicenseEntry(entryId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ entry: serializeLicenseEntry(result.entry) });
  }
  if (action === "trash") {
    const result = trashLicenseEntry(entryId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ entry: serializeLicenseEntry(result.entry) });
  }

  const result = updateLicenseEntry(entryId, {
    client: body.client != null ? String(body.client) : undefined,
    usedFor: body.usedFor != null ? String(body.usedFor) : undefined,
    territory: body.territory != null ? String(body.territory) : undefined,
    media: body.media != null ? String(body.media) : undefined,
    duration: body.duration != null ? String(body.duration) : undefined,
    branding: body.branding != null ? String(body.branding) : undefined,
    notes: body.notes !== undefined ? (body.notes == null ? null : String(body.notes)) : undefined,
    licensedAt: body.licensedAt != null ? String(body.licensedAt) : undefined,
    perpetuity:
      body.perpetuity !== undefined
        ? body.perpetuity == null
          ? null
          : String(body.perpetuity)
        : undefined,
    expiresAt:
      body.expiresAt !== undefined
        ? body.expiresAt == null
          ? null
          : String(body.expiresAt)
        : undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ entry: serializeLicenseEntry(result.entry) });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  const staff = await getCatalogStaffSession();
  if (!staff.ok) {
    return NextResponse.json(
      { error: staff.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: staff.status },
    );
  }

  const { id, entryId } = await params;
  const existing = getLicenseEntryById(entryId);
  if (!existing || existing.trackId !== id) {
    return NextResponse.json({ error: "License entry not found" }, { status: 404 });
  }

  const permanent =
    req.nextUrl.searchParams.get("permanent") === "1" ||
    req.nextUrl.searchParams.get("permanent") === "true";

  if (permanent) {
    const result = permanentlyDeleteLicenseEntry(entryId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, permanent: true });
  }

  const result = trashLicenseEntry(entryId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, entry: serializeLicenseEntry(result.entry) });
}
