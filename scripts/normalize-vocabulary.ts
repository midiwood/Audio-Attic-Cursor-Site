/**
 * Seed controlled vocabulary and remap existing track tags into
 * Genre / Mood / Instruments / Usage (attributes column) with no overlap.
 * Run: npm run db:normalize-vocab
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, sqlite } from "../src/db";
import {
  attributes,
  genres,
  instruments,
  moods,
  tracks,
} from "../src/db/schema";
import { syncTrackTags } from "../src/lib/queries";
import {
  CATALOG_VOCABULARY,
  classifyTag,
  constrainToVocabulary,
  type CatalogVocabulary,
} from "../src/lib/vocabulary";
import { splitTags } from "../src/lib/tracks";

function seedTable(
  table: typeof genres | typeof moods | typeof instruments | typeof attributes,
  names: string[],
) {
  for (const name of names) {
    const existing = db.select().from(table).where(eq(table.name, name)).get();
    if (!existing) {
      db.insert(table).values({ name }).run();
    }
  }
}

function purgeUnknown(
  table: typeof genres | typeof moods | typeof instruments | typeof attributes,
  allowed: string[],
  joinSql: string,
) {
  const allowedSet = new Set(allowed);
  const rows = db.select().from(table).all();
  for (const row of rows) {
    if (allowedSet.has(row.name)) continue;
    sqlite.prepare(joinSql).run(row.id);
    db.delete(table).where(eq(table.id, row.id)).run();
    console.log(`  removed orphan: ${row.name}`);
  }
}

function remapTrackFields(track: {
  genre: string | null;
  mood: string | null;
  instruments: string | null;
  attributes: string | null;
}) {
  const buckets: Record<keyof CatalogVocabulary, string[]> = {
    genres: [],
    moods: [],
    instruments: [],
    attributes: [],
  };

  const push = (kind: keyof CatalogVocabulary, value: string) => {
    if (!buckets[kind].includes(value)) buckets[kind].push(value);
  };

  // Start from each field's own constrained tags
  for (const tag of splitTags(constrainToVocabulary(track.genre, "genres"))) push("genres", tag);
  for (const tag of splitTags(constrainToVocabulary(track.mood, "moods"))) push("moods", tag);
  for (const tag of splitTags(constrainToVocabulary(track.instruments, "instruments"))) {
    push("instruments", tag);
  }
  for (const tag of splitTags(constrainToVocabulary(track.attributes, "attributes"))) {
    push("attributes", tag);
  }

  // Re-home leftover legacy tags from any field into the right bucket
  const rawAll = [
    ...splitTags(track.genre),
    ...splitTags(track.mood),
    ...splitTags(track.instruments),
    ...splitTags(track.attributes),
  ];
  for (const raw of rawAll) {
    const classified = classifyTag(raw);
    if (classified) push(classified.kind, classified.value);
  }

  return {
    genre: buckets.genres.join(", ") || null,
    mood: buckets.moods.join(", ") || null,
    instruments: buckets.instruments.join(", ") || null,
    attributes: buckets.attributes.join(", ") || null,
  };
}

function main() {
  console.log("Seeding streamlined vocabulary (Genre / Mood / Instruments / Usage)…");
  seedTable(genres, CATALOG_VOCABULARY.genres);
  seedTable(moods, CATALOG_VOCABULARY.moods);
  seedTable(instruments, CATALOG_VOCABULARY.instruments);
  seedTable(attributes, CATALOG_VOCABULARY.attributes);

  console.log("Remapping track tags…");
  const allTracks = db.select().from(tracks).all();
  let updated = 0;

  for (const track of allTracks) {
    const next = remapTrackFields(track);
    const changed =
      next.genre !== (track.genre || null) ||
      next.mood !== (track.mood || null) ||
      next.instruments !== (track.instruments || null) ||
      next.attributes !== (track.attributes || null);

    if (changed) {
      db.update(tracks)
        .set({
          ...next,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(tracks.id, track.id))
        .run();
      updated += 1;
    }

    syncTrackTags(track.id, next);
  }

  console.log(`Updated ${updated} / ${allTracks.length} tracks`);

  console.log("Purging tags outside the controlled vocabulary…");
  purgeUnknown(genres, CATALOG_VOCABULARY.genres, "DELETE FROM track_genres WHERE genre_id = ?");
  purgeUnknown(moods, CATALOG_VOCABULARY.moods, "DELETE FROM track_moods WHERE mood_id = ?");
  purgeUnknown(
    instruments,
    CATALOG_VOCABULARY.instruments,
    "DELETE FROM track_instruments WHERE instrument_id = ?",
  );
  purgeUnknown(
    attributes,
    CATALOG_VOCABULARY.attributes,
    "DELETE FROM track_attributes WHERE attribute_id = ?",
  );

  const counts = (Object.keys(CATALOG_VOCABULARY) as Array<keyof CatalogVocabulary>).map(
    (key) => `${key === "attributes" ? "usages" : key}: ${CATALOG_VOCABULARY[key].length}`,
  );
  console.log(`Done. Vocabulary sizes — ${counts.join(", ")}`);
}

main();
