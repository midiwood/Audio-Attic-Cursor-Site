"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlayer, type PlayerTrack } from "@/components/player-provider";
import { TrackList, type TrackListItem } from "@/components/track-list";
import { BrowseSelectionBar } from "@/components/browse-selection-bar";
import { BatchTrackEditPanel } from "@/components/batch-track-edit-panel";
import type { ComposerOption } from "@/components/composer-picker";
import type { TrackRelationView } from "@/lib/track-relations";
import type { CatalogMetaSuggestions } from "@/lib/queries";
import type { UserTrackLicenseStatus } from "@/lib/license-requests";
import type { CatalogVocabulary } from "@/lib/vocabulary";
import { formatDisplayTitle, hasPlayableAudio } from "@/lib/tracks";
import { downloadTracksZip } from "@/lib/download-tracks-zip";

export function PlaylistDetailClient({
  playlistId,
  playlistName,
  tracks: initialTracks,
  canEdit = false,
  canBatchEdit = false,
  canModifyPlaylist = true,
  vocabulary,
  metaSuggestions,
  composers = [],
  housePublisherName = "",
  licenseEntryCounts,
  userLicenseByTrack,
  subscriberView = false,
}: {
  playlistId: string;
  playlistName: string;
  tracks: TrackListItem[];
  canEdit?: boolean;
  /** Catalog staff — select tracks and batch-edit metadata. */
  canBatchEdit?: boolean;
  /** Owner only — add/remove tracks on this playlist. */
  canModifyPlaylist?: boolean;
  vocabulary?: CatalogVocabulary;
  metaSuggestions?: CatalogMetaSuggestions;
  composers?: ComposerOption[];
  housePublisherName?: string;
  licenseEntryCounts?: Record<string, number>;
  userLicenseByTrack?: Record<string, UserTrackLicenseStatus>;
  subscriberView?: boolean;
}) {
  const router = useRouter();
  const { playTrack } = usePlayer();
  const [tracks, setTracks] = useState(initialTracks);
  const [relationsByTrack, setRelationsByTrack] = useState<
    Record<string, TrackRelationView[]>
  >({});
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [batchEditOpen, setBatchEditOpen] = useState(false);
  const [batchNotice, setBatchNotice] = useState("");

  useEffect(() => {
    setTracks(initialTracks);
    setSelectedIds(new Set());
    setSelectionMode(false);
    setBatchEditOpen(false);
    setBatchNotice("");
  }, [initialTracks]);

  const queue: PlayerTrack[] = tracks
    .filter((t) => hasPlayableAudio(t))
    .map((t) => ({
      id: t.id,
      title: t.libraryTitle || t.workingTitle || t.id,
      subtitle: subscriberView
        ? [t.duration, t.musicalKey].filter(Boolean).join(" · ") || null
        : [t.client, t.year].filter(Boolean).join(" · ") || null,
      duration: t.duration,
      dropboxDl: t.dropboxDl,
      dropboxPath: t.dropboxPath,
      license: t.license,
    }));

  async function removeTrack(trackId: string) {
    if (!canModifyPlaylist) return;
    await fetch("/api/playlists", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "remove", playlistId, trackId }),
    });
    router.refresh();
  }

  async function downloadPlaylist() {
    if (!queue.length || downloadBusy) return;
    setDownloadBusy(true);
    setDownloadError("");
    try {
      const result = await downloadTracksZip({
        playlistId,
      });
      if (!result.ok) setDownloadError(result.error);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloadBusy(false);
    }
  }

  const selectedTracks = useMemo(
    () => tracks.filter((t) => selectedIds.has(t.id)),
    [tracks, selectedIds],
  );
  const allSelected = tracks.length > 0 && selectedIds.size === tracks.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  function clearSelection() {
    setSelectedIds(new Set());
    setBatchEditOpen(false);
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(tracks.map((t) => t.id)));
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3 px-5 md:px-8">
        <button
          type="button"
          disabled={!queue.length}
          onClick={() => {
            if (!queue[0]) return;
            playTrack(queue[0], queue);
          }}
          className="rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Play playlist
        </button>
        <button
          type="button"
          disabled={!queue.length || downloadBusy}
          onClick={() => void downloadPlaylist()}
          className="rounded-lg border border-[var(--line)] px-5 py-2.5 text-sm font-medium text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {downloadBusy ? "Preparing zip…" : "Download playlist"}
        </button>
        {canBatchEdit ? (
          <button
            type="button"
            onClick={() => {
              setSelectionMode((prev) => {
                if (prev) clearSelection();
                return !prev;
              });
            }}
            className={`rounded-lg border px-5 py-2.5 text-sm font-medium transition ${
              selectionMode
                ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink)]"
                : "border-[var(--line)] text-[var(--ink-muted)] hover:border-[var(--accent)] hover:text-[var(--ink)]"
            }`}
          >
            {selectionMode ? "Done selecting" : "Select tracks"}
          </button>
        ) : null}
        <span className="text-sm text-[var(--ink-dim)]">
          {tracks.length} track{tracks.length === 1 ? "" : "s"} in {playlistName}
          {!canModifyPlaylist ? " · view only" : ""}
        </span>
      </div>
      {batchNotice ? (
        <p className="mb-6 mx-5 rounded-lg border border-[var(--available)]/30 bg-[var(--available)]/10 px-3 py-2 text-sm text-[var(--available)] md:mx-8">
          {batchNotice}
        </p>
      ) : null}
      {downloadError ? (
        <p className="mb-6 mx-5 text-sm text-[var(--exclusive)] md:mx-8">
          {downloadError}
        </p>
      ) : null}
      <TrackList
        tracks={tracks}
        relationsByTrack={relationsByTrack}
        licenseEntryCounts={licenseEntryCounts}
        userLicenseByTrack={userLicenseByTrack}
        showRemoveFromPlaylist={canModifyPlaylist ? removeTrack : undefined}
        canEdit={canEdit}
        vocabulary={vocabulary}
        metaSuggestions={metaSuggestions}
        composers={composers}
        housePublisherName={housePublisherName}
        subscriberView={subscriberView}
        selectionMode={canBatchEdit && selectionMode}
        selectedIds={canBatchEdit && selectionMode ? selectedIds : undefined}
        onToggleSelect={
          canBatchEdit && selectionMode
            ? (id) => {
                setSelectedIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                });
              }
            : undefined
        }
        prepareSelectAllChecked={allSelected}
        prepareSelectAllIndeterminate={someSelected}
        onPrepareSelectAllToggle={
          canBatchEdit && selectionMode ? toggleSelectAll : undefined
        }
        onTrackSaved={(track, relations) => {
          setTracks((prev) => prev.map((row) => (row.id === track.id ? track : row)));
          setRelationsByTrack((prev) => ({ ...prev, [track.id]: relations }));
        }}
        onTrackTrashed={(trackId) => {
          setTracks((prev) => prev.filter((row) => row.id !== trackId));
          setSelectedIds((prev) => {
            const next = new Set(prev);
            next.delete(trackId);
            return next;
          });
          setRelationsByTrack((prev) => {
            const next = { ...prev };
            delete next[trackId];
            return next;
          });
        }}
      />
      {canBatchEdit && selectionMode && selectedIds.size > 0 ? (
        <BrowseSelectionBar
          selectedCount={selectedIds.size}
          onClear={clearSelection}
          onBatchEdit={() => setBatchEditOpen(true)}
        />
      ) : null}
      {canBatchEdit && batchEditOpen && selectedIds.size > 0 ? (
        <BatchTrackEditPanel
          trackIds={[...selectedIds]}
          tracks={selectedTracks}
          composers={composers}
          housePublisherName={housePublisherName}
          metaSuggestions={metaSuggestions}
          onClose={() => setBatchEditOpen(false)}
          onApplied={(summary) => {
            setBatchNotice(
              summary.failed
                ? `Updated ${summary.updated} track${summary.updated === 1 ? "" : "s"}, ${summary.failed} failed`
                : `Updated ${summary.updated} track${summary.updated === 1 ? "" : "s"}`,
            );
            clearSelection();
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
