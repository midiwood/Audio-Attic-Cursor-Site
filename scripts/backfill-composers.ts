/**
 * Backfill composer registry + track_composers from existing catalog data.
 *
 * Usage: npm run db:backfill-composers
 */
import {
  backfillAllTrackComposersFromArtist,
  backfillTracksWithEmptyArtist,
  ensureHouseComposer,
  findComposerByName,
  listComposers,
  seedComposersFromCatalogArtists,
  remapComposerAssignments,
  updateComposer,
} from "../src/lib/composers";
import { getPublisherRuntimeConfig } from "../src/lib/site-settings";

function main() {
  const cfg = getPublisherRuntimeConfig();
  if (cfg.houseName.trim()) {
    const house = ensureHouseComposer({
      displayName: cfg.houseName.trim(),
      ipiPa: cfg.proPaIpiNameNumber.trim() || cfg.proIpiBaseNumber.trim(),
      ipiBase: cfg.proIpiBaseNumber.trim() || undefined,
    });
    console.log(`House composer: ${house.displayName} (${house.ipiPa || "no IPI"})`);
  }

  const seeded = seedComposersFromCatalogArtists();
  console.log(
    `Registry seed: ${seeded.created.length} created, ${seeded.skipped} already existed`,
  );
  if (seeded.created.length) {
    console.log(`  New names: ${seeded.created.join(", ")}`);
  }

  // Copy IPI from the canonical David William Waugh entry to alias names if needed.
  const david = listComposers().find(
    (c) =>
      c.displayName.toLowerCase() === "david william waugh" &&
      c.ipiPa.trim() &&
      c.ipiPa.trim() !== "123",
  );
  if (david) {
    for (const alias of ["Dave Waugh"]) {
      const existing = findComposerByName(alias);
      if (existing && !existing.ipiPa.trim()) {
        updateComposer(existing.id, {
          ipiPa: david.ipiPa,
          ipiBase: david.ipiBase,
          notes: `Alias of ${david.displayName} (backfill)`,
        });
        console.log(`Updated alias ${alias} with IPI from ${david.displayName}`);
      }
    }
    // Disable duplicate stub row if present, then remap assignments onto the canonical row.
    for (const dup of listComposers({ includeDisabled: true })) {
      if (
        dup.displayName.toLowerCase() === "david william waugh" &&
        dup.id !== david.id &&
        (!dup.ipiPa.trim() || dup.ipiPa.trim() === "123")
      ) {
        updateComposer(dup.id, { disabled: true, notes: "Duplicate stub (disabled during backfill)" });
        const remapped = remapComposerAssignments(dup.id, david.id);
        console.log(`Disabled duplicate composer row: ${dup.id} (remapped ${remapped} tracks)`);
      }
    }
  }

  const linked = backfillAllTrackComposersFromArtist(500);
  console.log(
    `Track backfill (${linked.passes} pass(es)): ${linked.linked} linked, ${linked.skipped} skipped, ${linked.scanned} scanned`,
  );
  if (linked.unmatchedNames.length) {
    console.log(`  Unmatched names: ${linked.unmatchedNames.join(", ")}`);
  }

  const houseComposer = findComposerByName(cfg.houseName.trim());
  if (houseComposer) {
    let emptyTotal = 0;
    let emptyLinked = 0;
    while (true) {
      const batch = backfillTracksWithEmptyArtist(houseComposer.id, 500);
      emptyTotal += batch.scanned;
      emptyLinked += batch.linked;
      if (batch.scanned === 0) break;
    }
    if (emptyLinked) {
      console.log(`Empty artist: ${emptyLinked} track(s) assigned to ${houseComposer.displayName}`);
    }
  }

  console.log("Done.");
}

main();
