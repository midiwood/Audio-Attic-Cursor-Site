import { NextRequest, NextResponse } from "next/server";
import { getCatalogStaffSession } from "@/lib/auth";
import { getSamroProProfileFromSiteSettings } from "@/lib/publisher";
import {
  archiveSamroSubmission,
  cancelSamroSubmission,
  completeSamroSubmission,
  createSamroSubmission,
  deleteSamroSubmissionPermanently,
  listSamroSubmissions,
  restoreSamroSubmission,
  trashSamroSubmission,
  unarchiveSamroSubmission,
} from "@/lib/samro-submissions";

export const runtime = "nodejs";

function listView(req: NextRequest): "active" | "trash" | "archived" {
  if (req.nextUrl.searchParams.get("trashed") === "1") return "trash";
  if (req.nextUrl.searchParams.get("archived") === "1") return "archived";
  return "active";
}

export async function GET(req: NextRequest) {
  const auth = await getCatalogStaffSession();
  if (!auth.ok) return NextResponse.json({ error: "Forbidden" }, { status: auth.status });
  return NextResponse.json({ submissions: listSamroSubmissions({ view: listView(req) }) });
}

export async function POST(req: NextRequest) {
  const auth = await getCatalogStaffSession();
  if (!auth.ok) return NextResponse.json({ error: "Forbidden" }, { status: auth.status });

  const body = (await req.json().catch(() => ({}))) as {
    trackIds?: string[];
    notes?: string;
  };
  const trackIds = Array.isArray(body.trackIds) ? body.trackIds.map(String) : [];
  const profile = getSamroProProfileFromSiteSettings();
  if (!profile.ipiNumber) {
    return NextResponse.json(
      {
        error:
          "Add PA IPI / IPI number in Admin → Publisher / PRO before preparing a SAMRO form",
      },
      { status: 400 },
    );
  }

  const result = createSamroSubmission({
    trackIds,
    profile,
    createdBy: auth.session.user.id,
    notes: body.notes,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ submission: result.submission });
}

export async function PATCH(req: NextRequest) {
  const auth = await getCatalogStaffSession();
  if (!auth.ok) return NextResponse.json({ error: "Forbidden" }, { status: auth.status });

  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    action?: "complete" | "cancel" | "trash" | "restore" | "archive" | "unarchive" | "delete";
  };
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const handlers: Record<
    string,
    () => { ok: true; trackCount?: number } | { ok: false; error: string; status?: number }
  > = {
    complete: () => completeSamroSubmission(id),
    cancel: () => cancelSamroSubmission(id),
    trash: () => trashSamroSubmission(id),
    restore: () => restoreSamroSubmission(id),
    archive: () => archiveSamroSubmission(id),
    unarchive: () => unarchiveSamroSubmission(id),
    delete: () => deleteSamroSubmissionPermanently(id),
  };

  const handler = body.action ? handlers[body.action] : undefined;
  if (!handler) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const result = handler();
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status || 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    trackCount: "trackCount" in result ? result.trackCount : undefined,
  });
}
