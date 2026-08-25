import fs from "fs";
import path from "path";
import { sqlite } from "../src/db";

const sql = `
CREATE TABLE IF NOT EXISTS tracks (
  id TEXT PRIMARY KEY,
  date TEXT,
  dropbox_link TEXT,
  dropbox_dl TEXT,
  working_title TEXT,
  library_title TEXT,
  client TEXT,
  description TEXT,
  year INTEGER,
  duration TEXT,
  bpm INTEGER,
  artist TEXT,
  publisher TEXT,
  genre TEXT,
  mood TEXT,
  instruments TEXT,
  attributes TEXT,
  samro TEXT,
  license TEXT,
  license_detail TEXT,
  perpetuity TEXT,
  license_expires TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS tracks_library_title_idx ON tracks(library_title);
CREATE INDEX IF NOT EXISTS tracks_license_idx ON tracks(license);
CREATE INDEX IF NOT EXISTS tracks_year_idx ON tracks(year);
CREATE INDEX IF NOT EXISTS tracks_bpm_idx ON tracks(bpm);

CREATE TABLE IF NOT EXISTS genres (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS moods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS instruments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS attributes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS track_genres (
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  genre_id INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  PRIMARY KEY (track_id, genre_id)
);

CREATE TABLE IF NOT EXISTS track_moods (
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  mood_id INTEGER NOT NULL REFERENCES moods(id) ON DELETE CASCADE,
  PRIMARY KEY (track_id, mood_id)
);

CREATE TABLE IF NOT EXISTS track_instruments (
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  instrument_id INTEGER NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
  PRIMARY KEY (track_id, instrument_id)
);

CREATE TABLE IF NOT EXISTS track_attributes (
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  attribute_id INTEGER NOT NULL REFERENCES attributes(id) ON DELETE CASCADE,
  PRIMARY KEY (track_id, attribute_id)
);

CREATE TABLE IF NOT EXISTS playlists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS playlist_tracks (
  playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY (playlist_id, track_id)
);
CREATE INDEX IF NOT EXISTS playlist_tracks_playlist_idx ON playlist_tracks(playlist_id);

CREATE TABLE IF NOT EXISTS track_relations (
  id TEXT PRIMARY KEY,
  from_track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  to_track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  relation TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (from_track_id, to_track_id, relation)
);
CREATE INDEX IF NOT EXISTS track_relations_from_idx ON track_relations(from_track_id);
CREATE INDEX IF NOT EXISTS track_relations_to_idx ON track_relations(to_track_id);
`;

const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

sqlite.exec(sql);
console.log("Database migrated at data/attic.db");
