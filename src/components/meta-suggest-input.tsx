"use client";

import { useMemo, useRef, useState } from "react";

const fieldClass =
  "w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]";

function splitTokens(value: string) {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Current token being typed (text after the last comma). */
function currentToken(value: string) {
  const idx = value.lastIndexOf(",");
  if (idx === -1) return value;
  return value.slice(idx + 1).replace(/^\s+/, "");
}

function applySuggestion(value: string, suggestion: string) {
  const idx = value.lastIndexOf(",");
  if (idx === -1) return suggestion;
  const prefix = value.slice(0, idx + 1).replace(/\s*$/, " ");
  return `${prefix}${suggestion}`;
}

export function MetaSuggestInput({
  id,
  value,
  onChange,
  suggestions,
  placeholder,
  className = fieldClass,
}: {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const token = currentToken(value);
  const query = token.trim().toLowerCase();

  const matches = useMemo(() => {
    if (query.length < 1) return [];
    const chosen = new Set(splitTokens(value).map((t) => t.toLowerCase()));
    // Keep the active token eligible so you can re-select / complete it.
    const activeLower = query;
    return suggestions
      .filter((item) => {
        const lower = item.toLowerCase();
        if (!lower.startsWith(query) && !lower.includes(` ${query}`)) return false;
        if (chosen.has(lower) && lower !== activeLower) return false;
        return true;
      })
      .slice(0, 8);
  }, [query, suggestions, value]);

  function pick(suggestion: string) {
    onChange(applySuggestion(value, suggestion));
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
          className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] py-1 shadow-lg"
          onMouseDown={(e) => {
            // Keep focus on input so click can apply before blur closes list.
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
