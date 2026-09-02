"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

export function CatalogSearchBar({
  basePath = "/search",
  placeholder = "Search tracks…",
  autoFocus = false,
}: {
  basePath?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const qFromUrl = params.get("q") ?? "";
  const [searchDraft, setSearchDraft] = useState(qFromUrl);

  useEffect(() => {
    setSearchDraft(qFromUrl);
  }, [qFromUrl]);

  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  const pushSearch = useCallback(
    (value: string) => {
      const next = new URLSearchParams(paramsRef.current.toString());
      if (!value) next.delete("q");
      else next.set("q", value);
      const query = next.toString();
      const href = query ? `${basePath}?${query}` : basePath;
      router.replace(href, { scroll: false });
    },
    [basePath, router],
  );

  const updateSearch = useCallback(
    (value: string) => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(() => {
        const current = paramsRef.current.get("q") ?? "";
        if (current === value) return;
        pushSearch(value);
      }, 450);
    },
    [pushSearch],
  );

  const fieldClass =
    "w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-base text-[var(--ink)] outline-none transition placeholder:text-[var(--ink-dim)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";

  return (
    <label className="block">
      <span className="sr-only">Search</span>
      <input
        className={fieldClass}
        value={searchDraft}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        autoFocus={autoFocus}
        onChange={(e) => {
          const value = e.target.value;
          setSearchDraft(value);
          updateSearch(value);
        }}
      />
    </label>
  );
}
