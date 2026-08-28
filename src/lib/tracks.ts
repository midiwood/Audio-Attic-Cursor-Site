/** Canonical stored license values. Unknown / empty defaults to Clear. */
export const LICENSE_OPTIONS = ["Clear", "Library", "Exclusive", "On Hold", "Personal"] as const;
export type LicenseOption = (typeof LICENSE_OPTIONS)[number];
export type LicenseStatus = "clear" | "library" | "exclusive" | "hold" | "personal";

export function normalizeLicenseStatus(license: string | null | undefined): LicenseStatus {
  const value = (license ?? "").trim().toLowerCase();
  if (
    !value ||
    value === "clear" ||
    value === "none" ||
    value === "none [available]" ||
    value === "available"
  ) {
    return "clear";
  }
  if (value === "library" || value === "library [available]") {
    return "library";
  }
  if (value === "exclusive") {
    return "exclusive";
  }
  if (value === "on hold" || value === "hold") {
    return "hold";
  }
  if (value === "personal") {
    return "personal";
  }
  // Legacy "[Available]" without Library → Clear; anything else → Clear
  if (value.includes("[available]")) {
    return "clear";
  }
  return "clear";
}

/** Clear + Library are open for licensing (subscriber-visible). */
export function isAvailableLicense(license: string | null | undefined): boolean {
  const status = normalizeLicenseStatus(license);
  return status === "clear" || status === "library";
}

/** Personal tracks are staff-only — hidden from subscribers and guest playlists. */
export function isPersonalLicense(license: string | null | undefined): boolean {
  return normalizeLicenseStatus(license) === "personal";
}

export function licenseLabel(license: string | null | undefined): string {
  const status = normalizeLicenseStatus(license);
  if (status === "clear") return "Clear";
  if (status === "library") return "Library";
  if (status === "exclusive") return "Exclusive";
  if (status === "personal") return "Personal";
  return "On Hold";
}

/** Select option label; stored value stays Clear / Library / Exclusive / On Hold / Personal. */
export function licenseOptionLabel(option: LicenseOption): string {
  return option;
}

/** Persist only the canonical tags. */
export function canonicalizeLicense(license: string | null | undefined): LicenseOption {
  const status = normalizeLicenseStatus(license);
  if (status === "library") return "Library";
  if (status === "exclusive") return "Exclusive";
  if (status === "hold") return "On Hold";
  if (status === "personal") return "Personal";
  return "Clear";
}

/** Which license-related fields to show for Library / Exclusive / On Hold vs Clear / Personal. */
export function licenseFieldVisibility(license: string | null | undefined) {
  const status = normalizeLicenseStatus(license);
  if (status === "exclusive" || status === "hold" || status === "library") {
    return { detail: true, perpetuity: status === "exclusive" || status === "library" };
  }
  return { detail: false, perpetuity: false };
}

export function splitTags(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function toDropboxDlUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);

    if (parsed.hostname.includes("dropbox.com")) {
      // Keep rlkey and other query params; force direct download/play.
      if (parsed.hostname.includes("www.dropbox.com") || parsed.hostname === "dropbox.com") {
        parsed.hostname = "dl.dropboxusercontent.com";
      }
      parsed.searchParams.set("dl", "1");
      parsed.searchParams.delete("raw");
      return parsed.toString();
    }

    return trimmed;
  } catch {
    return trimmed;
  }
}

export function extractDropboxLinks(raw: string): string[] {
  const matches = raw.match(/https?:\/\/[^\s<>"']+/gi) || [];
  const cleaned = matches
    .map((url) => url.replace(/[),.;]+$/g, "").trim())
    .filter((url) => /dropbox\.com/i.test(url));
  return [...new Set(cleaned)];
}

export function parseYear(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "number" ? value : Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(num) ? num : null;
}

export function parseBpm(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "number" ? value : Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(num) ? num : null;
}

/** Normalize AI/user musical key to a short form like "Am", "C#m", "F major". */
export function normalizeMusicalKey(value: string | null | undefined): string {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const cleaned = raw
    .replace(/♭/g, "b")
    .replace(/♯/g, "#")
    .replace(/\s+/g, " ")
    .trim();

  const match = cleaned.match(
    /^([A-Ga-g])\s*([#b]?)\s*(?:[-–—]?\s*)(major|minor|maj|min|m)?$/i,
  );
  if (!match) return cleaned;

  const note = match[1].toUpperCase();
  const accidental = match[2] || "";
  const quality = (match[3] || "").toLowerCase();

  if (!quality || quality === "major" || quality === "maj") {
    return `${note}${accidental}`;
  }
  if (quality === "minor" || quality === "min" || quality === "m") {
    return `${note}${accidental}m`;
  }
  return cleaned;
}

export function nextTrackId(existingIds: string[]): string {
  let max = 0;
  for (const id of existingIds) {
    const match = /^(?:id|rjv)(\d+)$/i.exec(id.trim());
    if (match) {
      max = Math.max(max, Number.parseInt(match[1], 10));
    }
  }
  return `rjv${String(max + 1).padStart(4, "0")}`;
}

export function filenameFromDropboxUrl(url: string): string {
  try {
    const parsed = new URL(url.trim());
    return decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "").trim();
  } catch {
    return "";
  }
}

export function titleFromFilename(filename: string): string {
  return filename
    .replace(/\.(mp3|wav|aiff|aif|flac|m4a|ogg|aac)$/i, "")
    .replace(/[_+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function titleFromDropboxUrl(url: string): string {
  return titleFromFilename(filenameFromDropboxUrl(url));
}

const AUDIO_EXT_LABELS: Record<string, string> = {
  mp3: "MP3",
  wav: "WAV",
  aiff: "AIFF",
  aif: "AIFF",
  flac: "FLAC",
  m4a: "M4A",
  ogg: "OGG",
  aac: "AAC",
};

/** Infer display file type (WAV, MP3, …) from Dropbox link / dl URL filename. */
export function audioFileTypeFromUrls(
  ...urls: Array<string | null | undefined>
): string | null {
  for (const url of urls) {
    if (!url?.trim()) continue;
    const name = filenameFromDropboxUrl(url);
    const match = name.match(/\.([a-z0-9]+)$/i);
    if (!match) continue;
    const ext = match[1].toLowerCase();
    if (AUDIO_EXT_LABELS[ext]) return AUDIO_EXT_LABELS[ext];
  }
  return null;
}

/** True if any URL/filename looks like an MP3. */
export function isMp3AudioUrl(...urls: Array<string | null | undefined>): boolean {
  for (const url of urls) {
    if (!url?.trim()) continue;
    const name = (filenameFromDropboxUrl(url) || url).toLowerCase();
    if (/\.mp3(?:$|\?)/i.test(name) || name.endsWith(".mp3")) return true;
  }
  return false;
}

/** Import accepts MP3, WAV, or AIFF (lossless formats are normalized to vault MP3 on ingest). */
export function isAllowedImportAudioUrl(...urls: Array<string | null | undefined>): boolean {
  for (const url of urls) {
    if (!url?.trim()) continue;
    const name = (filenameFromDropboxUrl(url) || url).toLowerCase();
    if (/\.(mp3|wav|aiff|aif)(?:$|\?)/i.test(name) || /\.(mp3|wav|aiff|aif)$/i.test(name)) {
      return true;
    }
  }
  return false;
}

export function mp3OnlyErrorMessage() {
  return "Only MP3, WAV, or AIFF files are accepted";
}

/** @deprecated use mp3OnlyErrorMessage — kept for call sites */
export function allowedImportAudioErrorMessage() {
  return mp3OnlyErrorMessage();
}

export function formatDisplayTitle(track: {
  libraryTitle?: string | null;
  workingTitle?: string | null;
  id: string;
}): string {
  return track.libraryTitle?.trim() || track.workingTitle?.trim() || track.id;
}
