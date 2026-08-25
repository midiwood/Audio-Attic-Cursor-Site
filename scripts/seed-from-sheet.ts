import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { config } from "dotenv";
import { upsertTrack } from "../src/lib/queries";
import { parseBpm, parseYear, toDropboxDlUrl } from "../src/lib/tracks";
import { constrainToVocabulary } from "../src/lib/vocabulary";

// Ensure DB tables exist
import "./migrate";

config({ path: ".env.local" });
config();

type SheetRow = Record<string, string>;

function parseCsv(text: string): SheetRow[] {
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
    bom: true,
  }) as SheetRow[];
}

async function loadCsv(): Promise<string> {
  const url = process.env.SHEET_CSV_URL;
  if (url) {
    console.log("Fetching sheet CSV…");
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch sheet: ${res.status} ${res.statusText}`);
    }
    return await res.text();
  }

  const localPath = path.join(process.cwd(), "data", "tracks.csv");
  if (fs.existsSync(localPath)) {
    console.log("Reading local data/tracks.csv…");
    return fs.readFileSync(localPath, "utf8");
  }

  throw new Error("No SHEET_CSV_URL and no data/tracks.csv found");
}

function mapRow(row: SheetRow) {
  const id = (row.ID || row.id || "").trim();
  if (!id) return null;

  const dropboxLink = (row["dropbox-link"] || "").trim() || null;
  const dropboxDlRaw = (row["dropbox-dl1"] || "").trim();
  const dropboxDl = dropboxDlRaw || (dropboxLink ? toDropboxDlUrl(dropboxLink) : null);

  return {
    id,
    date: (row.date || "").trim() || null,
    dropboxLink,
    dropboxDl,
    workingTitle: (row["working-title"] || "").trim() || null,
    libraryTitle: (row["library-title"] || "").trim() || null,
    client: (row.client || "").trim() || null,
    description: (row.description || "").trim() || null,
    year: parseYear(row.year),
    duration: (row.time || "").trim() || null,
    bpm: parseBpm(row.bpm),
    artist: (row.artist || "").trim() || null,
    publisher: (row.publisher || "").trim() || null,
    genre: constrainToVocabulary(row.genre, "genres") || null,
    mood: constrainToVocabulary(row.mood, "moods") || null,
    instruments: constrainToVocabulary(row.instruments, "instruments") || null,
    attributes: constrainToVocabulary(row.attributes, "attributes") || null,
    samro: (row.samro || "").trim() || null,
    license: (row.license || "").trim() || null,
    licenseDetail: (row["license-detail"] || "").trim() || null,
    perpetuity: (row.perpetuity || "").trim() || null,
    licenseExpires: (row["license-expires"] || "").trim() || null,
  };
}

async function main() {
  const csvText = await loadCsv();
  const rows = parseCsv(csvText);
  let upserted = 0;
  let skipped = 0;

  for (const row of rows) {
    const mapped = mapRow(row);
    if (!mapped) {
      skipped += 1;
      continue;
    }
    upsertTrack(mapped);
    upserted += 1;
  }

  console.log(`Seed complete: ${upserted} tracks upserted, ${skipped} skipped.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
