"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LicensePanel } from "@/components/license-panel";
import {
  emptyLicenseScopeForm,
  LicenseScopeChips,
  LicenseScopeFields,
  type LicenseScopeFormValue,
} from "@/components/license-scope-fields";
import type { CatalogMetaSuggestions } from "@/lib/queries";

export type LicenseRequestRow = {
  id: string;
  trackId: string;
  trackTitle: string;
  userId: string;
  userName: string;
  userEmail: string;
  scope: string;
  territory: string;
  media: string;
  duration: string;
  branding: string;
  intendedUse: string;
  message: string | null;
  status: string;
  trashedAt?: string | null;
  createdAt: string;
  updatedAt: string;
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

/** Deterministic date+time — same on server and client (avoids hydration mismatch). */
function formatWhen(iso: string) {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  const d = new Date(parsed);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function rowToForm(row: LicenseRequestRow): LicenseScopeFormValue {
  return {
    territory: row.territory || "",
    media: row.media || "",
    duration: row.duration || "",
    branding: row.branding || "",
    project: row.intendedUse || "",
    notes: row.message || "",
  };
}

export function LicenseRequestsManager({
  initialRequests,
  initialTrashed = [],
  metaSuggestions,
}: {
  initialRequests: LicenseRequestRow[];
  initialTrashed?: LicenseRequestRow[];
  metaSuggestions?: CatalogMetaSuggestions;
}) {
  const router = useRouter();
  const [requests, setRequests] = useState(initialRequests);
  const [trashed, setTrashed] = useState(initialTrashed);
  const [filter, setFilter] = useState<"pending" | "all" | "trash">("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [accepting, setAccepting] = useState<LicenseRequestRow | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<LicenseScopeFormValue>(emptyLicenseScopeForm);
  const [editStatus, setEditStatus] = useState("pending");

  useEffect(() => {
    setRequests(initialRequests);
    setTrashed(initialTrashed);
  }, [initialRequests, initialTrashed]);

  const visible = useMemo(() => {
    if (filter === "trash") return trashed;
    if (filter === "pending") return requests.filter((r) => r.status === "pending");
    return requests;
  }, [requests, trashed, filter]);

  async function setStatus(id: string, status: "declined" | "archived" | "accepted") {
    setBusyId(id);
    setError("");
    const res = await fetch(`/api/admin/license-requests/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) {
      setError(data.error || "Update failed");
      return;
    }
    setRequests((prev) =>
      prev.map((row) => (row.id === id ? { ...row, status, updatedAt: new Date().toISOString() } : row)),
    );
    router.refresh();
  }

  function startEdit(row: LicenseRequestRow) {
    setEditingId(row.id);
    setEditForm(rowToForm(row));
    setEditStatus(row.status);
    setError("");
  }

  async function saveEdit(e: FormEvent, id: string) {
    e.preventDefault();
    setBusyId(id);
    setError("");
    const res = await fetch(`/api/admin/license-requests/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        territory: editForm.territory,
        media: editForm.media,
        duration: editForm.duration,
        branding: editForm.branding,
        intendedUse: editForm.project,
        message: editForm.notes,
        status: editStatus,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) {
      setError(data.error || "Save failed");
      return;
    }
    const updated = data.request;
    setRequests((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              territory: updated.territory || editForm.territory,
              media: updated.media || editForm.media,
              duration: updated.duration || editForm.duration,
              branding: updated.branding || editForm.branding,
              scope: updated.scope || row.scope,
              intendedUse: updated.intendedUse || editForm.project,
              message: updated.message ?? (editForm.notes.trim() || null),
              status: updated.status || editStatus,
              updatedAt: updated.updatedAt || new Date().toISOString(),
            }
          : row,
      ),
    );
    setEditingId(null);
    router.refresh();
  }

  async function trashRequest(id: string) {
    if (!confirm("Move this license request to Trash?")) return;
    setBusyId(id);
    setError("");
    const res = await fetch(`/api/admin/license-requests/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) {
      setError(data.error || "Could not move to Trash");
      return;
    }
    const row = requests.find((r) => r.id === id);
    setRequests((prev) => prev.filter((r) => r.id !== id));
    if (row) {
      setTrashed((prev) => [
        {
          ...row,
          trashedAt: data.request?.trashedAt || new Date().toISOString(),
          updatedAt: data.request?.updatedAt || new Date().toISOString(),
        },
        ...prev,
      ]);
    }
    if (editingId === id) setEditingId(null);
    router.refresh();
  }

  async function restoreRequest(id: string) {
    setBusyId(id);
    setError("");
    const res = await fetch(`/api/admin/license-requests/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "restore" }),
    });
    const data = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) {
      setError(data.error || "Restore failed");
      return;
    }
    const row = trashed.find((r) => r.id === id);
    setTrashed((prev) => prev.filter((r) => r.id !== id));
    if (row) {
      setRequests((prev) => [
        { ...row, trashedAt: null, updatedAt: data.request?.updatedAt || new Date().toISOString() },
        ...prev,
      ]);
    }
    router.refresh();
  }

  async function permanentlyDeleteRequest(id: string) {
    if (!confirm("Permanently delete this license request? This cannot be undone.")) return;
    setBusyId(id);
    setError("");
    const res = await fetch(
      `/api/admin/license-requests/${encodeURIComponent(id)}?permanent=1`,
      { method: "DELETE" },
    );
    const data = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) {
      setError(data.error || "Delete failed");
      return;
    }
    setTrashed((prev) => prev.filter((r) => r.id !== id));
    router.refresh();
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border border-[var(--line)] p-0.5">
          <button
            type="button"
            onClick={() => setFilter("pending")}
            className={`rounded-md px-3 py-1.5 text-xs transition ${
              filter === "pending"
                ? "bg-[var(--accent-soft)] text-[var(--ink)]"
                : "text-[var(--ink-dim)] hover:text-[var(--ink)]"
            }`}
          >
            Pending
          </button>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`rounded-md px-3 py-1.5 text-xs transition ${
              filter === "all"
                ? "bg-[var(--accent-soft)] text-[var(--ink)]"
                : "text-[var(--ink-dim)] hover:text-[var(--ink)]"
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilter("trash")}
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
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--line)] px-4 py-8 text-center text-sm text-[var(--ink-dim)]">
          {filter === "pending"
            ? "No pending license requests."
            : filter === "trash"
              ? "Trash is empty."
              : "No license requests yet."}
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((row) => {
            const editing = editingId === row.id;
            return (
              <li
                key={row.id}
                className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)]/70 px-4 py-3.5"
              >
                {editing ? (
                  <form onSubmit={(e) => void saveEdit(e, row.id)} className="space-y-3">
                    <div>
                      <div className="text-sm font-medium text-[var(--ink)]">{row.trackTitle}</div>
                      <div className="mt-0.5 text-xs text-[var(--ink-dim)]">
                        {row.trackId} · {row.userName}
                        {row.userEmail ? ` · ${row.userEmail}` : ""}
                      </div>
                    </div>
                    <LicenseScopeFields
                      value={editForm}
                      onChange={setEditForm}
                      projectLabel="Project"
                      notesLabel="Message"
                      notesPlaceholder="Notes from client…"
                    />
                    <label className="block max-w-[12rem]">
                      <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
                        Status
                      </span>
                      <select
                        className="w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value)}
                      >
                        <option value="pending">Pending</option>
                        <option value="accepted">Accepted</option>
                        <option value="declined">Declined</option>
                        <option value="archived">Archived</option>
                      </select>
                    </label>
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => setEditingId(null)}
                        className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--ink-muted)]"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={busyId === row.id}
                        className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                      >
                        {busyId === row.id ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-2">
                      <div>
                        <div className="text-sm font-medium text-[var(--ink)]">{row.trackTitle}</div>
                        <div className="mt-0.5 text-xs text-[var(--ink-dim)]">
                          {row.trackId} · {row.userName}
                          {row.userEmail ? ` · ${row.userEmail}` : ""}
                        </div>
                      </div>
                      <LicenseScopeChips
                        media={row.media}
                        territory={row.territory}
                        duration={row.duration}
                        branding={row.branding}
                        scope={row.scope}
                      />
                      <div className="text-sm text-[var(--ink-muted)]">
                        <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
                          Project
                        </span>
                        <div>{row.intendedUse}</div>
                      </div>
                      {row.message ? (
                        <p className="text-xs text-[var(--ink-dim)]">{row.message}</p>
                      ) : null}
                      <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
                        {row.status} · {formatWhen(row.createdAt)}
                        {filter === "trash" && row.trashedAt
                          ? ` · trashed ${formatWhen(row.trashedAt)}`
                          : ""}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {filter === "trash" ? (
                        <>
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => void restoreRequest(row.id)}
                            className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
                          >
                            Restore
                          </button>
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => void permanentlyDeleteRequest(row.id)}
                            className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--exclusive)] transition hover:border-[var(--exclusive)] disabled:opacity-50"
                          >
                            Delete forever
                          </button>
                        </>
                      ) : (
                        <>
                          {row.status === "pending" ? (
                            <>
                              <button
                                type="button"
                                disabled={busyId === row.id}
                                onClick={() => setAccepting(row)}
                                className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white transition hover:brightness-110 disabled:opacity-50"
                              >
                                Accept
                              </button>
                              <button
                                type="button"
                                disabled={busyId === row.id}
                                onClick={() => void setStatus(row.id, "declined")}
                                className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--exclusive)] transition hover:border-[var(--exclusive)] disabled:opacity-50"
                              >
                                Decline
                              </button>
                            </>
                          ) : null}
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => startEdit(row)}
                            className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => void trashRequest(row.id)}
                            className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--exclusive)] transition hover:border-[var(--exclusive)] disabled:opacity-50"
                          >
                            Trash
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {accepting ? (
        <LicensePanel
          trackId={accepting.trackId}
          trackTitle={accepting.trackTitle}
          open
          onClose={() => setAccepting(null)}
          metaSuggestions={metaSuggestions}
          acceptRequestId={accepting.id}
          initialPrefill={{
            client: accepting.userName || accepting.userEmail,
            project: accepting.intendedUse,
            territory: accepting.territory || "",
            media: accepting.media || "",
            duration: accepting.duration || "",
            branding: accepting.branding || "",
            notes: accepting.message || "",
            licensedAt: new Date().toISOString().slice(0, 10),
          }}
          onEntryChanged={() => {
            setRequests((prev) =>
              prev.map((row) =>
                row.id === accepting.id
                  ? { ...row, status: "accepted", updatedAt: new Date().toISOString() }
                  : row,
              ),
            );
            setAccepting(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
