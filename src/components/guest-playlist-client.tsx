"use client";

import { useMemo } from "react";
import { usePlayer, type PlayerTrack } from "@/components/player-provider";
import { TrackList, type TrackListItem } from "@/components/track-list";
import { hasPlayableAudio } from "@/lib/tracks";

export function GuestPlaylistClient({
  playlistName,
  tracks,
}: {
  playlistName: string;
  tracks: TrackListItem[];
}) {
  const { playTrack } = usePlayer();
  const queue: PlayerTrack[] = useMemo(
    () =>
      tracks
        .filter((t) => hasPlayableAudio(t))
        .map((t) => ({
          id: t.id,
          title: t.libraryTitle || t.workingTitle || t.id,
          subtitle: [t.duration, t.musicalKey].filter(Boolean).join(" · ") || null,
          duration: t.duration,
          dropboxDl: t.dropboxDl,
          dropboxPath: t.dropboxPath,
          license: t.license,
        })),
    [tracks],
  );

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
        </span>
      </div>
      <TrackList tracks={tracks} canEdit={false} subscriberView showAddToPlaylist={false} />
    </div>
  );
}
