"use client";

import { useEffect, useMemo, useState } from "react";
import {
  emptyLicenseEntryForm,
  LicenseEntryFormFields,
  licenseEntryToApiPayload,
  type LicenseEntryFormValue,
} from "@/components/license-entry-form-fields";
import { TrackLicenseHistory } from "@/components/track-license-history";
import type { LicenseEntryDto } from "@/components/license-panel";
import type { CatalogMetaSuggestions } from "@/lib/queries";
import { canIssueSyncLicenses, isSelfPublished } from "@/lib/publisher-shared";
import {
  LICENSE_OPTIONS,
  canonicalizeLicense,
  licenseOptionLabel,
  normalizeLicenseStatus,
  type LicenseOption,
} from "@/lib/tracks";

const fieldClass =
  "w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]";

function entryToForm(entry: LicenseEntryDto): LicenseEntryFormValue {
  return {
    client: entry.client,
    project: entry.usedFor,
    territory: entry.territory || "",
    media: entry.media || "",
    duration: entry.duration || "",
    branding: entry.branding || "",
    notes: entry.notes || "",
    licensedAt: entry.licensedAt.slice(0, 10),
    perpetuity: entry.perpetuity || "",
    expiresAt: entry.expiresAt || "",
  };
}

function statusHint(
  license: string,
  publisher: string,
  houseName: string,
  existingCount: number,
) {
  const self = isSelfPublished(publisher, houseName);
  const status = normalizeLicenseStatus(license);
  if (!houseName.trim()) {
    return "Set House publisher in Admin → Publisher / PRO to enable sync licenses";
  }
  if (!self) {
    return "Other publisher — status only; sync licenses are not issued here";
  }
  if (status === "clear") {
    return "Clear — no licenses on this track";
  }
  if (status === "hold") {
    return "On Hold — staff-visible; no new sync deals";
  }
  if (status === "exclusive") {
    return existingCount >= 1
      ? "Exclusive — one license issued; locked for new deals"
      : "Exclusive — add the single license below";
  }
  return "Library — multiple sync deals allowed";
}

/**
 * License status + deals live in track info (import / edit).
 * Add and edit happen inline — no separate licensing panel.
 */
export function TrackLicenseSection({
  license,
  onLicenseChange,
  publisher = "",
  housePublisherName = "",
  metaSuggestions,
  licenseEntry,
  onLicenseEntryChange,
  trackId,
  licenseHistoryKey = 0,
  onLicenseCountChange,
  onLicenseAdded,
  clientPrefill = "",
  projectPrefill = "",
  existingLicenseCount = 0,
}: {
  license: string;
  onLicenseChange: (license: LicenseOption) => void;
  publisher?: string;
  housePublisherName?: string;
  metaSuggestions?: CatalogMetaSuggestions;
  licenseEntry?: LicenseEntryFormValue;
  onLicenseEntryChange?: (next: LicenseEntryFormValue) => void;
  trackId?: string;
  licenseHistoryKey?: number;
  onLicenseCountChange?: (count: number) => void;
  onLicenseAdded?: () => void;
  clientPrefill?: string;
  projectPrefill?: string;
  existingLicenseCount?: number;
}) {
  const [entryCount, setEntryCount] = useState(existingLicenseCount);
  const [historyKey, setHistoryKey] = useState(licenseHistoryKey);
  useEffect(() => {
    setEntryCount(existingLicenseCount);
  }, [existingLicenseCount, trackId, licenseHistoryKey]);
  useEffect(() => {
    setHistoryKey(licenseHistoryKey);
  }, [licenseHistoryKey]);

  const canIssue = useMemo(
    () =>
      canIssueSyncLicenses({ publisher, license }, housePublisherName, {
        existingCount: entryCount,
      }),
    [publisher, license, housePublisherName, entryCount],
  );

  const isEdit = Boolean(trackId);
  const status = normalizeLicenseStatus(license);
  const showHistory = isEdit && status !== "clear";

  const [addForm, setAddForm] = useState<LicenseEntryFormValue>(() =>
    emptyLicenseEntryForm({
      client: clientPrefill,
      project: projectPrefill,
    }),
  );
  const [showAdd, setShowAdd] = useState(false);
  const [editingEntry, setEditingEntry] = useState<LicenseEntryDto | null>(null);
  const [editForm, setEditForm] = useState<LicenseEntryFormValue>(() =>
    emptyLicenseEntryForm(),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const entryValue = licenseEntry ?? addForm;
  const setEntryValue = onLicenseEntryChange ?? setAddForm;

  function bumpHistory() {
    setHistoryKey((k) => k + 1);
    onLicenseAdded?.();
  }

  function startEdit(entry: LicenseEntryDto) {
    setShowAdd(false);
    setEditingEntry(entry);
    setEditForm(entryToForm(entry));
    setError("");
    setMessage("");
  }

  function cancelEdit() {
    setEditingEntry(null);
    setError("");
    setMessage("");
  }

  async function saveNewLicense() {
    if (!trackId) return;
    setBusy(true);
    setError("");
    setMessage("");
    const payload = licenseEntryToApiPayload(entryValue);
    const res = await fetch(`/api/tracks/${encodeURIComponent(trackId)}/licenses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Could not add license");
      return;
    }
    setMessage("License logged");
    setEntryCount((c) => c + 1);
    setAddForm(
      emptyLicenseEntryForm({
        client: clientPrefill || entryValue.client,
        project: projectPrefill,
      }),
    );
    setShowAdd(false);
    bumpHistory();
    if (data.trackLicense) {
      onLicenseChange(canonicalizeLicense(data.trackLicense));
    }
  }

  async function saveEditedLicense() {
    if (!trackId || !editingEntry) return;
    setBusy(true);
    setError("");
    setMessage("");
    const payload = licenseEntryToApiPayload(editForm);
    const res = await fetch(
      `/api/tracks/${encodeURIComponent(trackId)}/licenses/${encodeURIComponent(editingEntry.id)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Could not update license");
      return;
    }
    setMessage("License updated");
    setEditingEntry(null);
    bumpHistory();
  }

  return (
    <div className="space-y-3 sm:col-span-2">
      <label className="block">
        <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
          License status
        </span>
        <select
          className={fieldClass}
          value={canonicalizeLicense(license)}
          onChange={(e) => {
            const next = canonicalizeLicense(e.target.value);
            onLicenseChange(next);
            setEditingEntry(null);
            if (
              canIssueSyncLicenses(
                { publisher, license: next },
                housePublisherName,
                { existingCount: entryCount },
              )
            ) {
              setEntryValue(
                emptyLicenseEntryForm({
                  ...entryValue,
                  client: entryValue.client || clientPrefill,
                  project: entryValue.project || projectPrefill,
                }),
              );
              if (isEdit) setShowAdd(true);
            } else if (isEdit) {
              setShowAdd(false);
            }
          }}
        >
          {LICENSE_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {licenseOptionLabel(opt)}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[10px] text-[var(--ink-dim)]">
          {statusHint(license, publisher, housePublisherName, entryCount)}
        </p>
      </label>

      {showHistory && trackId ? (
        <div className="rounded-lg border border-[var(--line)] bg-[rgba(0,0,0,0.12)] p-3">
          {editingEntry ? (
            <div className="mb-3 space-y-2.5 border-b border-[var(--line)] pb-3">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
                Edit license
              </p>
              <LicenseEntryFormFields
                key={editingEntry.id}
                value={editForm}
                onChange={setEditForm}
                metaSuggestions={metaSuggestions}
                defaultShowAdvanced={Boolean(editForm.perpetuity || editForm.expiresAt)}
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void saveEditedLicense()}
                  className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white transition hover:brightness-110 disabled:opacity-50"
                >
                  {busy ? "Saving…" : "Update license"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={cancelEdit}
                  className="rounded-lg px-3 py-1.5 text-xs text-[var(--ink-dim)] transition hover:text-[var(--ink)]"
                >
                  Cancel
                </button>
                {error ? (
                  <span className="text-xs text-[var(--exclusive)]">{error}</span>
                ) : null}
                {message ? (
                  <span className="text-xs text-[var(--available)]">{message}</span>
                ) : null}
              </div>
            </div>
          ) : null}

          <TrackLicenseHistory
            trackId={trackId}
            refreshKey={historyKey}
            onEdit={startEdit}
            onCountChange={(count) => {
              setEntryCount(count);
              onLicenseCountChange?.(count);
            }}
            hideWhenEditingId={editingEntry?.id}
          />

          {canIssue && !editingEntry ? (
            <div className="mt-3 border-t border-[var(--line)] pt-3">
              {!showAdd ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowAdd(true);
                    setError("");
                    setMessage("");
                    setAddForm(
                      emptyLicenseEntryForm({
                        client: clientPrefill,
                        project: projectPrefill,
                      }),
                    );
                  }}
                  className="text-[11px] font-medium text-[var(--accent)] transition hover:underline"
                >
                  + Add license
                </button>
              ) : (
                <div className="space-y-2.5">
                  <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
                    Add license
                  </p>
                  <LicenseEntryFormFields
                    value={entryValue}
                    onChange={setEntryValue}
                    metaSuggestions={metaSuggestions}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void saveNewLicense()}
                      className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white transition hover:brightness-110 disabled:opacity-50"
                    >
                      {busy ? "Saving…" : "Save license"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setShowAdd(false);
                        setError("");
                        setMessage("");
                      }}
                      className="rounded-lg px-3 py-1.5 text-xs text-[var(--ink-dim)] transition hover:text-[var(--ink)]"
                    >
                      Cancel
                    </button>
                    {error ? (
                      <span className="text-xs text-[var(--exclusive)]">{error}</span>
                    ) : null}
                    {message ? (
                      <span className="text-xs text-[var(--available)]">{message}</span>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {!isEdit && canIssue && licenseEntry && onLicenseEntryChange ? (
        <div className="space-y-2 rounded-lg border border-[var(--line)] bg-[rgba(0,0,0,0.15)] p-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
            {status === "exclusive" ? "Exclusive license" : "Add license (optional)"}
          </p>
          <p className="text-[10px] text-[var(--ink-dim)]">
            {status === "exclusive"
              ? "One license for this Exclusive track."
              : "Library allows multiple deals. Leave blank for status only."}
          </p>
          <LicenseEntryFormFields
            value={licenseEntry}
            onChange={onLicenseEntryChange}
            metaSuggestions={metaSuggestions}
          />
        </div>
      ) : null}
    </div>
  );
}
