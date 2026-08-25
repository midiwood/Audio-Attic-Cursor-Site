"use client";

import { MetaSuggestInput } from "@/components/meta-suggest-input";
import {
  emptyLicenseScopeForm,
  LicenseScopeFields,
  type LicenseScopeFormValue,
} from "@/components/license-scope-fields";
import { perpetuityFromDuration } from "@/lib/license-scope";
import type { CatalogMetaSuggestions } from "@/lib/queries";

const fieldClass =
  "w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]";

/** Same fields as Add license — client, scope, date; end date when not perpetuity. */
export type LicenseEntryFormValue = {
  client: string;
  licensedAt: string;
  perpetuity: string;
  expiresAt: string;
} & LicenseScopeFormValue;

export function emptyLicenseEntryForm(
  prefill?: Partial<LicenseEntryFormValue>,
): LicenseEntryFormValue {
  return {
    client: "",
    licensedAt: new Date().toISOString().slice(0, 10),
    perpetuity: "",
    expiresAt: "",
    ...emptyLicenseScopeForm(),
    ...prefill,
  };
}

function isPerpetuityDuration(duration: string) {
  return String(duration || "").trim().toLowerCase() === "perpetuity";
}

export function LicenseEntryFormFields({
  value,
  onChange,
  metaSuggestions,
  projectLabel = "Used for",
  projectPlaceholder = "Campaign, project, placement…",
  notesPlaceholder = "Extras, fee notes…",
}: {
  value: LicenseEntryFormValue;
  onChange: (next: LicenseEntryFormValue) => void;
  metaSuggestions?: CatalogMetaSuggestions;
  projectLabel?: string;
  projectPlaceholder?: string;
  notesPlaceholder?: string;
  /** @deprecated Ignored — term details no longer collapsed. */
  defaultShowAdvanced?: boolean;
}) {
  function patch(partial: Partial<LicenseEntryFormValue>) {
    onChange({ ...value, ...partial });
  }

  const needsEndDate = Boolean(value.duration.trim()) && !isPerpetuityDuration(value.duration);

  return (
    <div className="space-y-2.5">
      <label className="block">
        <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
          Client
        </span>
        <MetaSuggestInput
          value={value.client}
          onChange={(client) => patch({ client })}
          suggestions={metaSuggestions?.clients || []}
          placeholder="Who licensed it"
        />
      </label>
      <LicenseScopeFields
        value={{
          territory: value.territory,
          media: value.media,
          duration: value.duration,
          branding: value.branding,
          project: value.project,
          notes: value.notes,
        }}
        onChange={(scope) => {
          const nextDuration = scope.duration;
          patch({
            territory: scope.territory,
            media: scope.media,
            duration: nextDuration,
            branding: scope.branding,
            project: scope.project,
            notes: scope.notes,
            perpetuity: perpetuityFromDuration(nextDuration) || (nextDuration.trim() ? "No" : ""),
            expiresAt: isPerpetuityDuration(nextDuration) ? "" : value.expiresAt,
          });
        }}
        projectLabel={projectLabel}
        projectPlaceholder={projectPlaceholder}
        projectSuggestions={metaSuggestions?.projects || []}
        notesPlaceholder={notesPlaceholder}
      />
      <label className="block">
        <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
          Start date
        </span>
        <input
          type="date"
          className={fieldClass}
          value={value.licensedAt}
          onChange={(e) => patch({ licensedAt: e.target.value })}
          required
        />
      </label>

      {needsEndDate ? (
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
            End date
          </span>
          <input
            type="date"
            className={fieldClass}
            value={/^\d{4}-\d{2}-\d{2}$/.test(value.expiresAt) ? value.expiresAt : ""}
            onChange={(e) =>
              patch({
                expiresAt: e.target.value,
                perpetuity: "No",
              })
            }
            required
          />
          {value.expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(value.expiresAt) ? (
            <p className="mt-1 text-[10px] text-[var(--ink-dim)]">
              Prior value: {value.expiresAt} — pick a date to replace
            </p>
          ) : null}
        </label>
      ) : null}
    </div>
  );
}

export function licenseEntryToApiPayload(form: LicenseEntryFormValue) {
  const fromDuration = perpetuityFromDuration(form.duration);
  const perpetuity =
    fromDuration ||
    (form.duration.trim() ? "No" : form.perpetuity.trim() || "");
  return {
    client: form.client,
    usedFor: form.project,
    territory: form.territory,
    media: form.media,
    duration: form.duration,
    branding: form.branding || "",
    notes: form.notes,
    licensedAt: form.licensedAt,
    perpetuity,
    expiresAt: perpetuity === "No" ? form.expiresAt : "",
  };
}
