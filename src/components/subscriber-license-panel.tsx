"use client";

import { FormEvent, useState } from "react";
import {
  emptyLicenseScopeForm,
  LicenseScopeChips,
  LicenseScopeFields,
  type LicenseScopeFormValue,
} from "@/components/license-scope-fields";
import { formatLicenseScopeSummary } from "@/lib/license-scope";
import type { UserTrackLicenseStatus } from "@/lib/license-requests";

function statusLabel(status: string) {
  if (status === "accepted") return "Licensed";
  if (status === "pending") return "Pending";
  if (status === "declined") return "Declined";
  return status;
}

function statusClass(status: string) {
  if (status === "accepted") {
    return "border-[var(--available)]/35 bg-[rgba(34,197,94,0.12)] text-[var(--available)]";
  }
  if (status === "pending") {
    return "border-[var(--hold)]/40 bg-[rgba(56,189,248,0.12)] text-[var(--hold)]";
  }
  if (status === "declined") {
    return "border-[var(--exclusive)]/35 bg-[rgba(245,158,11,0.1)] text-[var(--exclusive)]";
  }
  return "border-[var(--line)] text-[var(--ink-dim)]";
}

export function SubscriberLicensePanel({
  trackId,
  trackTitle,
  open,
  onClose,
  initialStatus = null,
  onStatusChange,
}: {
  trackId: string;
  trackTitle: string;
  open: boolean;
  onClose: () => void;
  initialStatus?: UserTrackLicenseStatus | null;
  onStatusChange?: (next: UserTrackLicenseStatus | null) => void;
}) {
  const [status, setStatus] = useState<UserTrackLicenseStatus | null>(initialStatus);
  const [form, setForm] = useState<LicenseScopeFormValue>(emptyLicenseScopeForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Sync when opening a different track / status
  if (open && initialStatus?.requestId !== status?.requestId) {
    // Only update when panel opens with different data — avoid setState in render by using key on parent
  }

  if (!open) return null;

  const canRequest = !status || status.status === "declined" || status.status === "archived";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch(`/api/tracks/${encodeURIComponent(trackId)}/license-request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        territory: form.territory,
        media: form.media,
        duration: form.duration,
        branding: form.branding,
        intendedUse: form.project,
        message: form.notes,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Request failed");
      return;
    }
    const next: UserTrackLicenseStatus = {
      trackId,
      requestId: data.request.id,
      status: data.request.status,
      scope: formatLicenseScopeSummary({
        media: data.request.media,
        territory: data.request.territory,
        duration: data.request.duration,
        branding: data.request.branding,
      }),
      territory: data.request.territory || "",
      media: data.request.media || "",
      duration: data.request.duration || "",
      branding: data.request.branding || "",
      intendedUse: data.request.intendedUse || form.project,
      message: form.notes.trim() || null,
      createdAt: data.request.createdAt || new Date().toISOString(),
    };
    setStatus(next);
    onStatusChange?.(next);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[var(--ink)]">License</h2>
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

        {status && status.status !== "declined" && status.status !== "archived" ? (
          <div className="space-y-3">
            <span
              className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] ${statusClass(status.status)}`}
            >
              {statusLabel(status.status)}
            </span>
            <LicenseScopeChips
              media={status.media}
              territory={status.territory}
              duration={status.duration}
              branding={status.branding}
              scope={status.scope}
            />
            {status.intendedUse ? (
              <div>
                <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
                  Project
                </p>
                <p className="mt-0.5 text-sm text-[var(--ink-muted)]">{status.intendedUse}</p>
              </div>
            ) : null}
            {status.message ? (
              <div>
                <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
                  Message
                </p>
                <p className="mt-0.5 text-sm text-[var(--ink-dim)]">{status.message}</p>
              </div>
            ) : null}
            {status.status === "pending" ? (
              <p className="text-xs text-[var(--ink-dim)]">
                We’ll confirm this request shortly. You can also track it under Licenses.
              </p>
            ) : null}
          </div>
        ) : null}

        {canRequest ? (
          <form onSubmit={onSubmit} className="mt-1 space-y-3">
            {status?.status === "declined" ? (
              <p className="text-xs text-[var(--ink-dim)]">
                Previous request was declined. You can send a new request with updated details.
              </p>
            ) : (
              <p className="text-[11px] text-[var(--ink-dim)]">
                Choose the license scope that fits your use. We’ll follow up to confirm.
              </p>
            )}
            <LicenseScopeFields
              value={form}
              onChange={setForm}
              projectLabel="Project"
              notesLabel="Message"
              notesPlaceholder="Timing, budget, extras…"
            />
            {error ? <p className="text-xs text-[var(--exclusive)]">{error}</p> : null}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--ink-muted)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                {busy ? "Sending…" : "Send request"}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
