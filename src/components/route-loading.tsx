/** Shared skeleton for route `loading.tsx` — keeps shell chrome while content streams. */
export function RouteLoading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="min-w-0 flex-1 px-5 py-6 md:px-8 md:py-8" aria-busy="true" aria-label={label}>
      <div className="mb-6 border-b border-[var(--line)] pb-5">
        <div className="h-8 w-40 animate-pulse rounded-md bg-[var(--bg-soft)]" />
        <div className="mt-3 h-4 w-64 max-w-full animate-pulse rounded-md bg-[var(--bg-soft)]" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-14 animate-pulse rounded-lg bg-[var(--bg-soft)]"
            style={{ animationDelay: `${i * 40}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
