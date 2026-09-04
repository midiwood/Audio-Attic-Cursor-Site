import { NextRequest, NextResponse } from "next/server";
import { parseCatalogFilters } from "@/lib/catalog-filters";
import {
  authorizeCatalogSearch,
  catalogPlayUrl,
  catalogPublicOrigin,
  partnerBpmRange,
  partnerLicenseInventory,
} from "@/lib/catalog-partner";
import { countTracks, queryTracksPage } from "@/lib/queries";
import { formatDisplayTitle } from "@/lib/tracks";

export const runtime = "nodejs";

const MAX_LIMIT = 20;

export async function GET(req: NextRequest) {
  const auth = authorizeCatalogSearch(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const params = req.nextUrl.searchParams;
  const filters = parseCatalogFilters(params);
  filters.license = "clear";
  filters.samro = undefined;
  filters.year = undefined;

  const bpm = partnerBpmRange(params);
  if (bpm.bpmMin != null) filters.bpmMin = bpm.bpmMin;
  if (bpm.bpmMax != null) filters.bpmMax = bpm.bpmMax;

  const limitRaw = Number(params.get("limit") ?? MAX_LIMIT);
  const offsetRaw = Number(params.get("offset") ?? 0);
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(Math.floor(limitRaw), MAX_LIMIT))
    : MAX_LIMIT;
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.floor(offsetRaw)) : 0;

  const total = countTracks(filters);
  const rows = queryTracksPage(filters, { limit, offset });
  const origin = catalogPublicOrigin(req.nextUrl.origin);

  const body: Record<string, unknown> = {
    total,
    offset,
    limit,
    hasMore: offset + rows.length < total,
    tracks: rows.map((track) => ({
      id: track.id,
      title: formatDisplayTitle(track),
      genre: track.genre,
      mood: track.mood,
      instruments: track.instruments,
      attributes: track.attributes,
      bpm: track.bpm,
      duration: track.duration,
      key: track.musicalKey,
      playUrl: catalogPlayUrl(origin, track.id),
    })),
  };

  // Staff/partner debugging: same Bearer, add ?diag=1 — shows which attic.db this process opened.
  if (params.get("diag") === "1") {
    body.diag = {
      ...partnerLicenseInventory(),
      countTracksClear: total,
      filterLicense: filters.license,
      bpmMin: filters.bpmMin ?? null,
      bpmMax: filters.bpmMax ?? null,
    };
  }

  return NextResponse.json(body);
}
