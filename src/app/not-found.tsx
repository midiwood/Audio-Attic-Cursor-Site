import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-6xl flex-col items-start justify-center px-5 md:px-8">
      <h1 className="font-[family-name:var(--font-display)] text-4xl text-[var(--ink)]">Track not found</h1>
      <p className="mt-3 text-[var(--ink-muted)]">That ID is not in the catalog.</p>
      <Link href="/" className="mt-6 text-[var(--accent)]">
        ← Back to catalog
      </Link>
    </main>
  );
}
