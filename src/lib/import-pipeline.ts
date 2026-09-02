/**
 * Import pipeline — prepare → AI tag → normalize → confirm.
 * Pure helpers + API calls; React state lives in ImportForm.
 */

import { formatAiError, isAiQuotaError } from "@/lib/ai-errors";
import {
  filenameFromDropboxUrl,
  titleFromDropboxUrl,
  titleFromFilename,
} from "@/lib/tracks";

export type ImportDraftTrack = {
  clientId: string;
  trackId?: string;
  stagingId?: string;
  dropboxLink: string;
  dropboxDl?: string | null;
  dropboxPath?: string;
  sourceDropboxPath?: string;
  sourceFolderLink?: string;
  vaultReady?: boolean;
  localOnly?: boolean;
  localFile?: File;
  workingTitle: string;
  libraryTitle: string;
  description: string;
  genre: string;
  mood: string;
  instruments: string;
  attributes: string;
  duration: string;
  bpm: string;
  musicalKey: string;
  localPreviewUrl?: string;
};

export type AiSessionOpts = {
  titleMode: "keep" | "cleanup" | "creative";
  tagMode: "individual" | "album";
};

export const IMPORT_PIPELINE_STEPS = [
  { id: "prepare", label: "Prepare" },
  { id: "ai", label: "AI tag" },
  { id: "normalize", label: "Normalize" },
  { id: "import", label: "Import" },
] as const;

export type ImportPipelineStepId = (typeof IMPORT_PIPELINE_STEPS)[number]["id"];

export type AiSuggestion = {
  libraryTitle?: string;
  description?: string;
  genre?: string;
  mood?: string;
  instruments?: string;
  attributes?: string;
  bpm?: string;
  musicalKey?: string;
};

export function createImportDraft(link = "", filename = ""): ImportDraftTrack {
  const fileName = filename.trim() || filenameFromDropboxUrl(link);
  const cleaned = titleFromFilename(fileName) || titleFromDropboxUrl(link);
  return {
    clientId:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `draft-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    dropboxLink: link,
    workingTitle: cleaned,
    libraryTitle: cleaned,
    description: "",
    genre: "",
    mood: "",
    instruments: "",
    attributes: "",
    duration: "",
    bpm: "",
    musicalKey: "",
  };
}

export async function buildDraftsFromFiles(
  files: File[],
  readDuration: (url: string) => Promise<number | null>,
  formatDuration: (seconds: number) => string,
  onProgress?: (current: number, total: number) => void,
): Promise<ImportDraftTrack[]> {
  const created: ImportDraftTrack[] = [];
  for (const file of files) {
    const localPreviewUrl = URL.createObjectURL(file);
    onProgress?.(created.length + 1, files.length);
    const durationSec = await readDuration(localPreviewUrl);
    const duration = durationSec != null ? formatDuration(durationSec) : "";
    created.push({
      ...createImportDraft("", file.name),
      localOnly: true,
      localPreviewUrl,
      localFile: file,
      duration,
    });
  }
  return created;
}

export type VaultPrepareResult = {
  stagingId?: string;
  dropboxLink: string | null;
  dropboxDl: string | null;
  dropboxPath: string;
  sourceDropboxPath?: string | null;
  sourceFolderLink?: string | null;
};

/** Keep AI-populated fields when vault staging updates paths. */
export function mergeVaultOntoDraft(
  existing: ImportDraftTrack,
  vault: Partial<ImportDraftTrack>,
): ImportDraftTrack {
  return {
    ...existing,
    stagingId: vault.stagingId ?? existing.stagingId,
    trackId: vault.trackId !== undefined ? vault.trackId : existing.trackId,
    dropboxLink: vault.dropboxLink ?? existing.dropboxLink,
    dropboxDl: vault.dropboxDl ?? existing.dropboxDl,
    dropboxPath: vault.dropboxPath ?? existing.dropboxPath,
    sourceDropboxPath: vault.sourceDropboxPath ?? existing.sourceDropboxPath,
    sourceFolderLink: vault.sourceFolderLink ?? existing.sourceFolderLink,
    vaultReady: vault.vaultReady ?? existing.vaultReady,
    localOnly: vault.localOnly ?? existing.localOnly,
  };
}

export function resolveAiTitleMode(
  session: AiSessionOpts,
  override: "keep" | "cleanup" | "creative" | undefined,
  exclusive: boolean,
  fallback: "keep" | "cleanup" | "creative",
): "keep" | "cleanup" | "creative" {
  let mode = override ?? session.titleMode ?? fallback;
  if (mode === "creative" && exclusive) mode = "keep";
  return mode;
}

export function filterImportAudioFiles(files: FileList | File[]): {
  accepted: File[];
  rejected: File[];
} {
  const list = [...files];
  const isAudio = (file: File) =>
    /\.(mp3|wav|aiff|aif)$/i.test(file.name) ||
    file.type === "audio/mpeg" ||
    file.type === "audio/mp3" ||
    file.type === "audio/wav" ||
    file.type === "audio/x-wav" ||
    file.type === "audio/aiff" ||
    file.type === "audio/x-aiff";
  const accepted = list.filter(isAudio);
  const rejected = list.filter((file) => !isAudio(file));
  return { accepted, rejected };
}

function joinTags(tags: string[]) {
  return tags.join(", ");
}

function splitTags(value: string) {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function mergeTagLists(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    for (const tag of splitTags(value)) {
      const key = tag.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(tag);
    }
  }
  return out;
}

export function applyAiSuggestionsToTracks(
  tracks: ImportDraftTrack[],
  chunk: ImportDraftTrack[],
  suggestions: AiSuggestion[],
  applyRename: boolean,
): ImportDraftTrack[] {
  return tracks.map((latest) => {
    const sentIndex = chunk.findIndex((t) => t.clientId === latest.clientId);
    if (sentIndex < 0) return latest;
    const suggestion = suggestions[sentIndex];
    if (!suggestion) return latest;
    const workingTitle = titleFromFilename(latest.workingTitle) || latest.workingTitle;
    const libraryTitle = applyRename
      ? titleFromFilename(suggestion.libraryTitle || "") ||
        titleFromFilename(latest.libraryTitle || "") ||
        workingTitle
      : titleFromFilename(latest.libraryTitle || "") || workingTitle;
    return {
      ...latest,
      workingTitle,
      libraryTitle,
      description: suggestion.description || latest.description,
      genre: suggestion.genre || latest.genre,
      mood: suggestion.mood || latest.mood,
      instruments: suggestion.instruments || latest.instruments,
      attributes: suggestion.attributes || latest.attributes,
      bpm: suggestion.bpm || latest.bpm,
      musicalKey: suggestion.musicalKey || latest.musicalKey,
    };
  });
}

export function applyAlbumSharedTags(
  tracks: ImportDraftTrack[],
  targetClientIds: Set<string>,
): ImportDraftTrack[] {
  const targetTracks = tracks.filter((track) => targetClientIds.has(track.clientId));
  const merged = {
    genre: joinTags(mergeTagLists(targetTracks.map((track) => track.genre))),
    mood: joinTags(mergeTagLists(targetTracks.map((track) => track.mood))),
    instruments: joinTags(mergeTagLists(targetTracks.map((track) => track.instruments))),
    attributes: joinTags(mergeTagLists(targetTracks.map((track) => track.attributes))),
  };
  return tracks.map((track) =>
    targetClientIds.has(track.clientId)
      ? {
          ...track,
          genre: merged.genre,
          mood: merged.mood,
          instruments: merged.instruments,
          attributes: merged.attributes,
        }
      : track,
  );
}

export async function attachAudioBlobForAi(
  track: ImportDraftTrack,
): Promise<{ blob: Blob; filename: string } | null> {
  let blob: Blob | null = null;
  let filename = `${(track.trackId || track.workingTitle || track.libraryTitle || "track").replace(/[^\w.\- ]+/g, "_")}.mp3`;

  if (track.localFile) {
    blob = track.localFile;
    filename = track.localFile.name || filename;
  }

  if (!blob && track.localPreviewUrl) {
    const fetched = await fetch(track.localPreviewUrl).then((res) => res.blob());
    blob = fetched;
    if (fetched.type.includes("wav")) {
      filename = filename.replace(/\.mp3$/i, ".wav");
    } else if (fetched.type.includes("aiff") || fetched.type.includes("aif")) {
      filename = filename.replace(/\.mp3$/i, ".aiff");
    }
  }

  if (!blob && track.vaultReady && track.trackId) {
    const preview = await fetch(`/api/audio?id=${encodeURIComponent(track.trackId)}`);
    if (preview.ok) {
      blob = await preview.blob();
      filename = `${track.trackId}.mp3`;
    }
  }

  return blob ? { blob, filename } : null;
}

export async function prepareVaultForTrack(
  track: ImportDraftTrack,
): Promise<VaultPrepareResult> {
  if (track.vaultReady && track.dropboxPath) {
    return {
      stagingId: track.stagingId,
      dropboxLink: track.dropboxLink ?? null,
      dropboxDl: track.dropboxDl ?? null,
      dropboxPath: track.dropboxPath,
      sourceDropboxPath: track.sourceDropboxPath ?? null,
      sourceFolderLink: track.sourceFolderLink ?? null,
    };
  }

  const form = new FormData();
  if (track.localFile) {
    form.append("audio", track.localFile, track.localFile.name);
  }
  if (track.stagingId) {
    form.append("stagingId", track.stagingId);
  }

  const res = await fetch("/api/tracks/prepare-vault", { method: "POST", body: form });
  const data = (await res.json().catch(() => ({}))) as VaultPrepareResult & { error?: string };

  if (!res.ok || !data.dropboxPath) {
    throw new Error(data.error || `Vault prepare failed for ${track.workingTitle || "track"}`);
  }

  return data;
}

export type TagTracksResult = {
  tracks: ImportDraftTrack[];
  taggedCount: number;
  audioCountTotal: number;
  stoppedEarly: boolean;
  error?: string;
};

export async function tagTracksWithAi(opts: {
  tracks: ImportDraftTrack[];
  session: AiSessionOpts;
  titleMode: "keep" | "cleanup" | "creative";
  shared: { client: string; license: string };
  onChunkProgress?: (current: number, total: number, message: string) => void;
}): Promise<TagTracksResult> {
  const { tracks, session, titleMode, shared, onChunkProgress } = opts;
  const applyRename = titleMode === "cleanup" || titleMode === "creative";
  const albumTagging = tracks.length > 1 && session.tagMode === "album";
  const chunkSize = 10;
  const total = tracks.length;

  let working = [...tracks];
  let taggedCount = 0;
  let audioCountTotal = 0;
  let stoppedEarly = false;
  let error: string | undefined;

  for (let offset = 0; offset < total; offset += chunkSize) {
    const chunk = working.slice(offset, offset + chunkSize);
    const from = offset + 1;

    onChunkProgress?.(
      from,
      total,
      total === 1
        ? `AI analyzing ${chunk[0]?.libraryTitle || chunk[0]?.workingTitle || "track"}…`
        : total <= chunkSize
          ? `AI analyzing ${total} tracks…`
          : `AI analyzing ${from}–${offset + chunk.length} of ${total}…`,
    );

    const form = new FormData();
    form.append(
      "payload",
      JSON.stringify({
        client: shared.client,
        license: shared.license,
        libraryTitleMode: titleMode,
        tracks: chunk.map((track) => ({
          dropboxLink: track.dropboxLink,
          title: track.workingTitle || track.libraryTitle,
        })),
      }),
    );

    for (let i = 0; i < chunk.length; i++) {
      const attached = await attachAudioBlobForAi(chunk[i]);
      if (attached) {
        form.append(`audio_${i}`, attached.blob, attached.filename);
      }
    }

    const res = await fetch("/api/tracks/suggest-tags", { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      error = formatAiError(data.error || data.errors?.[0]?.error);
      stoppedEarly = taggedCount > 0;
      break;
    }

    if (Array.isArray(data.errors) && data.errors.length) {
      const first = String(data.errors[0]?.error || "");
      if (isAiQuotaError(first)) {
        error = formatAiError(first);
        stoppedEarly = taggedCount > 0;
        break;
      }
    }

    const suggestions = (Array.isArray(data.suggestions) ? data.suggestions : []) as AiSuggestion[];
    if (!suggestions.length) {
      error = "AI returned no suggestion — you can tag manually";
      stoppedEarly = taggedCount > 0;
      break;
    }

    working = applyAiSuggestionsToTracks(working, chunk, suggestions, applyRename);
    if (albumTagging) {
      working = applyAlbumSharedTags(working, new Set(tracks.map((t) => t.clientId)));
    }
    taggedCount += chunk.length;
    audioCountTotal += Number(data.audioCount) || 0;
  }

  return { tracks: working, taggedCount, audioCountTotal, stoppedEarly, error };
}

export async function normalizeTracksToVault(opts: {
  tracks: ImportDraftTrack[];
  onTrackProgress?: (current: number, total: number, message: string) => void;
}): Promise<ImportDraftTrack[]> {
  const { tracks, onTrackProgress } = opts;
  const out: ImportDraftTrack[] = [];

  for (let index = 0; index < tracks.length; index++) {
    const track = tracks[index];
    if (index > 0) {
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
    onTrackProgress?.(
      index + 1,
      tracks.length,
      tracks.length === 1
        ? "Converting & normalizing to −16 LUFS…"
        : `Normalizing ${index + 1}/${tracks.length} to −16 LUFS…`,
    );

    const vault = await prepareVaultForTrack(track);
    out.push(
      mergeVaultOntoDraft(track, {
        stagingId: vault.stagingId,
        trackId: undefined,
        dropboxLink: vault.dropboxLink ?? "",
        dropboxDl: vault.dropboxDl,
        dropboxPath: vault.dropboxPath,
        sourceDropboxPath: vault.sourceDropboxPath || undefined,
        sourceFolderLink: vault.sourceFolderLink || undefined,
        vaultReady: true,
        localOnly: false,
      }),
    );
  }

  return out;
}

export function aiTagsReadyMessage(opts: {
  taggedCount: number;
  total: number;
  audioCountTotal: number;
  stoppedEarly: boolean;
  titleMode: "keep" | "cleanup" | "creative";
  exclusive: boolean;
  albumTagging: boolean;
  singleTrackLabel?: boolean;
}): string {
  const {
    taggedCount,
    total,
    audioCountTotal,
    stoppedEarly,
    titleMode,
    exclusive,
    albumTagging,
    singleTrackLabel,
  } = opts;

  const renamedNote =
    titleMode === "keep"
      ? " · titles kept"
      : titleMode === "cleanup"
        ? " · titles cleaned"
        : exclusive
          ? " · exclusive — source titles kept"
          : " · library titles suggested";

  return (
    `AI tags ready` +
    (audioCountTotal ? " · audio analyzed" : "") +
    (total > 1
      ? ` · ${taggedCount}${stoppedEarly ? ` of ${total}` : ""} tracks`
      : singleTrackLabel
        ? " · 1 track"
        : "") +
    (stoppedEarly ? " · stopped early" : "") +
    (albumTagging ? " · album shared tags" : "") +
    renamedNote
  );
}
