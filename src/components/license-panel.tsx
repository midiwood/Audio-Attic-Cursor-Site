"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  emptyLicenseEntryForm,
  LicenseEntryFormFields,
  licenseEntryToApiPayload,
  type LicenseEntryFormValue,
} from "@/components/license-entry-form-fields";
import type { CatalogMetaSuggestions } from "@/lib/queries";

export type LicenseEntryDto = {
  id: string;
  trackId: string;
  client: string;
  usedFor: string;
  scope: string;
  territory: string;
  media: string;
  duration: string;
  branding: string;
  notes: string | null;
  licensedAt: string;
  perpetuity: string | null;
  expiresAt: string | null;
  trashedAt?: string | null;
};

type FormState = LicenseEntryFormValue;

function entryToForm(entry: LicenseEntryDto): FormState {
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

export function LicensePanel({
  trackId,
  trackTitle,
  open,
  onClose,
  metaSuggestions,
  initialPrefill,
  editEntry = null,
  onEntryChanged,
  acceptRequestId,
}: {
  trackId: string;
  trackTitle: string;
  open: boolean;
  onClose: () => void;
  metaSuggestions?: CatalogMetaSuggestions;
  /** Prefill add form (e.g. from accepting a request). */
  initialPrefill?: Partial<FormState> | null;
  /** When set, open in edit mode for this history entry. */
  editEntry?: LicenseEntryDto | null;
  onEntryChanged?: (info: { count?: number; trackLicense?: string | null }) => void;
  /** When set, saving a new entry also marks this request accepted. */
  acceptRequestId?: string | null;
}) {
  const [form, setForm] = useState<FormState>(() => emptyLicenseEntryForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setError("");
    setMessage("");
    if (editEntry) {
      setEditingId(editEntry.id);
      setForm(entryToForm(editEntry));
    } else {
      setEditingId(null);
      setForm(emptyLicenseEntryForm(initialPrefill || undefined));
    }
  }, [open, trackId, initialPrefill, editEntry]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    const payload = licenseEntryToApiPayload(form);

    const url = editingId
      ? `/api/tracks/${encodeURIComponent(trackId)}/licenses/${encodeURIComponent(editingId)}`
      : `/api/tracks/${encodeURIComponent(trackId)}/licenses`;
    const res = await fetch(url, {
      method: editingId ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setBusy(false);
      setError(data.error || "Save failed");
      return;
    }

    if (!editingId && acceptRequestId) {
      await fetch(`/api/admin/license-requests/${encodeURIComponent(acceptRequestId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "accepted" }),
      });
    }

    setBusy(false);
    setMessage(editingId ? "Updated" : "License logged");
    onEntryChanged?.({ trackLicense: data.trackLicense });
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4 shadow-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[var(--ink)]">
              {acceptRequestId
                ? "Accept & log license"
                : editingId
                  ? "Edit license"
                  : "Add license"}
            </h2>
            <p className="mt-0.5 truncate text-sm text-[var(--ink-dim)]">{trackTitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--line)] px-2.5 py-1 text-xs text-[var(--ink-muted)]"
          >
            Close
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-2.5">
          <LicenseEntryFormFields
            key={editingId || "new"}
            value={form}
            onChange={setForm}
            metaSuggestions={metaSuggestions}
            defaultShowAdvanced={Boolean(form.perpetuity || form.expiresAt)}
          />

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="text-xs">
              {error ? <span className="text-[var(--exclusive)]">{error}</span> : null}
              {message ? <span className="text-[var(--available)]">{message}</span> : null}
            </div>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {busy ? "Saving…" : editingId ? "Update" : "Add license"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Compact licensing control for track rows / panels. */
export function LicenseIconButton({
  count,
  onClick,
  title = "Licensing",
  userStatus,
}: {
  count?: number;
  onClick: () => void;
  title?: string;
  /** Subscriber request status for this track (tooltip only). */
  userStatus?: string | null;
}) {
  const has = (count || 0) > 0;
  const tip =
    userStatus === "accepted"
      ? "Licensed"
      : userStatus === "pending"
        ? "License request pending"
        : has
          ? `${count} license${count === 1 ? "" : "s"} logged`
          : title === "Licensing"
            ? "Request license"
            : title;

  return (
    <button
      type="button"
      onClick={onClick}
      title={tip}
      aria-label={title}
      className="relative grid h-9 w-9 place-items-center rounded-lg border border-[var(--line)] text-[var(--ink-dim)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12h6m-6 4h6M7 4h7l3 3v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"
        />
        <path strokeLinecap="round" strokeLinejoin="round" d="M14 4v3h3" />
      </svg>
    </button>
  );
}
