"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { clearAudioPlayer } from "@/components/player-provider";
import { authClient } from "@/lib/auth-client";

function LinkRow({
  href,
  label,
  description,
}: {
  href: string;
  label: string;
  description?: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-[rgba(255,255,255,0.02)] px-4 py-3 transition hover:border-[var(--accent)] hover:bg-[rgba(59,130,246,0.06)]"
    >
      <span>
        <span className="block text-sm font-medium text-[var(--ink)]">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs text-[var(--ink-dim)]">{description}</span>
        ) : null}
      </span>
      <span className="text-[var(--ink-dim)]" aria-hidden>
        ›
      </span>
    </Link>
  );
}

export function MobileProfileLinks({
  canManageCatalog = false,
  canManageAccount = false,
  isSubscriber = false,
}: {
  canManageCatalog?: boolean;
  canManageAccount?: boolean;
  isSubscriber?: boolean;
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    clearAudioPlayer();
    await authClient.signOut();
    setSigningOut(false);
    router.push("/admin/login");
    router.refresh();
  }

  const showLinks = canManageCatalog || canManageAccount || isSubscriber;

  if (!showLinks) {
    return (
      <section className="mt-8 max-w-xl lg:hidden">
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          className="w-full rounded-xl border border-[var(--line)] px-4 py-3 text-left text-sm text-[var(--ink-muted)] transition hover:border-[var(--exclusive)] hover:text-[var(--ink)] disabled:opacity-50"
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </section>
    );
  }

  return (
    <section className="mt-8 max-w-xl lg:hidden">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-dim)]">
        Account
      </h2>
      <div className="space-y-2">
        {canManageCatalog ? (
          <LinkRow href="/admin" label="Upload" description="Add tracks to the catalog" />
        ) : null}
        {canManageAccount ? (
          <LinkRow href="/admin/site" label="Admin" description="Site settings and users" />
        ) : null}
        {isSubscriber ? (
          <LinkRow href="/licenses" label="Licenses" description="Your license requests" />
        ) : null}
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          className="w-full rounded-xl border border-[var(--line)] px-4 py-3 text-left text-sm text-[var(--ink-muted)] transition hover:border-[var(--exclusive)] hover:text-[var(--ink)] disabled:opacity-50"
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </section>
  );
}
