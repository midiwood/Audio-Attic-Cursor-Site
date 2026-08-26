/**
 * Copy existing catalog tracks into the Dropbox vault as -16 LUFS MP3s.
 *
 *   npx tsx scripts/migrate-to-vault.ts --dry-run
 *   npx tsx scripts/migrate-to-vault.ts --apply [--limit N] [--id TRACK_ID] [--force]
 */

import { eq, isNull, or } from "drizzle-orm";
import { db } from "../src/db";
import { tracks } from "../src/db/schema";
import { dropboxAuthConfigured, dropboxAuthSetupMessage } from "../src/lib/dropbox-auth";
import { vaultTrackMp3Path } from "../src/lib/dropbox-files";
import { upsertTrack } from "../src/lib/queries";
import { ingestTrackToVault } from "../src/lib/vault-ingest";
import { ensureTrackWaveforms } from "../src/lib/waveform-generate";

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return undefined;
  return process.argv[idx + 1];
}

async function main() {
  const dryRun = process.argv.includes("--dry-run") || !process.argv.includes("--apply");
  const force = process.argv.includes("--force");
  const limitRaw = argValue("--limit");
  const limit = limitRaw ? Math.max(1, Number(limitRaw) || 0) : undefined;
  const onlyId = argValue("--id")?.trim();

  if (!dropboxAuthConfigured()) {
    console.error(dropboxAuthSetupMessage());
    process.exit(1);
  }

  let rows = onlyId
    ? db.select().from(tracks).where(eq(tracks.id, onlyId)).all()
    : force
      ? db.select().from(tracks).all()
      : db
          .select()
          .from(tracks)
          .where(or(isNull(tracks.dropboxPath), eq(tracks.dropboxPath, "")))
          .all();

  rows = rows.filter((row) => row.dropboxLink || row.dropboxDl);
  if (limit) rows = rows.slice(0, limit);

  console.log(
    `${dryRun ? "DRY-RUN" : "APPLY"} · ${rows.length} track(s)` +
      (force ? " · force" : " · missing dropbox_path") +
      (onlyId ? ` · id=${onlyId}` : ""),
  );

  let ok = 0;
  let failed = 0;

  for (const track of rows) {
    const planned = vaultTrackMp3Path(track.id);
    if (dryRun) {
      console.log(`  would vault ${track.id} → ${planned}`);
      ok += 1;
      continue;
    }

    process.stdout.write(`  ${track.id} … `);
    try {
      const vault = await ingestTrackToVault({
        trackId: track.id,
        sourceDropboxPath: track.sourceDropboxPath,
        sourceUrl: track.dropboxDl || track.dropboxLink,
        sourceHint: track.dropboxLink || track.libraryTitle || track.id,
      });

      upsertTrack({
        ...track,
        dropboxLink: vault.dropboxLink,
        dropboxDl: vault.dropboxDl,
        dropboxPath: vault.dropboxPath,
        sourceDropboxPath: vault.sourceDropboxPath ?? track.sourceDropboxPath,
        sourceFolderLink: vault.sourceFolderLink ?? track.sourceFolderLink,
      });

      await ensureTrackWaveforms([{ id: track.id, dropboxDl: vault.dropboxDl }], 1);
      console.log(`ok → ${vault.dropboxPath}`);
      ok += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`FAIL · ${message}`);
      failed += 1;
    }
  }

  console.log(`Done. ok=${ok} failed=${failed}${dryRun ? " (dry-run)" : ""}`);
  if (!dryRun && failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
