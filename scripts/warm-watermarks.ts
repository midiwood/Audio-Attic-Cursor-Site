/**
 * Pre-generate watermarked eval MP3s into Spaces (for hosts that cannot spawn ffmpeg).
 *
 * Usage:
 *   npx tsx scripts/warm-watermarks.ts --dry-run
 *   npx tsx scripts/warm-watermarks.ts --limit=20
 *   npx tsx scripts/warm-watermarks.ts --track-id=rjv0558
 */

import { config } from "dotenv";

config({ path: ".env.local" });
config();

import { db } from "../src/db";
import { tracks } from "../src/db/schema";
import { ensureWatermarkedObject } from "../src/lib/audio-watermark";
import { isSpacesObjectKey } from "../src/lib/storage/paths";
import { spacesConfigured, spacesSetupMessage } from "../src/lib/storage/spaces-core";

type Args = {
  dryRun: boolean;
  trackId?: string;
  limit?: number;
};

function parseArgs(): Args {
  const args = process.argv.slice(2);
  let dryRun = false;
  let trackId: string | undefined;
  let limit: number | undefined;
  for (const arg of args) {
    if (arg === "--dry-run") dryRun = true;
    else if (arg.startsWith("--track-id=")) trackId = arg.slice("--track-id=".length).trim();
    else if (arg.startsWith("--limit=")) {
      const n = Number(arg.slice("--limit=".length));
      if (Number.isFinite(n) && n > 0) limit = Math.floor(n);
    }
  }
  return { dryRun, trackId, limit };
}

async function main() {
  if (!spacesConfigured()) {
    console.error(spacesSetupMessage());
    process.exit(1);
  }

  const { dryRun, trackId, limit } = parseArgs();
  let rows = db
    .select({ id: tracks.id, dropboxPath: tracks.dropboxPath })
    .from(tracks)
    .all()
    .filter((r) => isSpacesObjectKey(r.dropboxPath));

  if (trackId) {
    const id = trackId.toLowerCase();
    rows = rows.filter((r) => r.id.toLowerCase() === id);
  }
  if (limit) rows = rows.slice(0, limit);

  console.log(
    dryRun
      ? `[dry-run] would warm ${rows.length} track(s)`
      : `Warming ${rows.length} watermarked object(s)…`,
  );

  let ok = 0;
  let failed = 0;
  for (const row of rows) {
    const key = String(row.dropboxPath || "").trim();
    if (dryRun) {
      console.log("  ", row.id, key);
      ok += 1;
      continue;
    }
    try {
      const dest = await ensureWatermarkedObject(row.id, key);
      console.log("ok", row.id, dest);
      ok += 1;
    } catch (err) {
      failed += 1;
      console.error("fail", row.id, err instanceof Error ? err.message : err);
    }
  }

  console.log(`Done. ok=${ok} failed=${failed}`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
