import { licenseLabel, normalizeLicenseStatus } from "@/lib/tracks";

export function LicenseBadge({ license }: { license?: string | null }) {
  const status = normalizeLicenseStatus(license);
  const color =
    status === "clear"
      ? "text-[var(--available)] border-[rgba(34,197,94,0.35)] bg-[rgba(34,197,94,0.12)]"
      : status === "library"
        ? "text-[var(--library)] border-[rgba(52,211,153,0.4)] bg-[rgba(52,211,153,0.12)]"
        : status === "exclusive"
          ? "text-[var(--exclusive)] border-[rgba(245,158,11,0.35)] bg-[rgba(245,158,11,0.12)]"
          : status === "personal"
            ? "text-[var(--personal)] border-[rgba(167,139,250,0.4)] bg-[rgba(167,139,250,0.14)]"
            : "text-[var(--hold)] border-[rgba(56,189,248,0.4)] bg-[rgba(56,189,248,0.14)]";

  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] ${color}`}
    >
      {licenseLabel(license)}
    </span>
  );
}
