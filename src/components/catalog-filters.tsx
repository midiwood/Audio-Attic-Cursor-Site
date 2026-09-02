"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  clearCatalogFilterQuery,
  saveCatalogFilterQuery,
} from "@/lib/catalog-filter-storage";
import { defaultSortDir } from "@/lib/catalog-sort";
import {
  TAG_TONE_FIELD,
  TAG_TONE_LABEL,
  TAG_TONE_PILL,
  type TagTone,
} from "@/lib/tag-tones";
import { PrepareProInfo } from "@/components/prepare-pro-info";

type Options = {
  genres: string[];
  moods: string[];
  instruments: string[];
  usages: string[];
  years: number[];
};

type Available = {
  genres: string[];
  moods: string[];
  instruments: string[];
  usages: string[];
  years: number[];
  licenses: {
    clear: boolean;
    library: boolean;
    exclusive: boolean;
    hold: boolean;
    personal: boolean;
    available: boolean;
  };
};

function FilterRow({
  label,
  tone,
  children,
}: {
  label: ReactNode;
  tone?: TagTone;
  children: ReactNode;
}) {
  return (
    <label className="catalog-filter-row">
      <span
        className={`catalog-filter-label ${
          tone ? TAG_TONE_LABEL[tone] : "text-[var(--ink-dim)]"
        }`}
      >
        {label}
      </span>
      <div className="min-w-0">{children}</div>
    </label>
  );
}

function readListParam(params: URLSearchParams, key: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of params.getAll(key)) {
    for (const piece of part.split(",")) {
      const trimmed = piece.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      out.push(trimmed);
    }
  }
  return out;
}

function setListParam(next: URLSearchParams, key: string, values: string[]) {
  next.delete(key);
  for (const value of values) next.append(key, value);
}

function MultiFacetField({
  items,
  available,
  selected,
  addLabel,
  tone,
  fieldClass,
  onChange,
}: {
  items: string[];
  available: Set<string>;
  selected: string[];
  /** Screen-reader / title only — closed select shows a quiet “+”. */
  addLabel: string;
  tone?: TagTone;
  fieldClass: string;
  onChange: (next: string[]) => void;
}) {
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const ordered = useMemo(() => {
    const enabled = items.filter(
      (item) => available.has(item) && !selectedSet.has(item),
    );
    const disabled = items.filter(
      (item) => !available.has(item) && !selectedSet.has(item),
    );
    return [...enabled, ...disabled];
  }, [items, available, selectedSet]);

  return (
    <select
      className={`catalog-filter-select ${fieldClass} text-[var(--ink-muted)] ${tone ? TAG_TONE_FIELD[tone] : ""}`}
      value=""
      onChange={(e) => {
        const value = e.target.value;
        if (!value || selectedSet.has(value)) return;
        onChange([...selected, value]);
      }}
      aria-label={addLabel}
      title={addLabel}
    >
      <option value="">{addLabel}…</option>
      {ordered.map((item) => {
        const isAvailable = available.has(item);
        return (
          <option key={item} value={item} disabled={!isAvailable}>
            {isAvailable ? item : `${item} · none`}
          </option>
        );
      })}
    </select>
  );
}

type SelectedChip = {
  key: "license" | "samro" | "genre" | "mood" | "instrument" | "attribute";
  value: string;
  tone?: TagTone;
};

/** Survives remounts while the user is still typing into search. */
let liveSearchDraft: string | null = null;

export function CatalogFilters({
  options,
  available,
  matchCount,
  hideLicenseFilter = false,
  showSamroFilter = false,
}: {
  options: Options;
  available: Available;
  /** Tracks matching the current filter URL (for sidebar count). */
  matchCount?: number;
  hideLicenseFilter?: boolean;
  /** Staff-only: filter by SAMRO PRO submission. */
  showSamroFilter?: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const qFromUrl = params.get("q") ?? "";
  const [searchDraft, setSearchDraft] = useState(() => liveSearchDraft ?? qFromUrl);

  useEffect(() => {
    if (liveSearchDraft == null) return;
    const node = searchInputRef.current;
    if (!node || node.offsetParent === null) return;
    node.focus();
    const end = node.value.length;
    node.setSelectionRange(end, end);
  }, []);

  useEffect(() => {
    if (liveSearchDraft != null) return;
    if (searchInputRef.current && document.activeElement === searchInputRef.current) {
      return;
    }
    setSearchDraft(qFromUrl);
  }, [qFromUrl]);

  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  // Keep Browse nav / return-to-catalog in sync with the active filter URL.
  useEffect(() => {
    saveCatalogFilterQuery(params.toString());
  }, [params]);

  const availableSets = useMemo(
    () => ({
      genres: new Set(available.genres),
      moods: new Set(available.moods),
      instruments: new Set(available.instruments),
      usages: new Set(available.usages),
      years: new Set(available.years.map(String)),
    }),
    [available],
  );

  const genreValues = useMemo(() => readListParam(params, "genre"), [params]);
  const moodValues = useMemo(() => readListParam(params, "mood"), [params]);
  const instrumentValues = useMemo(() => readListParam(params, "instrument"), [params]);
  const usageValues = useMemo(() => readListParam(params, "attribute"), [params]);
  const yearValue = params.get("year") ?? "";
  const licenseValue = params.get("license") ?? "all";
  const samroValue = params.get("samro") ?? "all";

  const hasActiveFilters = useMemo(() => {
    const licenseActive =
      !hideLicenseFilter && licenseValue !== null && licenseValue !== "all";
    const samroActive =
      showSamroFilter &&
      (samroValue === "yes" || samroValue === "no" || samroValue === "prepare");
    const sortParam = params.get("sort");
    const sort =
      sortParam === "title" || sortParam === "year" || sortParam === "bpm" || sortParam === "date"
        ? sortParam
        : "date";
    const dirParam = params.get("dir");
    const dir = dirParam === "asc" || dirParam === "desc" ? dirParam : defaultSortDir(sort);
    const sortActive = sort !== "date" || dir !== defaultSortDir("date");
    return (
      Boolean(params.get("q")) ||
      licenseActive ||
      samroActive ||
      sortActive ||
      genreValues.length > 0 ||
      moodValues.length > 0 ||
      instrumentValues.length > 0 ||
      usageValues.length > 0 ||
      Boolean(yearValue)
    );
  }, [
    params,
    hideLicenseFilter,
    showSamroFilter,
    licenseValue,
    samroValue,
    genreValues,
    moodValues,
    instrumentValues,
    usageValues,
    yearValue,
  ]);

  const pushParams = useCallback(
    (next: URLSearchParams, mode: "push" | "replace" = "push") => {
      const query = next.toString();
      saveCatalogFilterQuery(query);
      const href = query ? `/?${query}` : "/";
      if (mode === "replace") {
        // Search-as-you-type: don't mark this as a transition. Transitions in
        // this component make React defer input updates and feel like the
        // field is locked while results load.
        router.replace(href, { scroll: false });
        return;
      }
      startTransition(() => {
        router.push(href, { scroll: false });
      });
    },
    [router],
  );

  const update = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (
        !value ||
        (key === "license" && value === "all") ||
        (key === "samro" && value === "all") ||
        (key === "sort" && value === "date")
      ) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      pushParams(next);
    },
    [params, pushParams],
  );

  const updateList = useCallback(
    (key: string, values: string[]) => {
      const next = new URLSearchParams(params.toString());
      setListParam(next, key, values);
      pushParams(next);
    },
    [params, pushParams],
  );

  const updateSearch = useCallback(
    (value: string) => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(() => {
        const current = paramsRef.current.get("q") ?? "";
        if (current === value) return;
        const next = new URLSearchParams(paramsRef.current.toString());
        if (!value) next.delete("q");
        else next.set("q", value);
        pushParams(next, "replace");
      }, 450);
    },
    [pushParams],
  );

  const resetFilters = useCallback(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setSearchDraft("");
    liveSearchDraft = null;
    clearCatalogFilterQuery();
    // Fresh default: Date added, newest → oldest (no sort/dir in URL).
    startTransition(() => {
      router.push("/");
    });
  }, [router]);

  const fieldClass = "catalog-filter-field";

  const yearItems = useMemo(() => options.years.map(String), [options.years]);

  const selectedChips = useMemo((): SelectedChip[] => {
    const chips: SelectedChip[] = [];
    if (!hideLicenseFilter && licenseValue && licenseValue !== "all") {
      const licenseLabel =
        licenseValue === "available"
          ? "Available"
          : licenseValue === "clear"
            ? "Clear"
            : licenseValue === "library"
              ? "Library"
              : licenseValue === "exclusive"
                ? "Exclusive"
                : licenseValue === "hold"
                  ? "On Hold"
                  : licenseValue === "personal"
                    ? "Personal"
                    : licenseValue;
      chips.push({ key: "license", value: licenseLabel });
    }
    if (showSamroFilter && samroValue === "yes") {
      chips.push({ key: "samro", value: "SAMRO submitted" });
    } else if (showSamroFilter && samroValue === "no") {
      chips.push({ key: "samro", value: "SAMRO not submitted" });
    } else if (showSamroFilter && samroValue === "prepare") {
      chips.push({ key: "samro", value: "Prepare PRO" });
    }
    for (const value of genreValues) chips.push({ key: "genre", value, tone: "genre" });
    for (const value of moodValues) chips.push({ key: "mood", value, tone: "mood" });
    for (const value of instrumentValues) {
      chips.push({ key: "instrument", value, tone: "instrument" });
    }
    for (const value of usageValues) chips.push({ key: "attribute", value, tone: "usage" });
    return chips;
  }, [
    hideLicenseFilter,
    showSamroFilter,
    licenseValue,
    samroValue,
    genreValues,
    moodValues,
    instrumentValues,
    usageValues,
  ]);

  const removeChip = useCallback(
    (chip: SelectedChip) => {
      if (chip.key === "license") {
        update("license", "all");
        return;
      }
      if (chip.key === "samro") {
        update("samro", "all");
        return;
      }
      const current =
        chip.key === "genre"
          ? genreValues
          : chip.key === "mood"
            ? moodValues
            : chip.key === "instrument"
              ? instrumentValues
              : usageValues;
      updateList(
        chip.key,
        current.filter((value) => value !== chip.value),
      );
    },
    [update, updateList, genreValues, moodValues, instrumentValues, usageValues],
  );

  return (
    <div className="catalog-filters">
      <div className={`mb-2 flex items-center justify-between gap-2 ${pending ? "opacity-70" : ""}`}>
        <p className="min-w-0 text-xs tabular-nums text-[var(--ink-dim)]">
          {typeof matchCount === "number" ? (
            matchCount === 0 && hasActiveFilters ? (
              <>No matches — try removing a filter</>
            ) : (
              <>
                {matchCount.toLocaleString()} track{matchCount === 1 ? "" : "s"}
              </>
            )
          ) : (
            <span className="invisible">0</span>
          )}
        </p>
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={resetFilters}
            disabled={pending}
            className="catalog-filter-reset shrink-0"
          >
            Reset all
          </button>
        ) : (
          <span className="h-4" />
        )}
      </div>

      <form className="space-y-2" onSubmit={(e) => e.preventDefault()}>
        <label className="catalog-filter-search block">
          <span className="sr-only">Search</span>
          <span className="catalog-filter-search-wrap">
            <svg className="catalog-filter-search-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="11" cy="11" r="6.25" stroke="currentColor" strokeWidth="1.75" />
              <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
            <input
              ref={searchInputRef}
              className={`${fieldClass} catalog-filter-search-input`}
              value={searchDraft}
              placeholder="Search title, client, tags…"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => {
                const value = e.target.value;
                liveSearchDraft = value;
                setSearchDraft(value);
                updateSearch(value);
              }}
              onBlur={() => {
                window.setTimeout(() => {
                  const active = document.activeElement;
                  const stillTyping =
                    active instanceof HTMLInputElement && active === searchInputRef.current;
                  if (!stillTyping) liveSearchDraft = null;
                }, 0);
              }}
            />
          </span>
        </label>

        <div className="catalog-filter-section">
          <div className="catalog-filter-fields">
            {hideLicenseFilter ? null : (
              <FilterRow label="License">
                <select
                  className={`catalog-filter-select ${fieldClass}`}
                  value={licenseValue}
                  onChange={(e) => update("license", e.target.value)}
                >
                  <option value="all">All tracks</option>
                  <option
                    value="available"
                    disabled={!available.licenses.available && licenseValue !== "available"}
                  >
                    {available.licenses.available || licenseValue === "available"
                      ? "Available"
                      : "Available · none"}
                  </option>
                  <option
                    value="clear"
                    disabled={!available.licenses.clear && licenseValue !== "clear"}
                  >
                    {available.licenses.clear || licenseValue === "clear" ? "Clear" : "Clear · none"}
                  </option>
                  <option
                    value="library"
                    disabled={!available.licenses.library && licenseValue !== "library"}
                  >
                    {available.licenses.library || licenseValue === "library"
                      ? "Library"
                      : "Library · none"}
                  </option>
                  <option
                    value="exclusive"
                    disabled={!available.licenses.exclusive && licenseValue !== "exclusive"}
                  >
                    {available.licenses.exclusive || licenseValue === "exclusive"
                      ? "Exclusive"
                      : "Exclusive · none"}
                  </option>
                  <option
                    value="hold"
                    disabled={!available.licenses.hold && licenseValue !== "hold"}
                  >
                    {available.licenses.hold || licenseValue === "hold"
                      ? "On Hold"
                      : "On Hold · none"}
                  </option>
                  <option
                    value="personal"
                    disabled={!available.licenses.personal && licenseValue !== "personal"}
                  >
                    {available.licenses.personal || licenseValue === "personal"
                      ? "Personal"
                      : "Personal · none"}
                  </option>
                </select>
              </FilterRow>
            )}

            {showSamroFilter ? (
              <FilterRow
                label={
                  <span className="inline-flex items-center gap-1">
                    SAMRO
                    <PrepareProInfo />
                  </span>
                }
              >
                <select
                  className={`catalog-filter-select ${fieldClass}`}
                  value={
                    samroValue === "yes" || samroValue === "no" || samroValue === "prepare"
                      ? samroValue
                      : "all"
                  }
                  onChange={(e) => update("samro", e.target.value)}
                  title="SAMRO PRO submission status"
                >
                  <option value="all">All tracks</option>
                  <option value="prepare">Prepare PRO</option>
                  <option value="yes">Submitted</option>
                  <option value="no">Not submitted</option>
                </select>
              </FilterRow>
            ) : null}

            <FilterRow label="Year">
              <select
                className={`catalog-filter-select ${fieldClass}`}
                value={yearValue}
                onChange={(e) => update("year", e.target.value)}
              >
                <option value="">All years</option>
                {yearItems.map((year) => {
                  const isAvailable = availableSets.years.has(year);
                  return (
                    <option
                      key={year}
                      value={year}
                      disabled={!isAvailable && yearValue !== year}
                    >
                      {isAvailable || yearValue === year ? year : `${year} · none`}
                    </option>
                  );
                })}
              </select>
            </FilterRow>

            <FilterRow label="Genre" tone="genre">
            <MultiFacetField
              items={options.genres}
              available={availableSets.genres}
              selected={genreValues}
              addLabel="Add genre"
              tone="genre"
              fieldClass={fieldClass}
              onChange={(next) => updateList("genre", next)}
            />
          </FilterRow>

          <FilterRow label="Mood" tone="mood">
            <MultiFacetField
              items={options.moods}
              available={availableSets.moods}
              selected={moodValues}
              addLabel="Add mood"
              tone="mood"
              fieldClass={fieldClass}
              onChange={(next) => updateList("mood", next)}
            />
          </FilterRow>

          <FilterRow label="Instrument" tone="instrument">
            <MultiFacetField
              items={options.instruments}
              available={availableSets.instruments}
              selected={instrumentValues}
              addLabel="Add instrument"
              tone="instrument"
              fieldClass={fieldClass}
              onChange={(next) => updateList("instrument", next)}
            />
          </FilterRow>

          <FilterRow label="Usage" tone="usage">
            <MultiFacetField
              items={options.usages}
              available={availableSets.usages}
              selected={usageValues}
              addLabel="Add usage"
              tone="usage"
              fieldClass={fieldClass}
              onChange={(next) => updateList("attribute", next)}
            />
          </FilterRow>
          </div>
        </div>

        {selectedChips.length || searchDraft.trim() ? (
          <div className="catalog-filter-chips">
            <div className="flex flex-wrap gap-1.5">
              {searchDraft.trim() ? (
                <button
                  type="button"
                  onClick={() => {
                    if (searchTimer.current) clearTimeout(searchTimer.current);
                    setSearchDraft("");
                    liveSearchDraft = null;
                    const next = new URLSearchParams(params.toString());
                    next.delete("q");
                    pushParams(next, "replace");
                  }}
                  className="catalog-filter-chip catalog-filter-chip-neutral"
                  title="Clear search"
                >
                  “{searchDraft.trim()}” ×
                </button>
              ) : null}
              {selectedChips.map((chip) => {
                const pillClass = chip.tone
                  ? TAG_TONE_PILL[chip.tone]
                  : "catalog-filter-chip-neutral";
                return (
                  <button
                    key={`${chip.key}:${chip.value}`}
                    type="button"
                    onClick={() => removeChip(chip)}
                    className={`catalog-filter-chip ${pillClass}`}
                    title={`Remove ${chip.value}`}
                  >
                    {chip.value} ×
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </form>
    </div>
  );
}
