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
    available: boolean;
  };
};

function FilterRow({
  label,
  tone,
  children,
}: {
  label: string;
  tone?: TagTone;
  children: ReactNode;
}) {
  return (
    <label className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-2">
      <span
        className={`truncate text-[10px] font-medium uppercase tracking-[0.12em] ${
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
      className={`${fieldClass} ${tone ? TAG_TONE_FIELD[tone] : ""}`}
      value=""
      onChange={(e) => {
        const value = e.target.value;
        if (!value || selectedSet.has(value)) return;
        onChange([...selected, value]);
      }}
      aria-label={addLabel}
    >
      <option value="">{addLabel}</option>
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
  key: string;
  value: string;
  tone?: TagTone;
};

/** Survives remounts while the user is still typing into search. */
let liveSearchDraft: string | null = null;

export function CatalogFilters({
  options,
  available,
  hideLicenseFilter = false,
  showSamroFilter = false,
}: {
  options: Options;
  available: Available;
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
  const yearValues = useMemo(() => readListParam(params, "year"), [params]);
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
      yearValues.length > 0
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
    yearValues,
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
      }, 300);
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

  const fieldClass =
    "w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1.5 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-soft)]";

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
    for (const value of yearValues) chips.push({ key: "year", value });
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
    yearValues,
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
              : chip.key === "attribute"
                ? usageValues
                : yearValues;
      updateList(
        chip.key,
        current.filter((value) => value !== chip.value),
      );
    },
    [
      update,
      updateList,
      genreValues,
      moodValues,
      instrumentValues,
      usageValues,
      yearValues,
    ],
  );

  return (
    <div>
      <div className={`mb-3 flex justify-end ${pending ? "opacity-70" : ""}`}>
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={resetFilters}
            disabled={pending}
            className="shrink-0 text-[11px] font-medium text-[var(--ink-dim)] transition hover:text-[var(--exclusive)] disabled:cursor-not-allowed disabled:opacity-30"
          >
            Reset
          </button>
        ) : (
          <span className="h-4" />
        )}
      </div>

      <form className="space-y-2.5" onSubmit={(e) => e.preventDefault()}>
        <label className="block">
          <span className="sr-only">Search</span>
          <input
            ref={searchInputRef}
            className={fieldClass}
            value={searchDraft}
            placeholder="Search title, client, project, mood…"
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
                  active instanceof HTMLInputElement &&
                  active.placeholder === "Search title, client, project, mood…";
                if (!stillTyping) liveSearchDraft = null;
              }, 0);
            }}
          />
        </label>

        <div className="space-y-2 border-t border-[var(--line)] pt-2.5">
          {hideLicenseFilter ? null : (
            <FilterRow label="License">
              <select
                className={fieldClass}
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
                  {available.licenses.hold || licenseValue === "hold" ? "On Hold" : "On Hold · none"}
                </option>
              </select>
            </FilterRow>
          )}

          {showSamroFilter ? (
            <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-2">
              <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--ink-dim)]">
                SAMRO
                <PrepareProInfo />
              </span>
              <select
                className={fieldClass}
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
            </div>
          ) : null}

          <FilterRow label="Genre" tone="genre">
            <MultiFacetField
              items={options.genres}
              available={availableSets.genres}
              selected={genreValues}
              addLabel="Add genre…"
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
              addLabel="Add mood…"
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
              addLabel="Add instrument…"
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
              addLabel="Add usage…"
              tone="usage"
              fieldClass={fieldClass}
              onChange={(next) => updateList("attribute", next)}
            />
          </FilterRow>

          <FilterRow label="Year">
            <MultiFacetField
              items={yearItems}
              available={availableSets.years}
              selected={yearValues}
              addLabel="Add year…"
              fieldClass={fieldClass}
              onChange={(next) => updateList("year", next)}
            />
          </FilterRow>
        </div>

        {selectedChips.length ? (
          <div className="border-t border-[var(--line)] pt-3">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--ink-dim)]">
              Selected
            </p>
            <div className="flex flex-wrap gap-1.5">
              {selectedChips.map((chip) => {
                const pillClass = chip.tone
                  ? TAG_TONE_PILL[chip.tone]
                  : "border-[var(--line)] bg-[rgba(0,0,0,0.2)] text-[var(--ink-muted)]";
                return (
                  <button
                    key={`${chip.key}:${chip.value}`}
                    type="button"
                    onClick={() => removeChip(chip)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-normal leading-none transition hover:brightness-110 ${pillClass}`}
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
