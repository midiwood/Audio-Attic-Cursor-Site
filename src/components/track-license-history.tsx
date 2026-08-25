"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LicenseScopeChips } from "@/components/license-scope-fields";
import type { LicenseEntryDto } from "@/components/license-panel";

export function TrackLicenseHistory({
  trackId,
  refreshKey = 0,
  onEdit,
  onCountChange,
  readOnly = false,
  hideWhenEditingId,
}: {
  trackId: string;
  /** Increment to reload without remounting (avoids empty/loading flash). */
  refreshKey?: number;
  onEdit?: (entry: LicenseEntryDto) => void;
  onCountChange?: (count: number) => void;
  /** View mode — list only; edit track info to change licenses. */
  readOnly?: boolean;
  /** Hide this entry while it is being edited inline above. */
  hideWhenEditingId?: string;
}) {
  const [entries, setEntries] = useState<LicenseEntryDto[]>([]);
  const [trashed, setTrashed] = useState<LicenseEntryDto[]>([]);
  const [showTrash, setShowTrash] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const onCountChangeRef = useRef(onCountChange);
  onCountChangeRef.current = onCountChange;
  const trackIdRef = useRef(trackId);
  trackIdRef.current = trackId;

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const id = trackIdRef.current;
    if (!opts?.silent) {
      // Only blank the section on first paint for this track.
      setInitialLoading(true);
    }
    setError("");
    const [activeRes, trashRes] = await Promise.all([
      fetch(`/api/tracks/${encodeURIComponent(id)}/licenses`),
      fetch(`/api/tracks/${encodeURIComponent(id)}/licenses?trashed=1`),
    ]);
    // Ignore stale responses if the expanded track changed mid-flight.
    if (trackIdRef.current !== id) return;

    const activeData = await activeRes.json().catch(() => ({}));
    const trashData = await trashRes.json().catch(() => ({}));
    setInitialLoading(false);
    if (!activeRes.ok) {
      setError(activeData.error || "Could not load license history");
      return;
    }
    const next = Array.isArray(activeData.entries) ? activeData.entries : [];
    setEntries(next);
    setTrashed(Array.isArray(trashData.entries) ? trashData.entries : []);
    onCountChangeRef.current?.(next.length);
  }, []);

  useEffect(() => {
    setEntries([]);
    setTrashed([]);
    setShowTrash(false);
    void load({ silent: false });
  }, [trackId, load]);

  useEffect(() => {
    if (refreshKey === 0) return;
    void load({ silent: true });
  }, [refreshKey, load]);

  async function onTrash(entryId: string) {
    if (!confirm("Move this license to Trash?")) return;
    setBusyId(entryId);
    const res = await fetch(
      `/api/tracks/${encodeURIComponent(trackId)}/licenses/${encodeURIComponent(entryId)}`,
      { method: "DELETE" },
    );
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not move to Trash");
      return;
    }
    await load({ silent: true });
  }

  async function onRestore(entryId: string) {
    setBusyId(entryId);
    const res = await fetch(
      `/api/tracks/${encodeURIComponent(trackId)}/licenses/${encodeURIComponent(entryId)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "restore" }),
      },
    );
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Restore failed");
      return;
    }
    await load({ silent: true });
  }

  async function onPermanentDelete(entryId: string) {
    if (!confirm("Permanently delete this license? This cannot be undone.")) return;
    setBusyId(entryId);
    const res = await fetch(
      `/api/tracks/${encodeURIComponent(trackId)}/licenses/${encodeURIComponent(entryId)}?permanent=1`,
      { method: "DELETE" },
    );
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Delete failed");
      return;
    }
    setTrashed((prev) => prev.filter((e) => e.id !== entryId));
  }

  return (
    <section className={readOnly ? "mt-6 border-t border-[var(--line)] pt-5" : ""}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--ink-dim)]">
            License history
          </h3>
          <p className="mt-0.5 text-xs text-[var(--ink-dim)]">
            {readOnly
              ? "Logged deals for this track. Use Edit to add or change licenses."
              : "Logged deals for this track — add and edit below based on license status."}
          </p>
        </div>
        {entries.length ? (
          <span className="text-xs tabular-nums text-[var(--ink-dim)]">
            {entries.length} logged
          </span>
        ) : null}
      </div>

      {error ? <p className="mb-2 text-xs text-[var(--exclusive)]">{error}</p> : null}

      {initialLoading ? (
        <div
          className="h-16 animate-pulse rounded-lg border border-[var(--line)] bg-[rgba(0,0,0,0.2)]"
          aria-hidden
        />
      ) : entries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--line)] px-3 py-4 text-sm text-[var(--ink-dim)]">
          No licenses logged yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {entries
            .filter((entry) => entry.id !== hideWhenEditingId)
            .map((entry) => (
            <li
              key={entry.id}
              className="rounded-lg border border-[var(--line)] bg-[rgba(0,0,0,0.2)] px-3 py-2.5 sm:px-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-sm font-medium text-[var(--ink)]">{entry.client}</span>
                    <span className="text-xs text-[var(--ink-muted)]">{entry.usedFor}</span>
                  </div>
                  <LicenseScopeChips
                    media={entry.media}
                    territory={entry.territory}
                    duration={entry.duration}
                    branding={entry.branding}
                    scope={entry.scope}
                  />
                  <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
                    {entry.licensedAt.slice(0, 10)}
                    {entry.perpetuity === "Yes" ? " · perpetuity" : null}
                    {entry.perpetuity === "No" && entry.expiresAt
                      ? ` · expires ${entry.expiresAt}`
                      : null}
                  </div>
                  {entry.notes ? (
                    <p className="text-xs text-[var(--ink-dim)]">{entry.notes}</p>
                  ) : null}
                </div>
                {!readOnly ? (
                  <div className="flex shrink-0 gap-1">
                    {onEdit ? (
                      <button
                        type="button"
                        disabled={busyId === entry.id}
                        onClick={() => onEdit(entry)}
                        className="rounded px-2 py-1 text-[11px] text-[var(--ink-muted)] transition hover:text-[var(--accent)] disabled:opacity-50"
                      >
                        Edit
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={busyId === entry.id}
                      onClick={() => void onTrash(entry.id)}
                      className="rounded px-2 py-1 text-[11px] text-[var(--exclusive)] transition hover:brightness-110 disabled:opacity-50"
                    >
                      Trash
                    </button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!readOnly && trashed.length ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowTrash((v) => !v)}
            className="text-[11px] text-[var(--ink-dim)] transition hover:text-[var(--accent)]"
          >
            {showTrash ? "Hide trash" : `Show trash (${trashed.length})`}
          </button>
          {showTrash ? (
            <ul className="mt-2 space-y-2">
              {trashed.map((entry) => (
                <li
                  key={entry.id}
                  className="rounded-lg border border-dashed border-[var(--line)] bg-[rgba(0,0,0,0.15)] px-3 py-2.5 opacity-80 sm:px-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="text-sm font-medium text-[var(--ink)]">{entry.client}</div>
                      <div className="text-xs text-[var(--ink-muted)]">{entry.usedFor}</div>
                      <LicenseScopeChips
                        media={entry.media}
                        territory={entry.territory}
                        duration={entry.duration}
                        branding={entry.branding}
                        scope={entry.scope}
                      />
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        disabled={busyId === entry.id}
                        onClick={() => void onRestore(entry.id)}
                        className="rounded px-2 py-1 text-[11px] text-[var(--ink-muted)] transition hover:text-[var(--accent)] disabled:opacity-50"
                      >
                        Restore
                      </button>
                      <button
                        type="button"
                        disabled={busyId === entry.id}
                        onClick={() => void onPermanentDelete(entry.id)}
                        className="rounded px-2 py-1 text-[11px] text-[var(--exclusive)] transition hover:brightness-110 disabled:opacity-50"
                      >
                        Delete forever
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
