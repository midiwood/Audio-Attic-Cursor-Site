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
# Dropbox / Gemini / mail as needed — same keys as .env.example
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
