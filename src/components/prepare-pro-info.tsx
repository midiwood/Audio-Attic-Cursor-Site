"use client";

import { useEffect, useId, useRef, useState } from "react";

export function PrepareProInfo({
  className = "",
}: {
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function place() {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(352, window.innerWidth - 16);
      let left = rect.left;
      if (left + width > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - width - 8);
      }
      setPos({ top: rect.bottom + 6, left });
    }
    place();
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative inline-flex ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="grid h-5 w-5 place-items-center rounded-full border border-[var(--line)] text-[10px] font-semibold text-[var(--ink-dim)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="What Prepare PRO includes"
        title="What Prepare PRO includes"
      >
        i
      </button>
      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Prepare PRO criteria"
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-[80] w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] p-3 text-left shadow-xl"
        >
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--ink-dim)]">
            Prepare PRO includes tracks that
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-[var(--ink-muted)]">
            <li>Are not in trash</li>
            <li>Have not been submitted to SAMRO</li>
            <li>Have at least one active license deal (license history)</li>
          </ul>
          <p className="mt-2 text-xs leading-relaxed text-[var(--ink-dim)]">
            License status (Library, Exclusive, Clear) is not used. Ready / Incomplete is
            separate — incomplete tracks still appear, but export needs title, duration,
            publisher, first publication date, composer IPIs, and perf shares totaling 100%.
            One publisher per form.
          </p>
        </div>
      ) : null}
    </div>
  );
}
