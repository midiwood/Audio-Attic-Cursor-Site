"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ComposerPicker,
  composerAssignmentsTotal,
  defaultComposerAssignment,
  type ComposerOption,
} from "@/components/composer-picker";
import { MetaSuggestInput } from "@/components/meta-suggest-input";
import {
  emptyLicenseEntryForm,
  LicenseEntryFormFields,
  licenseEntryToApiPayload,
  type LicenseEntryFormValue,
} from "@/components/license-entry-form-fields";
import { canIssueSyncLicenses } from "@/lib/publisher-shared";
import type { CatalogMetaSuggestions } from "@/lib/queries";
import type { ComposerAssignmentInput } from "@/lib/composer-types";
import type { TrackListItem } from "@/lib/track-list-item";
import {
  LICENSE_OPTIONS,
  canonicalizeLicense,
  licenseOptionLabel,
  normalizeLicenseStatus,
} from "@/lib/tracks";

const fieldClass =
  "w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]";

const UNCHANGED = "";

function uniqueValues(raw: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const value = String(item || "").trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function sharedValue(raw: Array<string | null | undefined>): string {
  const unique = uniqueValues(raw);
  const anyBlank = raw.some((item) => !String(item || "").trim());
  if (unique.length === 1 && !anyBlank) return unique[0];
  return "";
}

function toDateInputValue(raw: string | null | undefined): string {
  const text = String(raw || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) return "";
  const d = new Date(parsed);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function CurrentValues({
  values,
  onPick,
}: {
  values: string[];
  onPick?: (value: string) => void;
}) {
  if (!values.length) {
    return <p className="mt-1 text-[10px] text-[var(--ink-dim)]">None set on selected tracks</p>;
  }
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {values.map((value) =>
        onPick ? (
          <button
            key={value}
            type="button"
            onClick={() => onPick(value)}
            className="rounded-md border border-[var(--line)] bg-[rgba(0,0,0,0.18)] px-1.5 py-0.5 text-[11px] text-[var(--ink-muted)] hover:border-[var(--accent)] hover:text-[var(--ink)]"
            title="Use this value for all selected tracks"
          >
            {value}
          </button>
        ) : (
          <span
            key={value}
            className="rounded-md border border-[var(--line)] bg-[rgba(0,0,0,0.18)] px-1.5 py-0.5 text-[11px] text-[var(--ink-muted)]"
          >
            {value}
          </span>
        ),
      )}
    </div>
  );
}

function composerAssignmentsEqual(
  a: ComposerAssignmentInput[],
  b: ComposerAssignmentInput[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (row, index) =>
      row.composerId === b[index]?.composerId && row.perfShare === b[index]?.perfShare,
  );
}

export function BatchTrackEditPanel({
  trackIds,
  tracks = [],
  composers = [],
  housePublisherName = "",
  metaSuggestions,
  onClose,
  onApplied,
}: {
  trackIds: string[];
  tracks?: TrackListItem[];
  composers?: ComposerOption[];
  housePublisherName?: string;
  metaSuggestions?: CatalogMetaSuggestions;
  onClose: () => void;
  onApplied: (summary: { updated: number; failed: number }) => void;
}) {
  const current = useMemo(() => {
    const clients = uniqueValues(tracks.map((t) => t.client));
    const projects = uniqueValues(tracks.map((t) => t.project));
    const artists = uniqueValues(tracks.map((t) => t.artist));
    const publishers = uniqueValues(tracks.map((t) => t.publisher));
    const years = uniqueValues(tracks.map((t) => (t.year != null ? String(t.year) : "")));
    const dates = uniqueValues(
      tracks.map((t) => toDateInputValue(t.date) || String(t.date || "").trim()),
    );
    const licenses = uniqueValues(tracks.map((t) => canonicalizeLicense(t.license)));
    return {
      clients,
      projects,
      artists,
      publishers,
      years,
      dates,
      licenses,
      shared: {
        client: sharedValue(tracks.map((t) => t.client)),
        project: sharedValue(tracks.map((t) => t.project)),
        artist: sharedValue(tracks.map((t) => t.artist)),
        publisher: sharedValue(tracks.map((t) => t.publisher)),
        year: sharedValue(tracks.map((t) => (t.year != null ? String(t.year) : ""))),
        date: sharedValue(tracks.map((t) => toDateInputValue(t.date))),
        license: sharedValue(tracks.map((t) => canonicalizeLicense(t.license))),
      },
    };
  }, [tracks]);

  const sharedArtist = current.shared.artist;
  const mixedComposers = current.artists.length > 1;

  const [client, setClient] = useState(current.shared.client);
  const [project, setProject] = useState(current.shared.project);
  const [publisher, setPublisher] = useState(current.shared.publisher);
  const [composerAssignments, setComposerAssignments] = useState<ComposerAssignmentInput[]>([]);
  const [initialComposerAssignments, setInitialComposerAssignments] = useState<
    ComposerAssignmentInput[]
  >([]);
  const [composersLoaded, setComposersLoaded] = useState(false);
  const [year, setYear] = useState(current.shared.year);
  const [publicationDate, setPublicationDate] = useState(current.shared.date);
  const [license, setLicense] = useState<string>(current.shared.license || UNCHANGED);
  const [showDeal, setShowDeal] = useState(false);
  const [licenseEntry, setLicenseEntry] = useState<LicenseEntryFormValue>(() =>
    emptyLicenseEntryForm(),
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!tracks.length) {
      setComposersLoaded(true);
      return;
    }
    if (mixedComposers) {
      setComposerAssignments([]);
      setInitialComposerAssignments([]);
      setComposersLoaded(true);
      return;
    }
    let cancelled = false;
    void fetch(`/api/tracks/${encodeURIComponent(tracks[0].id)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const assignments = Array.isArray(data.composerAssignments)
          ? (data.composerAssignments as ComposerAssignmentInput[])
          : [];
        const next = assignments.length
          ? assignments
          : defaultComposerAssignment(composers, sharedArtist);
        setComposerAssignments(next);
        setInitialComposerAssignments(next);
        setComposersLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setComposersLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [mixedComposers, tracks, composers, sharedArtist]);

  const composerDirty =
    composersLoaded &&
    (mixedComposers
      ? composerAssignments.length > 0
      : !composerAssignmentsEqual(composerAssignments, initialComposerAssignments));

  const composerPreview = useMemo(() => {
    if (!composerDirty || !composerAssignments.length) return "";
    const byId = new Map(composers.map((c) => [c.id, c.displayName]));
    return composerAssignments
      .map((row) => `${byId.get(row.composerId) || "Composer"} ${row.perfShare}%`)
      .join(", ");
  }, [composerDirty, composerAssignments, composers]);

  const count = trackIds.length;

  const patchPreview = useMemo(() => {
    const parts: string[] = [];
    if (client.trim() && client.trim() !== current.shared.client) {
      parts.push(`client → ${client.trim()}`);
    }
    if (project.trim() && project.trim() !== current.shared.project) {
      parts.push(`project → ${project.trim()}`);
    }
    if (composerDirty && composerPreview) {
      parts.push(`composers → ${composerPreview}`);
    }
    if (publisher.trim() && publisher.trim() !== current.shared.publisher) {
      parts.push(`publisher → ${publisher.trim()}`);
    }
    if (year.trim() && year.trim() !== current.shared.year) {
      parts.push(`year → ${year.trim()}`);
    }
    if (publicationDate.trim() && publicationDate.trim() !== current.shared.date) {
      parts.push(`first publication → ${publicationDate.trim()}`);
    }
    if (license !== UNCHANGED && license !== current.shared.license) {
      parts.push(`license status → ${license}`);
    }
    return parts;
  }, [
    client,
    project,
    composerDirty,
    composerPreview,
    publisher,
    year,
    publicationDate,
    license,
    current.shared,
  ]);

  const dealPreview = useMemo(() => {
    if (!showDeal) return null;
    const payload = licenseEntryToApiPayload(licenseEntry);
    if (!payload.client.trim() && !payload.usedFor.trim()) return null;
    return payload;
  }, [showDeal, licenseEntry]);

  const effectivePublisher =
    publisher.trim() || current.shared.publisher || current.publishers[0] || "";
  const effectiveLicense =
    license !== UNCHANGED ? license : current.shared.license || current.licenses[0] || "";

  const canIssueDeal = useMemo(() => {
    if (!showDeal || !dealPreview) return false;
    return canIssueSyncLicenses(
      { publisher: effectivePublisher, license: effectiveLicense || "Library" },
      housePublisherName,
    );
  }, [showDeal, dealPreview, effectivePublisher, effectiveLicense, housePublisherName]);

  const hasChanges = patchPreview.length > 0 || Boolean(dealPreview && showDeal);

  function validateDeal(): string | null {
    if (!showDeal || !dealPreview) return null;
    const payload = licenseEntryToApiPayload(licenseEntry);
    if (!payload.client.trim()) return "License client is required when adding a deal";
    if (!payload.usedFor.trim()) return "Used for is required when adding a deal";
    if (!payload.territory.trim() || !payload.media.trim() || !payload.duration.trim()) {
      return "Fill media, territory, and duration for the license";
    }
    if (!payload.licensedAt.trim()) return "Start date is required";
    if (payload.perpetuity === "No" && !payload.expiresAt.trim()) {
      return "End date is required when perpetuity is No";
    }
    if (normalizeLicenseStatus(effectiveLicense) === "clear") {
      return "Set license status to Library or Exclusive before adding a deal";
    }
    if (
      !canIssueSyncLicenses(
        { publisher: effectivePublisher, license: effectiveLicense },
        housePublisherName,
      )
    ) {
      return "Sync deals require house publisher and Library or Exclusive status";
    }
    return null;
  }

  function openConfirm(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!hasChanges) {
      setError("Change at least one field, or add a shared deal");
      return;
    }
    if (year.trim() && !/^\d{4}$/.test(year.trim())) {
      setError("Year must be a 4-digit year");
      return;
    }
    if (composerDirty) {
      if (!composerAssignments.length) {
        setError("Select at least one composer");
        return;
      }
      if (composerAssignmentsTotal(composerAssignments) !== 100) {
        setError("Composer perf shares must total 100%");
        return;
      }
    }
    const dealError = validateDeal();
    if (dealError) {
      setError(dealError);
      return;
    }
    setConfirmOpen(true);
  }

  async function applyBatch() {
    setBusy(true);
    setError("");
    const patch: Record<string, string> = {};
    if (client.trim() && client.trim() !== current.shared.client) patch.client = client.trim();
    if (project.trim() && project.trim() !== current.shared.project) {
      patch.project = project.trim();
    }
    if (publisher.trim() && publisher.trim() !== current.shared.publisher) {
      patch.publisher = publisher.trim();
    }
    if (year.trim() && year.trim() !== current.shared.year) patch.year = year.trim();
    if (publicationDate.trim() && publicationDate.trim() !== current.shared.date) {
      patch.date = publicationDate.trim();
    }
    if (license !== UNCHANGED && license !== current.shared.license) patch.license = license;

    const patchPayload: Record<string, unknown> = { ...patch };
    if (composerDirty) {
      patchPayload.composers = composerAssignments;
    }

    const payload = showDeal && dealPreview ? licenseEntryToApiPayload(licenseEntry) : null;

    const res = await fetch("/api/tracks/batch-update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        trackIds,
        patch: Object.keys(patchPayload).length ? patchPayload : undefined,
        licenseEntry: payload,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setConfirmOpen(false);

    if (!res.ok && !data.updated) {
      setError(data.error || "Batch update failed");
      return;
    }

    onApplied({
      updated: Number(data.updated) || 0,
      failed: Number(data.failed) || 0,
    });
    onClose();
  }

  const summaryLines = [
    ...patchPreview,
    ...(dealPreview && showDeal ? ["+ add shared sync deal"] : []),
  ];

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/55"
        aria-label="Close batch edit"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-edit-title"
        className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] shadow-2xl"
      >
        <div className="border-b border-[var(--line)] px-4 py-3">
          <h2 id="batch-edit-title" className="text-sm font-medium text-[var(--ink)]">
            Batch edit · {count} track{count === 1 ? "" : "s"}
          </h2>
          <p className="mt-1 text-xs text-[var(--ink-dim)]">
            Current values from the selection are shown. Mixed fields list every value — click one
            to apply it to all, or type a new value.
          </p>
        </div>

        {confirmOpen ? (
          <div className="space-y-4 px-4 py-4">
            <p className="text-sm text-[var(--ink-muted)]">
              Update {count} track{count === 1 ? "" : "s"}?
            </p>
            <ul className="list-inside list-disc text-sm text-[var(--ink)]">
              {summaryLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmOpen(false)}
                className="rounded-md px-3 py-2 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)]"
              >
                Back
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void applyBatch()}
                className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
              >
                {busy ? "Applying…" : "Confirm"}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={openConfirm} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              <div>
                <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
                  Client
                </span>
                <MetaSuggestInput
                  value={client}
                  onChange={setClient}
                  suggestions={metaSuggestions?.clients || []}
                  placeholder={current.clients.length > 1 ? "Mixed — type to set all" : ""}
                />
                <CurrentValues values={current.clients} onPick={setClient} />
              </div>
              <div>
                <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
                  Project
                </span>
                <MetaSuggestInput
                  value={project}
                  onChange={setProject}
                  suggestions={metaSuggestions?.projects || []}
                  placeholder={current.projects.length > 1 ? "Mixed — type to set all" : ""}
                />
                <CurrentValues values={current.projects} onPick={setProject} />
              </div>
              <div>
                <ComposerPicker
                  composers={composers}
                  value={composerAssignments}
                  onChange={setComposerAssignments}
                />
                {!composersLoaded ? (
                  <p className="mt-1 text-[10px] text-[var(--ink-dim)]">
                    Loading composer assignments…
                  </p>
                ) : mixedComposers ? (
                  <p className="mt-1 text-[10px] text-[var(--ink-dim)]">
                    Mixed on this selection — set composers here to apply the same assignment to all
                    selected tracks. Leave empty to keep each track unchanged.
                  </p>
                ) : null}
                <CurrentValues values={current.artists} />
              </div>
              <div>
                <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
                  Publisher
                </span>
                <MetaSuggestInput
                  value={publisher}
                  onChange={setPublisher}
                  suggestions={metaSuggestions?.publishers || []}
                  placeholder={current.publishers.length > 1 ? "Mixed — type to set all" : ""}
                />
                <CurrentValues values={current.publishers} onPick={setPublisher} />
              </div>
              <div>
                <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
                  Year
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  className={fieldClass}
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder={current.years.length > 1 ? "Mixed — type to set all" : ""}
                />
                <CurrentValues values={current.years} onPick={setYear} />
              </div>
              <div>
                <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
                  First publication date
                </span>
                <input
                  type="date"
                  className={fieldClass}
                  value={publicationDate}
                  onChange={(e) => setPublicationDate(e.target.value)}
                />
                <CurrentValues
                  values={current.dates}
                  onPick={(value) => setPublicationDate(toDateInputValue(value) || value)}
                />
              </div>
              <div>
                <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
                  License status
                </span>
                <select
                  className={fieldClass}
                  value={license}
                  onChange={(e) => setLicense(e.target.value)}
                >
                  {current.licenses.length !== 1 ? (
                    <option value={UNCHANGED}>— mixed — leave unchanged —</option>
                  ) : null}
                  {LICENSE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {licenseOptionLabel(opt)}
                    </option>
                  ))}
                </select>
                <CurrentValues values={current.licenses} onPick={setLicense} />
              </div>

              <div className="rounded-lg border border-[var(--line)] bg-[rgba(0,0,0,0.12)] p-3">
                <label className="flex items-center gap-2 text-sm text-[var(--ink-muted)]">
                  <input
                    type="checkbox"
                    checked={showDeal}
                    onChange={(e) => setShowDeal(e.target.checked)}
                  />
                  Add shared sync deal to all selected
                </label>
                {showDeal ? (
                  <div className="mt-3 space-y-2">
                    <LicenseEntryFormFields
                      value={licenseEntry}
                      onChange={setLicenseEntry}
                      metaSuggestions={metaSuggestions}
                    />
                    {!canIssueDeal && dealPreview ? (
                      <p className="text-xs text-[var(--exclusive)]">
                        Deals need house publisher and Library or Exclusive status.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--line)] px-4 py-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md px-3 py-2 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!hasChanges}
                className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
              >
                Review changes
              </button>
            </div>
          </form>
        )}

        {error ? (
          <p className="border-t border-[var(--line)] px-4 py-2 text-xs text-[var(--exclusive)]">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
