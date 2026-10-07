/**
 * Backfill vault masters from local Dropbox by matching working_title (fallback library_title).
 *
 * Usage:
 *   npx tsx scripts/backfill-masters-from-local.ts --root="/Volumes/Media/Dropbox" --dry-run
 *   npx tsx scripts/backfill-masters-from-local.ts --root="/Volumes/Media/Dropbox"
 *   npx tsx scripts/backfill-masters-from-local.ts --root=… --track-id=rjv001 --min-score=20
 *   npx tsx scripts/backfill-masters-from-local.ts --root=… --allow-mp3-master --include="Audio Attic"
 */

import { config } from "dotenv";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";

config({ path: ".env.local" });
config();

import { db } from "../src/db";
import { tracks } from "../src/db/schema";
import {
  contentTypeForMasterExt,
  masterExtFromHint,
} from "../src/lib/audio-normalize-shared";
import { vaultMasterKey } from "../src/lib/storage/paths";
import {
  spacesConfigured,
  spacesSetupMessage,
  uploadObject,
} from "../src/lib/storage/spaces-core";

type Args = {
  root: string;
  dryRun: boolean;
  trackId?: string;
  limit?: number;
  minScore: number;
  allowMp3Master: boolean;
  include: string[];
  exclude: string[];
};

type IndexedFile = {
  absPath: string;
  stemNorm: string;
  stemTokens: string[];
  ext: string;
};

type Scored = IndexedFile & { score: number };

const STOP = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "to",
  "for",
  "in",
  "on",
  "at",
  "by",
  "with",
  "from",
  "vs",
  "ver",
  "version",
  "mix",
  "final",
  "master",
]);

const ALWAYS_SKIP_DIR = new Set([
  "node_modules",
  ".git",
  ".dropbox",
  ".dropbox.cache",
  "__macosx",
  ".trash",
]);

function parseList(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  let root = "";
  let dryRun = false;
  let trackId: string | undefined;
  let limit: number | undefined;
  let minScore = 1;
  let allowMp3Master = false;
  let include: string[] = [];
  let exclude: string[] = [];

  for (const arg of args) {
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--allow-mp3-master") allowMp3Master = true;
    else if (arg.startsWith("--root=")) root = arg.slice("--root=".length).trim();
    else if (arg.startsWith("--track-id=")) trackId = arg.slice("--track-id=".length).trim();
    else if (arg.startsWith("--limit=")) {
      const n = Number.parseInt(arg.slice("--limit=".length), 10);
      if (Number.isFinite(n) && n > 0) limit = n;
    } else if (arg.startsWith("--min-score=")) {
      const n = Number.parseFloat(arg.slice("--min-score=".length));
      if (Number.isFinite(n)) minScore = n;
    } else if (arg.startsWith("--include=")) {
      include = parseList(arg.slice("--include=".length));
    } else if (arg.startsWith("--exclude=")) {
      exclude = parseList(arg.slice("--exclude=".length));
    }
  }

  if (!root) {
    console.error('Missing --root="/path/to/Dropbox"');
    process.exit(1);
  }

  return { root, dryRun, trackId, limit, minScore, allowMp3Master, include, exclude };
}

function normalizeText(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[_\-.]+/g, " ")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function significantTokens(raw: string): string[] {
  return normalizeText(raw)
    .split(" ")
    .filter((t) => t.length >= 2 && !STOP.has(t));
}

function extOf(filePath: string): string {
  const ext = path.extname(filePath).replace(/^\./, "").toLowerCase();
  if (ext === "aif") return "aiff";
  return ext;
}

function allowedExt(ext: string, allowMp3: boolean): boolean {
  if (ext === "wav" || ext === "aiff") return true;
  if (allowMp3 && ext === "mp3") return true;
  return false;
}

function extBonus(ext: string): number {
  if (ext === "wav") return 30;
  if (ext === "aiff") return 20;
  if (ext === "mp3") return 5;
  return 0;
}

function pathAllowed(
  absPath: string,
  root: string,
  include: string[],
  exclude: string[],
): boolean {
  const rel = path.relative(root, absPath).split(path.sep).join("/");
  const lower = rel.toLowerCase();
  for (const ex of exclude) {
    if (ex && lower.includes(ex.toLowerCase())) return false;
  }
  if (include.length === 0) return true;
  return include.some((inc) => inc && lower.includes(inc.toLowerCase()));
}

async function indexAudioFiles(args: Args): Promise<IndexedFile[]> {
  const out: IndexedFile[] = [];
  const root = path.resolve(args.root);

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const name = ent.name;
      if (name.startsWith(".")) continue;
      const abs = path.join(dir, name);
      if (ent.isDirectory()) {
        if (ALWAYS_SKIP_DIR.has(name.toLowerCase())) continue;
        if (!pathAllowed(abs, root, args.include, args.exclude)) {
          // Still allow walking if a child might match include; only skip when exclude hits.
          const rel = path.relative(root, abs).split(path.sep).join("/").toLowerCase();
          const excluded = args.exclude.some((ex) => ex && rel.includes(ex.toLowerCase()));
          if (excluded) continue;
          if (args.include.length > 0) {
            const might = args.include.some((inc) => {
              const i = inc.toLowerCase();
              return i.includes(rel) || rel.includes(i) || i.startsWith(rel);
            });
            // If include is set and this dir can't lead to a match, skip deep walks under unrelated trees.
            // Keep walking when either side is a prefix of the other.
            const relParts = rel.split("/");
            const keep = args.include.some((inc) => {
              const i = inc.toLowerCase().replace(/^\/+|\/+$/g, "");
              return i.startsWith(rel) || rel.startsWith(i) || relParts.some((p) => i.includes(p));
            });
            if (!keep && !might) continue;
          }
        }
        await walk(abs);
        continue;
      }
      if (!ent.isFile()) continue;
      if (!pathAllowed(abs, root, args.include, args.exclude)) continue;
      const ext = extOf(name);
      if (!allowedExt(ext, args.allowMp3Master)) continue;
      const stem = path.basename(name, path.extname(name));
      const stemNorm = normalizeText(stem);
      if (!stemNorm) continue;
      out.push({
        absPath: abs,
        stemNorm,
        stemTokens: stemNorm.split(" ").filter(Boolean),
        ext,
      });
    }
  }

  await walk(root);
  return out;
}

function scoreFile(file: IndexedFile, titleTokens: string[]): number {
  if (!titleTokens.length) return -1;
  const hay = ` ${file.stemNorm} `;
  for (const tok of titleTokens) {
    if (!hay.includes(` ${tok} `) && !file.stemNorm.includes(tok)) return -1;
  }
  // All significant title tokens present: prefer more specific (longer) stems + wav.
  const tokenScore = titleTokens.length * 100;
  const lengthScore = Math.min(file.stemNorm.length, 80);
  return tokenScore + lengthScore + extBonus(file.ext);
}

function bestMatches(files: IndexedFile[], title: string, minScore: number): Scored[] {
  const tokens = significantTokens(title);
  if (!tokens.length) return [];
  const scored: Scored[] = [];
  for (const file of files) {
    const score = scoreFile(file, tokens);
    if (score >= minScore) scored.push({ ...file, score });
  }
  scored.sort((a, b) => b.score - a.score || a.absPath.localeCompare(b.absPath));
  return scored;
}

async function readFileBuffer(absPath: string): Promise<Buffer> {
  const st = await stat(absPath);
  if (st.size <= 0) throw new Error("empty file");
  if (st.size > 150 * 1024 * 1024) throw new Error(`file too large (${st.size} bytes)`);
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(absPath);
    stream.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on("error", reject);
    stream.on("end", () => resolve());
  });
  return Buffer.concat(chunks);
}

async function main() {
  if (!spacesConfigured()) {
    console.error(spacesSetupMessage());
    process.exit(1);
  }

  const args = parseArgs();
  console.log(`Indexing audio under ${path.resolve(args.root)} …`);
  const files = await indexAudioFiles(args);
  console.log(
    `Indexed ${files.length} candidate file(s)` +
      (args.allowMp3Master ? " (wav/aiff/mp3)" : " (wav/aiff only)"),
  );

  let rows = db
    .select({
      id: tracks.id,
      workingTitle: tracks.workingTitle,
      libraryTitle: tracks.libraryTitle,
      masterObjectKey: tracks.masterObjectKey,
      trashedAt: tracks.trashedAt,
    })
    .from(tracks)
    .all()
    .filter((r) => !r.trashedAt && !(r.masterObjectKey || "").trim());

  if (args.trackId) {
    const id = args.trackId.toLowerCase();
    rows = rows.filter((r) => r.id.toLowerCase() === id);
  }
  if (args.limit) rows = rows.slice(0, args.limit);

  console.log(
    args.dryRun
      ? `[dry-run] matching ${rows.length} track(s) without master…`
      : `Backfilling masters for ${rows.length} track(s)…`,
  );

  const matched: string[] = [];
  const ambiguous: string[] = [];
  const unmatched: string[] = [];
  let uploaded = 0;

  for (const row of rows) {
    const primary = (row.workingTitle || "").trim();
    const fallback = (row.libraryTitle || "").trim();
    let candidates = primary ? bestMatches(files, primary, args.minScore) : [];
    let usedTitle = primary;
    if (!candidates.length && fallback && fallback !== primary) {
      candidates = bestMatches(files, fallback, args.minScore);
      usedTitle = fallback;
    }

    if (!candidates.length) {
      unmatched.push(row.id);
      console.log(`  unmatched ${row.id}  title="${primary || fallback || "(none)"}"`);
      continue;
    }

    const best = candidates[0]!;
    const ties = candidates.filter((c) => c.score === best.score);
    if (ties.length > 1) {
      ambiguous.push(row.id);
      console.log(
        `  ambiguous ${row.id}  title="${usedTitle}"  score=${best.score}  (${ties.length} files)`,
      );
      for (const t of ties.slice(0, 5)) {
        console.log(`           - ${t.absPath}`);
      }
      continue;
    }

    const key = vaultMasterKey(row.id, masterExtFromHint(best.absPath));
    console.log(
      `  match ${row.id}  title="${usedTitle}"  score=${best.score}  → ${best.absPath}  → ${key}`,
    );
    matched.push(row.id);

    if (args.dryRun) continue;

    try {
      const bytes = await readFileBuffer(best.absPath);
      const ext = masterExtFromHint(best.absPath);
      await uploadObject(key, bytes, contentTypeForMasterExt(ext));
      db.update(tracks)
        .set({ masterObjectKey: key, updatedAt: new Date().toISOString() })
        .where(eq(tracks.id, row.id))
        .run();
      uploaded += 1;
      console.log(`    OK uploaded (${bytes.length} bytes)`);
    } catch (err) {
      console.error(`    FAIL ${row.id}:`, err instanceof Error ? err.message : err);
      // Treat failed upload as unmatched for the summary counts of success.
      matched.pop();
      unmatched.push(row.id);
    }
  }

  console.log("\n--- report ---");
  console.log(`matched:    ${matched.length}${args.dryRun ? " (dry-run, not uploaded)" : ` (uploaded ${uploaded})`}`);
  console.log(`ambiguous:  ${ambiguous.length} (not uploaded)`);
  console.log(`unmatched:  ${unmatched.length}`);
  if (ambiguous.length) console.log(`ambiguous ids: ${ambiguous.join(", ")}`);
  if (unmatched.length && unmatched.length <= 80) {
    console.log(`unmatched ids: ${unmatched.join(", ")}`);
  } else if (unmatched.length) {
    console.log(`unmatched ids (first 80): ${unmatched.slice(0, 80).join(", ")} …`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
