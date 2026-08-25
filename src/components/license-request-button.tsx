"use client";

import { FormEvent, useState } from "react";
import {
  emptyLicenseScopeForm,
  LicenseScopeFields,
  type LicenseScopeFormValue,
} from "@/components/license-scope-fields";

/** Compact request entry — prefer SubscriberLicensePanel + licensing icon in track views. */
export function LicenseRequestButton({
  trackId,
  initiallyPending = false,
}: {
  trackId: string;
  initiallyPending?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<LicenseScopeFormValue>(emptyLicenseScopeForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(initiallyPending);
  const [done, setDone] = useState(false);

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
    setPending(true);
    setDone(true);
    setOpen(false);
  }

  if (pending || done) {
    return (
      <span className="rounded-lg border border-[var(--available)]/35 bg-[rgba(34,197,94,0.1)] px-3 py-1.5 text-xs font-medium text-[var(--available)]">
        Request sent
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-medium text-[var(--accent)] transition hover:brightness-110"
      >
        Request license
      </button>

      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-[min(100vw-2rem,22rem)] rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-3 shadow-xl">
          <form onSubmit={onSubmit} className="space-y-2.5">
            <p className="text-[11px] text-[var(--ink-dim)]">
              Choose the license scope that fits your use. We’ll follow up.
            </p>
            <LicenseScopeFields
              value={form}
              onChange={setForm}
              projectLabel="Project"
              notesLabel="Message"
              notesPlaceholder="Timing, budget, extras…"
            />
            {error ? <p className="text-xs text-[var(--exclusive)]">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
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
        </div>
      ) : null}
    </div>
  );
}
