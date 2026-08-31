import "server-only";

import type { Track } from "@/db/schema";
import { MAX_ZIP_TRACKS, safeAudioFilename } from "@/lib/audio-download-shared";
import { formatAudioDownloadLabel } from "@/lib/tracks";

export { MAX_ZIP_TRACKS, safeAudioFilename } from "@/lib/audio-download-shared";

function trackFileExt(dropboxDl: string) {
  return dropboxDl.toLowerCase().includes(".wav") ? "wav" : "mp3";
}

function uniqueZipEntryName(track: Track, used: Set<string>) {
  const base = safeAudioFilename(formatAudioDownloadLabel(track));
  const ext = trackFileExt(track.dropboxDl || "");
  let name = `${base}.${ext}`;
  if (used.has(name)) {
    name = `${base}-${track.id}.${ext}`;
  }
  used.add(name);
  return name;
}

/** Build a zip Buffer of track audio fetched from stored Dropbox DL URLs. */
export async function zipTracksAudio(tracks: Track[]): Promise<{
  buffer: Buffer;
  skipped: number;
  included: number;
}> {
  const withAudio = tracks.filter((t) => t.dropboxDl).slice(0, MAX_ZIP_TRACKS);
  const { ZipArchive } = await import("archiver");
  const archive = new ZipArchive({ zlib: { level: 0 } });

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    archive.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", (err: Error) => reject(err));
  });

  const usedNames = new Set<string>();
  let included = 0;
  let skipped = tracks.length - withAudio.length;

  for (const track of withAudio) {
    try {
      const upstream = await fetch(track.dropboxDl!, { redirect: "follow" });
      if (!upstream.ok) {
        skipped += 1;
        continue;
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      archive.append(buf, { name: uniqueZipEntryName(track, usedNames) });
      included += 1;
    } catch {
      skipped += 1;
    }
  }

  if (!included) {
    archive.abort();
    throw new Error("No tracks with audio could be fetched");
  }

  await archive.finalize();
  const buffer = await done;
  return { buffer, skipped, included };
}
