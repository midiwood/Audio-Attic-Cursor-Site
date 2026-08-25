import { sanitizeFilters, type TrackFilters } from "@/lib/queries";
import { DEFAULT_CATALOG_SORT, defaultSortDir } from "@/lib/catalog-sort";
import { parseSamroFilter } from "@/lib/samro";

function first(value: string | string[] | null | undefined): string | undefined {
  if (value == null) return undefined;
  if (Array.isArray(value)) return value[0];
  return value;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/** Read multi-value facet params (`genre=a&genre=b` or legacy `genre=a,b`). */
function all(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
  key: string,
): string[] {
  let raw: string[] = [];
  if (params instanceof URLSearchParams) {
    raw = params.getAll(key);
  } else {
    const value = params[key];
    if (value == null) raw = [];
    else if (Array.isArray(value)) raw = value.map(String);
    else raw = [String(value)];
  }
  return uniqueStrings(raw.flatMap((part) => part.split(",")));
}

function setListParam(next: URLSearchParams, key: string, values: string[] | undefined) {
  next.delete(key);
  if (!values?.length) return;
  for (const value of values) next.append(key, value);
}

/** Parse Browse filter params from a URLSearchParams or Next searchParams record. */
export function parseCatalogFilters(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): TrackFilters {
  const get = (key: string) => {
    if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
    return first(params[key]);
  };

  const licenseParam = get("license") ?? "all";
  const sort = (get("sort") as TrackFilters["sort"]) || DEFAULT_CATALOG_SORT;
  const dirParam = get("dir");
  const sortDir =
    dirParam === "asc" || dirParam === "desc" ? dirParam : defaultSortDir(sort);

  const years = all(params, "year")
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  const raw: TrackFilters = {
    q: get("q"),
    genre: all(params, "genre"),
    mood: all(params, "mood"),
    instrument: all(params, "instrument"),
    attribute: all(params, "attribute"),
    license: (["available", "clear", "library", "exclusive", "hold", "all"].includes(licenseParam)
      ? licenseParam
      : "all") as TrackFilters["license"],
    samro: parseSamroFilter(get("samro")),
    year: years.length ? years : undefined,
    sort,
    sortDir,
  };

  if (!raw.genre?.length) raw.genre = undefined;
  if (!raw.mood?.length) raw.mood = undefined;
  if (!raw.instrument?.length) raw.instrument = undefined;
  if (!raw.attribute?.length) raw.attribute = undefined;
  if (raw.samro === "all") raw.samro = undefined;

  return sanitizeFilters(raw);
}

export function catalogFiltersToQuery(filters: TrackFilters): string {
  const next = new URLSearchParams();
  if (filters.q) next.set("q", filters.q);
  if (filters.license && filters.license !== "all") next.set("license", filters.license);
  if (filters.samro && filters.samro !== "all") next.set("samro", filters.samro);
  setListParam(next, "genre", filters.genre);
  setListParam(next, "mood", filters.mood);
  setListParam(next, "instrument", filters.instrument);
  setListParam(next, "attribute", filters.attribute);
  setListParam(
    next,
    "year",
    filters.year?.map((value) => String(value)),
  );

  const sort = filters.sort || DEFAULT_CATALOG_SORT;
  const sortDir = filters.sortDir || defaultSortDir(sort);
  if (sort !== DEFAULT_CATALOG_SORT) next.set("sort", sort);
  if (sortDir !== defaultSortDir(sort)) next.set("dir", sortDir);

  return next.toString();
}
