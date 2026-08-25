"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error: signInError } = await authClient.signIn.email({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (signInError) {
      const msg = (signInError.message || "").toLowerCase();
      if (msg.includes("banned") || msg.includes("ban")) {
        setError(
          "This account is disabled or awaiting admin approval. Contact an admin if you just signed up.",
        );
      } else {
        setError(signInError.message || "Incorrect email or password");
      }
      return;
    }
    const next = searchParams.get("next");
    const safeNext =
      next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    router.push(safeNext);
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto w-full max-w-md rounded-2xl border border-[var(--line)] bg-[rgba(28,24,20,0.65)] p-8"
    >
      <h1 className="text-xl font-semibold text-[var(--ink)]">Sign in</h1>
      <p className="mt-1.5 text-sm text-[var(--ink-muted)]">
        Use your email and password to continue.
      </p>
      <label className="mt-8 block">
        <span className="mb-1.5 block text-[11px] uppercase tracking-[0.16em] text-[var(--ink-dim)]">
          Email
        </span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          className="w-full rounded-xl border border-[var(--line)] bg-[rgba(20,17,14,0.65)] px-3 py-3 text-[var(--ink)] outline-none focus:border-[var(--accent)]"
          autoFocus
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
          autoComplete="current-password"
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
        {loading ? "Signing in…" : "Sign in"}
      </button>
      <p className="mt-4 text-center text-sm text-[var(--ink-dim)]">
        Need access?{" "}
        <a href="/signup" className="text-[var(--accent)] underline-offset-2 hover:underline">
          Sign up
        </a>
      </p>
    </form>
  );
}
