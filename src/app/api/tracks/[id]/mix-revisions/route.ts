import { NextRequest, NextResponse } from "next/server";
import { getCatalogStaffSession } from "@/lib/auth";
import { getTrackById } from "@/lib/queries";
import { listMixRevisions, restoreMixRevision } from "@/lib/mix-revisions";
import { spacesConfigured, spacesSetupMessage } from "@/lib/vault-storage";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  const staff = await getCatalogStaffSession();
  if (!staff.ok) {
    return NextResponse.json(
      { error: staff.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: staff.status },
    );
  }

  const { id } = await context.params;
  if (!getTrackById(id)) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  return NextResponse.json({ revisions: listMixRevisions(id) });
}

export async function POST(req: NextRequest, context: RouteContext) {
  const staff = await getCatalogStaffSession();
  if (!staff.ok) {
    return NextResponse.json(
      { error: staff.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: staff.status },
    );
  }

  if (!spacesConfigured()) {
    return NextResponse.json({ error: spacesSetupMessage() }, { status: 500 });
  }

  const { id } = await context.params;
  const body = (await req.json().catch(() => null)) as { revisionId?: string } | null;
  const revisionId = String(body?.revisionId || "").trim();
  if (!revisionId) {
    return NextResponse.json({ error: "revisionId is required" }, { status: 400 });
  }

  try {
    const restoredBy =
      staff.session.user.name?.trim() || staff.session.user.email?.trim() || null;
    const track = await restoreMixRevision(id, revisionId, { restoredBy });
    return NextResponse.json({
      track,
      revisions: listMixRevisions(id),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Revert failed";
    const status = /not found/i.test(message) ? 404 : 502;
    console.error("[mix-revisions POST]", message, err);
    return NextResponse.json({ error: message }, { status });
  }
}
