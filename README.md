# Audio Attic

Local-first catalog portal for composed library tracks. Data is stored in SQLite, seeded from a published Google Sheet, with audio streamed from Dropbox.

## Setup

```bash
npm install
cp .env.example .env.local
npm run db:migrate
npm run seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

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
- `DROPBOX_APP_KEY` / `DROPBOX_APP_SECRET` / `DROPBOX_REFRESH_TOKEN` — long-term Dropbox API access (recommended)
- `DROPBOX_ACCESS_TOKEN` — optional short-lived fallback (~4h) while migrating
- `DROPBOX_UPLOAD_FOLDER` — unused for lookup (kept optional)

Auto-tag prefers audio from dropped local files; otherwise it fetches audio from the Dropbox link. Tags are constrained to your existing catalog vocabulary.

#### Dropbox long-term access (refresh token)

Dropbox no longer issues permanent generated tokens. Use a refresh token once:

1. Go to [Dropbox App Console](https://www.dropbox.com/developers/apps)
2. Open (or create) a scoped app; enable: `files.metadata.read`, `sharing.read`, `sharing.write`
3. Copy **App key** + **App secret** into `.env.local` as `DROPBOX_APP_KEY` / `DROPBOX_APP_SECRET`
4. Run `npm run dropbox:oauth` — open the printed URL, approve, copy the `code`
5. Run `npm run dropbox:oauth -- --exchange PASTE_CODE_HERE`
6. Add the printed `DROPBOX_REFRESH_TOKEN` to `.env.local`
7. Restart `npm run dev`

The app refreshes short-lived access tokens automatically. You can remove `DROPBOX_ACCESS_TOKEN` after this works.

Drag files that are **already synced in Dropbox**. The app searches Dropbox by filename and fetches/creates the share link — it does **not** upload.

## Scripts

- `npm run db:migrate` — create SQLite tables in `data/attic.db`
- `npm run seed` — upsert tracks from `SHEET_CSV_URL`
- `npm run dev` — local development server
- `npm run build && npm start` — production mode (ready for a subdomain)

## Features

- Browse / search / filter by genre, mood, instrument, year, license
- Persistent audio player (proxied Dropbox URLs)
- Download + playlists
- Admin import: paste links or drag existing Dropbox files to fetch share links, Gemini auto-tag, listen preview, import
- Admin re-sync from Google Sheet (upsert by ID)
