import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { dbPath, sqlite } from "@/db";
import { normalizeLicenseStatus } from "@/lib/tracks";

const BPM_SLACK = 8;

function secretEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Read KEY=value from Application-root env files (cPanel File Manager fallback). */
function readEnvFileValue(name: string): string {
  const files = [".env.local", ".env.production", ".env"];
  for (const file of files) {
    try {
      const full = path.join(process.cwd(), file);
      if (!existsSync(full)) continue;
      const text = readFileSync(full, "utf8");
      const match = text.match(new RegExp(`^${name}=(.*)$`, "m"));
      if (!match) continue;
      let value = match[1].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (value) return value;
    } catch {
      // try next file
    }
  }
  return "";
}

/**
 * Prefer process env; fall back to Application-root .env* files.
 * cPanel "Add Variables" sometimes does not appear in Passenger process.env.
 */
export function catalogApiKey(): string {
  const fromEnv = String(process.env["CATALOG_API_KEY"] || "").trim();
  if (fromEnv) return fromEnv;
  return readEnvFileValue("CATALOG_API_KEY");
}

function catalogHmacSecret(): string {
  const fromEnv = String(process.env["CATALOG_HMAC_SECRET"] || "").trim();
  if (fromEnv) return fromEnv;
  const fromFile = readEnvFileValue("CATALOG_HMAC_SECRET");
  if (fromFile) return fromFile;
  return catalogApiKey();
}

export function isPartnerClearTrack(track: { license?: string | null }): boolean {
  return normalizeLicenseStatus(track.license) === "clear";
}

export function authorizeCatalogSearch(
  req: NextRequest,
): { ok: true } | { ok: false; status: number; error: string } {
  const expected = catalogApiKey();
  if (!expected) {
    return { ok: false, status: 503, error: "Catalog partner API is not configured" };
  }

  const header = req.headers.get("authorization") || "";
  const bearer = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
  const alt = req.headers.get("x-catalog-api-key")?.trim() || "";
  const provided = bearer || alt;
  if (!provided || !secretEqual(provided, expected)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true };
}

export function catalogPlaySignature(trackId: string): string {
  const secret = catalogHmacSecret();
  if (!secret) return "";
  return createHmac("sha256", secret).update(trackId.trim()).digest("hex");
}

export function verifyCatalogPlaySignature(trackId: string, sig: string | null | undefined): boolean {
  const expected = catalogPlaySignature(trackId);
  const got = String(sig || "").trim().toLowerCase();
  if (!expected || !got) return false;
  return secretEqual(got, expected.toLowerCase());
}

/** Public site origin for playUrl (Passenger often exposes 127.0.0.1 as request origin). */
export function catalogPublicOrigin(fallbackOrigin: string): string {
  const fromEnv = String(process.env["BETTER_AUTH_URL"] || "").trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  const fromFile = readEnvFileValue("BETTER_AUTH_URL").replace(/\/+$/, "");
  if (fromFile) return fromFile;
  return String(fallbackOrigin || "").replace(/\/+$/, "");
}

export function catalogPlayUrl(origin: string, trackId: string): string {
  const base = catalogPublicOrigin(origin);
  const sig = catalogPlaySignature(trackId);
  const params = new URLSearchParams({ id: trackId, sig });
  return `${base}/api/catalog/audio?${params.toString()}`;
}

/**
 * Raw inventory for the DB this process opened (Bearer + ?diag=1).
 * Used to catch Passenger cwd / wrong attic.db vs Browse Clear count.
 */
export function partnerLicenseInventory(): {
  cwd: string;
  dbPath: string;
  dbExists: boolean;
  active: number;
  clearExact: number;
  clearNormalized: number;
  byLicense: Array<{ license: string; count: number }>;
} {
  const active = Number(
    (sqlite.prepare(`SELECT COUNT(*) AS c FROM tracks WHERE trashed_at IS NULL`).get() as { c: number })
      ?.c ?? 0,
  );
  const clearExact = Number(
    (
      sqlite
        .prepare(`SELECT COUNT(*) AS c FROM tracks WHERE trashed_at IS NULL AND license = 'Clear'`)
        .get() as { c: number }
    )?.c ?? 0,
  );
  const clearNormalized = Number(
    (
      sqlite
        .prepare(
          `SELECT COUNT(*) AS c FROM tracks WHERE trashed_at IS NULL
           AND lower(trim(coalesce(license, ''))) NOT IN (
             'library', 'library [available]', 'exclusive', 'on hold', 'hold', 'personal'
           )`,
        )
        .get() as { c: number }
    )?.c ?? 0,
  );
  const byLicense = (
    sqlite
      .prepare(
        `SELECT coalesce(license, '') AS license, COUNT(*) AS count
         FROM tracks WHERE trashed_at IS NULL
         GROUP BY coalesce(license, '')
         ORDER BY count DESC`,
      )
      .all() as Array<{ license: string; count: number }>
  ).map((row) => ({ license: row.license || "(empty)", count: Number(row.count) }));

  return {
    cwd: process.cwd(),
    dbPath,
    dbExists: existsSync(dbPath),
    active,
    clearExact,
    clearNormalized,
    byLicense,
  };
}

/** Optional `bpm` is a centre tempo; explicit min/max win when set. */
export function partnerBpmRange(params: URLSearchParams): { bpmMin?: number; bpmMax?: number } {
  // params.get() is null when absent — Number(null) === 0, which must not become a filter.
  const minParam = params.get("bpmMin");
  const maxParam = params.get("bpmMax");
  const minRaw =
    minParam != null && minParam.trim() !== "" ? Number(minParam) : Number.NaN;
  const maxRaw =
    maxParam != null && maxParam.trim() !== "" ? Number(maxParam) : Number.NaN;
  const hasMin = Number.isFinite(minRaw);
  const hasMax = Number.isFinite(maxRaw);
  if (hasMin || hasMax) {
    return {
      bpmMin: hasMin ? Math.floor(minRaw) : undefined,
      bpmMax: hasMax ? Math.floor(maxRaw) : undefined,
    };
  }

  const bpmParam = params.get("bpm");
  const centre =
    bpmParam != null && bpmParam.trim() !== "" ? Number(bpmParam) : Number.NaN;
  if (!Number.isFinite(centre) || centre <= 0) return {};
  const bpm = Math.round(centre);
  return { bpmMin: Math.max(1, bpm - BPM_SLACK), bpmMax: bpm + BPM_SLACK };
}
