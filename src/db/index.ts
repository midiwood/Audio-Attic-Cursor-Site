import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "fs";
import path from "path";
import * as authSchema from "./auth-schema";
import * as schema from "./schema";

const fullSchema = { ...schema, ...authSchema };

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "attic.db");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

sqlite.exec(`
CREATE TABLE IF NOT EXISTS tracks (
  id TEXT PRIMARY KEY,
  date TEXT,
  dropbox_link TEXT,
  dropbox_dl TEXT,
  working_title TEXT,
  library_title TEXT,
  client TEXT,
  project TEXT,
  description TEXT,
  notes TEXT,
  year INTEGER,
  duration TEXT,
  bpm INTEGER,
  musical_key TEXT,
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
  trashed_at TEXT,
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
  user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS playlist_shares (
  playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (playlist_id, user_id)
);
CREATE INDEX IF NOT EXISTS playlist_shares_user_idx ON playlist_shares(user_id);

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

CREATE TABLE IF NOT EXISTS track_waveforms (
  track_id TEXT PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
  peaks_json TEXT NOT NULL,
  duration_sec TEXT NOT NULL,
  peaks_length INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  role TEXT DEFAULT 'editor',
  banned INTEGER DEFAULT 0,
  ban_reason TEXT,
  ban_expires INTEGER,
  pro_relation_number TEXT,
  pro_ipi_base_number TEXT,
  pro_pa_ipi_name_number TEXT
);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY NOT NULL,
  expires_at INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  impersonated_by TEXT
);
CREATE INDEX IF NOT EXISTS session_userId_idx ON session(user_id);

CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at INTEGER,
  refresh_token_expires_at INTEGER,
  scope TEXT,
  password TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS account_userId_idx ON account(user_id);

CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY NOT NULL,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS verification_identifier_idx ON verification(identifier);
`);

// Lightweight migrations for existing DBs
try {
  sqlite.exec(`ALTER TABLE tracks ADD COLUMN musical_key TEXT`);
} catch {
  // column already exists
}

try {
  sqlite.exec(`ALTER TABLE tracks ADD COLUMN notes TEXT`);
} catch {
  // column already exists
}

try {
  sqlite.exec(`ALTER TABLE user ADD COLUMN pro_relation_number TEXT`);
} catch {
  // column already exists
}
try {
  sqlite.exec(`ALTER TABLE user ADD COLUMN pro_ipi_base_number TEXT`);
} catch {
  // column already exists
}
try {
  sqlite.exec(`ALTER TABLE user ADD COLUMN pro_pa_ipi_name_number TEXT`);
} catch {
  // column already exists
}

try {
  sqlite.exec(`
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
`);
} catch {
  // ignore
}

try {
  sqlite.exec(`
CREATE TABLE IF NOT EXISTS track_waveforms (
  track_id TEXT PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
  peaks_json TEXT NOT NULL,
  duration_sec TEXT NOT NULL,
  peaks_length INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);
} catch {
  // ignore
}

try {
  sqlite.exec(`ALTER TABLE tracks ADD COLUMN trashed_at TEXT`);
} catch {
  // column already exists
}

try {
  sqlite.exec(`CREATE INDEX IF NOT EXISTS tracks_trashed_at_idx ON tracks(trashed_at)`);
} catch {
  // ignore
}

try {
  sqlite.exec(`ALTER TABLE tracks ADD COLUMN project TEXT`);
} catch {
  // column already exists
}

try {
  sqlite.exec(`ALTER TABLE playlists ADD COLUMN user_id TEXT`);
} catch {
  // column already exists
}

try {
  sqlite.exec(`ALTER TABLE playlists ADD COLUMN guest_token TEXT`);
} catch {
  // column already exists
}

try {
  sqlite.exec(`CREATE INDEX IF NOT EXISTS playlists_user_idx ON playlists(user_id)`);
} catch {
  // ignore
}

try {
  sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS playlists_guest_token_idx ON playlists(guest_token)`);
} catch {
  // ignore
}

try {
  sqlite.exec(`
CREATE TABLE IF NOT EXISTS playlist_shares (
  playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (playlist_id, user_id)
);
CREATE INDEX IF NOT EXISTS playlist_shares_user_idx ON playlist_shares(user_id);
`);
} catch {
  // ignore
}

// Migrate email+guest_token shares → user-only shares + playlist guest_token.
try {
  const cols = sqlite.prepare(`PRAGMA table_info(playlist_shares)`).all() as Array<{
    name: string;
  }>;
  const names = new Set(cols.map((c) => c.name));
  if (cols.length && names.has("email")) {
    const legacy = sqlite
      .prepare(
        `SELECT playlist_id, email, user_id, guest_token, created_at FROM playlist_shares`,
      )
      .all() as Array<{
      playlist_id: string;
      email: string;
      user_id: string | null;
      guest_token: string;
      created_at: string;
    }>;

    // Promote first token per playlist onto playlists.guest_token when empty.
    const setGuest = sqlite.prepare(
      `UPDATE playlists SET guest_token = ? WHERE id = ? AND (guest_token IS NULL OR guest_token = '')`,
    );
    const seenPlaylist = new Set<string>();
    for (const row of legacy) {
      if (!row.guest_token || seenPlaylist.has(row.playlist_id)) continue;
      seenPlaylist.add(row.playlist_id);
      setGuest.run(row.guest_token, row.playlist_id);
    }

    sqlite.exec(`
      CREATE TABLE playlist_shares_v3 (
        playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (playlist_id, user_id)
      );
    `);
    const insert = sqlite.prepare(`
      INSERT OR IGNORE INTO playlist_shares_v3 (playlist_id, user_id, created_at)
      VALUES (?, ?, ?)
    `);
    for (const row of legacy) {
      let uid = row.user_id;
      if (!uid && row.email) {
        const u = sqlite
          .prepare(`SELECT id FROM user WHERE lower(email) = lower(?)`)
          .get(row.email) as { id?: string } | undefined;
        uid = u?.id || null;
      }
      if (!uid) continue;
      insert.run(row.playlist_id, uid, row.created_at);
    }
    sqlite.exec(`DROP TABLE playlist_shares`);
    sqlite.exec(`ALTER TABLE playlist_shares_v3 RENAME TO playlist_shares`);
    sqlite.exec(`CREATE INDEX IF NOT EXISTS playlist_shares_user_idx ON playlist_shares(user_id)`);
  }
} catch (err) {
  console.error("[db] playlist_shares → user-only migration failed", err);
}

// Migrate legacy playlist_shares (user_id-only PK without email) — no-op if already migrated.
try {
  const cols = sqlite.prepare(`PRAGMA table_info(playlist_shares)`).all() as Array<{
    name: string;
  }>;
  const names = new Set(cols.map((c) => c.name));
  // Older intermediate shape had email; handled above. If somehow guest_token remains without email:
  if (cols.length && names.has("guest_token") && !names.has("email")) {
    sqlite.exec(`
      CREATE TABLE playlist_shares_v3 (
        playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (playlist_id, user_id)
      );
    `);
    sqlite.exec(`
      INSERT OR IGNORE INTO playlist_shares_v3 (playlist_id, user_id, created_at)
      SELECT playlist_id, user_id, created_at FROM playlist_shares WHERE user_id IS NOT NULL
    `);
    sqlite.exec(`DROP TABLE playlist_shares`);
    sqlite.exec(`ALTER TABLE playlist_shares_v3 RENAME TO playlist_shares`);
    sqlite.exec(`CREATE INDEX IF NOT EXISTS playlist_shares_user_idx ON playlist_shares(user_id)`);
  }
} catch (err) {
  console.error("[db] playlist_shares cleanup failed", err);
}

try {
  sqlite.exec(`
CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);
} catch {
  // ignore
}

// Normalize license tags: Clear | Library | Exclusive | On Hold
try {
  sqlite
    .prepare(
      `UPDATE tracks SET license = 'Clear' WHERE license IS NULL OR TRIM(license) = '' OR license = 'None [Available]' OR lower(license) = 'none' OR lower(license) = 'n/a' OR lower(license) = 'available'`,
    )
    .run();
  sqlite
    .prepare(`UPDATE tracks SET license = 'Library' WHERE license = 'Library [Available]'`)
    .run();
  sqlite
    .prepare(
      `UPDATE tracks SET license = 'Clear' WHERE license NOT IN ('Clear', 'Library', 'Exclusive', 'On Hold')`,
    )
    .run();
} catch (err) {
  console.error("[db] license normalize failed", err);
}

try {
  sqlite.exec(`
CREATE TABLE IF NOT EXISTS track_license_entries (
  id TEXT PRIMARY KEY NOT NULL,
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  client TEXT NOT NULL,
  used_for TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT '',
  territory TEXT NOT NULL DEFAULT '',
  media TEXT NOT NULL DEFAULT '',
  duration TEXT NOT NULL DEFAULT '',
  branding TEXT NOT NULL DEFAULT '',
  notes TEXT,
  licensed_at TEXT NOT NULL,
  perpetuity TEXT,
  expires_at TEXT,
  trashed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS track_license_entries_track_idx ON track_license_entries(track_id);

CREATE TABLE IF NOT EXISTS license_requests (
  id TEXT PRIMARY KEY NOT NULL,
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT '',
  territory TEXT NOT NULL DEFAULT '',
  media TEXT NOT NULL DEFAULT '',
  duration TEXT NOT NULL DEFAULT '',
  branding TEXT NOT NULL DEFAULT '',
  intended_use TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL,
  trashed_at TEXT,
  subscriber_seen_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS license_requests_status_idx ON license_requests(status);
CREATE INDEX IF NOT EXISTS license_requests_track_idx ON license_requests(track_id);
CREATE INDEX IF NOT EXISTS license_requests_user_idx ON license_requests(user_id);
`);
} catch (err) {
  console.error("[db] license tables failed", err);
}

try {
  sqlite.exec(`ALTER TABLE track_license_entries ADD COLUMN scope TEXT NOT NULL DEFAULT ''`);
} catch {
  // column already exists
}

try {
  sqlite.exec(`ALTER TABLE license_requests ADD COLUMN scope TEXT NOT NULL DEFAULT ''`);
} catch {
  // column already exists
}

for (const col of ["territory", "media", "duration", "branding"] as const) {
  try {
    sqlite.exec(
      `ALTER TABLE track_license_entries ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`,
    );
  } catch {
    // column already exists
  }
  try {
    sqlite.exec(`ALTER TABLE license_requests ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`);
  } catch {
    // column already exists
  }
}

try {
  sqlite.exec(`ALTER TABLE track_license_entries ADD COLUMN trashed_at TEXT`);
} catch {
  // column already exists
}

try {
  sqlite.exec(`ALTER TABLE license_requests ADD COLUMN trashed_at TEXT`);
} catch {
  // column already exists
}

try {
  sqlite.exec(`ALTER TABLE license_requests ADD COLUMN subscriber_seen_at TEXT`);
} catch {
  // column already exists
}

// One-time seed: Library tracks with client/detail → one history entry (skip if already seeded).
try {
  const already = sqlite
    .prepare(`SELECT COUNT(*) AS c FROM track_license_entries`)
    .get() as { c: number };
  if (Number(already?.c ?? 0) === 0) {
    const rows = sqlite
      .prepare(
        `SELECT id, client, project, license_detail, perpetuity, license_expires, created_at, license
         FROM tracks
         WHERE trashed_at IS NULL
           AND (license = 'Library' OR license = 'Library [Available]')
           AND (
             trim(coalesce(client, '')) != ''
             OR trim(coalesce(license_detail, '')) != ''
             OR trim(coalesce(project, '')) != ''
           )`,
      )
      .all() as Array<{
      id: string;
      client: string | null;
      project: string | null;
      license_detail: string | null;
      perpetuity: string | null;
      license_expires: string | null;
      created_at: string;
    }>;

    const insert = sqlite.prepare(
      `INSERT INTO track_license_entries
        (id, track_id, client, used_for, scope, territory, media, duration, branding, notes, licensed_at, perpetuity, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const now = new Date().toISOString();
    for (const row of rows) {
      const client = (row.client || "").trim() || "Unknown";
      const usedFor =
        (row.project || "").trim() ||
        (row.license_detail || "").trim() ||
        "Prior library license";
      const notes =
        (row.project || "").trim() && (row.license_detail || "").trim()
          ? (row.license_detail || "").trim()
          : null;
      const id = `seed_${row.id}`;
      insert.run(
        id,
        row.id,
        client,
        usedFor,
        "",
        "",
        "",
        "",
        "",
        notes,
        (row.created_at || now).slice(0, 10),
        (row.perpetuity || "").trim() || null,
        (row.license_expires || "").trim() || null,
        now,
        now,
      );
    }
  }
} catch (err) {
  console.error("[db] license entry seed failed", err);
}

// Convert remaining track-row license details → history entries (Exclusive + any missed Library/Hold).
// Idempotent: only tracks with no active entry; ids are legacy_<trackId>.
try {
  const rows = sqlite
    .prepare(
      `SELECT id, client, project, license_detail, perpetuity, license_expires, created_at, license, date
       FROM tracks
       WHERE trashed_at IS NULL
         AND (
           lower(trim(coalesce(license, ''))) LIKE '%library%'
           OR lower(trim(coalesce(license, ''))) LIKE '%exclusive%'
           OR lower(trim(coalesce(license, ''))) = 'hold'
         )
         AND (
           trim(coalesce(client, '')) != ''
           OR trim(coalesce(project, '')) != ''
           OR trim(coalesce(license_detail, '')) != ''
           OR trim(coalesce(perpetuity, '')) != ''
           OR trim(coalesce(license_expires, '')) != ''
         )
         AND NOT EXISTS (
           SELECT 1 FROM track_license_entries e
           WHERE e.track_id = tracks.id AND e.trashed_at IS NULL
         )`,
    )
    .all() as Array<{
    id: string;
    client: string | null;
    project: string | null;
    license_detail: string | null;
    perpetuity: string | null;
    license_expires: string | null;
    created_at: string;
    license: string | null;
    date: string | null;
  }>;

  if (rows.length) {
    const insert = sqlite.prepare(
      `INSERT OR IGNORE INTO track_license_entries
        (id, track_id, client, used_for, scope, territory, media, duration, branding, notes, licensed_at, perpetuity, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const now = new Date().toISOString();
    let converted = 0;
    for (const row of rows) {
      const client = (row.client || "").trim() || "Unknown";
      const project = (row.project || "").trim();
      const detail = (row.license_detail || "").trim();
      const lic = (row.license || "").toLowerCase();
      const defaultUsed = lic.includes("exclusive")
        ? "Prior exclusive license"
        : lic === "hold"
          ? "Prior hold / license"
          : "Prior library license";
      const usedFor = project || detail || defaultUsed;
      const notes = project && detail ? detail : null;
      const licensedAt =
        (row.date || "").trim().slice(0, 10) ||
        (row.created_at || now).slice(0, 10);
      const id = `legacy_${row.id}`;
      const result = insert.run(
        id,
        row.id,
        client,
        usedFor,
        "",
        "",
        "",
        "",
        "",
        notes,
        licensedAt,
        (row.perpetuity || "").trim() || null,
        (row.license_expires || "").trim() || null,
        now,
        now,
      );
      if (result.changes) converted += 1;
    }
    if (converted) {
      console.log(`[db] converted ${converted} track license field(s) → license entries`);
    }
  }
} catch (err) {
  console.error("[db] legacy license conversion failed", err);
}

try {
  sqlite.exec(`
CREATE TABLE IF NOT EXISTS samro_submissions (
  id TEXT PRIMARY KEY NOT NULL,
  publisher_name TEXT NOT NULL,
  status TEXT NOT NULL,
  created_by TEXT NOT NULL,
  file_name TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  exported_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS samro_submissions_status_idx ON samro_submissions(status);

CREATE TABLE IF NOT EXISTS samro_submission_tracks (
  submission_id TEXT NOT NULL REFERENCES samro_submissions(id) ON DELETE CASCADE,
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  snapshot_json TEXT,
  PRIMARY KEY (submission_id, track_id)
);
CREATE INDEX IF NOT EXISTS samro_submission_tracks_track_idx ON samro_submission_tracks(track_id);
`);
} catch (err) {
  console.error("[db] samro submission tables failed", err);
}

try {
  sqlite.exec(`ALTER TABLE samro_submissions ADD COLUMN trashed_at TEXT`);
} catch {
  // column exists
}
try {
  sqlite.exec(
    `CREATE INDEX IF NOT EXISTS samro_submissions_trashed_at_idx ON samro_submissions(trashed_at)`,
  );
} catch {
  // index exists
}

try {
  sqlite.exec(`ALTER TABLE samro_submissions ADD COLUMN archived_at TEXT`);
} catch {
  // column exists
}
try {
  sqlite.exec(
    `CREATE INDEX IF NOT EXISTS samro_submissions_archived_at_idx ON samro_submissions(archived_at)`,
  );
} catch {
  // index exists
}

try {
  sqlite.exec(`
CREATE TABLE IF NOT EXISTS composers (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  ipi_pa TEXT NOT NULL DEFAULT '',
  ipi_base TEXT,
  pro_society TEXT NOT NULL DEFAULT 'SAMRO',
  notes TEXT,
  disabled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS composers_display_name_idx ON composers(display_name);
CREATE INDEX IF NOT EXISTS composers_disabled_at_idx ON composers(disabled_at);

CREATE TABLE IF NOT EXISTS track_composers (
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  composer_id TEXT NOT NULL REFERENCES composers(id) ON DELETE RESTRICT,
  perf_share INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (track_id, composer_id)
);
CREATE INDEX IF NOT EXISTS track_composers_composer_idx ON track_composers(composer_id);
CREATE INDEX IF NOT EXISTS track_composers_track_sort_idx ON track_composers(track_id, sort_order);
`);
} catch (err) {
  console.error("[db] composer tables failed", err);
}

export const db = drizzle(sqlite, { schema: fullSchema });
export { sqlite };
