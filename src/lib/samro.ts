/** SAMRO PRO submission flag and Prepare PRO helpers. Client-safe — no DB imports. */

import { formatDisplayTitle } from "@/lib/tracks";
import type { TrackListItem } from "@/lib/track-list-item";

export function isSamroSubmitted(value: string | null | undefined): boolean {
  const v = (value || "").trim().toLowerCase();
  return v === "yes" || v === "y" || v === "true" || v === "1";
}

export type SamroFilter = "yes" | "no" | "prepare" | "all";

export function parseSamroFilter(value: string | null | undefined): SamroFilter {
  if (value === "yes" || value === "no" || value === "prepare") return value;
  return "all";
}

export type SamroProProfile = {
  name: string;
  /** Prefer PA IPI Name Number for rights-holder IPI column. */
  ipiNumber: string;
  ipiBaseNumber?: string;
  relationNumber?: string;
};

export type SamroComposerSlot = {
  name: string;
  ipi: string;
  proSociety: string;
  perfShare: number;
};

export type SamroReadiness = {
  ready: boolean;
  missing: string[];
  title: string;
  /** Working title for SAMRO Sub-Title 1 when it differs from the original work title. */
  subtitle: string | null;
  publisher: string;
  /** Original artist field (may list multiple composers). */
  artist: string;
  /** Individual composer names for SAMRO rights-holder rows. */
  composers: string[];
  /** Rights holders with IPI and perf share for export. */
  composerSlots: SamroComposerSlot[];
  durationMin: number | null;
  durationSec: number | null;
  firstPublicationDate: string | null;
  origin: "SA" | "Foreign";
  territory: string;
  genre: "Light" | "Jingle" | "Serious";
  instrumentation: "Instrumental" | "Voice" | "Instrumental/Voice";
};

/** SAMRO sub-title cell is limited to 45 characters. */
export const SAMRO_SUBTITLE_MAX_LENGTH = 45;

/** SAMRO template supports up to 12 performance rights holders per work. */
export const SAMRO_MAX_RIGHTS_HOLDERS = 12;

/** Split track artist field into individual composer names. */
export function parseSamroComposers(raw: string | null | undefined): string[] {
  const text = (raw || "").trim();
  if (!text) return [];

  const parts = text
    .split(/\s*(?:[,;]|\s+and\s+|\s*&\s*)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const composers: string[] = [];
  for (const part of parts.length ? parts : [text]) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    composers.push(part);
  }
  return composers;
}

/** Evenly split 100% perf share across N composers (remainder on last holder). */
export function splitSamroPerfShare(holderCount: number): number[] {
  if (holderCount <= 0) return [];
  if (holderCount === 1) return [100];
  const base = Math.floor(100 / holderCount);
  const remainder = 100 - base * holderCount;
  return Array.from({ length: holderCount }, (_, index) =>
    index === holderCount - 1 ? base + remainder : base,
  );
}

/** Working title as SAMRO Sub-Title 1 when it differs from the original work title. */
export function samroWorkingSubtitle(
  track: Pick<TrackListItem, "libraryTitle" | "workingTitle" | "id">,
  originalTitle?: string,
): string | null {
  const working = (track.workingTitle || "").trim();
  if (!working) return null;
  const original = (originalTitle || formatDisplayTitle(track)).trim();
  if (!original || working.toLowerCase() === original.toLowerCase()) return null;
  return working.slice(0, SAMRO_SUBTITLE_MAX_LENGTH);
}

/** Parse "1:23", "0:42", "1.23", "83" (seconds) → min/sec. */
export function parseDurationParts(
  raw: string | null | undefined,
): { min: number; sec: number } | null {
  const text = (raw || "").trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) {
    const total = Number(text);
    if (!Number.isFinite(total) || total < 0) return null;
    return { min: Math.floor(total / 60), sec: total % 60 };
  }
  const m = text.match(/^(\d+)\s*[:.]\s*(\d{1,2})$/);
  if (!m) return null;
  const min = Number(m[1]);
  const sec = Number(m[2]);
  if (!Number.isFinite(min) || !Number.isFinite(sec) || sec > 59) return null;
  return { min, sec };
}

function mapSamroGenre(track: TrackListItem): "Light" | "Jingle" | "Serious" {
  const blob = `${track.genre || ""} ${track.attributes || ""} ${track.mood || ""}`.toLowerCase();
  if (/\bjingle\b|\bad\b|\badvert/.test(blob)) return "Jingle";
  if (/\bserious\b|\bclassical\b|\borchestral\b/.test(blob)) return "Serious";
  return "Light";
}

function mapInstrumentation(track: TrackListItem): "Instrumental" | "Voice" | "Instrumental/Voice" {
  const blob = `${track.instruments || ""} ${track.attributes || ""} ${track.genre || ""}`.toLowerCase();
  const hasVoice = /\bvoice\b|\bvocal\b|\bsing|\blyric/.test(blob);
  const hasInst = /\binstrument/.test(blob) || Boolean((track.instruments || "").trim());
  if (hasVoice && hasInst) return "Instrumental/Voice";
  if (hasVoice) return "Voice";
  return "Instrumental";
}

function firstPublicationDate(track: TrackListItem): string | null {
  const raw = (track.date || "").trim();
  if (raw) {
    const iso = Date.parse(raw);
    if (!Number.isNaN(iso)) {
      const d = new Date(iso);
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const day = String(d.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }
    const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
    const human = raw.match(/^(\d{1,2})\s+(\w+)\s+(\d{4})/i);
    if (human) {
      const months: Record<string, string> = {
        jan: "01",
        feb: "02",
        mar: "03",
        apr: "04",
        may: "05",
        jun: "06",
        jul: "07",
        aug: "08",
        sep: "09",
        oct: "10",
        nov: "11",
        dec: "12",
      };
      const mon = months[human[2].slice(0, 3).toLowerCase()];
      if (mon) return `${human[3]}-${mon}-${human[1].padStart(2, "0")}`;
    }
  }
  if (track.year && track.year > 1900) return `${track.year}-01-01`;
  const created = (track.createdAt || "").trim();
  if (created.length >= 10) return created.slice(0, 10);
  return null;
}

function slotsFromLegacyArtist(
  artist: string,
  profile: SamroProProfile,
): SamroComposerSlot[] {
  const names = parseSamroComposers(artist);
  if (!names.length) return [];
  const shares = splitSamroPerfShare(names.length);
  const profileIpi = (profile.ipiNumber || "").trim();

  return names.map((name, index) => ({
    name,
    ipi: index === 0 ? profileIpi : "",
    proSociety: "SAMRO",
    perfShare: shares[index],
  }));
}

function validateComposerSlots(
  slots: SamroComposerSlot[],
  missing: string[],
): void {
  if (!slots.length) {
    missing.push("artist / composer");
    return;
  }
  if (slots.length > SAMRO_MAX_RIGHTS_HOLDERS) {
    missing.push(`max ${SAMRO_MAX_RIGHTS_HOLDERS} composers`);
  }
  const total = slots.reduce((sum, slot) => sum + slot.perfShare, 0);
  if (total !== 100) {
    missing.push(`perf share totals ${total}% (must be 100%)`);
  }
  for (const slot of slots) {
    if (!slot.ipi.trim()) {
      missing.push(`composer IPI: ${slot.name}`);
    }
  }
}

/**
 * Assess whether a track can be included on a SAMRO Notification of Works form.
 * Prefer `track.composerSlots` from the server (registry + custom shares).
 * Fallback: parse `tracks.artist` with even shares (house IPI on the first holder).
 */
export function assessSamroReadiness(
  track: TrackListItem,
  profile: SamroProProfile,
): SamroReadiness {
  const missing: string[] = [];
  const title = formatDisplayTitle(track).trim();
  const publisher = (track.publisher || "").trim();
  const artist = (track.artist || "").trim();
  const parts = parseDurationParts(track.duration);
  const firstPub = firstPublicationDate(track);

  const composerSlots = track.composerSlots?.length
    ? track.composerSlots
    : slotsFromLegacyArtist(artist, profile);
  const composers = composerSlots.map((slot) => slot.name);

  if (!title) missing.push("title");
  if (!parts) missing.push("duration");
  if (!publisher) missing.push("publisher");
  if (!firstPub) missing.push("first publication date");
  validateComposerSlots(composerSlots, missing);

  return {
    ready: missing.length === 0,
    missing,
    title,
    subtitle: samroWorkingSubtitle(track, title),
    publisher,
    artist,
    composers,
    composerSlots,
    durationMin: parts?.min ?? null,
    durationSec: parts?.sec ?? null,
    firstPublicationDate: firstPub,
    origin: "SA",
    territory: "World",
    genre: mapSamroGenre(track),
    instrumentation: mapInstrumentation(track),
  };
}
