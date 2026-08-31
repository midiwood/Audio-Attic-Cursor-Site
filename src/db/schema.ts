import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
} from "drizzle-orm/sqlite-core";

export const tracks = sqliteTable(
  "tracks",
  {
    id: text("id").primaryKey(),
    date: text("date"),
    dropboxLink: text("dropbox_link"),
    dropboxDl: text("dropbox_dl"),
    /** Vault path for playback MP3, e.g. /_Business/Audio Attic/Vault/{id}/track.mp3 */
    dropboxPath: text("dropbox_path"),
    /** Original file path in Dropbox before vault copy (if known). */
    sourceDropboxPath: text("source_dropbox_path"),
    /** Shared link to the original file's parent folder (admin provenance). */
    sourceFolderLink: text("source_folder_link"),
    workingTitle: text("working_title"),
    libraryTitle: text("library_title"),
    client: text("client"),
    project: text("project"),
    description: text("description"),
    /** Freeform searchable notes (techniques, production details) — not AI hints. */
    notes: text("notes"),
    year: integer("year"),
    duration: text("duration"),
    bpm: integer("bpm"),
    musicalKey: text("musical_key"),
    artist: text("artist"),
    publisher: text("publisher"),
    genre: text("genre"),
    mood: text("mood"),
    instruments: text("instruments"),
    attributes: text("attributes"),
    samro: text("samro"),
    license: text("license"),
    licenseDetail: text("license_detail"),
    perpetuity: text("perpetuity"),
    licenseExpires: text("license_expires"),
    /** Soft-delete: set when moved to Trash playlist; null = active in catalog. */
    trashedAt: text("trashed_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("tracks_library_title_idx").on(table.libraryTitle),
    index("tracks_license_idx").on(table.license),
    index("tracks_year_idx").on(table.year),
    index("tracks_bpm_idx").on(table.bpm),
    index("tracks_trashed_at_idx").on(table.trashedAt),
  ],
);

export const genres = sqliteTable("genres", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
});

export const moods = sqliteTable("moods", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
});

export const instruments = sqliteTable("instruments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
});

export const attributes = sqliteTable("attributes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
});

export const trackGenres = sqliteTable(
  "track_genres",
  {
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    genreId: integer("genre_id")
      .notNull()
      .references(() => genres.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.trackId, table.genreId] })],
);

export const trackMoods = sqliteTable(
  "track_moods",
  {
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    moodId: integer("mood_id")
      .notNull()
      .references(() => moods.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.trackId, table.moodId] })],
);

export const trackInstruments = sqliteTable(
  "track_instruments",
  {
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    instrumentId: integer("instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.trackId, table.instrumentId] })],
);

export const trackAttributes = sqliteTable(
  "track_attributes",
  {
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    attributeId: integer("attribute_id")
      .notNull()
      .references(() => attributes.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.trackId, table.attributeId] })],
);

export const playlists = sqliteTable(
  "playlists",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    /** Creator/owner — never reassigned. Share via playlist_shares instead. */
    userId: text("user_id"),
    /** Public guest listen link; null = guest link disabled. */
    guestToken: text("guest_token").unique(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("playlists_user_idx").on(table.userId),
    index("playlists_guest_token_idx").on(table.guestToken),
  ],
);

/** Owner shares a playlist with an existing user account (view-only). */
export const playlistShares = sqliteTable(
  "playlist_shares",
  {
    playlistId: text("playlist_id")
      .notNull()
      .references(() => playlists.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.playlistId, table.userId] }),
    index("playlist_shares_user_idx").on(table.userId),
  ],
);

export const playlistTracks = sqliteTable(
  "playlist_tracks",
  {
    playlistId: text("playlist_id")
      .notNull()
      .references(() => playlists.id, { onDelete: "cascade" }),
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.playlistId, table.trackId] }),
    index("playlist_tracks_playlist_idx").on(table.playlistId),
  ],
);

/** Typed directed lineage: from_track (earlier) → to_track (derived/adapted). */
export const trackRelations = sqliteTable(
  "track_relations",
  {
    id: text("id").primaryKey(),
    fromTrackId: text("from_track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    toTrackId: text("to_track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    relation: text("relation").notNull(),
    note: text("note"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("track_relations_from_idx").on(table.fromTrackId),
    index("track_relations_to_idx").on(table.toTrackId),
  ],
);

/** Precomputed WaveSurfer peaks — avoids re-decoding audio for the player waveform. */
export const trackWaveforms = sqliteTable("track_waveforms", {
  trackId: text("track_id")
    .primaryKey()
    .references(() => tracks.id, { onDelete: "cascade" }),
  /** JSON: number[][] — one array per channel (WaveSurfer exportPeaks shape). */
  peaksJson: text("peaks_json").notNull(),
  durationSec: text("duration_sec").notNull(),
  peaksLength: integer("peaks_length").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** Alternate mixes and stems under one catalog track ID (main mix stays on tracks). */
export const trackAudioAssets = sqliteTable(
  "track_audio_assets",
  {
    id: text("id").primaryKey(),
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    /** version | stem */
    kind: text("kind").notNull(),
    label: text("label").notNull(),
    slug: text("slug").notNull(),
    dropboxLink: text("dropbox_link"),
    dropboxDl: text("dropbox_dl"),
    dropboxPath: text("dropbox_path"),
    duration: text("duration"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("track_audio_assets_track_idx").on(table.trackId),
    index("track_audio_assets_track_kind_idx").on(table.trackId, table.kind),
  ],
);

/** Past/current Library (and similar) deals — many per track. Staff only. */
export const trackLicenseEntries = sqliteTable(
  "track_license_entries",
  {
    id: text("id").primaryKey(),
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    client: text("client").notNull(),
    /** Project / campaign / placement — what it was used for. */
    usedFor: text("used_for").notNull(),
    /** Derived summary: Media · Territory · Duration (legacy-friendly). */
    scope: text("scope").notNull().default(""),
    territory: text("territory").notNull().default(""),
    media: text("media").notNull().default(""),
    duration: text("duration").notNull().default(""),
    branding: text("branding").notNull().default(""),
    notes: text("notes"),
    licensedAt: text("licensed_at").notNull(),
    perpetuity: text("perpetuity"),
    expiresAt: text("expires_at"),
    /** Soft-delete — set when moved to Trash; null = active. */
    trashedAt: text("trashed_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("track_license_entries_track_idx").on(table.trackId)],
);

/** Subscriber inquiries to license a track. */
export const licenseRequests = sqliteTable(
  "license_requests",
  {
    id: text("id").primaryKey(),
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    /** Derived summary: Media · Territory · Duration (legacy-friendly). */
    scope: text("scope").notNull().default(""),
    territory: text("territory").notNull().default(""),
    media: text("media").notNull().default(""),
    duration: text("duration").notNull().default(""),
    branding: text("branding").notNull().default(""),
    intendedUse: text("intended_use").notNull(),
    message: text("message"),
    /** pending | accepted | declined | archived */
    status: text("status").notNull(),
    /** Soft-delete — set when moved to Trash; null = active. */
    trashedAt: text("trashed_at"),
    /** When the subscriber last saw this request on /licenses (clears accepted alert). */
    subscriberSeenAt: text("subscriber_seen_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("license_requests_status_idx").on(table.status),
    index("license_requests_track_idx").on(table.trackId),
    index("license_requests_user_idx").on(table.userId),
  ],
);

/** Admin-editable site config. Non-empty values override matching env vars. */
export const siteSettings = sqliteTable("site_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export type Track = typeof tracks.$inferSelect;
export type NewTrack = typeof tracks.$inferInsert;
export type Playlist = typeof playlists.$inferSelect;
export type PlaylistShare = typeof playlistShares.$inferSelect;
export type TrackRelation = typeof trackRelations.$inferSelect;
export type NewTrackRelation = typeof trackRelations.$inferInsert;
export type TrackWaveform = typeof trackWaveforms.$inferSelect;
export type TrackAudioAsset = typeof trackAudioAssets.$inferSelect;
export type NewTrackAudioAsset = typeof trackAudioAssets.$inferInsert;
export type TrackLicenseEntry = typeof trackLicenseEntries.$inferSelect;
export type NewTrackLicenseEntry = typeof trackLicenseEntries.$inferInsert;
export type LicenseRequest = typeof licenseRequests.$inferSelect;
export type NewLicenseRequest = typeof licenseRequests.$inferInsert;
export type SiteSetting = typeof siteSettings.$inferSelect;

/** Batch Notification of Works forms prepared for SAMRO. */
export const samroSubmissions = sqliteTable(
  "samro_submissions",
  {
    id: text("id").primaryKey(),
    publisherName: text("publisher_name").notNull(),
    /** draft | exported | completed | cancelled */
    status: text("status").notNull(),
    createdBy: text("created_by").notNull(),
    fileName: text("file_name"),
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
    exportedAt: text("exported_at"),
    completedAt: text("completed_at"),
    /** Soft-delete — hidden from active list; restore from trash. */
    trashedAt: text("trashed_at"),
    /** Completed forms archived instead of trashed. */
    archivedAt: text("archived_at"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("samro_submissions_status_idx").on(table.status),
    index("samro_submissions_trashed_at_idx").on(table.trashedAt),
    index("samro_submissions_archived_at_idx").on(table.archivedAt),
  ],
);

export const samroSubmissionTracks = sqliteTable(
  "samro_submission_tracks",
  {
    submissionId: text("submission_id")
      .notNull()
      .references(() => samroSubmissions.id, { onDelete: "cascade" }),
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    /** JSON snapshot of title / publisher / readiness at export time. */
    snapshotJson: text("snapshot_json"),
  },
  (table) => [
    primaryKey({ columns: [table.submissionId, table.trackId] }),
    index("samro_submission_tracks_track_idx").on(table.trackId),
  ],
);

export type SamroSubmission = typeof samroSubmissions.$inferSelect;
export type NewSamroSubmission = typeof samroSubmissions.$inferInsert;
export type SamroSubmissionTrack = typeof samroSubmissionTracks.$inferSelect;

/** Composer registry for SAMRO rights holders (name + IPI). */
export const composers = sqliteTable(
  "composers",
  {
    id: text("id").primaryKey(),
    displayName: text("display_name").notNull(),
    ipiPa: text("ipi_pa").notNull().default(""),
    ipiBase: text("ipi_base"),
    proSociety: text("pro_society").notNull().default("SAMRO"),
    notes: text("notes"),
    /** Soft-disable — hidden from picker but kept for historical track links. */
    disabledAt: text("disabled_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("composers_display_name_idx").on(table.displayName),
    index("composers_disabled_at_idx").on(table.disabledAt),
  ],
);

export const trackComposers = sqliteTable(
  "track_composers",
  {
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    composerId: text("composer_id")
      .notNull()
      .references(() => composers.id, { onDelete: "restrict" }),
    perfShare: integer("perf_share").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.trackId, table.composerId] }),
    index("track_composers_composer_idx").on(table.composerId),
    index("track_composers_track_sort_idx").on(table.trackId, table.sortOrder),
  ],
);

export type Composer = typeof composers.$inferSelect;
export type NewComposer = typeof composers.$inferInsert;
export type TrackComposer = typeof trackComposers.$inferSelect;
