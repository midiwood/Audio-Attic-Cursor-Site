"use client";

/** Trigger a zip download from POST /api/audio/zip. */
export async function downloadTracksZip(body: {
  trackIds?: string[];
  playlistId?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch("/api/audio/zip", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    let message = `Download failed (${res.status})`;
    try {
      const data = JSON.parse(text) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // HTML / empty body from proxy or Next error page
    }
    return { ok: false, error: message };
  }

  const blob = await res.blob();
  if (!blob.size) {
    return { ok: false, error: "Download returned an empty file" };
  }

  const disposition = res.headers.get("content-disposition") || "";
  const match = /filename="([^"]+)"/i.exec(disposition);
  const filename = match?.[1] || "audio-attic-tracks.zip";

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { ok: true };
}
