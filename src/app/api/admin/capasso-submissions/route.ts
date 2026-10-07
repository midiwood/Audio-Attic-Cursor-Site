import { NextRequest, NextResponse } from "next/server";
import { getCatalogStaffSession } from "@/lib/auth";
import { getCapassoProProfileFromSiteSettings } from "@/lib/site-settings";
import {
  archiveCapassoSubmission,
  cancelCapassoSubmission,
  completeCapassoSubmission,
  createCapassoSubmission,
  deleteCapassoSubmissionPermanently,
  listCapassoSubmissions,
  restoreCapassoSubmission,
  trashCapassoSubmission,
  unarchiveCapassoSubmission,
} from "@/lib/capasso-submissions";

export const runtime = "nodejs";

function listView(req: NextRequest): "active" | "trash" | "archived" {
  if (req.nextUrl.searchParams.get("trashed") === "1") return "trash";
  if (req.nextUrl.searchParams.get("archived") === "1") return "archived";
  return "active";
}

export async function GET(req: NextRequest) {
  const auth = await getCatalogStaffSession();
  if (!auth.ok) return NextResponse.json({ error: "Forbidden" }, { status: auth.status });
  return NextResponse.json({ submissions: listCapassoSubmissions({ view: listView(req) }) });
}

export async function POST(req: NextRequest) {
  const auth = await getCatalogStaffSession();
  if (!auth.ok) return NextResponse.json({ error: "Forbidden" }, { status: auth.status });

  const body = (await req.json().catch(() => ({}))) as {
    trackIds?: string[];
    notes?: string;
  };
  const trackIds = Array.isArray(body.trackIds) ? body.trackIds.map(String) : [];
  const profile = getCapassoProProfileFromSiteSettings();
  if (!profile.houseName) {
    return NextResponse.json(
      { error: "Add a house publisher name in Admin → Publisher / PRO before preparing a Capasso SWI" },
      { status: 400 },
    );
  }
  if (!profile.caaNumber) {
    return NextResponse.json(
      { error: "Add a Capasso CAA number in Admin → Publisher / PRO before preparing a Capasso SWI" },
      { status: 400 },
    );
  }
  if (!profile.ipiNumber) {
    return NextResponse.json(
      {
        error:
          "Add PA IPI / IPI number in Admin → Publisher / PRO before preparing a Capasso SWI",
      },
      { status: 400 },
    );
  }

  const result = createCapassoSubmission({
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
    complete: () => completeCapassoSubmission(id),
    cancel: () => cancelCapassoSubmission(id),
    trash: () => trashCapassoSubmission(id),
    restore: () => restoreCapassoSubmission(id),
    archive: () => archiveCapassoSubmission(id),
    unarchive: () => unarchiveCapassoSubmission(id),
    delete: () => deleteCapassoSubmissionPermanently(id),
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
