"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { LicenseScopeChips } from "@/components/license-scope-fields";
import { usePlayer, type PlayerTrack } from "@/components/player-provider";
import { formatLicenseScopeSummary } from "@/lib/license-scope";

export type SubscriberLicenseRow = {
  id: string;
  trackId: string;
  trackTitle: string;
  scope: string;
  territory: string;
  media: string;
  duration: string;
  branding: string;
  intendedUse: string;
  message: string | null;
  status: string;
  createdAt: string;
  dropboxDl: string | null;
  trackDuration: string | null;
};

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Deterministic date — same on server and client (avoids hydration mismatch). */
function formatWhen(iso: string) {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso.slice(0, 10);
  const d = new Date(parsed);
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

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

function playButtonClass(active: boolean, playing: boolean) {
  if (active && playing) {
    return "border-[var(--accent)] bg-[var(--accent)] text-white shadow-[0_0_0_3px_var(--accent-soft)]";
  }
  if (active) {
    return "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink)]";
  }
  return "border-[var(--line)] text-[var(--ink)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]";
}

function toPlayerTrack(row: SubscriberLicenseRow): PlayerTrack {
  return {
    id: row.trackId,
    title: row.trackTitle,
    subtitle:
      formatLicenseScopeSummary(row) || row.intendedUse || row.trackDuration || null,
    duration: row.trackDuration,
    dropboxDl: row.dropboxDl,
    license: null,
  };
}

function LicenseSection({
  title,
  description,
  rows,
  queue,
}: {
  title: string;
  description?: string;
  rows: SubscriberLicenseRow[];
  queue: PlayerTrack[];
}) {
  const { playTrack, toggle, current, isPlaying } = usePlayer();
  const [openId, setOpenId] = useState<string | null>(null);

  if (!rows.length) return null;

  return (
    <section>
      <h2 className="text-sm font-semibold text-[var(--ink)]">{title}</h2>
      {description ? (
        <p className="mt-0.5 text-xs text-[var(--ink-dim)]">{description}</p>
      ) : null}
      <ul className="mt-3 space-y-2.5">
        {rows.map((row) => {
          const canPlay = Boolean(row.dropboxDl);
          const active = current?.id === row.trackId;
          const expanded = openId === row.id;
          const summary =
            formatLicenseScopeSummary(row) || row.intendedUse || row.trackId;
          return (
            <li
              key={row.id}
              className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)]/70 px-4 py-3"
            >              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={!canPlay}
                  onClick={() => {
                    if (!canPlay) return;
                    if (active) {
                      toggle();
                      return;
                    }
                    playTrack(toPlayerTrack(row), queue);
                  }}
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border text-sm transition disabled:cursor-not-allowed disabled:opacity-30 ${playButtonClass(active, isPlaying)}`}
                  aria-label={
                    active && isPlaying ? `Pause ${row.trackTitle}` : `Play ${row.trackTitle}`
                  }
                >
                  {active && isPlaying ? "❚❚" : "▶"}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-[var(--ink)]">{row.trackTitle}</div>
                  <div className="mt-0.5 truncate text-xs text-[var(--ink-dim)]">{summary}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
                    {formatWhen(row.createdAt)}
                  </div>
                </div>
                <span
                  className={`inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] ${statusClass(row.status)}`}
                >
                  {statusLabel(row.status)}
                </span>
                <button
                  type="button"
                  onClick={() => setOpenId((prev) => (prev === row.id ? null : row.id))}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--line)] text-xs text-[var(--ink-dim)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  aria-expanded={expanded}
                  aria-label={expanded ? "Hide details" : "Show details"}
                >
                  {expanded ? "▴" : "▾"}
                </button>
              </div>
              {expanded ? (
                <div className="mt-3 space-y-2 border-t border-[var(--line)] pt-3 pl-[3.25rem]">
                  <LicenseScopeChips
                    media={row.media}
                    territory={row.territory}
                    duration={row.duration}
                    branding={row.branding}
                    scope={row.scope}
                  />
                  {row.intendedUse ? (
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
                        Project
                      </p>
                      <p className="mt-0.5 text-sm text-[var(--ink-muted)]">{row.intendedUse}</p>
                    </div>
                  ) : null}
                  {row.message ? (
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
                        Message
                      </p>
                      <p className="mt-0.5 text-sm text-[var(--ink-dim)]">{row.message}</p>
                    </div>
                  ) : null}
                  <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
                    {row.trackId} · requested {formatWhen(row.createdAt)}
                  </p>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function SubscriberLicenses({
  initialRows,
}: {
  initialRows: SubscriberLicenseRow[];
}) {
  const accepted = useMemo(
    () => initialRows.filter((r) => r.status === "accepted"),
    [initialRows],
  );
  const pending = useMemo(
    () => initialRows.filter((r) => r.status === "pending"),
    [initialRows],
  );
  const declined = useMemo(
    () => initialRows.filter((r) => r.status === "declined"),
    [initialRows],
  );

  const playQueue = useMemo(() => {
    const playable = [...accepted, ...pending].filter((r) => r.dropboxDl);
    const seen = new Set<string>();
    const queue: PlayerTrack[] = [];
    for (const row of playable) {
      if (seen.has(row.trackId)) continue;
      seen.add(row.trackId);
      queue.push(toPlayerTrack(row));
    }
    return queue;
  }, [accepted, pending]);

  const empty = !accepted.length && !pending.length && !declined.length;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)]/50 px-4 py-4">
        <p className="text-sm text-[var(--ink-muted)]">
          Request a license from any available track in Browse. Accepted requests appear here as
          your licenses.
        </p>
        <Link
          href="/"
          className="mt-3 inline-flex rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-medium text-[var(--accent)] transition hover:brightness-110"
        >
          Browse available tracks
        </Link>
      </div>

      {empty ? (
        <p className="rounded-xl border border-dashed border-[var(--line)] px-4 py-10 text-center text-sm text-[var(--ink-dim)]">
          No licenses yet. Open a track in Browse and use the licensing icon.
        </p>
      ) : (
        <>
          <LicenseSection
            title="Your licenses"
            description="Tracks you’ve been licensed to use."
            rows={accepted}
            queue={playQueue}
          />
          <LicenseSection
            title="Pending requests"
            description="Waiting for Audio Attic to confirm."
            rows={pending}
            queue={playQueue}
          />
          <LicenseSection title="Declined" rows={declined} queue={playQueue} />
        </>
      )}
    </div>
  );
}
