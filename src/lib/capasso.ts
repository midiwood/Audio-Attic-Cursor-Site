/** Capasso SWI mechanical registration — client-safe, no DB imports. */

import { parsePublisherNames } from "@/lib/publisher-shared";
import { formatDisplayTitle, normalizeLicenseStatus } from "@/lib/tracks";
import { samroWorkingSubtitle, type SamroComposerSlot } from "@/lib/samro";
import type { TrackListItem } from "@/lib/track-list-item";

export const CAPASSO_PR_SOC = "SAMRO";
export const CAPASSO_MR_SOC = "CAPASSO";
export const CAPASSO_TERRITORY = "2WL";
export const CAPASSO_WRITER_ROLE = "C";

export function isCapassoSubmitted(value: string | null | undefined): boolean {
  const v = (value || "").trim().toLowerCase();
  return v === "yes" || v === "y" || v === "true" || v === "1";
}

export type CapassoFilter = "yes" | "no" | "prepare" | "all";

export function parseCapassoFilter(value: string | null | undefined): CapassoFilter {
  if (value === "yes" || value === "no" || value === "prepare") return value;
  return "all";
}

/** Capasso SWI is for licensed catalog works — not Clear or Personal. */
export function isCapassoEligibleLicense(license: string | null | undefined): boolean {
  const status = normalizeLicenseStatus(license);
  return status === "library" || status === "exclusive" || status === "hold";
}

export type CapassoProProfile = {
  houseName: string;
  caaNumber: string;
  ipiNumber: string;
};

export type CapassoWriter = {
  name: string;
  firstName: string;
  lastName: string;
  ipi: string;
  prSoc: string;
  mrSoc: string;
  role: string;
  copyrightShare: number;
};

export type CapassoReadiness = {
  ready: boolean;
  missing: string[];
  title: string;
  subtitle: string | null;
  publisher: string;
  publisherNames: string[];
  publisherCount: number;
  /** House share of publishing: 100 / number of listed publishers. */
  publisherShare: number;
  artist: string;
  writers: CapassoWriter[];
};

/** Last whitespace token = last name; remainder = first name. */
export function splitWriterName(displayName: string): {
  firstName: string;
  lastName: string;
} {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: "", lastName: parts[0] };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

/** Split a catalog publisher field into co-publishers. */
export function parseCapassoPublishers(
  publisher: string | null | undefined,
  houseName?: string,
): string[] {
  const primary = parsePublisherNames(publisher);
  const house = (houseName || "").trim().toLowerCase();
  if (!house || primary.some((part) => part.toLowerCase() === house)) return primary;

  const expanded: string[] = [];
  for (const token of primary) {
    const segs = token
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);
    if (segs.length > 1 && segs.some((seg) => seg.toLowerCase() === house)) {
      expanded.push(...segs);
    } else {
      expanded.push(token);
    }
  }
  return parsePublisherNames(expanded.join(", "));
}

export function isHousePublisher(
  publisher: string | null | undefined,
  houseName: string,
): boolean {
  const house = houseName.trim().toLowerCase();
  if (!house) return false;
  return parseCapassoPublishers(publisher, houseName).some(
    (part) => part.toLowerCase() === house,
  );
}

/** Equal split across listed publishers; only the house share is submitted. */
export function housePublisherShare(
  publisher: string | null | undefined,
  houseName: string,
): number {
  const names = parseCapassoPublishers(publisher, houseName);
  const house = houseName.trim().toLowerCase();
  if (!house || !names.some((part) => part.toLowerCase() === house)) return 0;
  const count = names.length;
  if (count <= 1) return 100;
  return Math.round((100 / count) * 100) / 100;
}

export function formatCapassoPublisherShare(share: number): string {
  if (!Number.isFinite(share) || share <= 0) return "";
  const rounded = Math.round(share * 100) / 100;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
  return `${text}%`;
}

function houseWriterCae(
  writers: CapassoWriter[],
  profile?: CapassoProProfile,
): string {
  const mine = (profile?.ipiNumber || "").trim();
  if (mine && writers.some((w) => w.ipi === mine)) return mine;
  const fromTrack = writers.find((w) => w.ipi)?.ipi || "";
  return mine || fromTrack;
}

/** One SWI writer block per track — names stay together; share is publisher split. */
export function capassoWriterRowFields(
  readiness: CapassoReadiness,
  profile?: CapassoProProfile,
): {
  lastName: string;
  firstName: string;
  ipi: string;
} {
  const writers = readiness.writers.filter((w) => w.name.trim());
  const ipi = houseWriterCae(writers, profile);
  if (writers.length === 1) {
    const writer = writers[0];
    return {
      lastName: writer.lastName || writer.name,
      firstName: writer.firstName,
      ipi: writer.ipi || ipi,
    };
  }
  if (writers.length > 1) {
    return {
      lastName: writers.map((w) => w.name.trim()).join(" / "),
      firstName: "",
      ipi,
    };
  }
  const fallback = splitWriterName(readiness.artist);
  return {
    lastName: fallback.lastName || readiness.artist.trim(),
    firstName: fallback.firstName,
    ipi,
  };
}

function writersFromSlots(slots: SamroComposerSlot[]): CapassoWriter[] {
  return slots.map((slot) => {
    const { firstName, lastName } = splitWriterName(slot.name);
    return {
      name: slot.name,
      firstName,
      lastName,
      ipi: (slot.ipi || "").trim(),
      prSoc: CAPASSO_PR_SOC,
      mrSoc: CAPASSO_MR_SOC,
      role: CAPASSO_WRITER_ROLE,
      copyrightShare: slot.perfShare,
    };
  });
}

export function assessCapassoReadiness(
  track: TrackListItem,
  profile: CapassoProProfile,
): CapassoReadiness {
  const missing: string[] = [];
  const title = formatDisplayTitle(track).trim();
  const publisher = (track.publisher || "").trim();
  const artist = (track.artist || "").trim();
  const house = profile.houseName.trim();
  const caa = profile.caaNumber.trim();
  const publisherIpi = profile.ipiNumber.trim();

  const slots = track.composerSlots || [];
  const writers = writersFromSlots(slots);
  const publisherNames = parseCapassoPublishers(publisher, house);
  const publisherShare = housePublisherShare(publisher, house);
  const publisherCount = publisherNames.length;

  if (!title) missing.push("title");
  if (!isCapassoEligibleLicense(track.license)) {
    missing.push("license must be Library, Exclusive, or On Hold (not Clear or Personal)");
  }
  if (!house) missing.push("house publisher (Admin → Publisher / PRO)");
  else if (!isHousePublisher(publisher, house)) {
    missing.push(`publisher must include ${house}`);
  }
  if (!caa) missing.push("Capasso CAA number");
  if (!publisherIpi) missing.push("publisher PA IPI");
  if (!artist && !writers.length) missing.push("artist / composer");

  return {
    ready: missing.length === 0,
    missing,
    title,
    subtitle: samroWorkingSubtitle(track, title),
    publisher,
    publisherNames,
    publisherCount,
    publisherShare,
    artist,
    writers,
  };
}
