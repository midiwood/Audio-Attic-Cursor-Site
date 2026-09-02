"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AddToPlaylistButton } from "@/components/add-to-playlist-button";
import { InlineTrackPanel } from "@/components/inline-track-panel";
import type { ComposerOption } from "@/components/composer-picker";
import { LicenseBadge } from "@/components/license-badge";
import { LicenseIconButton } from "@/components/license-panel";
import { SubscriberLicensePanel } from "@/components/subscriber-license-panel";
import {
  SCROLL_TO_CURRENT_EVENT,
  usePlayer,
  type PlayerTrack,
} from "@/components/player-provider";
import { formatDisplayTitle, hasPlayableAudio } from "@/lib/tracks";
import type { TrackRelationView } from "@/lib/track-relations";
import { type TrackListItem } from "@/lib/track-list-item";
import type { CatalogMetaSuggestions } from "@/lib/queries";
import type { UserTrackLicenseStatus } from "@/lib/license-requests";
import type { CatalogVocabulary } from "@/lib/vocabulary";
import {
  type CatalogSort,
  type CatalogSortDir,
} from "@/lib/catalog-sort";
import { isSamroSubmitted, assessSamroReadiness, type SamroProProfile } from "@/lib/samro";

export type { TrackListItem } from "@/lib/track-list-item";
export type { CatalogSort, CatalogSortDir } from "@/lib/catalog-sort";

function SamroStatusChip({
  ready,
  missing,
  detailed = false,
}: {
  ready: boolean;
  missing: string[];
  detailed?: boolean;
}) {
  if (ready) {
    return (
      <span
        className="inline-flex shrink-0 items-center rounded bg-[var(--available)]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--available)]"
        title="Ready for SAMRO export"
      >
        Ready
      </span>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span
        className="inline-flex shrink-0 items-center rounded bg-[var(--exclusive)]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--exclusive)]"
        title={missing.length ? `Missing: ${missing.join(", ")}` : "Incomplete"}
      >
        Incomplete
      </span>
      {detailed && missing.length ? (
        <ul className="max-w-[220px] space-y-0.5 text-[10px] leading-snug text-[var(--ink-dim)]">
          {missing.map((item) => (
            <li key={item}>
              {item.startsWith("composer IPI:") ? (
                <>
                  {item}
                  {" — "}
                  <Link href="/admin/composers" className="text-[var(--accent)] hover:underline">
                    Composers
                  </Link>
                </>
              ) : (
                item
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function SamroSubmittedMark() {
  return (
    <span
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--available)]/15 text-[var(--available)]"
      title="Submitted to SAMRO"
      aria-label="Submitted to SAMRO"
    >
      <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none" aria-hidden>
        <path
          d="M2.5 6.2 4.8 8.5 9.5 3.5"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function SamroCell({ submitted }: { submitted: boolean }) {
  if (!submitted) {
    return (
      <span className="text-xs text-[var(--ink-dim)]" title="Not submitted to SAMRO">
        —
      </span>
    );
  }
  return <SamroSubmittedMark />;
}

const GRID_COLS =
  "xl:grid-cols-[44px_minmax(0,1.4fr)_minmax(0,0.85fr)_64px_56px_88px_100px_130px]";
const GRID_COLS_WITH_SAMRO =
  "xl:grid-cols-[44px_minmax(0,1.4fr)_minmax(0,0.85fr)_64px_56px_88px_56px_100px_130px]";
const GRID_COLS_SUBSCRIBER =
  "xl:grid-cols-[44px_minmax(0,1.4fr)_minmax(0,0.85fr)_64px_56px_88px_130px]";
/** Prepare PRO: title → status → year → added → actions (no genre/BPM). */
const GRID_COLS_PREPARE =
  "xl:grid-cols-[72px_minmax(0,1.6fr)_minmax(220px,auto)_64px_88px_130px]";
function playButtonClass(active: boolean, playing: boolean) {
  if (active && playing) {
    return "border-[var(--accent)] bg-[var(--accent)] text-white shadow-[0_0_0_3px_var(--accent-soft)]";
  }
  if (active) {
    return "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink)]";
  }
  return "border-[var(--line)] text-[var(--ink)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]";
}

function toPlayerTrack(track: TrackListItem, subscriberView = false): PlayerTrack {
  return {
    id: track.id,
    title: formatDisplayTitle(track),
    subtitle: subscriberView
      ? [track.duration, track.musicalKey].filter(Boolean).join(" · ") || null
      : [track.client, track.project, track.year].filter(Boolean).join(" · ") || null,
    duration: track.duration,
    dropboxDl: track.dropboxDl,
    dropboxPath: track.dropboxPath,
    license: track.license,
  };
}

function formatAddedDate(track: TrackListItem): string {
  const raw = track.date || track.createdAt;
  if (!raw) return "—";

  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) {
    // Fixed en-GB-style day mon year — avoids SSR/client locale hydration mismatches.
    const d = new Date(parsed);
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }

  const human = raw.match(/^(\d{1,2}\s+\w+\s+\d{4})/);
  if (human) return human[1];
  return raw.length > 16 ? `${raw.slice(0, 14)}…` : raw;
}

function SortHeader({
  label,
  sortKey,
  activeSort,
  activeDir,
  onSort,
}: {
  label: string;
  sortKey: CatalogSort;
  activeSort?: CatalogSort;
  activeDir?: CatalogSortDir;
  onSort?: (sort: CatalogSort) => void;
}) {
  if (!onSort) {
    return <span>{label}</span>;
  }
  const active = activeSort === sortKey;
  const title = active
    ? `Sorted ${activeDir === "asc" ? "ascending" : "descending"} — click to reverse`
    : `Sort by ${label}`;

  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      title={title}
      className={`group -ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 transition hover:bg-white/5 hover:text-[var(--ink)] ${
        active ? "text-[var(--accent)]" : "text-[var(--ink-dim)]"
      }`}
      aria-sort={active ? (activeDir === "asc" ? "ascending" : "descending") : "none"}
    >
      <span>{label}</span>
      <span className="inline-flex flex-col leading-none" aria-hidden>
        <span
          className={`text-[9px] ${
            active && activeDir === "asc" ? "text-[var(--accent)]" : "opacity-35 group-hover:opacity-60"
          }`}
        >
          ▲
        </span>
        <span
          className={`-mt-0.5 text-[9px] ${
            active && activeDir === "desc" ? "text-[var(--accent)]" : "opacity-35 group-hover:opacity-60"
          }`}
        >
          ▼
        </span>
      </span>
    </button>
  );
}

export function TrackList({
  tracks,
  relationsByTrack,
  licenseEntryCounts: initialLicenseCounts,
  userLicenseByTrack: initialUserLicenseByTrack,
  showRemoveFromPlaylist,
  canEdit = false,
  vocabulary,
  metaSuggestions,
  composers = [],
  subscriberView = false,
  showAddToPlaylist = true,
  onTrackSaved,
  onTrackTrashed,
  initiallyExpanded = false,
  sort,
  sortDir = "desc",
  onSortChange,
  prepareProMode = false,
  selectionMode = false,
  samroProfile,
  housePublisherName = "",
  selectedIds,
  onToggleSelect,
  prepareSelectAllChecked = false,
  prepareSelectAllIndeterminate = false,
  prepareSelectAllBusy = false,
  onPrepareSelectAllToggle,
  onClearFilters,
}: {
  tracks: TrackListItem[];
  relationsByTrack?: Record<string, TrackRelationView[]>;
  licenseEntryCounts?: Record<string, number>;
  userLicenseByTrack?: Record<string, UserTrackLicenseStatus>;
  showRemoveFromPlaylist?: (trackId: string) => void;
  canEdit?: boolean;
  vocabulary?: CatalogVocabulary;
  metaSuggestions?: CatalogMetaSuggestions;
  composers?: ComposerOption[];
  subscriberView?: boolean;
  showAddToPlaylist?: boolean;
  onTrackSaved?: (track: TrackListItem, relations: TrackRelationView[]) => void;
  onTrackTrashed?: (trackId: string) => void;
  initiallyExpanded?: boolean;
  sort?: CatalogSort;
  sortDir?: CatalogSortDir;
  onSortChange?: (sort: CatalogSort, dir: CatalogSortDir) => void;
  /** Staff Prepare PRO filter — selection + Ready/Incomplete. */
  prepareProMode?: boolean;
  /** Row checkboxes for batch edit (Prepare PRO or staff Browse). */
  selectionMode?: boolean;
  samroProfile?: SamroProProfile;
  housePublisherName?: string;
  selectedIds?: Set<string>;
  onToggleSelect?: (trackId: string) => void;
  prepareSelectAllChecked?: boolean;
  prepareSelectAllIndeterminate?: boolean;
  prepareSelectAllBusy?: boolean;
  onPrepareSelectAllToggle?: () => void;
  /** Shown on empty filtered Browse — clears catalog filters. */
  onClearFilters?: () => void;
}) {
  const { playTrack, toggle, current, isPlaying, syncQueue } = usePlayer();
  const [expandedId, setExpandedId] = useState<string | null>(() =>
    initiallyExpanded && tracks.length ? tracks[0].id : null,
  );
  const [licenseCounts, setLicenseCounts] = useState<Record<string, number>>(
    () => initialLicenseCounts || {},
  );
  const [userLicenseByTrack, setUserLicenseByTrack] = useState<
    Record<string, UserTrackLicenseStatus>
  >(() => initialUserLicenseByTrack || {});
  const [licensePanelTrackId, setLicensePanelTrackId] = useState<string | null>(null);
  const currentIdRef = useRef<string | null>(null);

  useEffect(() => {
    setLicenseCounts(initialLicenseCounts || {});
  }, [initialLicenseCounts]);

  useEffect(() => {
    setUserLicenseByTrack(initialUserLicenseByTrack || {});
  }, [initialUserLicenseByTrack]);

  const queue = useMemo(
    () => tracks.filter((t) => hasPlayableAudio(t)).map((t) => toPlayerTrack(t, subscriberView)),
    [tracks, subscriberView],
  );
  const firstTrackId = tracks[0]?.id;
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const currentId = current?.id ?? null;
  currentIdRef.current = currentId;
  const showSamro = canEdit && !subscriberView;
  const showSelection = selectionMode || prepareProMode;
  const gridCols = prepareProMode
    ? GRID_COLS_PREPARE
    : subscriberView
      ? GRID_COLS_SUBSCRIBER
      : showSamro
        ? GRID_COLS_WITH_SAMRO
        : GRID_COLS;
  const mobileGridCols =
    prepareProMode || showSelection
      ? "grid-cols-[72px_minmax(0,1fr)_auto]"
      : "grid-cols-[44px_minmax(0,1fr)_auto]";

  useEffect(() => {
    if (!initiallyExpanded || !firstTrackId) return;
    setExpandedId((prev) => prev ?? firstTrackId);
  }, [initiallyExpanded, firstTrackId]);

  // When Browse infinite-scroll appends rows, keep ↑↓ queue in sync.
  useEffect(() => {
    syncQueue(queue);
  }, [queue, syncQueue]);

  /** Locate a row in the list — scroll only, do not open track info. */
  function scrollRowIntoView(id: string, behavior: ScrollBehavior = "smooth") {
    const node = rowRefs.current.get(id);
    if (!node) return false;
    node.scrollIntoView({ block: "center", behavior });
    return true;
  }

  // Keep the active play/stop row in view when current track changes (keyboard next/prev).
  useEffect(() => {
    if (!currentId) return;
    const node = rowRefs.current.get(currentId);
    if (!node) return;
    node.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [currentId]);

  // Bottom player "Go to track" — center row if loaded; otherwise jump to Browse (?q=id).
  useEffect(() => {
    const onScrollToCurrent = () => {
      const id = currentIdRef.current;
      if (!id) return;
      if (scrollRowIntoView(id)) return;
      // Row may not be painted yet after a filter remount — retry once, then jump to Browse.
      requestAnimationFrame(() => {
        if (scrollRowIntoView(id)) return;
        const url = `/?q=${encodeURIComponent(id)}`;
        const already =
          window.location.pathname === "/" &&
          window.location.search === `?q=${encodeURIComponent(id)}`;
        if (already) return;
        window.location.assign(url);
      });
    };
    window.addEventListener(SCROLL_TO_CURRENT_EVENT, onScrollToCurrent);
    return () => window.removeEventListener(SCROLL_TO_CURRENT_EVENT, onScrollToCurrent);
  }, []);

  // After landing on Browse via ?q=<id>, scroll to the playing or first match (no expand).
  useEffect(() => {
    if (!tracks.length) return;
    const focusId =
      (currentId && tracks.some((t) => t.id === currentId) ? currentId : null) ||
      (tracks.length === 1 ? tracks[0].id : null);
    if (!focusId) return;
    const params = new URLSearchParams(window.location.search);
    const q = (params.get("q") || "").trim();
    if (!q) return;
    // Only auto-focus when the search looks like a track id jump.
    if (q !== focusId && !focusId.toLowerCase().includes(q.toLowerCase())) return;
    scrollRowIntoView(focusId, "smooth");
  }, [tracks, currentId]);

  function toggleExpanded(trackId: string) {
    setExpandedId((prev) => (prev === trackId ? null : trackId));
  }

  function handleSortClick(sortKey: CatalogSort) {
    if (!onSortChange) return;
    if (sort === sortKey) {
      onSortChange(sortKey, sortDir === "asc" ? "desc" : "asc");
      return;
    }
    onSortChange(sortKey, sortKey === "title" ? "asc" : "desc");
  }

  if (!tracks.length) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--bg-elevated)]/50 px-6 py-16 text-center text-[var(--ink-muted)]">
        <p>No tracks match these filters.</p>
        <p className="mt-2 text-sm text-[var(--ink-dim)]">
          Within a category any match counts; across categories every filter must match.
        </p>
        {onClearFilters ? (
          <button
            type="button"
            onClick={onClearFilters}
            className="mt-4 rounded-lg border border-[var(--line)] px-4 py-2 text-sm text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)]"
          >
            Reset filters
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)]/70 shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
      <div
        className={`hidden gap-3 border-b border-[var(--line)] px-4 py-3 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)] xl:grid ${gridCols}`}
      >
        {showSelection && onPrepareSelectAllToggle ? (
          <label className="flex items-center gap-2 normal-case tracking-normal">
            <input
              type="checkbox"
              checked={prepareSelectAllChecked}
              ref={(node) => {
                if (node) node.indeterminate = prepareSelectAllIndeterminate;
              }}
              onClick={(e) => {
                e.preventDefault();
                if (!prepareSelectAllBusy) onPrepareSelectAllToggle();
              }}
              onChange={() => {}}
              disabled={prepareSelectAllBusy}
              className="h-4 w-4 accent-[var(--accent)]"
              aria-label="Select all tracks in this filter"
            />
            <span className="sr-only">Select all</span>
          </label>
        ) : (
          <span />
        )}
        <SortHeader
          label="Title"
          sortKey="title"
          activeSort={sort}
          activeDir={sortDir}
          onSort={onSortChange ? handleSortClick : undefined}
        />
        {prepareProMode ? <span>Status</span> : null}
        {prepareProMode ? null : <span>Genre / Mood</span>}
        <SortHeader
          label="Year"
          sortKey="year"
          activeSort={sort}
          activeDir={sortDir}
          onSort={onSortChange ? handleSortClick : undefined}
        />
        {prepareProMode ? null : (
          <SortHeader
            label="BPM"
            sortKey="bpm"
            activeSort={sort}
            activeDir={sortDir}
            onSort={onSortChange ? handleSortClick : undefined}
          />
        )}
        <SortHeader
          label="Added"
          sortKey="date"
          activeSort={sort}
          activeDir={sortDir}
          onSort={onSortChange ? handleSortClick : undefined}
        />
        {prepareProMode ? null : (
          <>
            {showSamro ? <span>SAMRO</span> : null}
            {subscriberView ? null : <span>License</span>}
          </>
        )}
        <span className="text-right">Actions</span>
      </div>
      <ul>
        {tracks.map((track) => {
          const title = formatDisplayTitle(track);
          const active = current?.id === track.id;
          const canPlay = hasPlayableAudio(track);
          const expanded = expandedId === track.id;
          const lineage = subscriberView ? [] : relationsByTrack?.[track.id] || [];
          const subtitle = subscriberView
            ? [track.duration, track.musicalKey].filter(Boolean).join(" · ")
            : prepareProMode
              ? [
                  track.workingTitle?.trim() &&
                  track.workingTitle.trim() !== title
                    ? track.workingTitle.trim()
                    : null,
                  track.client,
                  track.project,
                  track.duration,
                ]
                  .filter(Boolean)
                  .join(" · ") || track.id
              : [track.client, track.project, track.duration].filter(Boolean).join(" · ") ||
                track.id;
          const readiness =
            prepareProMode && samroProfile
              ? assessSamroReadiness(track, samroProfile)
              : null;
          const selected = selectedIds?.has(track.id) ?? false;
          const prepareHighlight = prepareProMode;

          return (
            <li
              key={track.id}
              ref={(node) => {
                if (node) rowRefs.current.set(track.id, node);
                else rowRefs.current.delete(track.id);
              }}
              className={`border-b border-[var(--line)] last:border-b-0 ${
                prepareHighlight
                  ? selected
                    ? "bg-[var(--accent-soft)]"
                    : "bg-[rgba(245,158,11,0.06)] hover:bg-[rgba(245,158,11,0.1)]"
                  : active || expanded
                    ? "bg-[var(--accent-soft)]"
                    : "hover:bg-[rgba(255,255,255,0.02)]"
              }`}
            >
              <div
                className={`grid ${mobileGridCols} items-center gap-3 px-3 py-3 xl:px-4 ${gridCols}`}
              >
                <div className="flex items-center gap-1">
                  {showSelection && onToggleSelect ? (
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => onToggleSelect(track.id)}
                      title={
                        readiness && !readiness.ready
                          ? `Incomplete: ${readiness.missing.join(", ")}`
                          : "Select for batch actions"
                      }
                      className="h-4 w-4 accent-[var(--accent)]"
                      aria-label={`Select ${title}`}
                    />
                  ) : null}
                  <button
                    type="button"
                    disabled={!canPlay}
                    onClick={() => {
                      if (!canPlay) return;
                      if (active) {
                        toggle();
                        return;
                      }
                      playTrack(toPlayerTrack(track, subscriberView), queue);
                    }}
                    className={`grid h-10 w-10 place-items-center rounded-full border text-sm transition disabled:cursor-not-allowed disabled:opacity-30 ${playButtonClass(active, isPlaying)}`}
                    aria-label={active && isPlaying ? `Pause ${title}` : `Play ${title}`}
                  >
                    {active && isPlaying ? "❚❚" : "▶"}
                  </button>
                </div>

                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(track.id)}
                    className="block w-full truncate text-left font-medium text-[var(--ink)] transition hover:text-[var(--accent)]"
                    aria-expanded={expanded}
                  >
                    {title}
                  </button>
                  <div className="mt-0.5 flex items-center gap-2">
                    <div className="min-w-0 truncate text-xs text-[var(--ink-dim)]">
                      {subtitle || "\u00a0"}
                    </div>
                    {!subscriberView && lineage.length ? (
                      <span
                        className="shrink-0 rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--accent)]"
                        title={
                          lineage.length === 1
                            ? "1 lineage link"
                            : `${lineage.length} lineage links`
                        }
                      >
                        Linked
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 xl:hidden">
                    {showSamro && readiness ? (
                      <SamroStatusChip
                        ready={readiness.ready}
                        missing={readiness.missing}
                        detailed={prepareProMode}
                      />
                    ) : showSamro ? (
                      isSamroSubmitted(track.samro) ? (
                        <SamroSubmittedMark />
                      ) : (
                        <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
                          SAMRO —
                        </span>
                      )
                    ) : null}
                    {subscriberView ? null : <LicenseBadge license={track.license} />}
                    {track.year ? <span className="text-xs text-[var(--ink-dim)]">{track.year}</span> : null}
                    {!prepareProMode && track.bpm ? (
                      <span className="text-xs text-[var(--ink-dim)]">{track.bpm} BPM</span>
                    ) : null}
                    <span className="text-xs text-[var(--ink-dim)]">{formatAddedDate(track)}</span>
                    {!prepareProMode && track.musicalKey ? (
                      <span className="text-xs text-[var(--ink-dim)]">{track.musicalKey}</span>
                    ) : null}
                  </div>
                </div>

                {prepareProMode ? (
                  <div className="hidden items-center gap-2 xl:flex">
                    {readiness ? (
                      <SamroStatusChip
                        ready={readiness.ready}
                        missing={readiness.missing}
                        detailed={prepareProMode}
                      />
                    ) : null}
                    <LicenseBadge license={track.license} />
                  </div>
                ) : (
                  <div className="hidden min-w-0 xl:block">
                    <div className="truncate text-sm text-[var(--ink-muted)]">{track.genre || "—"}</div>
                    <div className="truncate text-xs text-[var(--ink-dim)]">{track.mood || ""}</div>
                  </div>
                )}
                <div className="hidden text-sm tabular-nums text-[var(--ink-muted)] xl:block">
                  {track.year || "—"}
                </div>
                {prepareProMode ? null : (
                  <div className="hidden text-sm tabular-nums text-[var(--ink-muted)] xl:block">
                    {track.bpm || "—"}
                  </div>
                )}
                <div
                  className="hidden text-xs tabular-nums text-[var(--ink-dim)] xl:block"
                  title={track.date || track.createdAt || undefined}
                >
                  {formatAddedDate(track)}
                </div>
                {prepareProMode ? null : (
                  <>
                    {showSamro ? (
                      <div className="hidden xl:flex xl:items-center">
                        {readiness ? (
                          <SamroStatusChip
                            ready={readiness.ready}
                            missing={readiness.missing}
                            detailed={prepareProMode}
                          />
                        ) : (
                          <SamroCell submitted={isSamroSubmitted(track.samro)} />
                        )}
                      </div>
                    ) : null}
                    {subscriberView ? null : (
                      <div className="hidden xl:block">
                        <LicenseBadge license={track.license} />
                      </div>
                    )}
                  </>
                )}

                <div className="flex items-center justify-end gap-1.5">
                  {subscriberView ? (
                    <LicenseIconButton
                      userStatus={userLicenseByTrack[track.id]?.status}
                      onClick={() => setLicensePanelTrackId(track.id)}
                      title="License"
                    />
                  ) : null}
                  {canPlay ? (
                    <a
                      href={`/api/audio?id=${encodeURIComponent(track.id)}&download=1`}
                      className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--line)] text-[11px] font-medium text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)]"
                      aria-label={`Download ${title}`}
                      title="Download"
                    >
                      ↓
                    </a>
                  ) : null}
                  {showAddToPlaylist ? <AddToPlaylistButton trackId={track.id} /> : null}
                  {showRemoveFromPlaylist ? (
                    <button
                      type="button"
                      onClick={() => showRemoveFromPlaylist(track.id)}
                      className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--line)] text-xs text-[var(--exclusive)] transition hover:border-[var(--exclusive)]"
                      aria-label={`Remove ${title} from playlist`}
                      title="Remove"
                    >
                      ×
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => toggleExpanded(track.id)}
                    className="grid h-9 w-9 place-items-center rounded-lg text-[var(--ink-dim)] transition hover:text-[var(--accent)]"
                    aria-label={expanded ? `Hide details for ${title}` : `Show details for ${title}`}
                    aria-expanded={expanded}
                    title={expanded ? "Hide info" : "Track info"}
                  >
                    {expanded ? "▴" : "▾"}
                  </button>
                </div>
              </div>

              {expanded ? (
                <InlineTrackPanel
                  track={track}
                  lineage={lineage}
                  canEdit={canEdit}
                  vocabulary={vocabulary}
                  metaSuggestions={metaSuggestions}
                  composers={composers}
                  housePublisherName={housePublisherName}
                  licenseEntryCount={licenseCounts[track.id] || 0}
                  onOpenLicensing={
                    subscriberView
                      ? () => setLicensePanelTrackId(track.id)
                      : undefined
                  }
                  onLicenseCountChange={(count) => {
                    setLicenseCounts((prev) => ({ ...prev, [track.id]: count }));
                  }}
                  subscriberView={subscriberView}
                  userLicenseStatus={userLicenseByTrack[track.id] || null}
                  onSaved={onTrackSaved}
                  onTrashed={(trackId) => {
                    onTrackTrashed?.(trackId);
                    setExpandedId((prev) => (prev === trackId ? null : prev));
                  }}
                />
              ) : null}
            </li>
          );
        })}
      </ul>

      {licensePanelTrackId && subscriberView ? (
        <SubscriberLicensePanel
          trackId={licensePanelTrackId}
          trackTitle={formatDisplayTitle(
            tracks.find((t) => t.id === licensePanelTrackId) || {
              id: licensePanelTrackId,
              libraryTitle: null,
              workingTitle: null,
            },
          )}
          open={Boolean(licensePanelTrackId)}
          onClose={() => setLicensePanelTrackId(null)}
          initialStatus={userLicenseByTrack[licensePanelTrackId] || null}
          onStatusChange={(next) => {
            if (!next) return;
            setUserLicenseByTrack((prev) => ({ ...prev, [next.trackId]: next }));
          }}
        />
      ) : null}
    </div>
  );
}
