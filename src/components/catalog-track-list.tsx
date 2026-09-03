"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TrackList } from "@/components/track-list";
import {
  NEED_MORE_QUEUE_EVENT,
  QUEUE_EXHAUSTED_EVENT,
  prefetchTopPlayable,
  usePlayer,
} from "@/components/player-provider";
import { CATALOG_PAGE_SIZE } from "@/lib/catalog-constants";
import { saveCatalogFilterQuery, clearCatalogFilterQuery } from "@/lib/catalog-filter-storage";
import { DEFAULT_CATALOG_SORT, defaultSortDir, type CatalogSort, type CatalogSortDir } from "@/lib/catalog-sort";
import type { TrackListItem } from "@/lib/track-list-item";
import type { TrackRelationView } from "@/lib/track-relations";
import type { CatalogMetaSuggestions } from "@/lib/queries";
import type { UserTrackLicenseStatus } from "@/lib/license-requests";
import type { CatalogVocabulary } from "@/lib/vocabulary";
import { type SamroProProfile } from "@/lib/samro";
import { SamroPrepareBar } from "@/components/samro-prepare-bar";
import { BrowseSelectionBar } from "@/components/browse-selection-bar";
import { BatchTrackEditPanel } from "@/components/batch-track-edit-panel";
import type { ComposerOption } from "@/components/composer-picker";
import { downloadTracksZip } from "@/lib/download-tracks-zip";
import { MAX_ZIP_TRACKS } from "@/lib/audio-download-shared";

const SORT_VALUES: CatalogSort[] = ["title", "year", "bpm", "date"];

type RelationsMap = Record<string, TrackRelationView[]>;

type PageResponse = {
  tracks: TrackListItem[];
  relationsByTrack?: RelationsMap;
  licenseEntryCounts?: Record<string, number>;
  userLicenseByTrack?: Record<string, UserTrackLicenseStatus>;
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  error?: string;
};

export function CatalogTrackList({
  filterQuery,
  filterBasePath = "/",
  initialTracks,
  initialRelations,
  initialLicenseCounts,
  initialUserLicenseByTrack,
  initialTotal,
  canEdit,
  vocabulary,
  metaSuggestions,
  composers = [],
  subscriberView = false,
  prepareProMode = false,
  samroProfile,
  housePublisherName = "",
}: {
  /** Canonical filter query string (no limit/offset) — used as reset key + API params. */
  filterQuery: string;
  /** Base path for sort/clear navigation (default browse). */
  filterBasePath?: string;
  initialTracks: TrackListItem[];
  initialRelations: RelationsMap;
  initialLicenseCounts?: Record<string, number>;
  initialUserLicenseByTrack?: Record<string, UserTrackLicenseStatus>;
  initialTotal: number;
  canEdit: boolean;
  vocabulary?: CatalogVocabulary;
  metaSuggestions?: CatalogMetaSuggestions;
  composers?: ComposerOption[];
  subscriberView?: boolean;
  prepareProMode?: boolean;
  samroProfile?: SamroProProfile;
  housePublisherName?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [tracks, setTracks] = useState(initialTracks);
  const [relationsByTrack, setRelationsByTrack] = useState(initialRelations);
  const [licenseEntryCounts, setLicenseEntryCounts] = useState(
    initialLicenseCounts || {},
  );
  const [userLicenseByTrack, setUserLicenseByTrack] = useState(
    initialUserLicenseByTrack || {},
  );
  const [total, setTotal] = useState(initialTotal);
  const [hasMore, setHasMore] = useState(initialTracks.length < initialTotal);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [selectAllBusy, setSelectAllBusy] = useState(false);
  const [filteredSelectAllIds, setFilteredSelectAllIds] = useState<Set<string> | null>(null);
  const [browseSelectionMode, setBrowseSelectionMode] = useState(false);
  const [batchEditOpen, setBatchEditOpen] = useState(false);
  const [batchNotice, setBatchNotice] = useState("");
  const [extraSelectedTracks, setExtraSelectedTracks] = useState<TrackListItem[]>([]);
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const { current } = usePlayer();

  const sortParam = searchParams.get("sort");
  const sort: CatalogSort =
    sortParam && SORT_VALUES.includes(sortParam as CatalogSort)
      ? (sortParam as CatalogSort)
      : DEFAULT_CATALOG_SORT;
  const dirParam = searchParams.get("dir");
  const sortDir: CatalogSortDir =
    dirParam === "asc" || dirParam === "desc" ? dirParam : defaultSortDir(sort);

  const handleSortChange = useCallback(
    (nextSort: CatalogSort, nextDir: CatalogSortDir) => {
      const next = new URLSearchParams(searchParams.toString());
      if (nextSort === DEFAULT_CATALOG_SORT) next.delete("sort");
      else next.set("sort", nextSort);
      if (nextDir === defaultSortDir(nextSort)) next.delete("dir");
      else next.set("dir", nextDir);
      const query = next.toString();
      saveCatalogFilterQuery(query);
      startTransition(() => {
        router.push(query ? `${filterBasePath}?${query}` : filterBasePath);
      });
    },
    [filterBasePath, router, searchParams],
  );

  const handleClearFilters = useCallback(() => {
    clearCatalogFilterQuery();
    startTransition(() => {
      router.push(filterBasePath);
    });
  }, [filterBasePath, router]);

  // Reset when SSR seeds / filter query change
  useEffect(() => {
    setTracks(initialTracks);
    setRelationsByTrack(initialRelations);
    setLicenseEntryCounts(initialLicenseCounts || {});
    setUserLicenseByTrack(initialUserLicenseByTrack || {});
    setTotal(initialTotal);
    setHasMore(initialTracks.length < initialTotal);
    setSelectedIds(new Set());
    setFilteredSelectAllIds(null);
    setSelectAllBusy(false);
    setBrowseSelectionMode(false);
    setBatchEditOpen(false);
    setBatchNotice("");
    setExtraSelectedTracks([]);
    setError("");
    prefetchTopPlayable(initialTracks, 5);
  }, [
    filterQuery,
    initialTracks,
    initialRelations,
    initialLicenseCounts,
    initialUserLicenseByTrack,
    initialTotal,
  ]);

  const handleTrackSaved = useCallback(
    (track: TrackListItem, relations: TrackRelationView[]) => {
      setTracks((prev) => prev.map((row) => (row.id === track.id ? track : row)));
      setRelationsByTrack((prev) => ({ ...prev, [track.id]: relations }));
    },
    [],
  );

  const handleTrackTrashed = useCallback((trackId: string) => {
    setTracks((prev) => prev.filter((row) => row.id !== trackId));
    setRelationsByTrack((prev) => {
      const next = { ...prev };
      delete next[trackId];
      return next;
    });
    setTotal((prev) => Math.max(0, prev - 1));
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setLoading(true);
    setError("");

    const offset = tracks.length;
    const params = new URLSearchParams(filterQuery);
    params.set("limit", String(CATALOG_PAGE_SIZE));
    params.set("offset", String(offset));

    try {
      const res = await fetch(`/api/tracks?${params.toString()}`, {
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => ({}))) as PageResponse;
      if (!res.ok) {
        setError(data.error || "Failed to load more tracks");
        return;
      }

      setTracks((prev) => {
        const seen = new Set(prev.map((t) => t.id));
        const appended = (data.tracks || []).filter((t) => !seen.has(t.id));
        // Warm audio for newly visible rows (list order within this page).
        prefetchTopPlayable(appended, 5);
        return [...prev, ...appended];
      });
      setRelationsByTrack((prev) => ({
        ...prev,
        ...(data.relationsByTrack || {}),
      }));
      setLicenseEntryCounts((prev) => ({
        ...prev,
        ...(data.licenseEntryCounts || {}),
      }));
      setUserLicenseByTrack((prev) => ({
        ...prev,
        ...(data.userLicenseByTrack || {}),
      }));
      setTotal(data.total);
      setHasMore(Boolean(data.hasMore));
      if (!data.hasMore) {
        window.dispatchEvent(new Event(QUEUE_EXHAUSTED_EVENT));
      }
    } catch {
      setError("Failed to load more tracks");
      window.dispatchEvent(new Event(QUEUE_EXHAUSTED_EVENT));
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [filterQuery, hasMore, tracks.length]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMore();
        }
      },
      { root: null, rootMargin: "320px 0px", threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  // Prefetch the next page when playback nears the end of what's loaded.
  useEffect(() => {
    if (!current || !hasMore) return;
    const idx = tracks.findIndex((t) => t.id === current.id);
    if (idx < 0) return;
    if (idx >= tracks.length - 5) {
      void loadMore();
    }
  }, [current, hasMore, tracks, loadMore]);

  // ↑↓ at end of loaded page — fetch more so syncQueue can advance.
  useEffect(() => {
    const onNeedMore = () => {
      if (!hasMore) {
        window.dispatchEvent(new Event(QUEUE_EXHAUSTED_EVENT));
        return;
      }
      void loadMore();
    };
    window.addEventListener(NEED_MORE_QUEUE_EVENT, onNeedMore);
    return () => window.removeEventListener(NEED_MORE_QUEUE_EVENT, onNeedMore);
  }, [hasMore, loadMore]);

  const selectionActive = prepareProMode || (canEdit && browseSelectionMode);

  const allFilteredIds = useMemo(() => {
    if (filteredSelectAllIds && filteredSelectAllIds.size > 0) return filteredSelectAllIds;
    if (tracks.length >= total && total > 0) return new Set(tracks.map((track) => track.id));
    return null;
  }, [filteredSelectAllIds, tracks, total]);

  const prepareSelectAllChecked = Boolean(
    allFilteredIds &&
      allFilteredIds.size > 0 &&
      selectedIds.size === allFilteredIds.size &&
      [...allFilteredIds].every((id) => selectedIds.has(id)),
  );
  const prepareSelectAllIndeterminate =
    selectedIds.size > 0 && !prepareSelectAllChecked;

  async function fetchAllFilteredTracks(): Promise<TrackListItem[]> {
    const pageSize = 100;
    let offset = 0;
    const all: TrackListItem[] = [];
    while (offset < total) {
      const params = new URLSearchParams(filterQuery);
      params.set("limit", String(pageSize));
      params.set("offset", String(offset));
      const res = await fetch(`/api/tracks?${params.toString()}`, {
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => ({}))) as PageResponse;
      if (!res.ok) {
        throw new Error(data.error || "Failed to load filtered tracks");
      }
      all.push(...(data.tracks || []));
      if (!data.hasMore) break;
      offset += pageSize;
    }
    return all;
  }

  async function toggleSelectAllFiltered() {
    if (prepareSelectAllChecked) {
      setSelectedIds(new Set());
      setFilteredSelectAllIds(null);
      return;
    }
    setSelectAllBusy(true);
    setError("");
    try {
      const all = tracks.length >= total ? tracks : await fetchAllFilteredTracks();
      const targetSet = new Set(all.map((track) => track.id));
      setSelectedIds(targetSet);
      setFilteredSelectAllIds(targetSet);
      setExtraSelectedTracks(all);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not select filtered tracks");
    } finally {
      setSelectAllBusy(false);
    }
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setFilteredSelectAllIds(null);
    setExtraSelectedTracks([]);
  }

  async function handleDownloadSelected() {
    const ids = [...selectedIds];
    if (!ids.length || downloadBusy) return;
    if (ids.length > MAX_ZIP_TRACKS) {
      setDownloadError(`Download at most ${MAX_ZIP_TRACKS} tracks at a time`);
      return;
    }
    setDownloadBusy(true);
    setDownloadError("");
    const result = await downloadTracksZip({ trackIds: ids });
    setDownloadBusy(false);
    if (!result.ok) setDownloadError(result.error);
  }

  function handleBatchApplied(summary: { updated: number; failed: number }) {
    setBatchNotice(
      summary.failed
        ? `Updated ${summary.updated} track${summary.updated === 1 ? "" : "s"}, ${summary.failed} failed`
        : `Updated ${summary.updated} track${summary.updated === 1 ? "" : "s"}`,
    );
    router.refresh();
  }

  const selectedTracks = useMemo(() => {
    const byId = new Map<string, TrackListItem>();
    for (const track of extraSelectedTracks) byId.set(track.id, track);
    for (const track of tracks) byId.set(track.id, track);
    return [...selectedIds]
      .map((id) => byId.get(id))
      .filter((track): track is TrackListItem => Boolean(track));
  }, [extraSelectedTracks, tracks, selectedIds]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-4 lg:px-6">
        {canEdit && !prepareProMode ? (
          <button
            type="button"
            onClick={() => {
              setBrowseSelectionMode((prev) => {
                if (prev) clearSelection();
                return !prev;
              });
            }}
            className={`rounded-lg border px-3 py-1.5 text-sm transition ${
              browseSelectionMode
                ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink)]"
                : "border-[var(--line)] text-[var(--ink-muted)] hover:border-[var(--accent)] hover:text-[var(--ink)]"
            }`}
          >
            {browseSelectionMode ? "Done selecting" : "Select tracks"}
          </button>
        ) : (
          <span />
        )}
        <p className="text-sm tabular-nums text-[var(--ink-dim)]">
          {total} track{total === 1 ? "" : "s"}
          {tracks.length < total ? (
            <span className="text-[var(--ink-dim)]">
              {" "}
              · showing {tracks.length}
            </span>
          ) : null}
        </p>
      </div>

      {batchNotice ? (
        <p className="mb-3 mx-4 rounded-lg border border-[var(--available)]/30 bg-[var(--available)]/10 px-3 py-2 text-sm text-[var(--available)] lg:mx-6">
          {batchNotice}
        </p>
      ) : null}

      {selectionActive && total > 0 ? (
        <div className="mb-3 mx-4 flex items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)]/70 px-4 py-2.5 xl:hidden lg:mx-6">
          <label className="flex items-center gap-2 text-xs text-[var(--ink-dim)]">
            <input
              type="checkbox"
              checked={prepareSelectAllChecked}
              ref={(node) => {
                if (node) node.indeterminate = prepareSelectAllIndeterminate;
              }}
              onClick={(e) => {
                e.preventDefault();
                if (!selectAllBusy) void toggleSelectAllFiltered();
              }}
              onChange={() => {}}
              disabled={selectAllBusy}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            Select all in filter
          </label>
          {selectAllBusy ? (
            <span className="text-xs text-[var(--ink-dim)]">Loading…</span>
          ) : null}
        </div>
      ) : null}

      <TrackList
        tracks={tracks}
        relationsByTrack={relationsByTrack}
        licenseEntryCounts={licenseEntryCounts}
        userLicenseByTrack={userLicenseByTrack}
        canEdit={canEdit}
        vocabulary={vocabulary}
        metaSuggestions={metaSuggestions}
        composers={composers}
        subscriberView={subscriberView}
        onTrackSaved={handleTrackSaved}
        onTrackTrashed={handleTrackTrashed}
        sort={sort}
        sortDir={sortDir}
        onSortChange={handleSortChange}
        prepareProMode={prepareProMode}
        selectionMode={selectionActive}
        samroProfile={samroProfile}
        housePublisherName={housePublisherName}
        selectedIds={selectionActive ? selectedIds : undefined}
        onToggleSelect={
          selectionActive
            ? (id) => {
                setFilteredSelectAllIds(null);
                setSelectedIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                });
              }
            : undefined
        }
        prepareSelectAllChecked={prepareSelectAllChecked}
        prepareSelectAllIndeterminate={prepareSelectAllIndeterminate}
        prepareSelectAllBusy={selectAllBusy}
        onPrepareSelectAllToggle={
          selectionActive ? () => void toggleSelectAllFiltered() : undefined
        }
        onClearFilters={filterQuery ? handleClearFilters : undefined}
      />

      {prepareProMode && samroProfile ? (
        <SamroPrepareBar
          tracks={tracks}
          selectedIds={[...selectedIds]}
          profile={samroProfile}
          onClear={clearSelection}
          onBatchEdit={() => setBatchEditOpen(true)}
        />
      ) : null}

      {selectionActive && !prepareProMode && selectedIds.size > 0 ? (
        <BrowseSelectionBar
          selectedCount={selectedIds.size}
          downloadBusy={downloadBusy}
          onClear={clearSelection}
          onBatchEdit={() => setBatchEditOpen(true)}
          onDownload={() => void handleDownloadSelected()}
        />
      ) : null}

      {batchEditOpen && selectionActive ? (
        <BatchTrackEditPanel
          trackIds={[...selectedIds]}
          tracks={selectedTracks}
          composers={composers}
          housePublisherName={housePublisherName}
          metaSuggestions={metaSuggestions}
          onClose={() => setBatchEditOpen(false)}
          onApplied={handleBatchApplied}
        />
      ) : null}

      <div ref={sentinelRef} className="h-8 w-full" aria-hidden />

      {loading ? (
        <p className="py-4 text-center text-sm text-[var(--ink-dim)]">Loading more…</p>
      ) : null}
      {error ? (
        <p className="py-3 text-center text-sm text-[var(--exclusive)]">{error}</p>
      ) : null}
      {downloadError ? (
        <p className="py-3 text-center text-sm text-[var(--exclusive)]">{downloadError}</p>
      ) : null}
      {!hasMore && tracks.length > 0 ? (
        <p className="py-3 text-center text-xs text-[var(--ink-dim)]">End of list</p>
      ) : null}
    </div>
  );
}
