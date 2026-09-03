"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  consumeQueuedMobileFiltersOpen,
  setMobileFiltersOpen,
  subscribeMobileFiltersOpen,
  subscribeMobileFiltersOpenRequest,
} from "@/lib/mobile-filters-panel";

const STORAGE_KEY = "attic-filters-open";
const DESKTOP_MQ = "(min-width: 1024px)";

export function FiltersRail({
  children,
  activeCount = 0,
}: {
  children: ReactNode;
  activeCount?: number;
}) {
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [mobileOpen, setMobileOpenState] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_MQ);
    function onBreakpoint() {
      if (mq.matches) setMobileFiltersOpen(false);
    }
    onBreakpoint();
    mq.addEventListener("change", onBreakpoint);
    return () => mq.removeEventListener("change", onBreakpoint);
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (window.matchMedia(DESKTOP_MQ).matches) {
        if (stored === "0") setDesktopOpen(false);
        else setDesktopOpen(true);
      }
    } catch {
      // ignore
    }

    if (consumeQueuedMobileFiltersOpen()) {
      setMobileFiltersOpen(true);
    }

    return subscribeMobileFiltersOpen((next) => {
      setMobileOpenState(next);
    });
  }, []);

  useEffect(() => {
    return subscribeMobileFiltersOpenRequest(() => {
      setMobileFiltersOpen(true);
    });
  }, []);

  function setDesktopOpenPersist(next: boolean) {
    setDesktopOpen(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // ignore
    }
  }

  function closeMobile() {
    setMobileFiltersOpen(false);
  }

  const mobileOverlay =
    mounted && mobileOpen
      ? createPortal(
          <div className="lg:hidden">
            <button
              type="button"
              className="fixed inset-0 z-[34] bg-black/40"
              aria-label="Close filters"
              onClick={closeMobile}
            />
            <div
              className="mobile-filters-panel"
              role="dialog"
              aria-modal="true"
              aria-label="Filters"
            >
              <div className="max-h-[inherit] overflow-y-auto">
                <div className="mobile-filters-panel-header sticky top-0 z-10 flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
                  <span className="flex items-center gap-2 text-sm font-medium text-[var(--ink)]">
                    Filters
                    {activeCount > 0 ? (
                      <span className="rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10px] tabular-nums text-[var(--accent)]">
                        {activeCount}
                      </span>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    onClick={closeMobile}
                    className="rounded-md px-2 py-1 text-sm text-[var(--accent)]"
                  >
                    Done
                  </button>
                </div>
                <div className="px-4 pb-6 pt-3">{children}</div>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {mobileOverlay}

      {/* Desktop only — CSS hidden below lg, never used as the mobile panel */}
      <aside
        className={`relative hidden shrink-0 border-r border-[var(--line)] bg-[rgba(11,20,32,0.55)] transition-[width] duration-200 ease-out lg:sticky lg:top-0 lg:flex lg:h-[100dvh] lg:flex-col ${
          desktopOpen ? "lg:w-72 xl:w-80" : "lg:w-11"
        }`}
      >
        {mobileOpen ? null : desktopOpen ? (
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
                onClick={() => setDesktopOpenPersist(false)}
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
                onClick={() => setDesktopOpenPersist(false)}
                className="min-h-8 flex-1 cursor-default border-0 bg-transparent"
                aria-label="Collapse filters"
                title="Click to hide filters"
              />
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setDesktopOpenPersist(true)}
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
