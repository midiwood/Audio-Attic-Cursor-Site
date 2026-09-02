/** Shared open state for the mobile filters panel (browse page). */

const OPEN_REQUEST_KEY = "attic-open-filters";
const OPEN_EVENT = "attic-mobile-filters-open";

type Listener = (open: boolean) => void;

let open = false;
const listeners = new Set<Listener>();

export function getMobileFiltersOpen(): boolean {
  return open;
}

export function setMobileFiltersOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  for (const listener of listeners) listener(open);
}

export function toggleMobileFiltersOpen(): void {
  setMobileFiltersOpen(!open);
}

export function subscribeMobileFiltersOpen(listener: Listener): () => void {
  listeners.add(listener);
  listener(open);
  return () => listeners.delete(listener);
}

/** Navigate to browse first, then call on arrival (see FiltersRail). */
export function queueMobileFiltersOpen(): void {
  try {
    sessionStorage.setItem(OPEN_REQUEST_KEY, "1");
  } catch {
    // ignore
  }
}

export function consumeQueuedMobileFiltersOpen(): boolean {
  try {
    const queued = sessionStorage.getItem(OPEN_REQUEST_KEY) === "1";
    if (queued) sessionStorage.removeItem(OPEN_REQUEST_KEY);
    return queued;
  } catch {
    return false;
  }
}

export function requestMobileFiltersOpen(): void {
  setMobileFiltersOpen(true);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(OPEN_EVENT));
  }
}

export function subscribeMobileFiltersOpenRequest(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(OPEN_EVENT, listener);
  return () => window.removeEventListener(OPEN_EVENT, listener);
}
