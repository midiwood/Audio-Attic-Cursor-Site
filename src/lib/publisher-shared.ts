/** Pure publisher helpers — safe for client components (no DB / fs). */

import { isAvailableLicense, normalizeLicenseStatus } from "@/lib/tracks";

/**
 * Track publisher equals House publisher (trim, case-insensitive).
 * Pass `houseName` from the server when calling from client components.
 */
export function isSelfPublished(
  trackPublisher: string | null | undefined,
  houseName: string,
): boolean {
  const house = houseName.trim().toLowerCase();
  if (!house) return false;
  return (trackPublisher || "").trim().toLowerCase() === house;
}

/**
 * When staff may add a sync license entry.
 * Clear = none; Library = multiple non-exclusive; Exclusive = at most one.
 * `houseName` is required (no server settings lookup).
 */
export function canIssueSyncLicenses(
  track: {
    publisher?: string | null;
    license?: string | null;
  },
  houseName: string,
  opts?: { existingCount?: number },
): boolean {
  if (!isSelfPublished(track.publisher, houseName)) return false;
  const status = normalizeLicenseStatus(track.license);
  if (status === "library") return true;
  if (status === "exclusive") {
    const count = opts?.existingCount ?? 0;
    return count < 1;
  }
  return false;
}

/** Pure check — subscribers see Clear / Library tracks (any publisher). */
export function isSubscriberVisibleWithHouse(
  track: {
    publisher?: string | null;
    license?: string | null;
  },
  _houseName?: string,
): boolean {
  return isAvailableLicense(track.license);
}
