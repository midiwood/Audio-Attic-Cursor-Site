# Audio Attic — install and update (cPanel, no SSH)

Live: https://audioattic.phonographic.co.za  
GitHub: https://github.com/midiwood/Audio-Attic-Cursor-Site.git (`master`)  
cPanel user: `phonogra`  
Application root: `/home/phonogra/repositories/audio-attic-app`

This is a long-running **Node 22** Next.js app with **SQLite** and **Passenger**. It is not a static upload. You have **no Terminal/SSH** — use **Git Version Control**, **Setup Node.js App**, **File Manager**, and **Cron** only if you must.

Shorter hosting notes (Spaces-oriented): [CPANEL.md](./CPANEL.md).

## What must always be true

| Item | Value |
|------|--------|
| Node.js version | **22** (20 is OK; not 18) |
| Application mode | **Production** |
| Application root | Folder with `package.json` **and** `app.js` |
| Startup file | **`app.js`** (not `package.json`) |
| Config | **`next.config.mjs`** — do **not** restore `next.config.ts` (production `npm install` has no `typescript`) |
| Database | `data/attic.db` (gitignored). Git pull does **not** replace it |
| Native module | `better-sqlite3` must be **compiled on the server** (Mac/Linux prebuilds need GLIBC 2.29; el8 has 2.28) |

### Never do these on a working live app

- **Run NPM Install** unless `package.json` / lockfile changed. It can replace `better-sqlite3` with a binary that will not load.
- Touch **`data/attic.db`**, `attic.db-wal`, or `attic.db-shm` while Node is running.
- Upload Mac **`node_modules`**. The `node_modules` link in File Manager is cPanel’s virtualenv — leave it.
- Point Application root at the subdomain docroot if `package.json` is not there.
- Use Finder to zip the **`.next` folder** (extract often becomes `.next/.next/` and the app will not start).

`ADMIN_EMAIL` / `ADMIN_PASSWORD` only create the first admin when the **user table is empty**. After you upload a Mac database, log in with those Mac users — bootstrap env vars will not reset passwords.

---

## Git on cPanel

### Public vs private

| Visibility | Remote URL |
|------------|------------|
| **Public** | `https://github.com/midiwood/Audio-Attic-Cursor-Site.git` (no user, no token) |
| **Private** | SSH deploy key, **or** HTTPS with a GitHub **token** (not your password) |

Private HTTPS:

```text
https://YOUR_GITHUB_USERNAME:YOUR_TOKEN@github.com/midiwood/Audio-Attic-Cursor-Site.git
```

Token: GitHub → Settings → Developer settings → Personal access tokens (classic) → **`repo`**. If the token expires, Pull fails.

Private SSH: Git Version Control public key → GitHub repo → Settings → Deploy keys (read-only) → remote `git@github.com:midiwood/Audio-Attic-Cursor-Site.git`.

Flipping **public → private → public** can leave a stale token in the remote. Wrong credentials fail even on a public repo. Set the remote back to the plain HTTPS URL, save, retry.

Error **“The system could not contact the remote repository”** usually means auth, a bad remote URL, or the host cannot reach GitHub — not “the repo is missing.”

### Update from Remote vs Deploy HEAD Commit

| Button | What it does | Needs GitHub? |
|--------|----------------|---------------|
| **Update from Remote** | Fetch/pull new commits into the server git repo | Yes |
| **Deploy HEAD Commit** | Check out / copy **whatever is already on the server**, then run `.cpanel.yml` | No |

Always **Update from Remote first**, then Deploy only if you intend to run the deploy script.

**Do not use Deploy HEAD Commit on this host until `.cpanel.yml` is safe.** It currently runs `npm ci` and `npm run build`, which can break `better-sqlite3` and OOM the shared compiler. Use Update from Remote, then upload a Mac `.next` (below).

If Update from Remote fails, skip git for that release: the running site uses **`.next`**, not `src/`.

---

## First install

### 1. Subdomain

cPanel → Domains → e.g. `audioattic.phonographic.co.za`.  
Leave the default document root. The Node app lives in the **git clone**, not necessarily that docroot.

### 2. Clone

Git Version Control → Create:

- Clone URL: public or private URL from above
- Repository path: `repositories/audio-attic-app`
- Branch: `master`

### 3. Node app

Setup Node.js App:

- Node **22**, Production
- Application root: `/home/phonogra/repositories/audio-attic-app`
- Startup file: `app.js`
- Application URL: the subdomain

Environment variables (also see `.env.production.example`):

```bash
NODE_ENV=production
BETTER_AUTH_URL=https://audioattic.phonographic.co.za
BETTER_AUTH_SECRET=<long random string>
# Optional bootstrap only if data/attic.db has no users:
# ADMIN_EMAIL=
# ADMIN_PASSWORD=
```

Dropbox and/or DigitalOcean Spaces, Gemini, Resend: set here or later in Admin.  
**After any env change: Stop, then Start** (Restart is not always enough).

### 4. NPM Install (once)

Setup Node.js App → **Run NPM Install**.  
Expect `better-sqlite3` to be wrong on el8 until you compile it (next section).

Confirm File Manager shows in the **same** folder: `package.json`, `app.js`, `next.config.mjs`, `node_modules` (link icon is normal).

### 5. Compile `better-sqlite3` (once per Node / package bump)

Host must allow a compiler. Cron, **one shot**, then disable the job so it does not run every minute.

Pitfalls: overlapping crons, OOM (`cc1 Killed` — use `CFLAGS="-O0 -g0"`), GCC 8 has no `-std=c++20` (use `c++2a`).

Working pattern (adjust Python/Node paths if cPanel differs):

```bash
cd /home/phonogra/repositories/audio-attic-app
export PATH="/opt/alt/python311/bin:$PATH"
cd node_modules/better-sqlite3
rm -rf build
npx node-gyp@10 configure
# After configure, rewrite flags:
sed -i 's/-std=c++20/-std=c++2a/g' build/*.mk
CFLAGS="-O0 -g0" npx node-gyp@10 build --release
```

If Cron has no usable shell, ask the host to compile, or paste the same steps into a one-time Cron with an absolute `npx`/`node` from the app’s Node virtualenv (`~/nodevenv/repositories/audio-attic-app/22/...`).

**Never Run NPM Install** after this unless `package.json` changes — then compile again.

### 6. Production `.next` (Mac upload — method 6B)

This host often cannot finish `next build` (memory). Build on the Mac, upload the zip.

On the Mac, from the project folder:

```bash
npm run build
cd .next && zip -r ../.next.zip . && cd ..
```

Zip the **contents** of `.next` so `BUILD_ID` is at the top of the zip.

cPanel:

1. Setup Node.js App → **Stop**.
2. File Manager → `audio-attic-app` → delete the old **`.next`** folder only.
3. Upload `.next.zip` next to `app.js` → Extract.
4. Confirm **`.next/BUILD_ID`** sits beside `server` and `static`, **not** `.next/.next/BUILD_ID`.
5. Delete `.next.zip` on the server if you want.
6. **Start**.

If Passenger says it could not spawn: nested or incomplete `.next`, or `app.js` exiting (see logs).

### 7. Database

SQLite is created on boot (`CREATE TABLE IF NOT EXISTS` + additive migrations).  
First go-live: **Stop** Node, upload Mac `data/attic.db` (and `-wal` / `-shm` if present) into `data/`, permissions `data/` **755** or **775**, db **664** or **666**, then **Start**.  
After that, **live DB is source of truth**. Do not overwrite it with a Mac copy unless you intend to replace live catalog/users.

Do not run `npm run seed` on live unless you mean to upsert from the Google Sheet.

### 8. Login check

`BETTER_AUTH_URL` must be the public HTTPS origin (not `localhost`). Then Restart/Stop+Start.  
Open `/admin/login`.

---

## Regular update (code)

Mac `master` → GitHub → cPanel source + new `.next`.  
Git pull **does not** update the running UI until `.next` is replaced.

### A. Mac

```bash
cd "/Volumes/Media/Dropbox/_Business/DevScripts/Audio-Attic-Cursor Site"
git push origin master
npm run build
cd .next && zip -r ../.next.zip . && cd ..
```

### B. cPanel

1. **Stop** the Node app.
2. Git Version Control → **Update from Remote** (`master`). Skip this step if GitHub contact fails; still upload `.next`.
3. Do **not** Run NPM Install (unless dependencies changed — then recompile `better-sqlite3`).
4. Do **not** touch `data/attic.db`.
5. Replace `.next` as in first install step 6.
6. Confirm `next.config.mjs` exists and `next.config.ts` does not.
7. **Start**.

### C. Smoke test

- Site loads; login still works.
- If you only changed CSS/JS, you should see it.
- Browse should not flood `GET /api/audio` 502s. Audio prefetch is **next-track only**, ~1s after Play, ~256 KB Range — not five tracks on Browse.

---

## When `package.json` changes

1. Stop app.
2. Update from Remote.
3. **Run NPM Install**.
4. Recompile `better-sqlite3` (same as first install).
5. Replace `.next` (Mac zip or a successful server `npm run build`).
6. Start.

---

## Database and WAL

- Leave `data/` alone on git updates.
- Stuck WAL: **Stop** app, delete `attic.db-wal` and `attic.db-shm` only, **Start**. SQLite rebuilds them from `attic.db`. Never delete those files while Node is running.

---

## Logs and spawn failures

Passenger: “Could not spawn process… exited prematurely” means `app.js` quit. Common causes:

- Missing `.next/BUILD_ID` (dev leftover or nested unzip)
- `Cannot find module 'typescript'` → `next.config.ts` present; keep **`next.config.mjs`**
- `better-sqlite3` GLIBC / missing `.node` after NPM Install
- Wrong startup file or Application root

`stderr.log` is often missing. Use Setup Node.js App → Metrics / Errors, or the Passenger log.

---

## Audio notes (current Dropbox proxy)

`/api/audio` still proxies Dropbox through Node. Many concurrent Range fetches 502 on this host. Browse does **not** prefetch audio; after Play, only the **next** queue item is warmed.

DigitalOcean Spaces (presigned URLs, no cPanel byte proxy) is a later migration — see README / Admin → Storage. Do not mix a half-migrated vault without a plan.

---

## Local Mac (not live)

```bash
npm install
cp .env.example .env.local
npm run db:migrate   # optional; app also migrates on boot
npm run dev
```

Production locally: `npm run build && npm start` (needs `.next/BUILD_ID`).
