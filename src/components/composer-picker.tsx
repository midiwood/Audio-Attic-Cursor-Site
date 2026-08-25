"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ComposerAssignmentInput } from "@/lib/composer-types";
import { splitSamroPerfShare } from "@/lib/samro";

export type ComposerOption = {
  id: string;
  displayName: string;
  ipiPa: string;
  proSociety: string;
  disabledAt?: string | null;
};

const labelClass =
  "mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]";

export function composerAssignmentsTotal(assignments: ComposerAssignmentInput[]): number {
  return assignments.reduce((sum, row) => sum + (Number(row.perfShare) || 0), 0);
}

export function ComposerPicker({
  composers,
  value,
  onChange,
  adminHref = "/admin/composers",
}: {
  composers: ComposerOption[];
  value: ComposerAssignmentInput[];
  onChange: (next: ComposerAssignmentInput[]) => void;
  adminHref?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const activeComposers = useMemo(
    () => composers.filter((c) => !c.disabledAt),
    [composers],
  );

  const byId = useMemo(
    () => new Map(composers.map((c) => [c.id, c])),
    [composers],
  );

  const selectedIds = useMemo(() => new Set(value.map((v) => v.composerId)), [value]);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return activeComposers
      .filter((c) => !selectedIds.has(c.id))
      .filter((c) => !q || c.displayName.toLowerCase().includes(q))
      .slice(0, 8);
  }, [activeComposers, query, selectedIds]);

  const total = composerAssignmentsTotal(value);
  const totalOk = total === 100;

  function addComposer(composerId: string) {
    if (selectedIds.has(composerId) || value.length >= 12) return;
    const next = [...value, { composerId, perfShare: 0 }];
    const shares = splitSamroPerfShare(next.length);
    onChange(next.map((row, index) => ({ ...row, perfShare: shares[index] })));
    setQuery("");
    setOpen(false);
  }

  function removeComposer(composerId: string) {
    const next = value.filter((row) => row.composerId !== composerId);
    if (!next.length) {
      onChange([]);
      return;
    }
    const shares = splitSamroPerfShare(next.length);
    onChange(next.map((row, index) => ({ ...row, perfShare: shares[index] })));
  }

  function setShare(composerId: string, perfShare: number) {
    onChange(
      value.map((row) =>
        row.composerId === composerId
          ? { ...row, perfShare: Math.max(0, Math.min(100, Math.round(perfShare))) }
          : row,
      ),
    );
  }

  function moveComposer(composerId: string, dir: -1 | 1) {
    const index = value.findIndex((row) => row.composerId === composerId);
    if (index < 0) return;
    const target = index + dir;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    onChange(next);
  }

  function evenSplit() {
    if (!value.length) return;
    const shares = splitSamroPerfShare(value.length);
    onChange(value.map((row, index) => ({ ...row, perfShare: shares[index] })));
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={labelClass}>Composers</span>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className={totalOk ? "text-[var(--available)]" : "text-[var(--exclusive)]"}>
            Total: {total}% {totalOk ? "" : "· must equal 100%"}
          </span>
          {value.length > 1 ? (
            <button
              type="button"
              onClick={evenSplit}
              className="text-[var(--accent)] hover:underline"
            >
              Even split
            </button>
          ) : null}
          <Link href={adminHref} className="text-[var(--accent)] hover:underline">
            Manage registry
          </Link>
        </div>
      </div>

      {value.length ? (
        <ul className="space-y-2 rounded-lg border border-[var(--line)] bg-[rgba(0,0,0,0.12)] p-2">
          {value.map((row, index) => {
            const composer = byId.get(row.composerId);
            const name = composer?.displayName || "Unknown composer";
            const ipi = composer?.ipiPa || "—";
            const society = composer?.proSociety || "SAMRO";
            return (
              <li
                key={row.composerId}
                className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-[var(--ink)]">{name}</div>
                  <div className="truncate text-[10px] text-[var(--ink-dim)]">
                    IPI {ipi} · {society}
                    {composer?.disabledAt ? " · disabled in registry" : ""}
                    {!composer ? " · missing from registry" : ""}
                  </div>
                </div>
                <label className="flex items-center gap-1 text-xs text-[var(--ink-dim)]">
                  <span>%</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={row.perfShare}
                    onChange={(e) => setShare(row.composerId, Number(e.target.value))}
                    className="w-14 rounded border border-[var(--line)] bg-[var(--bg)] px-1.5 py-0.5 text-right tabular-nums text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                  />
                </label>
                <div className="flex gap-0.5">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => moveComposer(row.composerId, -1)}
                    className="rounded px-1.5 py-0.5 text-xs text-[var(--ink-dim)] hover:text-[var(--ink)] disabled:opacity-30"
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={index === value.length - 1}
                    onClick={() => moveComposer(row.composerId, 1)}
                    className="rounded px-1.5 py-0.5 text-xs text-[var(--ink-dim)] hover:text-[var(--ink)] disabled:opacity-30"
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => removeComposer(row.composerId)}
                    className="rounded px-1.5 py-0.5 text-xs text-[var(--exclusive)] hover:brightness-110"
                    aria-label="Remove"
                  >
                    ×
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-[var(--ink-dim)]">No composers selected.</p>
      )}

      <div className="relative">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search composers to add…"
          className="w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
        />
        {open && suggestions.length ? (
          <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] py-1 shadow-lg">
            {suggestions.map((composer) => (
              <li key={composer.id}>
                <button
                  type="button"
                  onClick={() => addComposer(composer.id)}
                  className="block w-full px-3 py-2 text-left text-sm text-[var(--ink)] hover:bg-[var(--accent-soft)]"
                >
                  <span className="font-medium">{composer.displayName}</span>
                  <span className="ml-2 text-xs text-[var(--ink-dim)]">
                    IPI {composer.ipiPa || "—"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

/** Build default single-composer assignment from registry (house name match or first). */
export function defaultComposerAssignment(
  composers: ComposerOption[],
  preferredName?: string,
): ComposerAssignmentInput[] {
  const active = composers.filter((c) => !c.disabledAt);
  if (!active.length) return [];
  const key = (preferredName || "").trim().toLowerCase();
  const match =
    (key && active.find((c) => c.displayName.trim().toLowerCase() === key)) ||
    active[0];
  return [{ composerId: match.id, perfShare: 100 }];
}
