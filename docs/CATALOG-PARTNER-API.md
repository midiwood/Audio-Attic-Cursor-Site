# Partner catalog API

Server-to-server search of **Clear** tracks only. Library, Exclusive, On Hold, and Personal are never returned and never play. If a track later leaves Clear, stored play URLs return 404.

Spaces download links expire. Persist Attic `id` + `playUrl` on the other site. Each play hits Attic; Attic 302s to a fresh stream.

Live base URL example: `https://audioattic.phonographic.co.za`

## Clear gate (what “empty” means)

Partner search always forces `license=clear`. A `200` with `total: 0` means the **live** SQLite DB has no Clear-eligible rows (or Passenger is not reading the DB you think it is)—not a broken Bearer key.

1. On production Browse, filter **License = Clear**, or open **Admin → Site** and check **License inventory**. If Clear is 0, partner search is correct. Staff must open each track → set **License = Clear** → save. (A Mac copy of `attic.db` with Clear rows does not mean live has them.)
2. Clear matches the same rules as the UI: empty / Clear / None / Available / legacy `[Available]` (non-Library), case-insensitive. Library, Exclusive, On Hold, and Personal are excluded.
3. Confirm Application root `data/attic.db` is the file Passenger uses (`docs/CPANEL.md`). `app.js` now `chdir`s to Application root so SQLite is not opened under a wrong cwd. After code or env changes: **Stop → Start** (not Restart only).

Authorized diagnostic (same Bearer key):

```bash
curl -sS -H "Authorization: Bearer $CATALOG_API_KEY" \
  "https://audioattic.phonographic.co.za/api/catalog/search?limit=1&diag=1"
```

Check `diag.clearExact` / `diag.clearNormalized` / `diag.dbPath`. If Browse Clear is 179 but `diag.clearExact` is 0, the API process is on a different `attic.db` than you think.

Do not widen the partner API to Library or Exclusive.

## Setup (Audio Attic)

**Preferred on cPanel:** put secrets in Application root (same folder as `app.js`) via File Manager:

Create **`.env.local`** (or `.env.production`) with:

```
CATALOG_API_KEY=<long random secret>
BETTER_AUTH_URL=https://audioattic.phonographic.co.za
```

No quotes. `BETTER_AUTH_URL` is required so `playUrl` uses the public host (Passenger often reports `http://127.0.0.1` as the request origin). Then **Stop → Start** the Node app.

You can also add `CATALOG_API_KEY` under Setup Node.js App → Environment variables. On some hosts that UI value never reaches `process.env`; the `.env.local` file is the reliable fallback.

Optional: `CATALOG_HMAC_SECRET` (defaults to `CATALOG_API_KEY`). Rotating it invalidates existing `playUrl` signatures — search again to get new URLs.

After env or code changes: upload a new **`.next`** build when catalog code changes, then **Stop**, then **Start** (Restart is not always enough).

Success check:

```bash
curl -sS -H "Authorization: Bearer $CATALOG_API_KEY" \
  "https://audioattic.phonographic.co.za/api/catalog/search?limit=20"
```

Expect `total > 0` only when live has Clear tracks; each item’s `playUrl` must start with `https://audioattic.phonographic.co.za/api/catalog/audio?id=…&sig=…`.

## Auth

**Search** requires:

```
Authorization: Bearer <CATALOG_API_KEY>
```

(`X-Catalog-Api-Key` is also accepted.)

**Playback** does **not** use the Bearer key. `playUrl` includes a per-track HMAC (`sig`) so `<audio src>` never leaks the partner secret.

## Search

`GET /api/catalog/search`

Query params (all optional):

| Param | Meaning |
| --- | --- |
| `q` | Free-text catalog search |
| `genre` | Repeat or comma-separated. Must match Attic vocabulary |
| `mood` | Same |
| `instrument` | Same |
| `attribute` | Usage / attributes vocabulary |
| `bpm` | Centre tempo; matches about ±8 BPM |
| `bpmMin` / `bpmMax` | Explicit range (overrides `bpm` if either is set) |
| `sort` | `title` \| `year` \| `bpm` \| `date` |
| `dir` | `asc` \| `desc` |
| `limit` | Default 20, max 20 |
| `offset` | Pagination |

`license` and `samro` query params are ignored. Results are always Clear.

Unknown facet names are dropped (no error).

Example:

```bash
curl -sS -H "Authorization: Bearer $CATALOG_API_KEY" \
  "https://audioattic.phonographic.co.za/api/catalog/search?mood=Upbeat&genre=Afrobeat&bpm=120&limit=8"
```

Response:

```json
{
  "total": 3,
  "offset": 0,
  "limit": 8,
  "hasMore": false,
  "tracks": [
    {
      "id": "rjv0123",
      "title": "Summer Groove",
      "genre": "Afrobeat",
      "mood": "Upbeat, Warm",
      "instruments": "Guitar",
      "attributes": "Promo",
      "bpm": 120,
      "duration": "3:24",
      "key": "Cm",
      "playUrl": "https://audioattic.phonographic.co.za/api/catalog/audio?id=rjv0123&sig=…"
    }
  ]
}
```

Errors: `401` bad/missing key, `503` if `CATALOG_API_KEY` is unset on the server.

## Playback

`GET /api/catalog/audio?id=<id>&sig=<hmac>`

- Use the exact `playUrl` from search (or rebuild with the same HMAC secret).
- Browser: `<audio src={playUrl} />` or `new Audio(playUrl)`.
- 302 to DigitalOcean Spaces (short-lived). Do not store the redirected URL.
- `401` invalid signature, `404` missing / not Clear / no audio.
- `playUrl` host comes from `BETTER_AUTH_URL` (see Setup), not from the reverse-proxy origin.

## Other-site contract

1. Call search from **your server** with the Bearer key (never ship `CATALOG_API_KEY` to a public browser).
2. Save `id`, `playUrl`, and whatever metadata you need for likes / shortlists / playlists.
3. Play with `playUrl` at any later time. Do not cache Spaces URLs.

---

## Prompt for the other site’s AI

Copy everything in this section into the other project:

```
You are integrating Audio Attic as a remote Clear-music catalog.

Rules:
- Only Clear tracks exist in this API. Never request Library/Exclusive/Hold/Personal.
- Call search from the SERVER only. Never put CATALOG_API_KEY in client-side JS.
- Base URL: {{AUDIO_ATTIC_BASE_URL}}  (e.g. https://audioattic.phonographic.co.za)
- Search: GET {{AUDIO_ATTIC_BASE_URL}}/api/catalog/search
  Header: Authorization: Bearer {{CATALOG_API_KEY}}
- Query params you may send: q, genre, mood, instrument, attribute (repeatable or comma-separated; names must match Attic vocabulary), bpm (centre ±8), bpmMin, bpmMax, sort (title|year|bpm|date), dir (asc|desc), limit (max 20), offset.
- Map your generated tags onto those params. If a tag is not in Attic’s vocabulary it is silently ignored — prefer sending several candidate genre/mood values.
- Persist each result’s `id` and `playUrl` (plus title, bpm, duration, key, tags) in our database for likes, shortlists, and playlists.
- NEVER persist the URL after a 302 (that is a short-lived Spaces link).
- Playback: set HTML audio (or equivalent) src to the stored `playUrl`. It stays valid indefinitely as long as the track remains Clear; Attic re-signs storage on every request.
- Handle 401 (search key wrong), 404 on play (track gone or no longer Clear), empty `tracks` array (no match).
- Do not implement downloads against this API. Playback only.
```
