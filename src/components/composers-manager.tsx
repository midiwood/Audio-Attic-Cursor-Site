"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type ComposerRow = {
  id: string;
  displayName: string;
  ipiPa: string;
  ipiBase: string | null;
  proSociety: string;
  notes: string | null;
  disabledAt: string | null;
};

const fieldClass =
  "w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]";

const labelClass =
  "mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]";

const emptyForm = () => ({
  displayName: "",
  ipiPa: "",
  ipiBase: "",
  proSociety: "SAMRO",
  notes: "",
});

export function ComposersManager({ initialComposers }: { initialComposers: ComposerRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initialComposers);
  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [backfillBusy, setBackfillBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    setRows(initialComposers);
  }, [initialComposers]);

  async function refresh() {
    const res = await fetch("/api/admin/composers");
    const data = (await res.json().catch(() => ({}))) as { composers?: ComposerRow[] };
    if (res.ok && data.composers) setRows(data.composers);
  }

  function startEdit(row: ComposerRow) {
    setEditingId(row.id);
    setForm({
      displayName: row.displayName,
      ipiPa: row.ipiPa,
      ipiBase: row.ipiBase || "",
      proSociety: row.proSociety || "SAMRO",
      notes: row.notes || "",
    });
    setError("");
    setStatus("");
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm());
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setStatus("");

    const payload = {
      displayName: form.displayName.trim(),
      ipiPa: form.ipiPa.trim(),
      ipiBase: form.ipiBase.trim() || null,
      proSociety: form.proSociety.trim() || "SAMRO",
      notes: form.notes.trim() || null,
    };

    const res = await fetch("/api/admin/composers", {
      method: editingId ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);

    if (!res.ok) {
      setError(data.error || "Save failed");
      return;
    }

    setStatus(editingId ? "Composer updated." : "Composer added.");
    cancelEdit();
    await refresh();
    router.refresh();
  }

  async function toggleDisabled(row: ComposerRow) {
    setBusy(true);
    setError("");
    const res = await fetch("/api/admin/composers", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: row.id, disabled: !row.disabledAt }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error || "Update failed");
      return;
    }
    await refresh();
  }

  async function runBackfill() {
    setBackfillBusy(true);
    setError("");
    setStatus("");
    const res = await fetch("/api/admin/composers/backfill", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ limit: 300 }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      scanned?: number;
      linked?: number;
      skipped?: number;
      unmatchedNames?: string[];
    };
    setBackfillBusy(false);
    if (!res.ok) {
      setError(data.error || "Backfill failed");
      return;
    }
    const unmatched =
      data.unmatchedNames?.length ? ` Unmatched: ${data.unmatchedNames.join(", ")}.` : "";
    setStatus(
      `Backfill: ${data.linked ?? 0} linked from artist text, ${data.emptyArtistLinked ?? 0} empty-artist tracks assigned to house composer, ${data.skipped ?? 0} skipped.${data.seeded?.length ? ` Registry: ${data.seeded.join(", ")} added.` : ""}${unmatched}`,
    );
    await refresh();
    router.refresh();
  }

  const active = rows.filter((r) => !r.disabledAt);
  const disabled = rows.filter((r) => r.disabledAt);

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--ink-dim)]">
        Composers in this registry supply IPI numbers for SAMRO rights-holder columns. Tracks pick
        composers from this list with custom perf-share percentages.
      </p>

      <form
        onSubmit={(e) => void onSubmit(e)}
        className="max-w-xl space-y-3 rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)]/70 p-4"
      >
        <h2 className="text-sm font-medium text-[var(--ink)]">
          {editingId ? "Edit composer" : "Add composer"}
        </h2>
        <label className="block">
          <span className={labelClass}>Display name</span>
          <input
            className={fieldClass}
            value={form.displayName}
            onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
            required
          />
        </label>
        <label className="block">
          <span className={labelClass}>PA IPI name number</span>
          <input
            className={fieldClass}
            value={form.ipiPa}
            onChange={(e) => setForm((f) => ({ ...f, ipiPa: e.target.value }))}
            required
          />
        </label>
        <label className="block">
          <span className={labelClass}>IPI base number (optional)</span>
          <input
            className={fieldClass}
            value={form.ipiBase}
            onChange={(e) => setForm((f) => ({ ...f, ipiBase: e.target.value }))}
          />
        </label>
        <label className="block">
          <span className={labelClass}>PRO society</span>
          <input
            className={fieldClass}
            value={form.proSociety}
            onChange={(e) => setForm((f) => ({ ...f, proSociety: e.target.value }))}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Notes</span>
          <input
            className={fieldClass}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : editingId ? "Save changes" : "Add composer"}
          </button>
          {editingId ? (
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--ink-muted)]"
            >
              Cancel
            </button>
          ) : null}
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={backfillBusy}
          onClick={() => void runBackfill()}
          className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)] disabled:opacity-50"
        >
          {backfillBusy ? "Backfilling…" : "Backfill tracks from artist text"}
        </button>
      </div>

      {error ? <p className="text-sm text-[var(--exclusive)]">{error}</p> : null}
      {status ? <p className="text-sm text-[var(--ink-muted)]">{status}</p> : null}

      <section>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
          Active ({active.length})
        </h2>
        {!active.length ? (
          <p className="text-sm text-[var(--ink-muted)]">No active composers yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--line)] rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)]/70">
            {active.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-[var(--ink)]">{row.displayName}</div>
                  <div className="text-xs text-[var(--ink-dim)]">
                    IPI {row.ipiPa || "—"}
                    {row.ipiBase ? ` · base ${row.ipiBase}` : ""} · {row.proSociety}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(row)}
                    className="rounded-lg border border-[var(--line)] px-2.5 py-1 text-xs text-[var(--ink-muted)] hover:text-[var(--ink)]"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void toggleDisabled(row)}
                    className="rounded-lg px-2.5 py-1 text-xs text-[var(--ink-dim)] hover:text-[var(--exclusive)] disabled:opacity-50"
                  >
                    Disable
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {disabled.length ? (
        <section>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
            Disabled ({disabled.length})
          </h2>
          <ul className="divide-y divide-[var(--line)] rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)]/50">
            {disabled.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3 opacity-70">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-[var(--ink)]">{row.displayName}</div>
                  <div className="text-xs text-[var(--ink-dim)]">IPI {row.ipiPa || "—"}</div>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void toggleDisabled(row)}
                  className="rounded-lg border border-[var(--line)] px-2.5 py-1 text-xs text-[var(--ink-muted)] disabled:opacity-50"
                >
                  Enable
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
