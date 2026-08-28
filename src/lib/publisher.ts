/** House publisher + self-published / availability helpers (server). */

import { getPublisherRuntimeConfig } from "@/lib/site-settings";
import type { SamroProProfile } from "@/lib/samro";
import {
  canIssueSyncLicenses as canIssueSyncLicensesShared,
  isSubscriberVisibleWithHouse,
} from "@/lib/publisher-shared";

export {
  isSelfPublished,
  canIssueSyncLicenses as canIssueSyncLicensesWithHouse,
} from "@/lib/publisher-shared";

/** Server: House publisher from Admin site settings. */
export function getHousePublisherName(): string {
  return getPublisherRuntimeConfig().houseName.trim();
}

/** Subscribers see Clear / Library tracks (Exclusive, On Hold, and Personal stay staff-only). */
export function isSubscriberVisible(track: {
  publisher?: string | null;
  license?: string | null;
}): boolean {
  return isSubscriberVisibleWithHouse(track);
}

/**
 * When staff may add a sync license entry.
 * Clear = none; Library = multi; Exclusive = at most one.
 * Omitting `houseName` reads Admin house publisher (server only).
 */
export function canIssueSyncLicenses(
  track: {
    publisher?: string | null;
    license?: string | null;
  },
  houseName?: string,
  opts?: { existingCount?: number },
): boolean {
  return canIssueSyncLicensesShared(
    track,
    houseName ?? getHousePublisherName(),
    opts,
  );
}

/** PRO / SAMRO profile from Admin publisher settings (not user Profile). */
export function getSamroProProfileFromSiteSettings(): SamroProProfile {
  const cfg = getPublisherRuntimeConfig();
  const ipiNumber =
    cfg.proPaIpiNameNumber.trim() || cfg.proIpiBaseNumber.trim();
  return {
    name: cfg.houseName.trim(),
    ipiNumber,
    ipiBaseNumber: cfg.proIpiBaseNumber.trim() || undefined,
    relationNumber: cfg.proRelationNumber.trim() || undefined,
  };
}
