import { NextRequest, NextResponse } from "next/server";
import { canManageCatalog, getApiSession, isSubscriber } from "@/lib/auth";
import { attachSamroComposerSlots } from "@/lib/composers";
import { parseCatalogFilters } from "@/lib/catalog-filters";
import { getLicenseEntryCounts } from "@/lib/license-entries";
import { getUserLicenseRequestStatusByTrack } from "@/lib/license-requests";
import { getSamroProProfileFromSiteSettings } from "@/lib/publisher";
import { CATALOG_PAGE_SIZE, countTracks, queryTracksPage } from "@/lib/queries";
import { toTrackListItem } from "@/lib/track-list-item";
import { listRelationsForTrackIds } from "@/lib/track-relation-queries";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await getApiSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const filters = parseCatalogFilters(params);
  const staff = canManageCatalog(session);
  const subscriber = isSubscriber(session);
  if (subscriber || !staff) {
    filters.license = "available";
  }
  if (!staff) {
    filters.samro = undefined;
  }

  const limitRaw = Number(params.get("limit") ?? CATALOG_PAGE_SIZE);
  const offsetRaw = Number(params.get("offset") ?? 0);
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(Math.floor(limitRaw), 100))
    : CATALOG_PAGE_SIZE;
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.floor(offsetRaw)) : 0;

  const total = countTracks(filters);
  const rows = queryTracksPage(filters, { limit, offset });
  let trackItems = rows.map(toTrackListItem);
  if (staff && filters.samro === "prepare") {
    trackItems = attachSamroComposerSlots(trackItems, getSamroProProfileFromSiteSettings());
  }
  const ids = rows.map((track) => track.id);
  const relationsByTrack = staff ? listRelationsForTrackIds(ids) : {};
  const licenseEntryCounts = staff ? getLicenseEntryCounts(ids) : {};
  const userLicenseByTrack =
    subscriber && !staff
      ? getUserLicenseRequestStatusByTrack(session.user.id, ids)
      : {};

  return NextResponse.json({
    tracks: trackItems,
    relationsByTrack,
    licenseEntryCounts,
    userLicenseByTrack,
    total,
    offset,
    limit,
    hasMore: offset + rows.length < total,
  });
}
