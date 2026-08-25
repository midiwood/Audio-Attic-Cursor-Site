"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { authClient } from "@/lib/auth-client";
import type { AppRole } from "@/lib/auth-permissions";
import { isPendingApproval, PENDING_APPROVAL_REASON } from "@/lib/pending-approval";

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  banned?: boolean | null;
  banReason?: string | null;
  createdAt: Date | string;
};

const fieldClass =
  "w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]";

const labelClass =
  "mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]";

export function UsersManager({
  initialUsers,
  currentUserId,
}: {
  initialUsers: ManagedUser[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AppRole>("subscriber");

  const sorted = useMemo(
    () =>
      [...users].sort((a, b) =>
        a.email.localeCompare(b.email, undefined, { sensitivity: "base" }),
      ),
    [users],
  );

  const pending = useMemo(
    () => sorted.filter((u) => isPendingApproval(u)),
    [sorted],
  );
  const activeOrBanned = useMemo(
    () => sorted.filter((u) => !isPendingApproval(u)),
    [sorted],
  );

  async function refreshUsers() {
    const { data, error: listError } = await authClient.admin.listUsers({
      query: { limit: 200, sortBy: "email", sortDirection: "asc" },
    });
    if (listError) {
      setError(listError.message || "Failed to load users");
      return;
    }
    setUsers((data?.users as ManagedUser[]) || []);
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setStatus("");
    const { error: createError } = await authClient.admin.createUser({
      name: name.trim(),
      email: email.trim(),
      password,
      role,
    });
    setBusy(false);
    if (createError) {
      setError(createError.message || "Could not create user");
      return;
    }
    setName("");
    setEmail("");
    setPassword("");
    setRole("subscriber");
    setStatus("User created.");
    await refreshUsers();
    router.refresh();
  }

  async function onSetRole(userId: string, nextRole: AppRole) {
    setBusy(true);
    setError("");
    const { error: roleError } = await authClient.admin.setRole({
      userId,
      role: nextRole,
    });
    setBusy(false);
    if (roleError) {
      setError(roleError.message || "Could not update role");
      return;
    }
    setStatus("Role updated.");
    await refreshUsers();
    router.refresh();
  }

  async function onResetPassword(userId: string, userEmail: string) {
    const next = window.prompt(`New password for ${userEmail} (min 8 characters)`);
    if (!next) return;
    if (next.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setBusy(true);
    setError("");
    const { error: pwError } = await authClient.admin.setUserPassword({
      userId,
      newPassword: next,
    });
    setBusy(false);
    if (pwError) {
      setError(pwError.message || "Could not reset password");
      return;
    }
    setStatus(`Password reset for ${userEmail}.`);
  }

  async function onApprove(user: ManagedUser) {
    if (user.id === currentUserId) return;
    setBusy(true);
    setError("");
    const { error: unbanError } = await authClient.admin.unbanUser({ userId: user.id });
    setBusy(false);
    if (unbanError) {
      setError(unbanError.message || "Could not approve user");
      return;
    }
    setStatus(`${user.email} approved.`);
    await refreshUsers();
    router.refresh();
  }

  async function onToggleBan(user: ManagedUser) {
    if (user.id === currentUserId) {
      setError("You cannot ban yourself.");
      return;
    }
    setBusy(true);
    setError("");
    if (user.banned) {
      const { error: unbanError } = await authClient.admin.unbanUser({ userId: user.id });
      setBusy(false);
      if (unbanError) {
        setError(unbanError.message || "Could not unban user");
        return;
      }
      setStatus(`${user.email} unbanned.`);
    } else {
      const { error: banError } = await authClient.admin.banUser({
        userId: user.id,
        banReason: "Disabled by admin",
      });
      setBusy(false);
      if (banError) {
        setError(banError.message || "Could not ban user");
        return;
      }
      setStatus(`${user.email} banned.`);
    }
    await refreshUsers();
    router.refresh();
  }

  async function onRemove(user: ManagedUser) {
    if (user.id === currentUserId) {
      setError("You cannot delete yourself.");
      return;
    }
    if (!window.confirm(`Delete ${user.email}? This cannot be undone.`)) return;
    setBusy(true);
    setError("");
    const { error: removeError } = await authClient.admin.removeUser({ userId: user.id });
    setBusy(false);
    if (removeError) {
      setError(removeError.message || "Could not delete user");
      return;
    }
    setStatus(`${user.email} deleted.`);
    await refreshUsers();
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <form
        onSubmit={onCreate}
        className="space-y-4 rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)]/70 p-5"
        autoComplete="off"
      >
        <div>
          <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
            Add user
          </h2>
          <p className="mt-1.5 text-sm text-[var(--ink-dim)]">
            Editors can use the catalog. Admins can also manage users.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className={labelClass}>Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="off"
              className={fieldClass}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className={labelClass}>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="off"
              className={fieldClass}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Temporary password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className={fieldClass}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Role</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as AppRole)}
              className={fieldClass}
            >
              <option value="subscriber">Subscriber</option>
              <option value="editor">Editor</option>
              <option value="admin">Admin</option>
            </select>
          </label>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-50"
        >
          Create user
        </button>
      </form>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
              People
            </h2>
            <p className="mt-1.5 text-sm text-[var(--ink-dim)]">
              {activeOrBanned.length} users
              {pending.length ? ` · ${pending.length} pending` : ""}
            </p>
          </div>
          <Link
            href="/admin/site"
            className="text-sm text-[var(--ink-dim)] transition hover:text-[var(--accent)]"
          >
            ← Admin
          </Link>
        </div>

        {pending.length ? (
          <div className="mb-6">
            <h3 className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--exclusive)]">
              Awaiting approval
            </h3>
            <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-[var(--exclusive)]/30 bg-[var(--bg-elevated)]/70">
              {pending.map((user) => (
                <li
                  key={user.id}
                  className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-[var(--ink)]">{user.name}</div>
                    <div className="truncate text-sm text-[var(--ink-muted)]">{user.email}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onApprove(user)}
                      className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={busy || user.id === currentUserId}
                      onClick={() => onRemove(user)}
                      className="rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-sm text-[var(--exclusive)] transition hover:brightness-110 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)]/70">
          {activeOrBanned.map((user) => {
            const roleValue = (
              user.role === "admin" || user.role === "editor" || user.role === "subscriber"
                ? user.role
                : "subscriber"
            ) as AppRole;
            return (
              <li
                key={user.id}
                className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-[var(--ink)]">{user.name}</div>
                  <div className="truncate text-sm text-[var(--ink-muted)]">{user.email}</div>
                  {user.banned ? (
                    <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-[var(--exclusive)]">
                      {user.banReason === PENDING_APPROVAL_REASON ? "Pending" : "Banned"}
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={roleValue}
                    disabled={busy || user.id === currentUserId}
                    onChange={(e) => onSetRole(user.id, e.target.value as AppRole)}
                    className="rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)] disabled:opacity-50"
                  >
                    <option value="subscriber">Subscriber</option>
                    <option value="editor">Editor</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onResetPassword(user.id, user.email)}
                    className="rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-sm text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)] disabled:opacity-50"
                  >
                    Reset password
                  </button>
                  <button
                    type="button"
                    disabled={busy || user.id === currentUserId}
                    onClick={() => onToggleBan(user)}
                    className="rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-sm text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)] disabled:opacity-50"
                  >
                    {user.banned ? "Unban" : "Ban"}
                  </button>
                  <button
                    type="button"
                    disabled={busy || user.id === currentUserId}
                    onClick={() => onRemove(user)}
                    className="rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-sm text-[var(--exclusive)] transition hover:brightness-110 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {error ? <p className="text-sm text-[var(--exclusive)]">{error}</p> : null}
      {status ? <p className="text-sm text-[var(--available)]">{status}</p> : null}
    </div>
  );
}
