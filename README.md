# Audio Attic

Local-first catalog portal for composed library tracks. Data is stored in SQLite, seeded from a published Google Sheet, with audio stored in a **private DigitalOcean Spaces** bucket.

Playback and downloads **never stream through cPanel** — the Node app verifies auth, then returns a short-lived presigned URL; the browser streams directly from Spaces.

## Setup

```bash
npm install
cp .env.example .env.local
npm run db:migrate
npm run seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Production (cPanel Node.js)

No-SSH install and update playbook: **[docs/INSTALL-AND-UPDATE.md](docs/INSTALL-AND-UPDATE.md)**.  
Shorter hosting notes: **[docs/CPANEL.md](docs/CPANEL.md)**.

Summary: Node **20+**, Application root = folder with `package.json`, startup file = **`app.js`**, set `BETTER_AUTH_URL` to your HTTPS subdomain, then `npm run build` and Restart.

```bash
npm ci
npm run build
npm start          # uses app.js (Passenger / cPanel)
```

The site is **private** for now: unauthenticated visits redirect to `/admin/login`.

Auth uses [Better Auth](https://www.better-auth.com/) (email + password, session cookies). Roles:

- **admin** — catalog + Account (user management) + sheet re-sync  
- **editor** — catalog only (browse, import, edit, playlists)

Bootstrap the first admin when the user table is empty using `ADMIN_EMAIL` + `ADMIN_PASSWORD` in `.env.local`.  
Also set `BETTER_AUTH_SECRET` (or `SESSION_SECRET`) and `BETTER_AUTH_URL`.

### Env keys

- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — bootstrap first admin when DB has no users
- `BETTER_AUTH_SECRET` — session signing secret (falls back to `SESSION_SECRET`)
- `BETTER_AUTH_URL` — public app URL (e.g. `http://localhost:3000`)
- `GEMINI_API_KEY` — AI tagging (Gemini multimodal listens to audio)
- `GEMINI_MODEL` — optional (default `gemini-3.6-flash`)
- `DO_SPACES_KEY` / `DO_SPACES_SECRET` — Spaces access credentials (Admin → Storage)
- `DO_SPACES_BUCKET` / `DO_SPACES_REGION` — bucket name and region (e.g. `nyc3`)
- `DO_SPACES_PREFIX` — object key prefix (default `vault`)
- `DO_SPACES_PRESIGN_TTL_SEC` — presigned URL lifetime (default 4 hours)

Configure and test Spaces in **Admin → Storage**. The bucket should be **private**.

#### Migrating from Dropbox

While legacy tracks still live in Dropbox, keep Dropbox OAuth env vars temporarily and run:

```bash
npm run spaces:migrate-from-dropbox -- --dry-run
npm run spaces:migrate-from-dropbox
npm run spaces:migrate-from-dropbox -- --track-id=RJV001
```

After migration, remove Dropbox credentials from `.env`.

Auto-tag prefers audio from dropped local files; otherwise it fetches from the vault (Spaces). Tags are constrained to your existing catalog vocabulary.

Import: drag local MP3/WAV files — the app normalizes to −16 LUFS MP3 and uploads to Spaces.

## Scripts

- `npm run db:migrate` — create SQLite tables in `data/attic.db`
- `npm run seed` — upsert tracks from `SHEET_CSV_URL`
- `npm run dev` — local development server
- `npm run build && npm start` — production mode (ready for a subdomain)
- `npm run spaces:migrate-from-dropbox` — one-time Dropbox → Spaces migration

## Features

- Browse / search / filter by genre, mood, instrument, year, license
- Persistent audio player (presigned Spaces URLs via `/api/audio`)
- Download + playlists (bulk download uses presigned batch URLs — no server zip)
- Admin import: drag local files, Gemini auto-tag, listen preview, import
- Track versions and stems stored alongside main mix in Spaces
- Admin re-sync from Google Sheet (upsert by ID)
