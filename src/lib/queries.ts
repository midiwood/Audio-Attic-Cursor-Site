import { and, asc, count, desc, eq, inArray, isNull, like, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  attributes,
  genres,
  instruments,
  moods,
  trackAttributes,
  trackGenres,
  trackInstruments,
  trackLicenseEntries,
  trackMoods,
  tracks,
  type NewTrack,
  type Track,
} from "@/db/schema";
import {
  canonicalizeLicense,
  isAvailableLicense,
  nextTrackId,
  splitTags,
  toDropboxDlUrl,
} from "@/lib/tracks";
import { isSubscriberVisible } from "@/lib/publisher";
import { getCatalogVocabulary } from "@/lib/vocabulary";
import { DEFAULT_CATALOG_SORT, defaultSortDir } from "@/lib/catalog-sort";

export type TrackFilters = {
  q?: string;
  genre?: string[];
  mood?: string[];
  instrument?: string[];
  attribute?: string[];
  license?: "available" | "clear" | "library" | "exclusive" | "hold" | "personal" | "all";
  /** Staff-only: SAMRO PRO submission. `prepare` = licensed ∩ not submitted. */
  samro?: "yes" | "no" | "prepare" | "all";
  year?: number[];
  bpmMin?: number;
  bpmMax?: number;
  sort?: "title" | "year" | "bpm" | "date";
  sortDir?: "asc" | "desc";
};

function resolveSortOrder(filters: TrackFilters) {
  const sort = filters.sort ?? DEFAULT_CATALOG_SORT;
  const dir = filters.sortDir ?? defaultSortDir(sort);
  const column =
    sort === "year"
      ? tracks.year
      : sort === "bpm"
        ? tracks.bpm
        : sort === "title"
          ? tracks.libraryTitle
          : tracks.createdAt;
  return dir === "asc" ? asc(column) : desc(column);
}

function findTagId(
  table: typeof genres | typeof moods | typeof instruments | typeof attributes,
  name: string,
): number | null {
  const existing = db.select().from(table).where(eq(table.name, name)).get();
  return existing?.id ?? null;
}

export function syncTrackTags(trackId: string, track: Pick<Track, "genre" | "mood" | "instruments" | "attributes">) {
  db.delete(trackGenres).where(eq(trackGenres.trackId, trackId)).run();
  db.delete(trackMoods).where(eq(trackMoods.trackId, trackId)).run();
  db.delete(trackInstruments).where(eq(trackInstruments.trackId, trackId)).run();
  db.delete(trackAttributes).where(eq(trackAttributes.trackId, trackId)).run();

  for (const name of splitTags(track.genre)) {
    const genreId = findTagId(genres, name);
    if (genreId == null) continue;
    db.insert(trackGenres).values({ trackId, genreId }).onConflictDoNothing().run();
  }
  for (const name of splitTags(track.mood)) {
    const moodId = findTagId(moods, name);
    if (moodId == null) continue;
    db.insert(trackMoods).values({ trackId, moodId }).onConflictDoNothing().run();
  }
  for (const name of splitTags(track.instruments)) {
    const instrumentId = findTagId(instruments, name);
    if (instrumentId == null) continue;
    db.insert(trackInstruments).values({ trackId, instrumentId }).onConflictDoNothing().run();
  }
  for (const name of splitTags(track.attributes)) {
    const attributeId = findTagId(attributes, name);
    if (attributeId == null) continue;
    db.insert(trackAttributes).values({ trackId, attributeId }).onConflictDoNothing().run();
  }
}

export function upsertTrack(data: Omit<NewTrack, "createdAt" | "updatedAt"> & Partial<Pick<NewTrack, "createdAt" | "updatedAt">>): Track {
  const now = new Date().toISOString();
  const dropboxDl = data.dropboxDl || (data.dropboxLink ? toDropboxDlUrl(data.dropboxLink) : null);
  const payload: NewTrack = {
    ...data,
    license: canonicalizeLicense(data.license),
    dropboxDl,
    createdAt: data.createdAt || now,
    updatedAt: now,
  };

  db.insert(tracks)
    .values(payload)
    .onConflictDoUpdate({
      target: tracks.id,
      set: {
        date: payload.date,
        dropboxLink: payload.dropboxLink,
        dropboxDl: payload.dropboxDl,
        dropboxPath: payload.dropboxPath,
        sourceDropboxPath: payload.sourceDropboxPath,
        sourceFolderLink: payload.sourceFolderLink,
        workingTitle: payload.workingTitle,
        libraryTitle: payload.libraryTitle,
        client: payload.client,
        project: payload.project,
        description: payload.description,
        notes: payload.notes,
        year: payload.year,
        duration: payload.duration,
        bpm: payload.bpm,
        musicalKey: payload.musicalKey,
        artist: payload.artist,
        publisher: payload.publisher,
        genre: payload.genre,
        mood: payload.mood,
        instruments: payload.instruments,
        attributes: payload.attributes,
        samro: payload.samro,
        license: payload.license,
        licenseDetail: payload.licenseDetail,
        perpetuity: payload.perpetuity,
        licenseExpires: payload.licenseExpires,
        updatedAt: now,
      },
    })
    .run();

  const saved = db.select().from(tracks).where(eq(tracks.id, payload.id)).get()!;
  syncTrackTags(saved.id, saved);
  return saved;
}

export function getNextTrackIds(count: number): string[] {
  const rows = db.select({ id: tracks.id }).from(tracks).all();
  const ids: string[] = [];
  let existing = rows.map((r) => r.id);
  for (let i = 0; i < count; i++) {
    const next = nextTrackId(existing);
    ids.push(next);
    existing = [...existing, next];
  }
  return ids;
}

export function getTrackById(id: string): Track | undefined {
  return db.select().from(tracks).where(eq(tracks.id, id)).get();
}

export function listTracksForDuplicateCheck() {
  return db
    .select({
      id: tracks.id,
      dropboxLink: tracks.dropboxLink,
      dropboxDl: tracks.dropboxDl,
      dropboxPath: tracks.dropboxPath,
      workingTitle: tracks.workingTitle,
      libraryTitle: tracks.libraryTitle,
    })
    .from(tracks)
    .all();
}

export function getFilterOptions() {
  return {
    genres: db.select().from(genres).orderBy(asc(genres.name)).all().map((g) => g.name),
    moods: db.select().from(moods).orderBy(asc(moods.name)).all().map((m) => m.name),
    instruments: db
      .select()
      .from(instruments)
      .orderBy(asc(instruments.name))
      .all()
      .map((i) => i.name),
    attributes: db
      .select()
      .from(attributes)
      .orderBy(asc(attributes.name))
      .all()
      .map((a) => a.name),
    years: db
      .selectDistinct({ year: tracks.year })
      .from(tracks)
      .where(sql`${tracks.year} IS NOT NULL`)
      .orderBy(desc(tracks.year))
      .all()
      .map((y) => y.year!)
      .filter(Boolean),
  };
}

/** Distinct free-text meta values for upload/edit autocomplete. */
export type CatalogMetaSuggestions = {
  clients: string[];
  projects: string[];
  artists: string[];
  publishers: string[];
};

export function getCatalogMetaSuggestions(): CatalogMetaSuggestions {
  const active = isNull(tracks.trashedAt);
  /** Split comma-separated cells into individual suggestion tokens. */
  const pick = (rows: Array<{ value: string | null }>) =>
    uniqueSortedStrings(
      rows.flatMap((row) =>
        String(row.value || "")
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean),
      ),
    );

  return {
    clients: pick(
      db
        .selectDistinct({ value: tracks.client })
        .from(tracks)
        .where(and(active, sql`trim(coalesce(${tracks.client}, '')) != ''`))
        .all(),
    ),
    projects: pick(
      db
        .selectDistinct({ value: tracks.project })
        .from(tracks)
        .where(and(active, sql`trim(coalesce(${tracks.project}, '')) != ''`))
        .all(),
    ),
    artists: pick(
      db
        .selectDistinct({ value: tracks.artist })
        .from(tracks)
        .where(and(active, sql`trim(coalesce(${tracks.artist}, '')) != ''`))
        .all(),
    ),
    publishers: pick(
      db
        .selectDistinct({ value: tracks.publisher })
        .from(tracks)
        .where(and(active, sql`trim(coalesce(${tracks.publisher}, '')) != ''`))
        .all(),
    ),
  };
}

function uniqueSortedStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v && v.trim())))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function uniqueSortedYears(values: Array<number | null | undefined>): number[] {
  return [...new Set(values.filter((v): v is number => typeof v === "number"))].sort((a, b) => b - a);
}

/**
 * Faceted options: each facet is computed from tracks matching all *other* active filters.
 * Selecting Folk only shows moods/instruments present on Folk tracks (within current license/search/etc).
 */
export function getFacetOptions(filters: TrackFilters = {}) {
  const forGenres = queryTracks({ ...filters, genre: undefined, sort: "title" });
  const forMoods = queryTracks({ ...filters, mood: undefined, sort: "title" });
  const forInstruments = queryTracks({ ...filters, instrument: undefined, sort: "title" });
  const forUsages = queryTracks({ ...filters, attribute: undefined, sort: "title" });
  const forYears = queryTracks({ ...filters, year: undefined, sort: "title" });
  const forLicense = queryTracks({ ...filters, license: "all", sort: "title" });

  let clear = false;
  let library = false;
  let exclusive = false;
  let hold = false;
  let personal = false;
  for (const track of forLicense) {
    const license = track.license || "";
    if (license === "Library" || license === "Library [Available]") library = true;
    else if (license === "Exclusive") exclusive = true;
    else if (license === "On Hold") hold = true;
    else if (license === "Personal") personal = true;
    else if (isAvailableLicense(license)) clear = true;
  }

  return {
    genres: uniqueSortedStrings(forGenres.flatMap((t) => splitTags(t.genre))),
    moods: uniqueSortedStrings(forMoods.flatMap((t) => splitTags(t.mood))),
    instruments: uniqueSortedStrings(forInstruments.flatMap((t) => splitTags(t.instruments))),
    usages: uniqueSortedStrings(forUsages.flatMap((t) => splitTags(t.attributes))),
    years: uniqueSortedYears(forYears.map((t) => t.year)),
    licenses: {
      clear,
      library,
      exclusive,
      hold,
      personal,
      /** Clear + Library — used for subscriber “available” view. */
      available: clear || library,
    },
  };
}

/** Drop facet / tag values that are not in the controlled vocabulary (or years list). */
export function sanitizeFilters(filters: TrackFilters): TrackFilters {
  const vocab = getCatalogVocabulary();
  const years = getFacetOptions({ ...filters, year: undefined }).years;
  const next = { ...filters };

  if (next.genre?.length) {
    next.genre = next.genre.filter((name) => vocab.genres.includes(name));
    if (!next.genre.length) next.genre = undefined;
  }
  if (next.mood?.length) {
    next.mood = next.mood.filter((name) => vocab.moods.includes(name));
    if (!next.mood.length) next.mood = undefined;
  }
  if (next.instrument?.length) {
    next.instrument = next.instrument.filter((name) => vocab.instruments.includes(name));
    if (!next.instrument.length) next.instrument = undefined;
  }
  if (next.attribute?.length) {
    next.attribute = next.attribute.filter((name) => vocab.attributes.includes(name));
    if (!next.attribute.length) next.attribute = undefined;
  }
  if (next.year?.length) {
    next.year = next.year.filter((y) => years.includes(y));
    if (!next.year.length) next.year = undefined;
  }

  return next;
}

function escapeLikeTerm(value: string): string {
  return value.replace(/[%_]/g, "");
}

/** Split a catalog query into AND tokens (`twende E1` → ["twende", "E1"]). */
export function catalogSearchTokens(raw: string): string[] {
  return raw
    .trim()
    .split(/[\s/_.,;:+-]+/)
    .map((part) => escapeLikeTerm(part))
    .filter((part) => part.length > 0)
    .slice(0, 8);
}

function tokenMatchesTrack(token: string): SQL {
  const term = `%${token}%`;
  // Wide recall: one remembered word can hit anywhere on the track record.
  // Facets still AND on top when chips are set.
  return or(
    like(tracks.libraryTitle, term),
    like(tracks.workingTitle, term),
    like(tracks.description, term),
    like(tracks.notes, term),
    like(tracks.client, term),
    like(tracks.project, term),
    like(tracks.artist, term),
    like(tracks.publisher, term),
    like(tracks.genre, term),
    like(tracks.mood, term),
    like(tracks.instruments, term),
    like(tracks.attributes, term),
    like(tracks.musicalKey, term),
    like(tracks.license, term),
    like(tracks.licenseDetail, term),
    like(tracks.samro, term),
    like(tracks.id, term),
    sql`cast(${tracks.year} as text) like ${term}`,
    sql`cast(${tracks.bpm} as text) like ${term}`,
  )!;
}

function catalogSearchClause(raw: string): SQL | undefined {
  const tokens = catalogSearchTokens(raw);
  if (!tokens.length) return undefined;
  if (tokens.length === 1) return tokenMatchesTrack(tokens[0]);
  return and(...tokens.map(tokenMatchesTrack));
}

function buildWhere(filters: TrackFilters): SQL | undefined {
  const clauses: SQL[] = [isNull(tracks.trashedAt)];

  if (filters.q) {
    const search = catalogSearchClause(filters.q);
    if (search) clauses.push(search);
  }

  if (filters.year?.length) {
    clauses.push(inArray(tracks.year, filters.year));
  }

  if (filters.bpmMin !== undefined) {
    clauses.push(sql`${tracks.bpm} >= ${filters.bpmMin}`);
  }
  if (filters.bpmMax !== undefined) {
    clauses.push(sql`${tracks.bpm} <= ${filters.bpmMax}`);
  }

  if (filters.license === "available") {
    clauses.push(
      or(
        eq(tracks.license, "Clear"),
        eq(tracks.license, "Library"),
        // Legacy rows until migration runs
        eq(tracks.license, "None [Available]"),
        eq(tracks.license, "Library [Available]"),
        like(tracks.license, "%[Available]%"),
        sql`(${tracks.license} IS NULL OR ${tracks.license} = '')`,
      )!,
    );
  } else if (filters.license === "clear") {
    clauses.push(
      or(
        eq(tracks.license, "Clear"),
        eq(tracks.license, "None [Available]"),
        sql`(${tracks.license} IS NULL OR ${tracks.license} = '')`,
        and(
          like(tracks.license, "%[Available]%"),
          sql`${tracks.license} != 'Library [Available]'`,
        )!,
      )!,
    );
  } else if (filters.license === "library") {
    clauses.push(
      or(eq(tracks.license, "Library"), eq(tracks.license, "Library [Available]"))!,
    );
  } else if (filters.license === "exclusive") {
    clauses.push(eq(tracks.license, "Exclusive"));
  } else if (filters.license === "hold") {
    clauses.push(eq(tracks.license, "On Hold"));
  } else if (filters.license === "personal") {
    clauses.push(eq(tracks.license, "Personal"));
  }

  if (filters.samro === "yes") {
    clauses.push(
      sql`lower(trim(coalesce(${tracks.samro}, ''))) IN ('yes', 'y', 'true', '1')`,
    );
  } else if (filters.samro === "no") {
    clauses.push(
      sql`lower(trim(coalesce(${tracks.samro}, ''))) NOT IN ('yes', 'y', 'true', '1')`,
    );
  } else if (filters.samro === "prepare") {
    // Licensed (active license history) and not yet submitted to SAMRO.
    clauses.push(
      sql`lower(trim(coalesce(${tracks.samro}, ''))) NOT IN ('yes', 'y', 'true', '1')`,
    );
    clauses.push(
      sql`${tracks.id} IN (
        SELECT ${trackLicenseEntries.trackId} FROM ${trackLicenseEntries}
        WHERE ${trackLicenseEntries.trashedAt} IS NULL
      )`,
    );
  }

  if (filters.genre?.length) {
    clauses.push(
      sql`${tracks.id} IN (SELECT ${trackGenres.trackId} FROM ${trackGenres}
        INNER JOIN ${genres} ON ${genres.id} = ${trackGenres.genreId}
        WHERE ${inArray(genres.name, filters.genre)})`,
    );
  }

  if (filters.mood?.length) {
    clauses.push(
      sql`${tracks.id} IN (SELECT ${trackMoods.trackId} FROM ${trackMoods}
        INNER JOIN ${moods} ON ${moods.id} = ${trackMoods.moodId}
        WHERE ${inArray(moods.name, filters.mood)})`,
    );
  }

  if (filters.instrument?.length) {
    clauses.push(
      sql`${tracks.id} IN (SELECT ${trackInstruments.trackId} FROM ${trackInstruments}
        INNER JOIN ${instruments} ON ${instruments.id} = ${trackInstruments.instrumentId}
        WHERE ${inArray(instruments.name, filters.instrument)})`,
    );
  }

  if (filters.attribute?.length) {
    clauses.push(
      sql`${tracks.id} IN (SELECT ${trackAttributes.trackId} FROM ${trackAttributes}
        INNER JOIN ${attributes} ON ${attributes.id} = ${trackAttributes.attributeId}
        WHERE ${inArray(attributes.name, filters.attribute)})`,
    );
  }

  if (!clauses.length) return undefined;
  return and(...clauses);
}

export function queryTracks(filters: TrackFilters = {}): Track[] {
  const where = buildWhere(filters);
  const order = resolveSortOrder(filters);

  const base = db.select().from(tracks);
  if (where) {
    return base.where(where).orderBy(order).all();
  }
  return base.orderBy(order).all();
}

/** Default page size for Browse infinite scroll (~1–2 viewports). */
export { CATALOG_PAGE_SIZE } from "@/lib/catalog-constants";

export function queryTracksPage(
  filters: TrackFilters = {},
  pagination: { limit: number; offset: number },
): Track[] {
  const where = buildWhere(filters);
  const order = resolveSortOrder(filters);
  const limit = Math.max(1, Math.min(pagination.limit, 100));
  const offset = Math.max(0, pagination.offset);

  const base = db.select().from(tracks);
  if (where) {
    return base.where(where).orderBy(order).limit(limit).offset(offset).all();
  }
  return base.orderBy(order).limit(limit).offset(offset).all();
}

/** Filtered track count for Browse header (does not load rows). */
export function countTracks(filters: TrackFilters = {}): number {
  const where = buildWhere(filters);
  const base = db.select({ value: count() }).from(tracks);
  const row = where ? base.where(where).get() : base.get();
  return row?.value ?? 0;
}

export function getTrackCount(): number {
  const row = db
    .select({ value: count() })
    .from(tracks)
    .where(isNull(tracks.trashedAt))
    .get();
  return row?.value ?? 0;
}

export function getAvailableCount(): number {
  const all = db
    .select({ license: tracks.license, publisher: tracks.publisher })
    .from(tracks)
    .where(isNull(tracks.trashedAt))
    .all();
  return all.filter((t) => isSubscriberVisible(t)).length;
}

export function getTracksByIds(ids: string[]): Track[] {
  if (!ids.length) return [];
  return db.select().from(tracks).where(inArray(tracks.id, ids)).all();
}

