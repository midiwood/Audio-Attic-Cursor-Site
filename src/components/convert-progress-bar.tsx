"use client";

export function ConvertProgressBar({
  title,
  detail,
  current,
  total,
  ratio,
}: {
  title: string;
  detail?: string;
  current?: number | null;
  total?: number | null;
  /** 0–1 fill. If omitted, derived from current/total. */
  ratio?: number;
}) {
  const derived =
    total && total > 0 && current != null ? Math.max(0, Math.min(1, current / total)) : 0.12;
  const fillPct = Math.round(Math.max(0, Math.min(1, ratio ?? derived)) * 100);
  const itemLabel =
    total && total > 0 && current != null ? `${Math.min(current, total)} / ${total}` : null;

  return (
    <section
      className="space-y-3 rounded-lg border border-[var(--line)] bg-[rgba(18,28,44,0.72)] p-5 backdrop-blur-sm"
      aria-busy
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
              Processing
            </h2>
            <span className="rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent)]">
              Convert
            </span>
          </div>
          <p className="mt-2 text-sm font-medium text-[var(--ink)]">{title}</p>
          {detail ? (
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-dim)]">{detail}</p>
          ) : null}
        </div>
        {itemLabel ? (
          <span className="shrink-0 rounded-md border border-[var(--line)] bg-[rgba(0,0,0,0.22)] px-2.5 py-1 text-[11px] tabular-nums text-[var(--ink-muted)]">
            {itemLabel}
          </span>
        ) : null}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[rgba(148,173,204,0.14)]">
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300 ease-out"
          style={{ width: `${fillPct}%` }}
        />
      </div>
    </section>
  );
}
