# cPanel Node.js (shared hosting)

Audio Attic is a long-running Next.js app with SQLite. It is **not** a Vercel/static deploy.

## cPanel settings

| Field | Value |
|--------|--------|
| Node.js version | **20.x** (or 22.x) |
| Application mode | **Production** |
| Application root | Folder that contains **`package.json`** (e.g. `audioattic…/audio-attic-app`) |
| Application URL | Your subdomain |
| Application startup file | **`app.js`** |

## One-time setup

1. Put the project in Application root so `package.json` and `app.js` are at that level (not one folder deeper).
2. **Run NPM Install** in Setup Node.js App (or `npm ci` via SSH).
3. Add environment variables in the Node app UI (or `.env.local` in Application root):

```bash
NODE_ENV=production
BETTER_AUTH_URL=https://audioattic.phonographic.co.za
BETTER_AUTH_SECRET=long-random-secret
DO_SPACES_KEY=...
DO_SPACES_SECRET=...
DO_SPACES_BUCKET=...
DO_SPACES_REGION=nyc3
# GEMINI_API_KEY / mail keys as needed — see .env.example
```

4. Build (SSH / Terminal, from Application root, with the app’s virtualenv activated if cPanel provides a “Enter” command):

```bash
npm run build
```

5. **Restart** the Node.js app in cPanel.

## After code updates

```bash
git pull   # or re-upload
npm ci     # or Run NPM Install
npm run build
```

Then Restart the app in cPanel.

## Notes

- **Startup file must be `app.js`** — Passenger needs a file that calls `listen()`. Do not point startup at `package.json` alone.
- SQLite lives in `data/attic.db` — that directory must be writable.
- Vault normalize / waveforms need **`ffmpeg`** on the server. If missing, browsing/playback of already-vaulted MP3s can still work; new vault ingest may fail.
- Prefer building **on the server** (same Node version) so `better-sqlite3` native bindings match.
- Do not use Application root = empty subdomain docroot that only has `.well-known` if `package.json` is in a subfolder — point Application root at the subfolder that has `package.json`.

## Audio delivery (important)

**cPanel must not proxy audio bytes.** Playback and single-track downloads work like this:

1. Browser requests `/api/audio?id=…` (or `&download=1`).
2. Node verifies session / guest / subscriber access.
3. Node responds with **302 redirect** to a short-lived presigned DigitalOcean Spaces URL.
4. Browser streams or downloads **directly from Spaces** (Range requests work for seeking).

Bulk downloads use `POST /api/audio/presign-batch` — the browser fetches presigned URLs and saves each file locally. There is no server-built zip.

Waveform generation and AI tagging may briefly download audio to server memory during upload/backfill — that is admin/background only, not user streaming.
