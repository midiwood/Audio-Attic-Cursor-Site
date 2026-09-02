"use client";

import { MAX_ZIP_TRACKS } from "@/lib/audio-download-shared";

function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fetch presigned URLs and download each track directly from Spaces. */
export async function downloadTracksZip(body: {
  trackIds?: string[];
  playlistId?: string;
}): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  let trackIds = body.trackIds ?? [];

  if (body.playlistId && !trackIds.length) {
    const res = await fetch(`/api/playlists/${encodeURIComponent(body.playlistId)}/tracks`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error || "Could not load playlist tracks" };
    }
    trackIds = Array.isArray(data.trackIds) ? data.trackIds : [];
  }

  const ids = [...new Set(trackIds.filter(Boolean))];
  if (!ids.length) {
    return { ok: false, error: "No tracks selected" };
  }
  if (ids.length > MAX_ZIP_TRACKS) {
    return { ok: false, error: `Download at most ${MAX_ZIP_TRACKS} tracks at a time` };
  }

  const res = await fetch("/api/audio/presign-batch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ trackIds: ids }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: data.error || `Download failed (${res.status})` };
  }

  const downloads = Array.isArray(data.downloads)
    ? (data.downloads as Array<{ url: string; filename: string }>)
    : [];

  if (!downloads.length) {
    return { ok: false, error: "No downloadable tracks found" };
  }

  for (let i = 0; i < downloads.length; i++) {
    const item = downloads[i];
    triggerDownload(item.url, item.filename);
    if (i < downloads.length - 1) {
      await sleep(400);
    }
  }

  return { ok: true, count: downloads.length };
}
