"use client";

import { useEffect, useRef } from "react";
import { AddToPlaylistButton } from "@/components/add-to-playlist-button";

export function AutoOpenAddToPlaylist({ trackId }: { trackId: string }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    wrapRef.current?.querySelector("button")?.click();
  }, []);

  return (
    <div ref={wrapRef} className="sr-only" aria-hidden>
      <AddToPlaylistButton trackId={trackId} />
    </div>
  );
}
