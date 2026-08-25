"use client";

import { useMemo, useRef, useState } from "react";

const fieldClass =
  "w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]";

/** Single-value combobox: presets on focus + free type. */
export function ComboboxInput({
  id,
  value,
  onChange,
  options,
  placeholder,
  required,
  className = fieldClass,
}: {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  options: readonly string[];
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const query = value.trim().toLowerCase();

  const matches = useMemo(() => {
    const list = options.filter((item) => {
      if (!query) return true;
      const lower = item.toLowerCase();
      return lower.startsWith(query) || lower.includes(` ${query}`) || lower.includes(query);
    });
    return list.slice(0, 12);
  }, [options, query]);

  function pick(suggestion: string) {
    onChange(suggestion);
    setOpen(false);
    setActive(0);
  }

  return (
    <div className="relative">
      <input
        id={id}
        className={className}
        value={value}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={(e) => {
          if (!open || !matches.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => (i + 1) % matches.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => (i - 1 + matches.length) % matches.length);
          } else if (e.key === "Enter" && matches[active]) {
            e.preventDefault();
            pick(matches[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && matches.length ? (
        <ul
          className="absolute z-30 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] py-1 shadow-lg"
          onMouseDown={(e) => {
            e.preventDefault();
            if (blurTimer.current) clearTimeout(blurTimer.current);
          }}
        >
          {matches.map((item, index) => (
            <li key={item}>
              <button
                type="button"
                className={`block w-full truncate px-2.5 py-1.5 text-left text-sm transition ${
                  index === active
                    ? "bg-[var(--accent-soft)] text-[var(--ink)]"
                    : "text-[var(--ink-muted)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--ink)]"
                }`}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(item)}
              >
                {item}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
