import { NextRequest, NextResponse } from "next/server";
import { getCatalogStaffSession } from "@/lib/auth";
import {
  backfillAllTrackComposersFromArtist,
  backfillTracksWithEmptyArtist,
  ensureHouseComposer,
  findComposerByName,
  seedComposersFromCatalogArtists,
} from "@/lib/composers";
import { getPublisherRuntimeConfig } from "@/lib/site-settings";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = await getCatalogStaffSession();
  if (!auth.ok) return NextResponse.json({ error: "Forbidden" }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const limitRaw = Number(body?.limit ?? 500);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(Math.floor(limitRaw), 500)) : 500;
  const includeEmptyArtist = body?.includeEmptyArtist !== false;

  const cfg = getPublisherRuntimeConfig();
  if (cfg.houseName.trim()) {
    ensureHouseComposer({
      displayName: cfg.houseName.trim(),
      ipiPa: cfg.proPaIpiNameNumber.trim() || cfg.proIpiBaseNumber.trim(),
      ipiBase: cfg.proIpiBaseNumber.trim() || undefined,
    });
  }

  const seeded = seedComposersFromCatalogArtists();
  const result = backfillAllTrackComposersFromArtist(limit);

  let emptyArtistLinked = 0;
  if (includeEmptyArtist) {
    const house = findComposerByName(cfg.houseName.trim());
    if (house) {
      let batch = backfillTracksWithEmptyArtist(house.id, limit);
      while (batch.scanned > 0) {
        emptyArtistLinked += batch.linked;
        batch = backfillTracksWithEmptyArtist(house.id, limit);
      }
    }
  }

  return NextResponse.json({
    ...result,
    seeded: seeded.created,
    emptyArtistLinked,
  });
}
