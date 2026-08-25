"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

const fieldClass =
  "w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]";

function initials(name: string, email: string) {
  const base = (name || email || "?").trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

export function ProfileForm({
  initialName,
  initialEmail,
  initialImage,
}: {
  initialName: string;
  initialEmail: string;
  initialImage: string | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState(initialName);
  const [image, setImage] = useState(initialImage);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  async function onSaveProfile(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setStatus("");
    const { error: updateError } = await authClient.updateUser({
      name: name.trim() || initialName,
    });
    setBusy(false);
    if (updateError) {
      setError(updateError.message || "Could not save profile");
      return;
    }
    setStatus("Profile saved");
    router.refresh();
  }

  async function onAvatarChange(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError("");
    setStatus("");
    const body = new FormData();
    body.set("avatar", file);
    const res = await fetch("/api/profile/avatar", { method: "POST", body });
    const data = (await res.json().catch(() => ({}))) as { error?: string; image?: string };
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Could not upload photo");
      return;
    }
    setImage(data.image || null);
    setStatus("Photo updated");
    router.refresh();
  }

  async function onRemoveAvatar() {
    if (!confirm("Remove your profile photo?")) return;
    setBusy(true);
    setError("");
    setStatus("");
    const res = await fetch("/api/profile/avatar", { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      setError("Could not remove photo");
      return;
    }
    setImage(null);
    setStatus("Photo removed");
    router.refresh();
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }
    setBusy(true);
    setError("");
    setStatus("");
    const { error: pwError } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });
    setBusy(false);
    if (pwError) {
      setError(pwError.message || "Could not change password");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setStatus("Password updated");
  }

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <section className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)]/70 p-5">
        <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
          Profile photo
        </h2>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-[var(--line)] bg-[var(--bg-soft)]">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full w-full place-items-center text-lg font-semibold text-[var(--ink-muted)]">
                {initials(name, initialEmail)}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => void onAvatarChange(e.target.files?.[0] || null)}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)] disabled:opacity-50"
            >
              Upload photo
            </button>
            {image ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onRemoveAvatar()}
                className="ml-2 rounded-lg px-3 py-1.5 text-sm text-[var(--exclusive)] transition hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            ) : null}
            <p className="text-[11px] text-[var(--ink-dim)]">JPEG, PNG, or WebP · max 2 MB</p>
          </div>
        </div>
      </section>

      <form
        onSubmit={onSaveProfile}
        className="space-y-4 rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)]/70 p-5"
      >
        <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
          Account details
        </h2>
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
            Display name
          </span>
          <input
            className={fieldClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
            Email
          </span>
          <input className={`${fieldClass} opacity-70`} value={initialEmail} disabled readOnly />
          <p className="mt-1 text-[11px] text-[var(--ink-dim)]">
            Ask an admin if you need your email changed.
          </p>
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-50"
        >
          Save profile
        </button>
      </form>

      <form
        onSubmit={onChangePassword}
        className="space-y-4 rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)]/70 p-5"
      >
        <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
          Change password
        </h2>
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
            Current password
          </span>
          <input
            type="password"
            className={fieldClass}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
            New password
          </span>
          <input
            type="password"
            className={fieldClass}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
            Confirm new password
          </span>
          <input
            type="password"
            className={fieldClass}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)] disabled:opacity-50"
        >
          Update password
        </button>
      </form>

      {(error || status) && (
        <p className={`text-sm ${error ? "text-[var(--exclusive)]" : "text-[var(--available)]"}`}>
          {error || status}
        </p>
      )}
    </div>
  );
}
