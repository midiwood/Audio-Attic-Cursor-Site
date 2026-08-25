/** Structured license scope — presets + helpers. */

export const LICENSE_TERRITORY_OPTIONS = [
  "South Africa",
  "Africa",
  "Worldwide",
  "Europe",
  "USA",
  "UK",
] as const;

export const LICENSE_MEDIA_OPTIONS = [
  "TV",
  "Online",
  "Film",
  "Doccie",
  "Netflix",
  "SABC",
  "Advertising",
  "Social",
  "Radio",
  "Podcast",
] as const;

export const LICENSE_DURATION_OPTIONS = [
  "4 weeks",
  "12 weeks",
  "6 months",
  "1 year",
  "Perpetuity",
] as const;

export const LICENSE_BRANDING_OPTIONS = [
  "Unbranded",
  "Branded",
  "Co-branded",
] as const;

export type LicenseScopeFields = {
  territory: string;
  media: string;
  duration: string;
  branding: string;
};

export function emptyLicenseScope(): LicenseScopeFields {
  return { territory: "", media: "", duration: "", branding: "" };
}

export function formatLicenseScopeSummary(
  fields: Partial<LicenseScopeFields> & { scope?: string | null },
): string {
  const parts = [fields.media, fields.territory, fields.duration]
    .map((p) => String(p || "").trim())
    .filter(Boolean);
  if (parts.length) return parts.join(" · ");
  return String(fields.scope || "").trim();
}

export function normalizeLicenseScopeInput(
  input: Partial<LicenseScopeFields>,
): LicenseScopeFields | { error: string } {
  const territory = String(input.territory || "").trim();
  const media = String(input.media || "").trim();
  const duration = String(input.duration || "").trim();
  const branding = String(input.branding || "").trim();
  if (!territory) return { error: "Territory is required" };
  if (!media) return { error: "Media is required" };
  if (!duration) return { error: "Duration is required" };
  return { territory, media, duration, branding };
}

/** When duration is Perpetuity, staff perpetuity flag should be Yes. */
export function perpetuityFromDuration(duration: string): string | null {
  return String(duration || "").trim().toLowerCase() === "perpetuity" ? "Yes" : null;
}
