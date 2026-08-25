"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LicenseBadge } from "@/components/license-badge";
import { usePlayer, type PlayerTrack } from "@/components/player-provider";
import { formatDisplayTitle } from "@/lib/tracks";
import type { TrackListItem } from "@/lib/track-list-item";

function toPlayerTrack(track: TrackListItem): PlayerTrack {
  return {
    id: track.id,
    title: formatDisplayTitle(track),
    subtitle: [track.client, track.year].filter(Boolean).join(" · ") || null,
    duration: track.duration,
    dropboxDl: track.dropboxDl,
    license: track.license,
  };
}

export function TrashPlaylistClient({
  initialTracks,
}: {
  initialTracks: TrackListItem[];
}) {
  const router = useRouter();
  const { playTrack, toggle, current, isPlaying } = usePlayer();
  const [tracks, setTracks] = useState(initialTracks);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setTracks(initialTracks);
    setSelected(new Set());
  }, [initialTracks]);

  const queue = useMemo(
    () => tracks.filter((t) => t.dropboxDl).map(toPlayerTrack),
    [tracks],
  );

  const allSelected = tracks.length > 0 && selected.size === tracks.length;

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(tracks.map((t) => t.id)));
  }

  async function restoreSelected() {
    const ids = [...selected];
    if (!ids.length) return;
    setBusy(true);
    setError("");
    setMessage("");
    const res = await fetch("/api/trash", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "restore", trackIds: ids }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      count?: number;
    };
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Restore failed");
      return;
    }
    setTracks((prev) => prev.filter((t) => !selected.has(t.id)));
    setSelected(new Set());
    setMessage(`Restored ${data.count ?? ids.length} track(s) to the catalog`);
    router.refresh();
  }

  async function purgeSelected() {
    const ids = [...selected];
    if (!ids.length) return;
    if (
      !confirm(
        `Permanently delete ${ids.length} track${ids.length === 1 ? "" : "s"}? This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    const res = await fetch("/api/trash", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "purge", trackIds: ids }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      deleted?: number;
    };
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Delete failed");
      return;
    }
    setTracks((prev) => prev.filter((t) => !selected.has(t.id)));
    setSelected(new Set());
    setMessage(`Permanently deleted ${data.deleted ?? ids.length} track(s)`);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)]/70 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm text-[var(--ink-muted)]">
            {tracks.length} trashed track{tracks.length === 1 ? "" : "s"}
            {selected.size ? (
              <span className="text-[var(--ink-dim)]"> · {selected.size} selected</span>
            ) : null}
          </p>
          <p className="mt-0.5 text-xs text-[var(--ink-dim)]">
            Check tracks, then restore to the catalog or permanently delete.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!selected.size || busy}
            onClick={() => void restoreSelected()}
            className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Restore
          </button>
          <button
            type="button"
            disabled={!selected.size || busy}
            onClick={() => void purgeSelected()}
            className="rounded-lg border border-[var(--exclusive)] bg-[rgba(245,158,11,0.12)] px-3 py-1.5 text-sm font-medium text-[var(--exclusive)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Delete permanently
          </button>
        </div>
      </div>

      {error ? <p className="text-sm text-[var(--exclusive)]">{error}</p> : null}
      {message ? <p className="text-sm text-[var(--available)]">{message}</p> : null}

      {!tracks.length ? (
        <div className="rounded-xl border border-dashed border-[var(--line)] px-6 py-14 text-center text-[var(--ink-muted)]">
          Trash is empty.{" "}
          <Link href="/playlists" className="text-[var(--accent)] hover:underline">
            Back to playlists
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)]/70">
          <div className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3">
            <label className="flex items-center gap-2 text-xs text-[var(--ink-dim)]">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              Select all
            </label>
          </div>
          <ul>
            {tracks.map((track) => {
              const title = formatDisplayTitle(track);
              const active = current?.id === track.id;
              const canPlay = Boolean(track.dropboxDl);
              const checked = selected.has(track.id);
              return (
                <li
                  key={track.id}
                  className={`flex items-center gap-3 border-b border-[var(--line)] px-4 py-3 last:border-b-0 ${
                    checked ? "bg-[var(--accent-soft)]" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleOne(track.id)}
                    className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                    aria-label={`Select ${title}`}
                  />
                  <button
                    type="button"
                    disabled={!canPlay}
                    onClick={() => {
                      if (!canPlay) return;
                      if (active) {
                        toggle();
                        return;
                      }
                      playTrack(toPlayerTrack(track), queue);
                    }}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--line)] text-xs text-[var(--ink)] transition hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label={active && isPlaying ? `Pause ${title}` : `Play ${title}`}
                  >
                    {active && isPlaying ? "❚❚" : "▶"}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-[var(--ink)]">{title}</div>
                    <div className="mt-0.5 truncate text-xs text-[var(--ink-dim)]">
                      {[track.id, track.client, track.duration].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <LicenseBadge license={track.license} />
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
