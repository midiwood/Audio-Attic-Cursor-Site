export type CatalogSort = "title" | "year" | "bpm" | "date";
export type CatalogSortDir = "asc" | "desc";

/** Default Browse sort: Date added, newest → oldest. */
export const DEFAULT_CATALOG_SORT: CatalogSort = "date";

/** Default direction when switching to a column (Title A→Z; others high→low). */
export function defaultSortDir(sort: CatalogSort = "date"): CatalogSortDir {
  return sort === "title" ? "asc" : "desc";
}

export const DEFAULT_CATALOG_SORT_DIR = defaultSortDir(DEFAULT_CATALOG_SORT);
