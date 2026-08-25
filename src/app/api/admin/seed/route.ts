import { NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import { getSession, isSiteAdmin } from "@/lib/auth";
import { upsertTrack } from "@/lib/queries";
import { canonicalizeLicense, parseBpm, parseYear, toDropboxDlUrl } from "@/lib/tracks";
import { constrainToVocabulary } from "@/lib/vocabulary";

type SheetRow = Record<string, string>;

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
    project: (row.project || "").trim() || null,
    description: (row.description || "").trim() || null,
    notes: (row.notes || "").trim() || null,
    year: parseYear(row.year),
    duration: (row.time || "").trim() || null,
    bpm: parseBpm(row.bpm),
    musicalKey: (row.key || row["musical-key"] || "").trim() || null,
    artist: (row.artist || "").trim() || null,
    publisher: (row.publisher || "").trim() || null,
    genre: constrainToVocabulary(row.genre, "genres") || null,
    mood: constrainToVocabulary(row.mood, "moods") || null,
    instruments: constrainToVocabulary(row.instruments, "instruments") || null,
    attributes: constrainToVocabulary(row.attributes, "attributes") || null,
    samro: (row.samro || "").trim() || null,
    license: canonicalizeLicense(row.license),
    licenseDetail: (row["license-detail"] || "").trim() || null,
    perpetuity: (row.perpetuity || "").trim() || null,
    licenseExpires: (row["license-expires"] || "").trim() || null,
  };
}

export async function POST() {
  const session = await getSession();
  if (!isSiteAdmin(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.SHEET_CSV_URL;
  if (!url) {
    return NextResponse.json({ error: "SHEET_CSV_URL is not configured" }, { status: 500 });
  }

  const res = await fetch(url);
  if (!res.ok) {
    return NextResponse.json(
      { error: `Failed to fetch sheet: ${res.status}` },
      { status: 502 },
    );
  }

  const text = await res.text();
  const rows = parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
    bom: true,
  }) as SheetRow[];

  let upserted = 0;
  for (const row of rows) {
    const mapped = mapRow(row);
    if (!mapped) continue;
    upsertTrack(mapped);
    upserted += 1;
  }

  return NextResponse.json({ upserted });
}
