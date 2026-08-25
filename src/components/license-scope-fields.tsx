"use client";

import { ComboboxInput } from "@/components/combobox-input";
import {
  LICENSE_DURATION_OPTIONS,
  LICENSE_MEDIA_OPTIONS,
  LICENSE_TERRITORY_OPTIONS,
  type LicenseScopeFields,
} from "@/lib/license-scope";

const fieldClass =
  "w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]";

export type LicenseScopeFormValue = LicenseScopeFields & {
  project: string;
  notes: string;
};

export function emptyLicenseScopeForm(): LicenseScopeFormValue {
  return {
    territory: "",
    media: "",
    duration: "",
    branding: "",
    project: "",
    notes: "",
  };
}

export function LicenseScopeFields({
  value,
  onChange,
  projectLabel = "Project",
  projectPlaceholder = "Campaign, project, or placement…",
  notesLabel = "Notes",
  notesPlaceholder = "Timing, extras…",
  notesOptional = true,
  projectSuggestions = [],
  showProject = true,
  showNotes = true,
}: {
  value: LicenseScopeFormValue;
  onChange: (next: LicenseScopeFormValue) => void;
  projectLabel?: string;
  projectPlaceholder?: string;
  notesLabel?: string;
  notesPlaceholder?: string;
  notesOptional?: boolean;
  projectSuggestions?: string[];
  showProject?: boolean;
  showNotes?: boolean;
}) {
  function patch(partial: Partial<LicenseScopeFormValue>) {
    onChange({ ...value, ...partial });
  }

  return (
    <div className="space-y-2.5">
      <div className="grid gap-2.5 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
            Media
          </span>
          <ComboboxInput
            value={value.media}
            onChange={(media) => patch({ media })}
            options={LICENSE_MEDIA_OPTIONS}
            placeholder="TV, Netflix, Doccie…"
            required
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
            Territory
          </span>
          <ComboboxInput
            value={value.territory}
            onChange={(territory) => patch({ territory })}
            options={LICENSE_TERRITORY_OPTIONS}
            placeholder="South Africa, Worldwide…"
            required
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
            Duration
          </span>
          <ComboboxInput
            value={value.duration}
            onChange={(duration) => patch({ duration })}
            options={LICENSE_DURATION_OPTIONS}
            placeholder="12 weeks, 1 year…"
            required
          />
        </label>
      </div>

      {showProject ? (
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
            {projectLabel}
          </span>
          {projectSuggestions.length ? (
            <ComboboxInput
              value={value.project}
              onChange={(project) => patch({ project })}
              options={projectSuggestions}
              placeholder={projectPlaceholder}
              required
            />
          ) : (
            <input
              className={fieldClass}
              value={value.project}
              onChange={(e) => patch({ project: e.target.value })}
              placeholder={projectPlaceholder}
              required
            />
          )}
        </label>
      ) : null}

      {showNotes ? (
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
            {notesLabel}
            {notesOptional ? (
              <span className="normal-case tracking-normal opacity-70"> (optional)</span>
            ) : null}
          </span>
          <textarea
            className={`${fieldClass} min-h-[56px] resize-y`}
            value={value.notes}
            onChange={(e) => patch({ notes: e.target.value })}
            placeholder={notesPlaceholder}
            required={!notesOptional}
          />
        </label>
      ) : null}
    </div>
  );
}

/** Compact chips for overview display. */
export function LicenseScopeChips({
  territory,
  media,
  duration,
  scope,
}: Partial<LicenseScopeFields> & { scope?: string | null }) {
  const chips = [
    media && { label: "Media", value: media },
    territory && { label: "Territory", value: territory },
    duration && { label: "Duration", value: duration },
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  if (!chips.length) {
    const fallback = String(scope || "").trim();
    if (!fallback) return null;
    return <span className="text-sm text-[var(--ink-muted)]">{fallback}</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <span
          key={chip.label}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--line)] bg-[rgba(0,0,0,0.2)] px-2 py-0.5 text-[11px] text-[var(--ink-muted)]"
          title={chip.label}
        >
          <span className="text-[var(--ink-dim)]">{chip.label}</span>
          <span className="font-medium text-[var(--ink)]">{chip.value}</span>
        </span>
      ))}
    </div>
  );
}
