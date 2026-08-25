import { NextRequest, NextResponse } from "next/server";
import { getCatalogStaffSession } from "@/lib/auth";
import {
  createLicenseEntry,
  listLicenseEntriesForTrack,
  serializeLicenseEntry,
} from "@/lib/license-entries";
import { getTrackById } from "@/lib/queries";

export async function GET(
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
  const track = getTrackById(id);
  if (!track) return NextResponse.json({ error: "Track not found" }, { status: 404 });

  const trashed = req.nextUrl.searchParams.get("trashed") === "1";
  const entries = listLicenseEntriesForTrack(id, { trashed }).map(serializeLicenseEntry);
  return NextResponse.json({ entries, trashed });
}

export async function POST(
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
  const track = getTrackById(id);
  if (!track) return NextResponse.json({ error: "Track not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const result = createLicenseEntry(id, {
    client: String(body.client || ""),
    usedFor: String(body.usedFor || ""),
    territory: String(body.territory || ""),
    media: String(body.media || ""),
    duration: String(body.duration || ""),
    branding: String(body.branding || ""),
    notes: body.notes != null ? String(body.notes) : null,
    licensedAt: String(body.licensedAt || ""),
    perpetuity: body.perpetuity != null ? String(body.perpetuity) : null,
    expiresAt: body.expiresAt != null ? String(body.expiresAt) : null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const updated = getTrackById(id);
  return NextResponse.json({
    entry: serializeLicenseEntry(result.entry),
    trackLicense: updated?.license ?? null,
  });
}
