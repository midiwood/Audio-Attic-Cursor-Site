"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type TrackDetail = {
  trackId: string;
  title: string;
  subtitle: string | null;
  project: string | null;
  publisher: string;
  artist: string;
  durationMin: number | null;
  durationSec: number | null;
  firstPublicationDate: string | null;
  genre: string | null;
  instrumentation: string | null;
};

type SubmissionRow = {
  id: string;
  publisherName: string;
  status: string;
  trackCount: number;
  fileName: string | null;
  notes: string | null;
  createdAt: string;
  exportedAt: string | null;
  completedAt: string | null;
  trashedAt: string | null;
  archivedAt: string | null;
  tracks: TrackDetail[];
};

type ListFilter = "active" | "archive" | "trash";

type SubmissionAction =
  | "complete"
  | "cancel"
  | "trash"
  | "archive"
  | "restore"
  | "unarchive"
  | "delete";

type PendingConfirm = {
  id: string;
  action: Exclude<SubmissionAction, "restore" | "unarchive">;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
};

function formatDuration(min: number | null, sec: number | null) {
  if (min == null && sec == null) return "—";
  const m = min ?? 0;
  const s = sec ?? 0;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatStamp(value: string | null) {
  if (!value) return null;
  return value.slice(0, 16).replace("T", " ");
}

function projectsForRow(row: SubmissionRow): string[] {
  return [
    ...new Set(
      (row.tracks || [])
        .map((track) => (track.project || "").trim())
        .filter(Boolean),
    ),
  ];
}

const ACTION_PROMPTS: Record<
  Exclude<SubmissionAction, "restore" | "unarchive">,
  { message: string; confirmLabel: string; destructive?: boolean }
> = {
  complete: {
    message:
      "Mark this form as submitted to SAMRO? Each linked track will get SAMRO = Yes.",
    confirmLabel: "Mark complete",
  },
  cancel: {
    message: "Cancel this form? Tracks stay unsubmitted.",
    confirmLabel: "Cancel form",
    destructive: true,
  },
  trash: {
    message: "Move this submission to trash?",
    confirmLabel: "Move to trash",
    destructive: true,
  },
  archive: {
    message: "Archive this completed submission? It will move out of the active list.",
    confirmLabel: "Archive",
  },
  delete: {
    message: "Permanently delete this submission? This cannot be undone.",
    confirmLabel: "Delete forever",
    destructive: true,
  },
};

export function SamroSubmissionsManager({
  initialSubmissions,
  initialArchived,
  initialTrashed,
}: {
  initialSubmissions: SubmissionRow[];
  initialArchived: SubmissionRow[];
  initialTrashed: SubmissionRow[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialSubmissions);
  const [archived, setArchived] = useState(initialArchived);
  const [trashed, setTrashed] = useState(initialTrashed);
  const [filter, setFilter] = useState<ListFilter>("active");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setRows(initialSubmissions);
  }, [initialSubmissions]);

  useEffect(() => {
    setArchived(initialArchived);
  }, [initialArchived]);

  useEffect(() => {
    setTrashed(initialTrashed);
  }, [initialTrashed]);

  const visible =
    filter === "trash" ? trashed : filter === "archive" ? archived : rows;

  async function refresh() {
    const [activeRes, archiveRes, trashRes] = await Promise.all([
      fetch("/api/admin/samro-submissions"),
      fetch("/api/admin/samro-submissions?archived=1"),
      fetch("/api/admin/samro-submissions?trashed=1"),
    ]);
    const parse = async (res: Response) =>
      ((await res.json().catch(() => ({}))) as { submissions?: SubmissionRow[] }).submissions;
    if (activeRes.ok) setRows((await parse(activeRes)) || []);
    if (archiveRes.ok) setArchived((await parse(archiveRes)) || []);
    if (trashRes.ok) setTrashed((await parse(trashRes)) || []);
  }

  function queueConfirm(
    id: string,
    action: Exclude<SubmissionAction, "restore" | "unarchive">,
  ) {
    const prompt = ACTION_PROMPTS[action];
    setPendingConfirm({ id, action, ...prompt });
    setError("");
  }

  async function runAction(id: string, action: SubmissionAction) {
    setBusyId(id);
    setError("");
    const res = await fetch("/api/admin/samro-submissions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusyId(null);
    setPendingConfirm(null);
    if (!res.ok) {
      setError(data.error || "Request failed");
      return;
    }
    if (
      expandedId === id &&
      (action === "trash" || action === "cancel" || action === "archive" || action === "delete")
    ) {
      setExpandedId(null);
    }
    await refresh();
    if (action === "complete") router.refresh();
  }

  async function executePending() {
    if (!pendingConfirm) return;
    await runAction(pendingConfirm.id, pendingConfirm.action);
  }

  function switchFilter(next: ListFilter) {
    setFilter(next);
    setPendingConfirm(null);
    setError("");
  }

  const emptyMessage = useMemo(() => {
    if (filter === "trash") return "Trash is empty.";
    if (filter === "archive") return "No archived submissions.";
    return (
      <>
        No SAMRO forms yet.{" "}
        <Link href="/?samro=prepare" className="text-[var(--accent)] hover:underline">
          Open Prepare PRO
        </Link>
      </>
    );
  }, [filter]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--ink-dim)]">
        Forms prepared from Browse → SAMRO → Prepare PRO. After you email the file to SAMRO,
        mark the form complete to set each track’s SAMRO flag to Yes. Completed forms are
        archived, not trashed. Multiple composers export as separate rights holders with split
        perf share.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => switchFilter("active")}
          className={`rounded-md px-3 py-1.5 text-xs transition ${
            filter === "active"
              ? "bg-[var(--accent-soft)] text-[var(--ink)]"
              : "text-[var(--ink-dim)] hover:text-[var(--ink)]"
          }`}
        >
          Active{rows.length ? ` (${rows.length})` : ""}
        </button>
        <button
          type="button"
          onClick={() => switchFilter("archive")}
          className={`rounded-md px-3 py-1.5 text-xs transition ${
            filter === "archive"
              ? "bg-[var(--accent-soft)] text-[var(--ink)]"
              : "text-[var(--ink-dim)] hover:text-[var(--ink)]"
          }`}
        >
          Archive{archived.length ? ` (${archived.length})` : ""}
        </button>
        <button
          type="button"
          onClick={() => switchFilter("trash")}
          className={`rounded-md px-3 py-1.5 text-xs transition ${
            filter === "trash"
              ? "bg-[var(--accent-soft)] text-[var(--ink)]"
              : "text-[var(--ink-dim)] hover:text-[var(--ink)]"
          }`}
        >
          Trash{trashed.length ? ` (${trashed.length})` : ""}
        </button>
      </div>

      {error ? <p className="text-sm text-[var(--exclusive)]">{error}</p> : null}
      {!visible.length ? (
        <div className="rounded-xl border border-dashed border-[var(--line)] px-5 py-10 text-center text-sm text-[var(--ink-muted)]">
          {emptyMessage}
        </div>
      ) : (
        <ul className="divide-y divide-[var(--line)] rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)]/70">
          {visible.map((row) => {
            const open = expandedId === row.id;
            const projects = projectsForRow(row);
            const projectLabel = projects.length ? projects.join(" · ") : null;
            const confirming = pendingConfirm?.id === row.id;

            return (
              <li key={row.id}>
                <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setExpandedId(open ? null : row.id)}
                    className="min-w-0 flex-1 text-left"
                    aria-expanded={open}
                  >
                    <div className="truncate text-sm font-medium text-[var(--ink)]">
                      {projectLabel || row.publisherName}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-[var(--ink-dim)]">
                      {projectLabel ? (
                        <>
                          <span className="text-[var(--ink-muted)]">{row.publisherName}</span>
                          {" · "}
                        </>
                      ) : null}
                      {row.trackCount} track{row.trackCount === 1 ? "" : "s"} · {row.status}
                      {row.createdAt ? ` · ${row.createdAt.slice(0, 10)}` : null}
                      {filter === "trash" && row.trashedAt
                        ? ` · trashed ${formatStamp(row.trashedAt)}`
                        : null}
                      {filter === "archive" && row.archivedAt
                        ? ` · archived ${formatStamp(row.archivedAt)}`
                        : null}
                      <span className="ml-2 text-[var(--accent)]">
                        {open ? "Hide details" : "Details"}
                      </span>
                    </div>
                  </button>

                  {confirming && pendingConfirm ? (
                    <div className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-[var(--line)] bg-[rgba(0,0,0,0.22)] px-3 py-2 sm:w-auto sm:min-w-[18rem]">
                      <p className="min-w-0 flex-1 text-xs text-[var(--ink-muted)]">
                        {pendingConfirm.message}
                      </p>
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => setPendingConfirm(null)}
                        className="rounded-lg px-2.5 py-1.5 text-xs text-[var(--ink-dim)] hover:text-[var(--ink)] disabled:opacity-50"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => void executePending()}
                        className={`rounded-lg px-2.5 py-1.5 text-xs font-medium disabled:opacity-50 ${
                          pendingConfirm.destructive
                            ? "bg-[var(--exclusive)]/15 text-[var(--exclusive)] hover:brightness-110"
                            : "bg-[var(--accent)] text-white hover:brightness-110"
                        }`}
                      >
                        {busyId === row.id ? "Working…" : pendingConfirm.confirmLabel}
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      {filter === "trash" ? (
                        <>
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => void runAction(row.id, "restore")}
                            className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)] disabled:opacity-50"
                          >
                            Restore
                          </button>
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => queueConfirm(row.id, "delete")}
                            className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--exclusive)] transition hover:border-[var(--exclusive)] disabled:opacity-50"
                          >
                            Delete forever
                          </button>
                        </>
                      ) : filter === "archive" ? (
                        <>
                          <a
                            href={`/api/admin/samro-submissions/${row.id}/export`}
                            className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)]"
                          >
                            Download
                          </a>
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => void runAction(row.id, "unarchive")}
                            className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)] disabled:opacity-50"
                          >
                            Unarchive
                          </button>
                        </>
                      ) : (
                        <>
                          {row.status !== "cancelled" ? (
                            <a
                              href={`/api/admin/samro-submissions/${row.id}/export`}
                              className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)]"
                            >
                              Download
                            </a>
                          ) : null}
                          {row.status !== "completed" && row.status !== "cancelled" ? (
                            <button
                              type="button"
                              disabled={busyId === row.id}
                              onClick={() => queueConfirm(row.id, "complete")}
                              className="rounded-lg bg-[var(--available)]/20 px-3 py-1.5 text-xs font-medium text-[var(--available)] transition hover:brightness-110 disabled:opacity-50"
                            >
                              Mark complete
                            </button>
                          ) : null}
                          {row.status === "draft" || row.status === "exported" ? (
                            <button
                              type="button"
                              disabled={busyId === row.id}
                              onClick={() => queueConfirm(row.id, "cancel")}
                              className="rounded-lg px-3 py-1.5 text-xs text-[var(--ink-dim)] transition hover:text-[var(--exclusive)] disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          ) : null}
                          {row.status === "completed" ? (
                            <button
                              type="button"
                              disabled={busyId === row.id}
                              onClick={() => queueConfirm(row.id, "archive")}
                              className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)] disabled:opacity-50"
                            >
                              Archive
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busyId === row.id}
                              onClick={() => queueConfirm(row.id, "trash")}
                              className="rounded-lg px-3 py-1.5 text-xs text-[var(--ink-dim)] transition hover:text-[var(--exclusive)] disabled:opacity-50"
                            >
                              Trash
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {open ? (
                  <div className="border-t border-[var(--line)] bg-[rgba(0,0,0,0.15)] px-4 py-4">
                    <dl className="mb-4 grid gap-2 text-xs text-[var(--ink-dim)] sm:grid-cols-2">
                      <div>
                        <dt className="uppercase tracking-[0.12em]">Publisher</dt>
                        <dd className="mt-0.5 text-sm text-[var(--ink)]">{row.publisherName}</dd>
                      </div>
                      <div>
                        <dt className="uppercase tracking-[0.12em]">Project</dt>
                        <dd className="mt-0.5 text-sm text-[var(--ink)]">
                          {projectLabel || "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="uppercase tracking-[0.12em]">Status</dt>
                        <dd className="mt-0.5 text-sm text-[var(--ink)]">{row.status}</dd>
                      </div>
                      <div>
                        <dt className="uppercase tracking-[0.12em]">File</dt>
                        <dd className="mt-0.5 truncate text-sm text-[var(--ink)]">
                          {row.fileName || "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="uppercase tracking-[0.12em]">Created</dt>
                        <dd className="mt-0.5 text-sm text-[var(--ink)]">
                          {formatStamp(row.createdAt) || "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="uppercase tracking-[0.12em]">Exported</dt>
                        <dd className="mt-0.5 text-sm text-[var(--ink)]">
                          {formatStamp(row.exportedAt) || "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="uppercase tracking-[0.12em]">Completed</dt>
                        <dd className="mt-0.5 text-sm text-[var(--ink)]">
                          {formatStamp(row.completedAt) || "—"}
                        </dd>
                      </div>
                      {filter === "archive" && row.archivedAt ? (
                        <div>
                          <dt className="uppercase tracking-[0.12em]">Archived</dt>
                          <dd className="mt-0.5 text-sm text-[var(--ink)]">
                            {formatStamp(row.archivedAt) || "—"}
                          </dd>
                        </div>
                      ) : null}
                      {filter === "trash" && row.trashedAt ? (
                        <div>
                          <dt className="uppercase tracking-[0.12em]">Trashed</dt>
                          <dd className="mt-0.5 text-sm text-[var(--ink)]">
                            {formatStamp(row.trashedAt) || "—"}
                          </dd>
                        </div>
                      ) : null}
                      {row.notes ? (
                        <div className="sm:col-span-2">
                          <dt className="uppercase tracking-[0.12em]">Notes</dt>
                          <dd className="mt-0.5 text-sm text-[var(--ink)]">{row.notes}</dd>
                        </div>
                      ) : null}
                    </dl>

                    <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
                      Tracks on this form
                    </p>
                    {!row.tracks?.length ? (
                      <p className="text-sm text-[var(--ink-muted)]">No track snapshots stored.</p>
                    ) : (
                      <ul className="divide-y divide-[var(--line)] rounded-lg border border-[var(--line)]">
                        {row.tracks.map((track) => (
                          <li
                            key={track.trackId}
                            className="grid gap-1 px-3 py-2.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]"
                          >
                            <div className="min-w-0">
                              <Link
                                href={`/?q=${encodeURIComponent(track.trackId)}`}
                                className="block truncate text-sm font-medium text-[var(--ink)] hover:text-[var(--accent)]"
                              >
                                {track.title}
                              </Link>
                              <div className="truncate text-[11px] text-[var(--ink-dim)]">
                                {track.publisher ? `${track.publisher} · ` : null}
                                {track.project ? `${track.project} · ` : null}
                                {track.subtitle ? `${track.subtitle} · ` : null}
                                {track.trackId}
                                {track.artist ? ` · ${track.artist}` : null}
                              </div>
                            </div>
                            <div className="truncate text-xs text-[var(--ink-muted)]">
                              {[track.genre, track.instrumentation].filter(Boolean).join(" · ") ||
                                "—"}
                              {track.firstPublicationDate
                                ? ` · ${track.firstPublicationDate}`
                                : null}
                            </div>
                            <div className="text-xs tabular-nums text-[var(--ink-dim)] sm:text-right">
                              {formatDuration(track.durationMin, track.durationSec)}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
