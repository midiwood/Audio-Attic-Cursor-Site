/**
 * Rename legacy track IDs id#### → rjv#### across the database.
 *
 *   npx tsx scripts/migrate-track-ids-to-rjv.ts --dry-run
 *   npx tsx scripts/migrate-track-ids-to-rjv.ts --apply
 */

import { sqlite } from "../src/db";

function remapId(id: string): string | null {
  const match = /^id(\d+)$/i.exec(id.trim());
  if (!match) return null;
  return `rjv${match[1].padStart(4, "0")}`;
}

function main() {
  const apply = process.argv.includes("--apply");
  const dryRun = !apply;

  const rows = sqlite.prepare(`SELECT id FROM tracks`).all() as Array<{ id: string }>;
  const pairs = rows
    .map((row) => {
      const next = remapId(row.id);
      return next && next !== row.id ? { from: row.id, to: next } : null;
    })
    .filter((row): row is { from: string; to: string } => Boolean(row));

  console.log(
    `${dryRun ? "DRY-RUN" : "APPLY"} · ${pairs.length} track id(s) to rename (id→rjv)`,
  );
  for (const pair of pairs.slice(0, 10)) {
    console.log(`  ${pair.from} → ${pair.to}`);
  }
  if (pairs.length > 10) console.log(`  … +${pairs.length - 10} more`);

  if (dryRun || !pairs.length) {
    if (dryRun) console.log("Re-run with --apply to write changes.");
    return;
  }

  const collisions = pairs.filter((pair) =>
    sqlite.prepare(`SELECT 1 FROM tracks WHERE id = ?`).get(pair.to),
  );
  if (collisions.length) {
    console.error(
      `Abort: ${collisions.length} target id(s) already exist (e.g. ${collisions[0].from} → ${collisions[0].to})`,
    );
    process.exit(1);
  }

  sqlite.exec("PRAGMA foreign_keys = OFF");
  const tx = sqlite.transaction(() => {
    const tables: Array<{ table: string; column: string }> = [
      { table: "track_genres", column: "track_id" },
      { table: "track_moods", column: "track_id" },
      { table: "track_instruments", column: "track_id" },
      { table: "track_attributes", column: "track_id" },
      { table: "track_composers", column: "track_id" },
      { table: "track_license_entries", column: "track_id" },
      { table: "track_waveforms", column: "track_id" },
      { table: "playlist_tracks", column: "track_id" },
      { table: "license_requests", column: "track_id" },
      { table: "samro_submission_tracks", column: "track_id" },
      { table: "track_relations", column: "from_track_id" },
      { table: "track_relations", column: "to_track_id" },
    ];

    for (const pair of pairs) {
      for (const { table, column } of tables) {
        sqlite
          .prepare(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`)
          .run(pair.to, pair.from);
      }

      sqlite
        .prepare(
          `UPDATE tracks
           SET id = ?,
               dropbox_path = CASE
                 WHEN dropbox_path IS NULL OR TRIM(dropbox_path) = '' THEN dropbox_path
                 ELSE replace(dropbox_path, ?, ?)
               END
           WHERE id = ?`,
        )
        .run(pair.to, `/${pair.from}/`, `/${pair.to}/`, pair.from);
    }
  });

  try {
    tx();
  } finally {
    sqlite.exec("PRAGMA foreign_keys = ON");
  }

  const remaining = sqlite
    .prepare(`SELECT COUNT(*) AS n FROM tracks WHERE id LIKE 'id%' ESCAPE '\\' AND id GLOB 'id[0-9]*'`)
    .get() as { n: number };
  const rjv = sqlite
    .prepare(`SELECT COUNT(*) AS n FROM tracks WHERE id GLOB 'rjv[0-9]*'`)
    .get() as { n: number };

  console.log(`Done. remaining id####=${remaining.n} · rjv####=${rjv.n}`);
}

main();
