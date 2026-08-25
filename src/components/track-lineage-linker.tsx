"use client";

import { useEffect, useState } from "react";
import { formatDisplayTitle } from "@/lib/tracks";
import {
  RELATION_TYPE_OPTIONS,
  type DerivedFromLink,
  type TrackRelationType,
} from "@/lib/track-relations";
import type { TrackListItem } from "@/lib/track-list-item";

const fieldClass =
  "w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]";

const EMPTY_TITLES: Record<string, string> = {};

export function TrackLineageLinker({
  excludeTrackId,
  value,
  onChange,
  knownTitles = EMPTY_TITLES,
}: {
  excludeTrackId?: string;
  value: DerivedFromLink[];
  onChange: (next: DerivedFromLink[]) => void;
  knownTitles?: Record<string, string>;
}) {
  const [open, setOpen] = useState(() => value.length > 0);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TrackListItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [relation, setRelation] = useState<TrackRelationType>("library_adaptation");
  const [note, setNote] = useState("");
  const [titles, setTitles] = useState<Record<string, string>>(() => ({ ...knownTitles }));

  useEffect(() => {
    setTitles((prev) => {
      const merged = { ...knownTitles, ...prev };
      const prevKeys = Object.keys(prev);
      const mergedKeys = Object.keys(merged);
      if (
        prevKeys.length === mergedKeys.length &&
        mergedKeys.every((key) => prev[key] === merged[key])
      ) {
        return prev;
      }
      return merged;
    });
  }, [knownTitles]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      return;
    }
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ q });
        if (excludeTrackId) params.set("exclude", excludeTrackId);
        const res = await fetch(`/api/tracks/search?${params}`, {
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || controller.signal.aborted) return;
        const tracks = Array.isArray(data.tracks) ? (data.tracks as TrackListItem[]) : [];
        setResults(tracks);
        setTitles((prev) => {
          const next = { ...prev };
          for (const track of tracks) {
            next[track.id] = formatDisplayTitle(track);
          }
          return next;
        });
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 220);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, excludeTrackId, open]);

  function addLink(track: TrackListItem) {
    if (value.some((link) => link.trackId === track.id && link.relation === relation)) {
      setQuery("");
      setResults([]);
      return;
    }
    setTitles((prev) => ({ ...prev, [track.id]: formatDisplayTitle(track) }));
    onChange([
      ...value,
      {
        trackId: track.id,
        relation,
        note: note.trim() || null,
      },
    ]);
    setQuery("");
    setResults([]);
    setNote("");
  }

  function removeLink(trackId: string, linkRelation: TrackRelationType) {
    onChange(
      value.filter((link) => !(link.trackId === trackId && link.relation === linkRelation)),
    );
  }

  const count = value.length;
  const summary =
    count === 0 ? "Lineage" : count === 1 ? "Lineage · 1 link" : `Lineage · ${count} links`;

  return (
    <section
      className={`space-y-3 rounded-lg border p-4 ${
        count
          ? "border-[var(--accent)]/35 bg-[var(--accent-soft)]/30"
          : "border-[var(--line)] bg-[var(--bg-elevated)]/60"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--ink)]">
          {summary}
        </h3>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-[11px] text-[var(--accent)] hover:underline"
          aria-expanded={open}
        >
          {open ? "Hide search" : count ? "Add another link" : "Link a parent track"}
        </button>
      </div>

      {count ? (
        <ul className="space-y-1.5">
          {value.map((link) => (
            <li
              key={`${link.trackId}-${link.relation}`}
              className="flex items-start justify-between gap-2 rounded-md border border-[var(--line)] bg-[var(--bg)] px-2.5 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm text-[var(--ink)]">
                  {titles[link.trackId] || link.trackId}
                </div>
                <div className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
                  {RELATION_TYPE_OPTIONS.find((opt) => opt.value === link.relation)?.label ||
                    link.relation}
                  {link.note ? ` · ${link.note}` : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeLink(link.trackId, link.relation)}
                className="shrink-0 text-[11px] text-[var(--ink-dim)] transition hover:text-[var(--exclusive)]"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-[var(--ink-dim)]">
          No parent links yet. Link an adaptation, rewrite, or alt mix from the catalog.
        </p>
      )}

      {open ? (
        <div className="space-y-3 border-t border-[var(--line)] pt-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
                Search catalog
              </span>
              <input
                className={fieldClass}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Title, ID, client, or project"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
                Relation
              </span>
              <select
                className={fieldClass}
                value={relation}
                onChange={(e) => setRelation(e.target.value as TrackRelationType)}
              >
                {RELATION_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
              Note <span className="normal-case tracking-normal opacity-70">optional</span>
            </span>
            <input
              className={fieldClass}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. strings removed for library"
            />
          </label>

          {searching ? (
            <p className="text-[11px] text-[var(--ink-dim)]">Searching…</p>
          ) : null}

          {results.length ? (
            <ul className="max-h-48 overflow-y-auto rounded-md border border-[var(--line)] divide-y divide-[var(--line)]">
              {results.map((track) => (
                <li key={track.id}>
                  <button
                    type="button"
                    onClick={() => addLink(track)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition hover:bg-[var(--accent-soft)]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-[var(--ink)]">
                        {formatDisplayTitle(track)}
                      </span>
                      <span className="block truncate text-[10px] text-[var(--ink-dim)]">
                        {track.id}
                        {track.client ? ` · ${track.client}` : ""}
                        {track.year ? ` · ${track.year}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] text-[var(--accent)]">Add</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
