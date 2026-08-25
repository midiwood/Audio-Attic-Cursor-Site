import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  if (await getSession()) {
    const next = params.next;
    const safeNext =
      next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    redirect(safeNext);
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-5 py-16">
      <div className="mb-8 text-center">
        <div className="text-2xl font-semibold tracking-tight text-[var(--ink)]">Audio Attic</div>
        <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--ink-dim)]">
          Private catalog
        </p>
      </div>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-[var(--bg-soft)]" />}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
