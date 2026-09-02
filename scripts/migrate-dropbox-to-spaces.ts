/**
 * One-time migration: copy vault audio from Dropbox to DigitalOcean Spaces.
 *
 * Usage:
 *   npx tsx scripts/migrate-dropbox-to-spaces.ts --dry-run
 *   npx tsx scripts/migrate-dropbox-to-spaces.ts --track-id=RJV001
 */

import { config } from "dotenv";
import { eq } from "drizzle-orm";

config({ path: ".env.local" });
config();
import { db } from "../src/db";
import { trackAudioAssets, tracks } from "../src/db/schema";
import { downloadFile } from "../src/lib/dropbox-files";
import { dropboxAuthConfigured, dropboxAuthSetupMessage } from "../src/lib/dropbox-auth";
import {
  vaultStemMp3Key,
  vaultTrackMp3Key,
  vaultVersionMp3Key,
} from "../src/lib/storage/paths";
import { isSpacesObjectKey } from "../src/lib/storage/paths";
import { spacesConfigured, spacesSetupMessage, uploadObject } from "../src/lib/storage/spaces-core";

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
      const n = Number.parseInt(arg.slice("--limit=".length), 10);
      if (Number.isFinite(n) && n > 0) limit = n;
    }
  }
  return { dryRun, trackId, limit };
}

function extractTrackIdFromPath(path: string): string | null {
  const normalized = path.replace(/\\/g, "/");
  const match = normalized.match(/\/([A-Za-z0-9_-]+)\/(?:track\.mp3|versions|stems)\//) ||
    normalized.match(/\/([A-Za-z0-9_-]+)\/track\.mp3$/);
  return match?.[1] || null;
}

function legacyPathToSpacesKey(oldPath: string, trackId: string, kind?: "version" | "stem", slug?: string): string {
  if (kind === "version" && slug) return vaultVersionMp3Key(trackId, slug);
  if (kind === "stem" && slug) return vaultStemMp3Key(trackId, slug);

  const normalized = oldPath.replace(/\\/g, "/");
  const idFromPath = extractTrackIdFromPath(normalized) || trackId;
  const versionMatch = normalized.match(/\/versions\/([^/]+)\.mp3$/i);
  if (versionMatch) return vaultVersionMp3Key(idFromPath, versionMatch[1].replace(/\.mp3$/i, ""));
  const stemMatch = normalized.match(/\/stems\/([^/]+)\.mp3$/i);
  if (stemMatch) return vaultStemMp3Key(idFromPath, stemMatch[1].replace(/\.mp3$/i, ""));
  return vaultTrackMp3Key(idFromPath);
}

async function migrateTrackRow(
  row: {
    id: string;
    trackId?: string;
    dropboxPath: string | null;
    dropboxDl: string | null;
    kind?: "version" | "stem";
    slug?: string;
    table: "tracks" | "assets";
  },
  dryRun: boolean,
) {
  const existingPath = row.dropboxPath?.trim() || "";
  if (existingPath && isSpacesObjectKey(existingPath)) {
    console.log(`  skip ${row.id} — already on Spaces (${existingPath})`);
    return { ok: true, skipped: true };
  }

  const ownerTrackId =
    row.table === "tracks" ? row.id : row.trackId || extractTrackIdFromPath(existingPath) || "";
  const newKey = legacyPathToSpacesKey(existingPath, ownerTrackId, row.kind, row.slug);

  console.log(`  ${row.id}: ${existingPath || row.dropboxDl || "(no path)"} → ${newKey}`);

  if (dryRun) return { ok: true, skipped: false };

  try {
    const bytes = await downloadFile({
      path: existingPath.startsWith("/") ? existingPath : null,
      sharedOrDlUrl: row.dropboxDl,
    });

    if (!bytes.length) {
      console.error(`  FAIL ${row.id}: empty download`);
      return { ok: false, skipped: false };
    }

    await uploadObject(newKey, bytes);

    if (row.table === "tracks") {
      db.update(tracks)
        .set({ dropboxPath: newKey, dropboxLink: null, dropboxDl: null })
        .where(eq(tracks.id, row.id))
        .run();
    } else {
      db.update(trackAudioAssets)
        .set({ dropboxPath: newKey, dropboxLink: null, dropboxDl: null })
        .where(eq(trackAudioAssets.id, row.id))
        .run();
    }

    console.log(`  OK ${row.id} (${bytes.length} bytes)`);
    return { ok: true, skipped: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  FAIL ${row.id}: ${message}`);
    return { ok: false, skipped: false };
  }
}

async function main() {
  const { dryRun, trackId, limit } = parseArgs();

  if (!spacesConfigured()) {
    console.error(spacesSetupMessage());
    process.exit(1);
  }
  if (!dropboxAuthConfigured()) {
    console.error(dropboxAuthSetupMessage());
    process.exit(1);
  }

  console.log(dryRun ? "DRY RUN — no uploads or DB writes" : "Migrating Dropbox vault → Spaces…");

  let ok = 0;
  let failed = 0;
  let skipped = 0;

  let trackRows = trackId
    ? [db.select().from(tracks).where(eq(tracks.id, trackId)).get()].filter(Boolean)
    : db.select().from(tracks).all();

  trackRows = trackRows.filter(
    (row) => row && (row.dropboxPath?.trim() || row.dropboxDl?.trim()),
  );
  if (limit) trackRows = trackRows.slice(0, limit);

  for (const row of trackRows) {
    if (!row) continue;
    console.log(`Track ${row.id}`);
    const result = await migrateTrackRow(
      {
        id: row.id,
        dropboxPath: row.dropboxPath,
        dropboxDl: row.dropboxDl,
        table: "tracks",
      },
      dryRun,
    );
    if (result.skipped) skipped += 1;
    else if (result.ok) ok += 1;
    else failed += 1;
  }

  let assetRows = db
    .select()
    .from(trackAudioAssets)
    .all()
    .filter((row) => {
      if (trackId && row.trackId !== trackId) return false;
      return Boolean(row.dropboxPath?.trim() || row.dropboxDl?.trim());
    });
  if (limit && trackRows.length >= limit) assetRows = [];

  for (const row of assetRows) {
    console.log(`Asset ${row.id} (${row.trackId} · ${row.label})`);
    const result = await migrateTrackRow(
      {
        id: row.id,
        trackId: row.trackId,
        dropboxPath: row.dropboxPath,
        dropboxDl: row.dropboxDl,
        kind: row.kind as "version" | "stem",
        slug: row.slug,
        table: "assets",
      },
      dryRun,
    );
    if (result.skipped) skipped += 1;
    else if (result.ok) ok += 1;
    else failed += 1;
  }

  console.log(`Done. migrated=${ok} skipped=${skipped} failed=${failed}`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
