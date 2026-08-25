import { NextRequest, NextResponse } from "next/server";
import { getCatalogStaffSession } from "@/lib/auth";
import { searchTracksForLinker } from "@/lib/track-relation-queries";
import { toTrackListItem } from "@/lib/track-list-item";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const staff = await getCatalogStaffSession();
  if (!staff.ok) {
    return NextResponse.json(
      { error: staff.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: staff.status },
    );
  }

  const q = req.nextUrl.searchParams.get("q") || "";
  const exclude = req.nextUrl.searchParams.get("exclude") || undefined;
  const tracks = searchTracksForLinker(q, exclude, 12).map(toTrackListItem);
  return NextResponse.json({ tracks });
}
