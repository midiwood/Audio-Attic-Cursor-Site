"use client";

import { useEffect, useState, type ReactNode } from "react";

const STORAGE_KEY = "attic-filters-open";

export function FiltersRail({
  children,
  activeCount = 0,
}: {
  children: ReactNode;
  activeCount?: number;
}) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "0") setOpen(false);
      if (stored === "1") setOpen(true);
    } catch {
      // ignore
    }
  }, []);

  function setOpenPersist(next: boolean) {
    setOpen(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // ignore
    }
  }

  function toggle() {
    setOpenPersist(!open);
  }

  function close() {
    setOpenPersist(false);
  }

  return (
    <>
      {/* Mobile filters toggle + panel */}
      <div className="border-b border-[var(--line)] bg-[rgba(11,20,32,0.55)] lg:hidden">
        <button
          type="button"
          onClick={toggle}
          className="flex w-full items-center justify-between px-4 py-3 text-sm text-[var(--ink-muted)]"
        >
          <span className="flex items-center gap-2 font-medium text-[var(--ink)]">
            Filters
            {activeCount > 0 ? (
              <span className="rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10px] tabular-nums text-[var(--accent)]">
                {activeCount}
              </span>
            ) : null}
          </span>
          <span className="text-xs text-[var(--ink-dim)]">{open ? "Hide" : "Show"}</span>
        </button>
        {open ? <div className="border-t border-[var(--line)] px-4 pb-4 pt-3">{children}</div> : null}
      </div>

      {/* Desktop collapsible rail */}
      <aside
        className={`relative hidden shrink-0 border-r border-[var(--line)] bg-[rgba(11,20,32,0.55)] transition-[width] duration-200 ease-out lg:sticky lg:top-0 lg:flex lg:h-[100dvh] lg:flex-col ${
          open ? "lg:w-72 xl:w-80" : "lg:w-11"
        }`}
      >
        {open ? (
          <>
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-dim)]">
                  Filters
                </span>
                {activeCount > 0 ? (
                  <span className="rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-[var(--accent)]">
                    {activeCount}
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={toggle}
                className="rounded-md px-2 py-1 text-[11px] text-[var(--ink-dim)] transition hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--ink)]"
                aria-label="Collapse filters"
              >
                Hide
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="overflow-y-auto p-4">{children}</div>
              <button
                type="button"
                onClick={close}
                className="min-h-8 flex-1 cursor-default border-0 bg-transparent"
                aria-label="Collapse filters"
                title="Click to hide filters"
              />
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={toggle}
            className="flex h-full w-full flex-col items-center gap-3 py-4 text-[var(--ink-dim)] transition hover:bg-[rgba(255,255,255,0.03)] hover:text-[var(--ink)]"
            aria-label="Show filters"
            title="Show filters"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M4 6h16M7 12h10M10 18h4"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.18em]"
              style={{ writingMode: "vertical-rl" }}
            >
              Filters
            </span>
            {activeCount > 0 ? (
              <span className="rounded bg-[var(--accent-soft)] px-1 py-0.5 text-[10px] tabular-nums text-[var(--accent)]">
                {activeCount}
              </span>
            ) : null}
          </button>
        )}
      </aside>
    </>
  );
}
