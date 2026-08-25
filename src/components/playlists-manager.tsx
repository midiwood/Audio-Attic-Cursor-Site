"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { TRASH_HREF } from "@/lib/trash-constants";

type ShareRecipient = {
  userId: string;
  name: string;
  email: string;
};

type ShareableUser = {
  id: string;
  name: string;
  email: string;
};

type PlaylistSummary = {
  id: string;
  name: string;
  trackCount: number;
  updatedAt: string;
  isOwner: boolean;
  guestToken?: string | null;
  sharedBy?: { id: string; name: string; email: string } | null;
  sharedWith?: ShareRecipient[];
};

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 7h14M10 11v6M14 11v6M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="18" cy="5" r="2.25" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="6" cy="12" r="2.25" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="18" cy="19" r="2.25" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M8.1 10.9 15.9 6.1M8.1 13.1l7.8 4.8"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="9"
        y="9"
        width="11"
        height="11"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function guestInviteUrl(token: string) {
  if (typeof window === "undefined") return `/guest/playlist/${encodeURIComponent(token)}`;
  return `${window.location.origin}/guest/playlist/${encodeURIComponent(token)}`;
}

function ShareMenu({
  playlist,
  shareableUsers,
  busy,
  open,
  onToggle,
  onGuestLink,
  onShareUser,
  onUnshareUser,
}: {
  playlist: PlaylistSummary;
  shareableUsers: ShareableUser[];
  busy: boolean;
  open: boolean;
  onToggle: () => void;
  onGuestLink: (mode: "enable" | "regenerate" | "disable") => Promise<string | null>;
  onShareUser: (userId: string) => void;
  onUnshareUser: (userId: string) => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [userQuery, setUserQuery] = useState("");
  const shareCount = playlist.sharedWith?.length ?? 0;
  const hasGuest = Boolean(playlist.guestToken);

  const sharedIds = useMemo(
    () => new Set((playlist.sharedWith || []).map((u) => u.userId)),
    [playlist.sharedWith],
  );

  const availableUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    return shareableUsers
      .filter((u) => !sharedIds.has(u.id))
      .filter(
        (u) =>
          !q ||
          u.email.toLowerCase().includes(q) ||
          (u.name || "").toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [shareableUsers, sharedIds, userQuery]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      onToggle();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onToggle();
    }
    const t = window.setTimeout(() => {
      document.addEventListener("mousedown", onDoc);
      document.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onToggle]);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(t);
  }, [copied]);

  async function copyGuestLink(token: string) {
    const url = guestInviteUrl(token);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      window.prompt("Copy guest link:", url);
    }
  }

  async function ensureAndCopy() {
    let token = playlist.guestToken || null;
    if (!token) {
      token = await onGuestLink("enable");
    }
    if (token) await copyGuestLink(token);
  }

  return (
    <div ref={panelRef} className="relative z-30" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={onToggle}
        disabled={busy}
        className={`relative grid h-9 w-9 place-items-center rounded-lg border transition disabled:opacity-50 ${
          open || shareCount || hasGuest
            ? "border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent)]"
            : "border-[var(--line)] text-[var(--ink-muted)] hover:border-[var(--accent)] hover:text-[var(--ink)]"
        }`}
        aria-label={open ? "Close sharing" : "Share playlist"}
        aria-expanded={open}
        title="Share"
      >
        <ShareIcon className="h-4 w-4" />
        {shareCount ? (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--accent)] px-1 text-[9px] font-semibold text-white">
            {shareCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] shadow-[0_16px_40px_rgba(0,0,0,0.45)]">
          <div className="border-b border-[var(--line)] px-3 py-2 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
            Share
          </div>

          <div className="space-y-2 border-b border-[var(--line)] p-3">
            <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
              Guest link
            </div>
            <p className="text-xs text-[var(--ink-dim)]">
              Anyone with the link can listen to this playlist only.
            </p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => void ensureAndCopy()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white transition hover:brightness-110 disabled:opacity-50"
              >
                <CopyIcon className="h-3.5 w-3.5" />
                {copied ? "Copied" : hasGuest ? "Copy link" : "Enable & copy"}
              </button>
              {hasGuest ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (!confirm("Regenerate link? The old guest link will stop working.")) return;
                      void onGuestLink("regenerate");
                    }}
                    className="rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)] disabled:opacity-50"
                  >
                    Regenerate
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (!confirm("Disable guest link?")) return;
                      void onGuestLink("disable");
                    }}
                    className="rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs text-[var(--exclusive)] transition hover:border-[var(--exclusive)] disabled:opacity-50"
                  >
                    Disable
                  </button>
                </>
              ) : null}
            </div>
          </div>

          <div className="p-3">
            <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
              Add user
            </div>
            <div className="max-h-36 space-y-1 overflow-y-auto">
              {playlist.sharedWith?.length ? (
                playlist.sharedWith.map((u) => (
                  <div
                    key={u.userId}
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm text-[var(--ink)]">{u.name || u.email}</div>
                      <div className="truncate text-[10px] text-[var(--ink-dim)]">{u.email}</div>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onUnshareUser(u.userId)}
                      className="shrink-0 rounded px-1.5 py-0.5 text-xs text-[var(--ink-dim)] transition hover:text-[var(--exclusive)] disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                ))
              ) : (
                <p className="px-2 py-1 text-xs text-[var(--ink-dim)]">No users added yet</p>
              )}
            </div>
            <input
              type="search"
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              placeholder="Search existing users…"
              disabled={busy}
              className="mt-2 w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-2.5 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)] disabled:opacity-50"
            />
            {userQuery.trim() && availableUsers.length ? (
              <ul className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-[var(--line)]">
                {availableUsers.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        onShareUser(u.id);
                        setUserQuery("");
                      }}
                      className="flex w-full flex-col items-start px-2.5 py-2 text-left transition hover:bg-[var(--accent-soft)] disabled:opacity-50"
                    >
                      <span className="text-sm text-[var(--ink)]">{u.name || u.email}</span>
                      <span className="text-[10px] text-[var(--ink-dim)]">{u.email}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : userQuery.trim() ? (
              <p className="mt-1 px-1 text-xs text-[var(--ink-dim)]">No matching users</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PlaylistRow({
  href,
  name,
  meta,
  actions,
  elevated = false,
}: {
  href: string;
  name: string;
  meta: string;
  actions?: ReactNode;
  elevated?: boolean;
}) {
  return (
    <li
      className={`group relative border-b border-[var(--line)] last:border-b-0 hover:bg-[rgba(255,255,255,0.02)] ${
        elevated ? "z-40" : "z-0"
      }`}
    >
      <Link href={href} className="absolute inset-0 z-0" aria-label={`Open ${name}`} />
      <div className="relative z-10 flex items-center gap-3 px-4 py-3.5 pointer-events-none">
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-medium text-[var(--ink)] transition group-hover:text-[var(--accent)]">
            {name}
          </div>
          <div className="mt-0.5 truncate text-xs text-[var(--ink-dim)]">{meta}</div>
        </div>
        {actions ? (
          <div className="relative z-20 flex shrink-0 items-center gap-1.5 pointer-events-auto">
            {actions}
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function PlaylistsManager({
  initialPlaylists,
  shareableUsers = [],
  trashCount = 0,
  showTrash = true,
}: {
  initialPlaylists: PlaylistSummary[];
  shareableUsers?: ShareableUser[];
  trashCount?: number;
  showTrash?: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [shareBusy, setShareBusy] = useState<string | null>(null);
  const [shareError, setShareError] = useState("");
  const [shareOk, setShareOk] = useState("");
  const [shareOpenId, setShareOpenId] = useState<string | null>(null);

  const owned = initialPlaylists.filter((p) => p.isOwner);
  const shared = initialPlaylists.filter((p) => !p.isOwner);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/playlists", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "create", name }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Could not create playlist");
      return;
    }
    setName("");
    router.push(`/playlists/${data.playlist.id}`);
    router.refresh();
  }

  async function onDelete(id: string, playlistName: string) {
    if (!confirm(`Delete playlist “${playlistName}”?`)) return;
    setShareOpenId(null);
    await fetch("/api/playlists", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    router.refresh();
  }

  async function onGuestLink(
    playlistId: string,
    mode: "enable" | "regenerate" | "disable",
  ): Promise<string | null> {
    setShareBusy(playlistId);
    setShareError("");
    setShareOk("");
    const res = await fetch("/api/playlists", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "guestLink", id: playlistId, mode }),
    });
    const data = await res.json().catch(() => ({}));
    setShareBusy(null);
    if (!res.ok) {
      setShareError(data.error || "Could not update guest link");
      return null;
    }
    if (mode === "disable") setShareOk("Guest link disabled");
    else if (mode === "regenerate") setShareOk("Guest link regenerated");
    router.refresh();
    return (data.guestToken as string) || null;
  }

  async function onShareUser(playlistId: string, userId: string) {
    setShareBusy(playlistId);
    setShareError("");
    setShareOk("");
    const res = await fetch("/api/playlists", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "share", id: playlistId, userId }),
    });
    const data = await res.json().catch(() => ({}));
    setShareBusy(null);
    if (!res.ok) {
      setShareError(data.error || "Could not add user");
      return;
    }
    setShareOk("User added");
    router.refresh();
  }

  async function onUnshareUser(playlistId: string, userId: string) {
    setShareBusy(playlistId);
    setShareError("");
    const res = await fetch("/api/playlists", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "unshare", id: playlistId, userId }),
    });
    const data = await res.json().catch(() => ({}));
    setShareBusy(null);
    if (!res.ok) {
      setShareError(data.error || "Could not update sharing");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <form
          onSubmit={onCreate}
          className="flex flex-col gap-3 rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)]/70 p-4 sm:flex-row sm:items-end"
        >
          <label className="min-w-0 flex-1">
            <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
              New playlist
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Twende pitch, Folk available"
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
              required
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-60"
          >
            {loading ? "Creating…" : "Create playlist"}
          </button>
        </form>
        {error ? <p className="text-sm text-[var(--exclusive)]">{error}</p> : null}
        {shareOk ? <p className="text-sm text-[var(--available)]">{shareOk}</p> : null}
        {shareError ? <p className="text-sm text-[var(--exclusive)]">{shareError}</p> : null}

        <div>
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--ink-dim)]">
            Your playlists
          </h2>
          {owned.length ? (
            <ul className="overflow-visible rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)]/70">
              {owned.map((playlist) => (
                <PlaylistRow
                  key={playlist.id}
                  href={`/playlists/${playlist.id}`}
                  name={playlist.name}
                  meta={`${playlist.trackCount} track${playlist.trackCount === 1 ? "" : "s"}`}
                  elevated={shareOpenId === playlist.id}
                  actions={
                    <>
                      <ShareMenu
                        playlist={playlist}
                        shareableUsers={shareableUsers}
                        busy={shareBusy === playlist.id}
                        open={shareOpenId === playlist.id}
                        onToggle={() =>
                          setShareOpenId((prev) => (prev === playlist.id ? null : playlist.id))
                        }
                        onGuestLink={(mode) => onGuestLink(playlist.id, mode)}
                        onShareUser={(userId) => void onShareUser(playlist.id, userId)}
                        onUnshareUser={(userId) => void onUnshareUser(playlist.id, userId)}
                      />
                      <button
                        type="button"
                        onClick={() => void onDelete(playlist.id, playlist.name)}
                        className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--line)] text-[var(--exclusive)] transition hover:border-[var(--exclusive)]"
                        aria-label={`Delete ${playlist.name}`}
                        title="Delete"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </>
                  }
                />
              ))}
            </ul>
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--line)] px-6 py-14 text-center text-[var(--ink-muted)]">
              No playlists yet. Create one, then add tracks from the catalog with +.
            </div>
          )}
        </div>
      </section>

      {shared.length ? (
        <section>
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--ink-dim)]">
            Shared with you
          </h2>
          <ul className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)]/70">
            {shared.map((playlist) => (
              <PlaylistRow
                key={playlist.id}
                href={`/playlists/${playlist.id}`}
                name={playlist.name}
                meta={[
                  `${playlist.trackCount} track${playlist.trackCount === 1 ? "" : "s"}`,
                  playlist.sharedBy?.email ? `from ${playlist.sharedBy.email}` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {showTrash ? (
        <section className="border-t border-[var(--line)] pt-8">
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--ink-dim)]">
            System
          </h2>
          <Link
            href={TRASH_HREF}
            className="group flex items-center justify-between gap-4 rounded-xl border border-dashed border-[var(--line)] bg-[rgba(245,158,11,0.06)] px-4 py-4 transition hover:border-[var(--exclusive)]/50"
          >
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[var(--exclusive)]/30 bg-[rgba(245,158,11,0.1)] text-[var(--exclusive)]">
                <TrashIcon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="text-base font-medium text-[var(--ink)] group-hover:text-[var(--exclusive)]">
                  Trash
                </div>
                <div className="mt-1 text-xs text-[var(--ink-dim)]">
                  {trashCount === 0
                    ? "Empty — soft-deleted tracks appear here"
                    : `${trashCount} track${trashCount === 1 ? "" : "s"} · restore or permanently delete`}
                </div>
              </div>
            </div>
            <span className="shrink-0 text-sm text-[var(--ink-dim)] transition group-hover:text-[var(--exclusive)]">
              Open →
            </span>
          </Link>
        </section>
      ) : null}
    </div>
  );
}
