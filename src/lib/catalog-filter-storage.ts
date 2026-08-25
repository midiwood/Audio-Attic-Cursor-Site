const STORAGE_KEY = "audio-attic:catalog-filters";
const EVENT = "audio-attic:catalog-filters";

/** Drop sort params so a fresh Browse visit always defaults to Date added (newest first). */
function withoutSort(query: string): string {
  if (!query) return "";
  const params = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
  params.delete("sort");
  params.delete("dir");
  return params.toString();
}

/** Persist Browse filter query so navigating away and back keeps filters. */
export function saveCatalogFilterQuery(query: string) {
  try {
    if (typeof window === "undefined") return;
    const cleaned = withoutSort(query);
    if (cleaned) sessionStorage.setItem(STORAGE_KEY, cleaned);
    else sessionStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // ignore quota / private mode
  }
}

export function loadCatalogFilterQuery(): string {
  try {
    if (typeof window === "undefined") return "";
    return withoutSort(sessionStorage.getItem(STORAGE_KEY) || "");
  } catch {
    return "";
  }
}

export function catalogBrowseHref(): string {
  const query = loadCatalogFilterQuery();
  return query ? `/?${query}` : "/";
}

export function clearCatalogFilterQuery() {
  saveCatalogFilterQuery("");
}

export function subscribeCatalogFilterQuery(listener: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}
