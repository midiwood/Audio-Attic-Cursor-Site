export type CatalogSort = "title" | "year" | "bpm" | "date";
export type CatalogSortDir = "asc" | "desc";

/** Default Browse sort: Date added, newest → oldest. */
export const DEFAULT_CATALOG_SORT: CatalogSort = "date";

/**
 * Query param for sort direction.
 * Do not use `dir` — Apache/ModSecurity treats it as a Unix command and returns 406.
 */
export const CATALOG_DIR_PARAM = "direction";
const LEGACY_DIR_PARAM = "dir";

/** Default direction when switching to a column (Title A→Z; others high→low). */
export function defaultSortDir(sort: CatalogSort = "date"): CatalogSortDir {
  return sort === "title" ? "asc" : "desc";
}

export const DEFAULT_CATALOG_SORT_DIR = defaultSortDir(DEFAULT_CATALOG_SORT);

export function parseSortDirParam(
  get: (key: string) => string | null | undefined,
): CatalogSortDir | undefined {
  const raw = get(CATALOG_DIR_PARAM) ?? get(LEGACY_DIR_PARAM);
  if (raw === "asc" || raw === "desc") return raw;
  return undefined;
}

export function applySortDirParam(
  params: URLSearchParams,
  sort: CatalogSort,
  dir: CatalogSortDir,
) {
  params.delete(CATALOG_DIR_PARAM);
  params.delete(LEGACY_DIR_PARAM);
  if (dir !== defaultSortDir(sort)) params.set(CATALOG_DIR_PARAM, dir);
}

export function clearSortDirParams(params: URLSearchParams) {
  params.delete(CATALOG_DIR_PARAM);
  params.delete(LEGACY_DIR_PARAM);
}
