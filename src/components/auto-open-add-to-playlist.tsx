"use client";

import { AddToPlaylistButton } from "@/components/add-to-playlist-button";

export function AutoOpenAddToPlaylist({ trackId }: { trackId: string }) {
  return <AddToPlaylistButton trackId={trackId} autoOpen />;
}
