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

/** Watermark on the server when needed, then download one zip from Spaces. */
export async function downloadTracksZip(body: {
  trackIds?: string[];
  playlistId?: string;
}): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const ids = [...new Set((body.trackIds ?? []).filter(Boolean))];
  if (!body.playlistId && !ids.length) {
    return { ok: false, error: "No tracks selected" };
  }
  if (ids.length > MAX_ZIP_TRACKS) {
    return { ok: false, error: `Download at most ${MAX_ZIP_TRACKS} tracks at a time` };
  }

  let res: Response;
  try {
    res = await fetch("/api/audio/zip", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        playlistId: body.playlistId,
        trackIds: ids.length ? ids : undefined,
      }),
    });
  } catch {
    return { ok: false, error: "Download failed. Try again." };
  }

  const data = (await res.json().catch(() => ({}))) as {
    url?: string;
    filename?: string;
    error?: string;
  };
  if (!res.ok) {
    return { ok: false, error: data.error || `Download failed (${res.status})` };
  }
  if (!data.url) {
    return { ok: false, error: data.error || "Download failed" };
  }

  triggerDownload(data.url, data.filename || "Audio Attic.zip");
  return { ok: true, count: ids.length || 1 };
}
