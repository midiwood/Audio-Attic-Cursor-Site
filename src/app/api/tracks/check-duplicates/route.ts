import { NextRequest, NextResponse } from "next/server";
import { getCatalogStaffSession } from "@/lib/auth";
import { findDuplicateMatches, type DuplicateMatch } from "@/lib/duplicates";
import { getTrackById, listTracksForDuplicateCheck } from "@/lib/queries";
import { toTrackListItem } from "@/lib/track-list-item";

export const runtime = "nodejs";

type CheckItem = {
  dropboxLink?: string;
  workingTitle?: string;
  libraryTitle?: string;
};

export async function POST(req: NextRequest) {
  const staff = await getCatalogStaffSession();
  if (!staff.ok) {
    return NextResponse.json(
      { error: staff.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: staff.status },
    );
  }

  const body = await req.json().catch(() => null);
  const items = (body?.tracks || body?.items) as CheckItem[] | undefined;
  if (!Array.isArray(items) || !items.length) {
    return NextResponse.json({ error: "Provide tracks to check" }, { status: 400 });
  }

  const catalog = listTracksForDuplicateCheck();
  const results: Array<{ index: number; matches: DuplicateMatch[] }> = items.map((item, index) => ({
    index,
    matches: findDuplicateMatches(
      {
        dropboxLink: item.dropboxLink,
        workingTitle: item.workingTitle,
        libraryTitle: item.libraryTitle,
      },
      catalog,
    ),
  }));

  const matchIds = [
    ...new Set(results.flatMap((row) => row.matches.map((match) => match.id))),
  ];
  const tracks = matchIds
    .map((id) => getTrackById(id))
    .filter((track): track is NonNullable<typeof track> => Boolean(track))
    .map(toTrackListItem);

  return NextResponse.json({ results, tracks });
}
