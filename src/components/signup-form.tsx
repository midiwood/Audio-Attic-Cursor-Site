"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export function SignupForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Could not create account");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="mx-auto w-full max-w-md rounded-2xl border border-[var(--line)] bg-[rgba(28,24,20,0.65)] p-8">
        <h1 className="text-xl font-semibold text-[var(--ink)]">Request received</h1>
        <p className="mt-2 text-sm text-[var(--ink-muted)]">
          Your account is awaiting admin approval. You’ll be able to sign in once an admin
          approves you.
        </p>
        <Link
          href="/admin/login"
          className="mt-6 inline-flex text-sm text-[var(--accent)] underline-offset-2 hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      className="mx-auto w-full max-w-md rounded-2xl border border-[var(--line)] bg-[rgba(28,24,20,0.65)] p-8"
    >
      <h1 className="text-xl font-semibold text-[var(--ink)]">Sign up</h1>
      <p className="mt-1.5 text-sm text-[var(--ink-muted)]">
        Request access to Audio Attic. An admin must approve new accounts.
      </p>
      <label className="mt-8 block">
        <span className="mb-1.5 block text-[11px] uppercase tracking-[0.16em] text-[var(--ink-dim)]">
          Name
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          className="w-full rounded-xl border border-[var(--line)] bg-[rgba(20,17,14,0.65)] px-3 py-3 text-[var(--ink)] outline-none focus:border-[var(--accent)]"
          autoFocus
          required
        />
      </label>
      <label className="mt-4 block">
        <span className="mb-1.5 block text-[11px] uppercase tracking-[0.16em] text-[var(--ink-dim)]">
          Email
        </span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          className="w-full rounded-xl border border-[var(--line)] bg-[rgba(20,17,14,0.65)] px-3 py-3 text-[var(--ink)] outline-none focus:border-[var(--accent)]"
          required
        />
      </label>
      <label className="mt-4 block">
        <span className="mb-1.5 block text-[11px] uppercase tracking-[0.16em] text-[var(--ink-dim)]">
          Password
        </span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          className="w-full rounded-xl border border-[var(--line)] bg-[rgba(20,17,14,0.65)] px-3 py-3 text-[var(--ink)] outline-none focus:border-[var(--accent)]"
          required
          minLength={8}
        />
      </label>
      {error ? <p className="mt-3 text-sm text-[var(--exclusive)]">{error}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="mt-6 w-full rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-medium text-[#1a140e] transition hover:brightness-110 disabled:opacity-60"
      >
        {loading ? "Submitting…" : "Request access"}
      </button>
      <p className="mt-4 text-center text-sm text-[var(--ink-dim)]">
        Already have an account?{" "}
        <Link href="/admin/login" className="text-[var(--accent)] underline-offset-2 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
