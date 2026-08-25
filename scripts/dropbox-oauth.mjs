#!/usr/bin/env node
/**
 * One-time Dropbox OAuth helper — get a long-lived refresh token.
 *
 * Usage:
 *   node scripts/dropbox-oauth.mjs
 *   node scripts/dropbox-oauth.mjs --exchange THE_CODE
 *
 * Needs DROPBOX_APP_KEY + DROPBOX_APP_SECRET in .env.local (or env).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnvLocal() {
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

const appKey = (process.env.DROPBOX_APP_KEY || "").trim();
const appSecret = (process.env.DROPBOX_APP_SECRET || "").trim();

if (!appKey || !appSecret) {
  console.error("Set DROPBOX_APP_KEY and DROPBOX_APP_SECRET in .env.local first.");
  process.exit(1);
}

const args = process.argv.slice(2);
const exchangeIdx = args.indexOf("--exchange");
const code = exchangeIdx >= 0 ? args[exchangeIdx + 1] : null;

if (!code) {
  const url =
    `https://www.dropbox.com/oauth2/authorize` +
    `?client_id=${encodeURIComponent(appKey)}` +
    `&response_type=code` +
    `&token_access_type=offline`;

  console.log(`
1) Open this URL in your browser and approve access:

${url}

2) Dropbox redirects to http://localhost/?code=...
   Copy the "code" query value.

3) Run:

   npm run dropbox:oauth -- --exchange PASTE_CODE_HERE

4) Put the printed DROPBOX_REFRESH_TOKEN into .env.local and restart npm run dev.
`);
  process.exit(0);
}

const body = new URLSearchParams({
  code,
  grant_type: "authorization_code",
  client_id: appKey,
  client_secret: appSecret,
});

const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body,
});
const data = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error("Exchange failed:", data);
  process.exit(1);
}

if (!data.refresh_token) {
  console.error(
    "No refresh_token in response. Re-authorize with token_access_type=offline (use this script without --exchange).",
  );
  console.error(data);
  process.exit(1);
}

console.log(`
Add these to .env.local (refresh token is long-lived):

DROPBOX_APP_KEY=${appKey}
DROPBOX_APP_SECRET=${appSecret}
DROPBOX_REFRESH_TOKEN=${data.refresh_token}

Optional: you can remove DROPBOX_ACCESS_TOKEN after this works.
Access token expires_in=${data.expires_in || "?"}s — the app refreshes automatically.
`);
