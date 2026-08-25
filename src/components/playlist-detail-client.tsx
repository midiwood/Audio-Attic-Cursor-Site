"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlayer, type PlayerTrack } from "@/components/player-provider";
import { TrackList, type TrackListItem } from "@/components/track-list";
import type { TrackRelationView } from "@/lib/track-relations";
import type { CatalogMetaSuggestions } from "@/lib/queries";
import type { UserTrackLicenseStatus } from "@/lib/license-requests";
import type { CatalogVocabulary } from "@/lib/vocabulary";

export function PlaylistDetailClient({
  playlistId,
  playlistName,
  tracks: initialTracks,
  canEdit = false,
  canModifyPlaylist = true,
  vocabulary,
  metaSuggestions,
  housePublisherName = "",
  licenseEntryCounts,
  userLicenseByTrack,
  subscriberView = false,
}: {
  playlistId: string;
  playlistName: string;
  tracks: TrackListItem[];
  canEdit?: boolean;
  /** Owner only — add/remove tracks on this playlist. */
  canModifyPlaylist?: boolean;
  vocabulary?: CatalogVocabulary;
  metaSuggestions?: CatalogMetaSuggestions;
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

  useEffect(() => {
    setTracks(initialTracks);
  }, [initialTracks]);

  const queue: PlayerTrack[] = tracks
    .filter((t) => t.dropboxDl)
    .map((t) => ({
      id: t.id,
      title: t.libraryTitle || t.workingTitle || t.id,
      subtitle: subscriberView
        ? [t.duration, t.musicalKey].filter(Boolean).join(" · ") || null
        : [t.client, t.year].filter(Boolean).join(" · ") || null,
      duration: t.duration,
      dropboxDl: t.dropboxDl,
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
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
        <span className="text-sm text-[var(--ink-dim)]">
          {tracks.length} track{tracks.length === 1 ? "" : "s"} in {playlistName}
          {!canModifyPlaylist ? " · view only" : ""}
        </span>
      </div>
      <TrackList
        tracks={tracks}
        relationsByTrack={relationsByTrack}
        licenseEntryCounts={licenseEntryCounts}
        userLicenseByTrack={userLicenseByTrack}
        showRemoveFromPlaylist={canModifyPlaylist ? removeTrack : undefined}
        canEdit={canEdit}
        vocabulary={vocabulary}
        metaSuggestions={metaSuggestions}
        housePublisherName={housePublisherName}
        subscriberView={subscriberView}
        onTrackSaved={(track, relations) => {
          setTracks((prev) => prev.map((row) => (row.id === track.id ? track : row)));
          setRelationsByTrack((prev) => ({ ...prev, [track.id]: relations }));
        }}
        onTrackTrashed={(trackId) => {
          setTracks((prev) => prev.filter((row) => row.id !== trackId));
          setRelationsByTrack((prev) => {
            const next = { ...prev };
            delete next[trackId];
            return next;
          });
        }}
      />
    </div>
  );
}
