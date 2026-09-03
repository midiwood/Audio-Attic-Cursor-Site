/**
 * Build a zip of catalog audio for playlist / bulk download.
 * Zip in memory, upload to Spaces, return a presigned URL.
 */

import "server-only";

import { randomBytes } from "crypto";
import { ZipArchive } from "archiver";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { Session } from "@/lib/auth";
import { isSubscriber } from "@/lib/auth";
import {
  MAX_ZIP_TRACKS,
  safeAudioFilename,
  uniqueZipEntryName,
} from "@/lib/audio-download-shared";
import { GUEST_PLAYLIST_COOKIE } from "@/lib/guest-playlist";
import { guestMayAccessTrack } from "@/lib/guest-playlist-access";
import { isSubscriberVisible } from "@/lib/publisher";
import {
  getPlaylistByGuestToken,
  getPlaylistById,
  getPlaylistTracks,
  userCanAccessPlaylist,
} from "@/lib/playlists";
import { getTrackById } from "@/lib/queries";
import { isSpacesObjectKey, vaultTempZipKey } from "@/lib/storage/paths";
import { getObjectBuffer, presignGetUrl, uploadObject } from "@/lib/storage/spaces";
import { formatAudioDownloadLabel } from "@/lib/tracks";
import type { Track } from "@/db/schema";

export type ZipAudioEntry = {
  objectKey: string;
  filename: string;
};

function entryFilename(label: string, objectKey: string) {
  const ext = objectKey.toLowerCase().endsWith(".wav") ? "wav" : "mp3";
  return `${safeAudioFilename(label)}.${ext}`;
}

async function guestPlaylistId(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(GUEST_PLAYLIST_COOKIE)?.value;
  if (!token) return null;
  return getPlaylistByGuestToken(token)?.id ?? null;
}

async function collectTracks(input: {
  session: Session | null;
  playlistId?: string;
  trackIds?: string[];
}): Promise<{ tracks: Track[]; zipBaseName: string }> {
  const playlistId = input.playlistId?.trim() || "";
  const requestedIds = Array.isArray(input.trackIds)
    ? [...new Set(input.trackIds.map(String).filter(Boolean))]
    : [];

  if (playlistId) {
    const playlist = getPlaylistById(playlistId);
    if (!playlist) {
      throw Object.assign(new Error("Playlist not found"), { status: 404 });
    }
    if (input.session) {
      if (!userCanAccessPlaylist(playlist, input.session.user.id)) {
        throw Object.assign(new Error("Forbidden"), { status: 403 });
      }
    } else {
      const guestId = await guestPlaylistId();
      if (guestId !== playlistId) {
        throw Object.assign(new Error("Unauthorized"), { status: 401 });
      }
    }
    let tracks = getPlaylistTracks(playlistId);
    if (input.session && isSubscriber(input.session)) {
      tracks = tracks.filter((t) => isSubscriberVisible(t));
    }
    return { tracks, zipBaseName: playlist.name || "playlist" };
  }

  if (!requestedIds.length) {
    throw Object.assign(new Error("playlistId or trackIds required"), { status: 400 });
  }
  if (requestedIds.length > MAX_ZIP_TRACKS) {
    throw Object.assign(new Error(`At most ${MAX_ZIP_TRACKS} tracks per download`), {
      status: 400,
    });
  }

  const tracks: Track[] = [];
  for (const id of requestedIds) {
    if (!input.session) {
      if (!(await guestMayAccessTrack(id))) continue;
    }
    const track = getTrackById(id);
    if (!track) continue;
    if (input.session && isSubscriber(input.session) && !isSubscriberVisible(track)) continue;
    tracks.push(track);
  }
  return { tracks, zipBaseName: "Audio Attic tracks" };
}

export async function resolveZipAudioEntries(input: {
  session: Session | null;
  playlistId?: string;
  trackIds?: string[];
}): Promise<{ entries: ZipAudioEntry[]; zipFilename: string }> {
  const { tracks, zipBaseName } = await collectTracks(input);
  if (tracks.length > MAX_ZIP_TRACKS) {
    throw Object.assign(new Error(`At most ${MAX_ZIP_TRACKS} tracks per download`), {
      status: 400,
    });
  }

  const usedNames = new Set<string>();
  const entries: ZipAudioEntry[] = [];

  for (const track of tracks) {
    const sourceKey = track.dropboxPath?.trim() || "";
    if (!isSpacesObjectKey(sourceKey)) continue;

    const label = formatAudioDownloadLabel(track);
    entries.push({
      objectKey: sourceKey,
      filename: uniqueZipEntryName(entryFilename(label, sourceKey), usedNames),
    });
  }

  if (!entries.length) {
    throw Object.assign(new Error("No downloadable tracks found"), { status: 404 });
  }

  return {
    entries,
    zipFilename: `${safeAudioFilename(zipBaseName)}.zip`,
  };
}

export async function zipAudioEntriesResponse(
  entries: ZipAudioEntry[],
  zipFilename: string,
): Promise<Response> {
  const chunks: Buffer[] = [];
  const archive = new ZipArchive({ store: true, zlib: { level: 0 } });
  archive.on("error", (err: Error) => {
    throw err;
  });
  archive.on("data", (chunk: Buffer | Uint8Array) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });

  try {
    for (const entry of entries) {
      const bytes = await getObjectBuffer(entry.objectKey);
      archive.append(bytes, { name: entry.filename });
    }
    await archive.finalize();
  } catch (err) {
    archive.abort();
    throw err instanceof Error ? err : new Error("Zip failed");
  }

  const body = Buffer.concat(chunks);
  const zipKey = vaultTempZipKey(`${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`);
  await uploadObject(zipKey, body, "application/zip");
  const url = await presignGetUrl(zipKey, { downloadFilename: zipFilename });
  return NextResponse.json({ url, filename: zipFilename });
}
