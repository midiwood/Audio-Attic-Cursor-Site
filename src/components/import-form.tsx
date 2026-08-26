"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ComposerPicker,
  composerAssignmentsTotal,
  defaultComposerAssignment,
  type ComposerOption,
} from "@/components/composer-picker";
import {
  emptyLicenseEntryForm,
  licenseEntryToApiPayload,
  type LicenseEntryFormValue,
} from "@/components/license-entry-form-fields";
import { MetaSuggestInput } from "@/components/meta-suggest-input";
import { usePlayer, type PlayerTrack } from "@/components/player-provider";
import { SharedTagPicker } from "@/components/shared-tag-picker";
import { TrackLicenseSection } from "@/components/track-license-section";
import { TrackLineageLinker } from "@/components/track-lineage-linker";
import { TrackList } from "@/components/track-list";
import { formatAiError, isAiQuotaError } from "@/lib/ai-errors";
import type { DuplicateMatch } from "@/lib/duplicates";
import {
  formatAudioDuration,
  readDurationFromAudioUrl,
} from "@/lib/audio-duration";
import {
  extractDropboxLinks,
  filenameFromDropboxUrl,
  isAllowedImportAudioUrl,
  normalizeLicenseStatus,
  titleFromFilename,
  titleFromDropboxUrl,
} from "@/lib/tracks";
import { canIssueSyncLicenses } from "@/lib/publisher-shared";
import type { CatalogMetaSuggestions } from "@/lib/queries";
import type { ComposerAssignmentInput } from "@/lib/composer-types";
import type { DerivedFromLink } from "@/lib/track-relations";
import type { TrackListItem } from "@/lib/track-list-item";
import type { CatalogVocabulary } from "@/lib/vocabulary";

type DraftTrack = {
  clientId: string;
  dropboxLink: string;
  /** Dropbox path from resolve-link (original file). */
  sourceDropboxPath?: string;
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

function previewUrlFor(track: DraftTrack) {
  if (track.localPreviewUrl) return track.localPreviewUrl;
  if (track.dropboxLink) return `/api/audio/preview?url=${encodeURIComponent(track.dropboxLink)}`;
  return "";
}

function draftToPlayerTrack(track: DraftTrack): PlayerTrack | null {
  const audioSrc = previewUrlFor(track);
  if (!audioSrc) return null;
  const title = track.libraryTitle.trim() || track.workingTitle.trim() || "Untitled import";
  return {
    id: `import:${track.clientId}`,
    title,
    subtitle: [track.duration, track.musicalKey].filter(Boolean).join(" · ") || "Import preview",
    duration: track.duration || null,
    dropboxDl: audioSrc,
    audioSrc,
    preview: true,
  };
}

function reasonLabel(reason: DuplicateMatch["reason"]) {
  if (reason === "same_file") return "Already in database";
  if (reason === "same_title") return "Same title";
  return "Similar title";
}

function matchTitle(match: DuplicateMatch) {
  return match.libraryTitle || match.workingTitle || match.id;
}

function matchLabel(match: DuplicateMatch) {
  return `${reasonLabel(match.reason)}: ${matchTitle(match)} (${match.id})`;
}

function hardMatches(matches: DuplicateMatch[]) {
  return matches.filter((match) => match.reason === "same_file");
}

function hasHardDuplicate(warnings: DuplicateMatch[][]) {
  return warnings.some((matches) => hardMatches(matches).length > 0);
}

function catalogMatchToPlayerTrack(track: TrackListItem): PlayerTrack | null {
  if (!track.dropboxDl) return null;
  return {
    id: track.id,
    title: track.libraryTitle?.trim() || track.workingTitle?.trim() || track.id,
    subtitle:
      [track.workingTitle, track.client, track.year].filter(Boolean).join(" · ") || null,
    duration: track.duration,
    dropboxDl: track.dropboxDl,
    license: track.license,
  };
}

async function fetchDuplicateMatches(tracks: DraftTrack[]): Promise<{
  warnings: DuplicateMatch[][];
  catalogTracks: TrackListItem[];
}> {
  if (!tracks.length) return { warnings: [], catalogTracks: [] };
  const res = await fetch("/api/tracks/check-duplicates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      tracks: tracks.map((track) => ({
        dropboxLink: track.dropboxLink,
        workingTitle: track.workingTitle,
        libraryTitle: track.libraryTitle,
      })),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { warnings: tracks.map(() => []), catalogTracks: [] };
  const results = Array.isArray(data.results) ? data.results : [];
  const warnings = tracks.map((_, index) => {
    const row = results.find(
      (item: { index?: number; matches?: DuplicateMatch[] }) => item.index === index,
    );
    return Array.isArray(row?.matches) ? row.matches : [];
  });
  const catalogTracks = Array.isArray(data.tracks) ? (data.tracks as TrackListItem[]) : [];
  return { warnings, catalogTracks };
}

function audioUrlForDraft(track: DraftTrack): string {
  return (
    track.localPreviewUrl ||
    (track.dropboxLink
      ? `/api/audio/preview?url=${encodeURIComponent(track.dropboxLink)}`
      : "")
  );
}

async function probeMissingDurations(tracks: DraftTrack[]): Promise<DraftTrack[]> {
  return Promise.all(
    tracks.map(async (track) => {
      if (track.duration) return track;
      const url = audioUrlForDraft(track);
      if (!url) return track;
      const seconds = await readDurationFromAudioUrl(url);
      if (seconds == null) return track;
      const formatted = formatAudioDuration(seconds);
      return formatted ? { ...track, duration: formatted } : track;
    }),
  );
}

const emptyDraft = (link = "", filename = ""): DraftTrack => {
  const fileName = filename.trim() || filenameFromDropboxUrl(link);
  // Titles never keep the audio extension — use cleaned name for both fields.
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
};

const fieldClass =
  "w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]";

function splitTags(value: string) {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function joinTags(tags: string[]) {
  return tags.join(", ");
}

function mergeTagLists(values: string[]) {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const value of values) {
    for (const raw of splitTags(value)) {
      const key = raw.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(raw);
    }
  }
  return merged;
}

function AiRenamePromptModal({
  trackCount,
  initialTagMode,
  onConfirm,
  onCancel,
}: {
  trackCount: number;
  initialTagMode: "individual" | "album";
  onConfirm: (
    titleMode: "keep" | "cleanup" | "creative",
    tagMode: "individual" | "album",
  ) => void;
  onCancel: () => void;
}) {
  const [titleMode, setTitleMode] = useState<"keep" | "cleanup" | "creative">("cleanup");
  const [tagMode, setTagMode] = useState<"individual" | "album">(initialTagMode);

  useEffect(() => {
    setTagMode(initialTagMode);
  }, [initialTagMode]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/55"
        aria-label="Cancel AI options"
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-rename-title"
        className="relative w-full max-w-md overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] shadow-2xl"
      >
        <div className="border-b border-[var(--line)] px-4 py-3">
          <h2 id="ai-rename-title" className="text-sm font-medium text-[var(--ink)]">
            AI options for this batch
          </h2>
        </div>
        <div className="space-y-3 px-4 py-4">
          <p className="text-sm leading-relaxed text-[var(--ink-muted)]">
            AI will tag all {trackCount} tracks (description, tags, BPM, key). Choose title handling
            and tag mode before it starts.
          </p>
          <p className="text-xs leading-relaxed text-[var(--ink-muted)]">
            Example cleanup:{" "}
            <span className="text-[var(--ink)]">00:01:12:01_Enter Susan_v2_oo1</span>
            {" → "}
            <span className="text-[var(--ink)]">Enter Susan</span>
          </p>
          <div className="space-y-2 rounded-md border border-[var(--line)] bg-[rgba(0,0,0,0.15)] p-2.5">
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--ink-dim)]">
              Library title mode
            </p>
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => setTitleMode("cleanup")}
                className={`rounded-md px-2.5 py-2 text-left text-xs transition ${
                  titleMode === "cleanup"
                    ? "bg-[var(--accent)] text-white"
                    : "border border-[var(--line)] text-[var(--ink-muted)] hover:border-[var(--accent)]"
                }`}
              >
                Clean titles with AI
              </button>
              <button
                type="button"
                onClick={() => setTitleMode("creative")}
                className={`rounded-md px-2.5 py-2 text-left text-xs transition ${
                  titleMode === "creative"
                    ? "bg-[var(--accent)] text-white"
                    : "border border-[var(--line)] text-[var(--ink-muted)] hover:border-[var(--accent)]"
                }`}
              >
                Invent library titles
              </button>
              <button
                type="button"
                onClick={() => setTitleMode("keep")}
                className={`rounded-md px-2.5 py-2 text-left text-xs transition ${
                  titleMode === "keep"
                    ? "bg-[var(--accent)] text-white"
                    : "border border-[var(--line)] text-[var(--ink-muted)] hover:border-[var(--accent)]"
                }`}
              >
                Keep current titles
              </button>
            </div>
          </div>
          <div className="space-y-2 rounded-md border border-[var(--line)] bg-[rgba(0,0,0,0.15)] p-2.5">
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--ink-dim)]">
              Tag mode
            </p>
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => setTagMode("individual")}
                className={`rounded-md px-2.5 py-2 text-left text-xs transition ${
                  tagMode === "individual"
                    ? "bg-[var(--accent)] text-white"
                    : "border border-[var(--line)] text-[var(--ink-muted)] hover:border-[var(--accent)]"
                }`}
              >
                Individual tagging (per-track tags)
              </button>
              <button
                type="button"
                onClick={() => setTagMode("album")}
                className={`rounded-md px-2.5 py-2 text-left text-xs transition ${
                  tagMode === "album"
                    ? "bg-[var(--accent)] text-white"
                    : "border border-[var(--line)] text-[var(--ink-muted)] hover:border-[var(--accent)]"
                }`}
              >
                Album tagging (shared tag cloud)
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-2 pt-1">
            <button
              type="button"
              onClick={() => onConfirm(titleMode, tagMode)}
              className="rounded-md bg-[var(--accent)] px-3 py-2.5 text-sm font-medium text-white transition hover:brightness-110"
            >
              Run AI
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md px-3 py-2 text-sm text-[var(--ink-muted)] transition hover:text-[var(--ink)]"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ImportForm({
  vocabulary,
  metaSuggestions,
  composers,
  housePublisherName = "",
}: {
  vocabulary: CatalogVocabulary;
  metaSuggestions?: CatalogMetaSuggestions;
  composers: ComposerOption[];
  housePublisherName?: string;
}) {
  const [linksText, setLinksText] = useState("");
  const [showPasteLinks, setShowPasteLinks] = useState(false);
  const [shared, setShared] = useState({
    client: "",
    project: "",
    year: String(new Date().getFullYear()),
    publisher: housePublisherName,
    description: "",
    notes: "",
    duration: "",
    samro: "No",
    license: "Clear",
    bpm: "",
    musicalKey: "",
  });
  const [composerAssignments, setComposerAssignments] = useState<ComposerAssignmentInput[]>(() =>
    defaultComposerAssignment(composers, "Richard Vossgatter"),
  );
  const [licenseEntry, setLicenseEntry] = useState<LicenseEntryFormValue>(() =>
    emptyLicenseEntryForm(),
  );
  const [drafts, setDrafts] = useState<DraftTrack[]>([]);
  const [dupWarnings, setDupWarnings] = useState<DuplicateMatch[][]>([]);
  const [dupCatalogTracks, setDupCatalogTracks] = useState<TrackListItem[]>([]);
  const [hardDupProceed, setHardDupProceed] = useState(false);
  /** Soft similar-title warnings marked checked per draft (cleared until matches change). */
  const [clearedSoftDupByClientId, setClearedSoftDupByClientId] = useState<
    Record<string, true>
  >({});
  const [derivedFrom, setDerivedFrom] = useState<DerivedFromLink[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"idle" | "resolving" | "tagging" | "importing">("idle");
  /** True from single-track queue until auto-AI finishes starting (avoids settings flash). */
  const [aiPending, setAiPending] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [multiTagMode, setMultiTagMode] = useState<"individual" | "album">("individual");
  const [multiTitleMode, setMultiTitleMode] = useState<"keep" | "cleanup" | "creative">(
    "cleanup",
  );
  const [aiOptionsPrompt, setAiOptionsPrompt] = useState<{
    trackCount: number;
    pendingInput:
      | { kind: "links"; links: string[] }
      | { kind: "files"; files: File[] };
  } | null>(null);
  /** When set, AI is rescanning one queue row without hiding the queue. */
  const [aiScanClientId, setAiScanClientId] = useState<string | null>(null);
  const batchRef = useRef<HTMLElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { playTrack, toggle, current, isPlaying, syncQueue, clearPlayer } = usePlayer();

  const importQueue = useMemo(
    () =>
      drafts
        .map((track) => draftToPlayerTrack(track))
        .filter((track): track is PlayerTrack => Boolean(track)),
    [drafts],
  );

  useEffect(() => {
    if (!current?.preview) return;
    if (!importQueue.some((t) => t.id === current.id)) {
      clearPlayer();
      return;
    }
    syncQueue(importQueue);
  }, [importQueue, current, clearPlayer, syncQueue]);

  const isSingle = drafts.length === 1;
  const isMulti = drafts.length > 1;
  const canIssueLicense = canIssueSyncLicenses(
    { publisher: shared.publisher, license: shared.license },
    housePublisherName,
  );
  const entryPayloadPreview = licenseEntryToApiPayload(licenseEntry);
  const wantsLicenseEntry = Boolean(
    entryPayloadPreview.client.trim() || entryPayloadPreview.usedFor.trim(),
  );

  // Drop leftover deal fields when Clear / other publisher (form is hidden).
  useEffect(() => {
    if (canIssueLicense) return;
    setLicenseEntry(emptyLicenseEntryForm());
  }, [canIssueLicense]);
  const hardDupBlocked = hasHardDuplicate(dupWarnings) && !hardDupProceed;
  const hardDupTracks = useMemo(() => {
    const ids = new Set(
      dupWarnings.flatMap((matches) => hardMatches(matches).map((match) => match.id)),
    );
    return dupCatalogTracks.filter((track) => ids.has(track.id));
  }, [dupWarnings, dupCatalogTracks]);
  const trackCountLabel = useMemo(
    () => `${drafts.length} track${drafts.length === 1 ? "" : "s"}`,
    [drafts.length],
  );
  const sharedAlbumTags = useMemo(
    () => ({
      genre: mergeTagLists(drafts.map((track) => track.genre)),
      mood: mergeTagLists(drafts.map((track) => track.mood)),
      instruments: mergeTagLists(drafts.map((track) => track.instruments)),
      attributes: mergeTagLists(drafts.map((track) => track.attributes)),
    }),
    [drafts],
  );

  const dupSignature = useMemo(
    () =>
      drafts
        .map((d) => `${d.dropboxLink}\0${d.workingTitle}\0${d.libraryTitle}`)
        .join("\n"),
    [drafts],
  );

  const dropboxSignature = useMemo(
    () => drafts.map((d) => d.dropboxLink.trim()).join("\n"),
    [drafts],
  );

  const durationProbeKey = useMemo(
    () =>
      drafts
        .map((d, i) => `${i}:${d.duration || ""}:${d.localPreviewUrl || d.dropboxLink}`)
        .join("|"),
    [drafts],
  );

  useEffect(() => {
    setHardDupProceed(false);
  }, [dropboxSignature]);

  useEffect(() => {
    setClearedSoftDupByClientId({});
  }, [dupSignature]);

  // Fallback duration fill from file metadata (primary probe runs before AI).
  useEffect(() => {
    drafts.forEach((track, index) => {
      if (track.duration) return;
      const url = audioUrlForDraft(track);
      if (!url) return;
      void readDurationFromAudioUrl(url).then((seconds) => {
        if (seconds == null) return;
        const formatted = formatAudioDuration(seconds);
        if (!formatted) return;
        setDrafts((prev) =>
          prev.map((item, i) =>
            i === index && !item.duration ? { ...item, duration: formatted } : item,
          ),
        );
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationProbeKey]);

  useEffect(() => {
    return () => {
      for (const draft of drafts) {
        if (draft.localPreviewUrl) URL.revokeObjectURL(draft.localPreviewUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!drafts.length) {
      setDupWarnings([]);
      setDupCatalogTracks([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/tracks/check-duplicates", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            tracks: drafts.map((track) => ({
              dropboxLink: track.dropboxLink,
              workingTitle: track.workingTitle,
              libraryTitle: track.libraryTitle,
            })),
          }),
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || controller.signal.aborted) return;
        const results = Array.isArray(data.results) ? data.results : [];
        setDupWarnings(
          drafts.map((_, index) => {
            const row = results.find(
              (item: { index?: number; matches?: DuplicateMatch[] }) => item.index === index,
            );
            return Array.isArray(row?.matches) ? row.matches : [];
          }),
        );
        setDupCatalogTracks(Array.isArray(data.tracks) ? data.tracks : []);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        // ignore transient network blips while typing/editing
      }
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dupSignature]);

  function revokeAll(list: DraftTrack[]) {
    for (const draft of list) {
      if (draft.localPreviewUrl) URL.revokeObjectURL(draft.localPreviewUrl);
    }
  }

  function scrollToBatch() {
    setTimeout(() => batchRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
  }

  function resetTagState() {
    setDerivedFrom([]);
  }

  function startAiWithRenameChoice(tracks: DraftTrack[], opts?: { force?: boolean }) {
    const titleMode = tracks.length > 1 ? multiTitleMode : "creative";
    void submitForAi(tracks, { force: opts?.force, titleMode });
  }

  function resolveAiRenamePrompt(
    titleMode: "keep" | "cleanup" | "creative",
    tagMode: "individual" | "album",
  ) {
    const pending = aiOptionsPrompt;
    setAiOptionsPrompt(null);
    if (!pending) return;
    setMultiTagMode(tagMode);
    setMultiTitleMode(titleMode);
    if (pending.pendingInput.kind === "links") {
      queueFromLinks(pending.pendingInput.links, { titleMode });
      return;
    }
    void resolveFiles(pending.pendingInput.files, { skipPrompt: true, titleMode });
  }

  function cancelAiRenamePrompt() {
    setAiOptionsPrompt(null);
    setAiPending(false);
    setMessage("");
  }

  async function maybeAutoAi(tracks: DraftTrack[], opts?: { titleMode?: "keep" | "cleanup" | "creative" }) {
    if (!tracks.length) {
      setAiPending(false);
      return;
    }
    setAiPending(true);
    try {
      const { warnings, catalogTracks } = await fetchDuplicateMatches(tracks);
      setDupWarnings(warnings);
      setDupCatalogTracks(catalogTracks);
      if (hasHardDuplicate(warnings)) {
        setHardDupProceed(false);
        setAiPending(false);
        setBusy("idle");
        setMessage("");
        setError("");
        return;
      }
    } catch {
      // If the check fails, still allow AI — import will re-check.
    }

    const withDuration = await probeMissingDurations(tracks);
    setDrafts((prev) => {
      const byId = new Map(withDuration.map((track) => [track.clientId, track]));
      return prev.map((track) => byId.get(track.clientId) ?? track);
    });
    // Single-track auto-AI invents a library title (same as single Dropbox link).
    // Multi keeps the last multi-batch choice (cleanup by default).
    const titleMode =
      opts?.titleMode ?? (tracks.length === 1 ? "creative" : multiTitleMode);
    void submitForAi(withDuration, { force: true, titleMode });
  }

  function proceedDespiteHardDup() {
    setHardDupProceed(true);
    setError("");
    setMessage("Proceed unlocked — you can run AI and import again.");
    setAiPending(true);
    startAiWithRenameChoice(drafts, { force: true });
  }

  function queueFromLinks(mp3Links: string[], opts?: { titleMode?: "keep" | "cleanup" | "creative" }) {
    const next = mp3Links.map((link) => emptyDraft(link));
    setDrafts((prev) => {
      revokeAll(prev);
      return next;
    });
    setHardDupProceed(false);
    resetTagState();
    setLinksText("");
    setAiPending(true);
    scrollToBatch();
    void maybeAutoAi(next, { titleMode: opts?.titleMode });
  }

  function addFromLinks() {
    setError("");
    const links = extractDropboxLinks(linksText);
    if (!links.length) {
      setError("Paste at least one Dropbox link");
      return;
    }
    const audioLinks = links.filter((link) => isAllowedImportAudioUrl(link));
    if (!audioLinks.length) {
      setError("Only MP3 or WAV Dropbox links are accepted");
      return;
    }
    if (audioLinks.length < links.length) {
      setError(
        `Skipped ${links.length - audioLinks.length} non-audio link${links.length - audioLinks.length === 1 ? "" : "s"} — only MP3/WAV is accepted`,
      );
    }
    if (audioLinks.length > 1) {
      setAiPending(true);
      setAiOptionsPrompt({
        trackCount: audioLinks.length,
        pendingInput: { kind: "links", links: audioLinks },
      });
      return;
    }
    queueFromLinks(audioLinks, { titleMode: "creative" });
  }

  async function resolveFiles(
    files: FileList | File[],
    opts?: { skipPrompt?: boolean; titleMode?: "keep" | "cleanup" | "creative" },
  ) {
    const list = [...files].filter(
      (file) =>
        /\.(mp3|wav)$/i.test(file.name) ||
        file.type === "audio/mpeg" ||
        file.type === "audio/mp3" ||
        file.type === "audio/wav" ||
        file.type === "audio/x-wav",
    );
    if (!list.length) {
      setError("Only MP3 or WAV files are accepted");
      return;
    }

    const rejected = [...files].filter(
      (file) =>
        !/\.(mp3|wav)$/i.test(file.name) &&
        file.type !== "audio/mpeg" &&
        file.type !== "audio/mp3" &&
        file.type !== "audio/wav" &&
        file.type !== "audio/x-wav",
    );
    if (rejected.length) {
      setError(
        `Skipped ${rejected.length} non-audio file${rejected.length === 1 ? "" : "s"} — only MP3/WAV is accepted`,
      );
    } else {
      setError("");
    }
    if (!opts?.skipPrompt && list.length > 1) {
      setAiPending(true);
      setAiOptionsPrompt({
        trackCount: list.length,
        pendingInput: { kind: "files", files: list },
      });
      return;
    }

    setBusy("resolving");
    setMessage(`Looking up ${list.length} file${list.length === 1 ? "" : "s"} in Dropbox…`);
    const created: DraftTrack[] = [];

    for (const file of list) {
      const localPreviewUrl = URL.createObjectURL(file);
      let res: Response;
      let data: { error?: string; dropboxLink?: string; path?: string } = {};
      try {
        res = await fetch("/api/dropbox/resolve-link", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ filename: file.name, size: file.size }),
        });
        data = await res.json().catch(() => ({}));
      } catch {
        URL.revokeObjectURL(localPreviewUrl);
        setBusy("idle");
        setError(
          `Connection dropped while looking up ${file.name}. If you just restarted the server, wait a second and drop the file again.`,
        );
        if (created.length) {
          let next: DraftTrack[] = [];
          setDrafts((prev) => {
            next = [...prev, ...created];
            return next;
          });
          resetTagState();
          scrollToBatch();
          void maybeAutoAi(next, { titleMode: opts?.titleMode });
        }
        return;
      }

      if (!res.ok) {
        URL.revokeObjectURL(localPreviewUrl);
        setBusy("idle");
        setError(data.error || `Could not find Dropbox link for ${file.name}`);
        if (created.length) {
          let next: DraftTrack[] = [];
          setDrafts((prev) => {
            next = [...prev, ...created];
            return next;
          });
          resetTagState();
          scrollToBatch();
          void maybeAutoAi(next, { titleMode: opts?.titleMode });
        }
        return;
      }

      const durationSec = await readDurationFromAudioUrl(localPreviewUrl);
      const duration = durationSec != null ? formatAudioDuration(durationSec) : "";

      created.push({
        ...emptyDraft(String(data.dropboxLink || ""), file.name),
        sourceDropboxPath: data.path?.trim() || undefined,
        localPreviewUrl,
        duration,
      });
    }

    let next: DraftTrack[] = [];
    setDrafts((prev) => {
      next = [...prev, ...created];
      return next;
    });
    setHardDupProceed(false);
    if (created.length) resetTagState();
    // Keep results panels hidden until AI finishes.
    setAiPending(true);
    setBusy("idle");
    scrollToBatch();
    void maybeAutoAi(next, { titleMode: opts?.titleMode });
  }

  async function submitForAi(
    overrideTracks?: DraftTrack[],
    opts?: {
      force?: boolean;
      titleMode?: "keep" | "cleanup" | "creative";
      keepQueueVisible?: boolean;
    },
  ) {
    const current = overrideTracks ?? drafts;
    if (!current.length) {
      setAiPending(false);
      setAiScanClientId(null);
      return;
    }

    if (!opts?.force && hardDupBlocked) {
      setAiPending(false);
      setAiScanClientId(null);
      setError(
        "This file is already in the database. Verify the existing track below, or click Proceed anyway.",
      );
      return;
    }

    const exclusive = normalizeLicenseStatus(shared.license) === "exclusive";
    let titleMode = opts?.titleMode ?? "creative";
    if (titleMode === "creative" && exclusive) {
      titleMode = "keep";
    }
    const keepQueueVisible = Boolean(opts?.keepQueueVisible);
    const applyRename = titleMode === "cleanup" || titleMode === "creative";
    const albumTagging = current.length > 1 && multiTagMode === "album";
    const chunkSize = 10;
    const total = current.length;

    setAiPending(false);
    setAiScanClientId(keepQueueVisible ? current[0]?.clientId ?? null : null);
    setBusy("tagging");
    setError("");

    type AiSuggestion = {
      libraryTitle?: string;
      description?: string;
      genre?: string;
      mood?: string;
      instruments?: string;
      attributes?: string;
      bpm?: string;
      musicalKey?: string;
    };

    function applySuggestionsToChunk(chunk: DraftTrack[], suggestions: AiSuggestion[]) {
      setDrafts((prev) =>
        prev.map((latest) => {
          const sentIndex = chunk.findIndex((t) => t.clientId === latest.clientId);
          if (sentIndex < 0) return latest;
          const suggestion = suggestions[sentIndex];
          if (!suggestion) return latest;
          const workingTitle =
            titleFromFilename(latest.workingTitle) || latest.workingTitle;
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
        }),
      );
    }

    let taggedCount = 0;
    let audioCountTotal = 0;
    let stoppedEarly = false;

    try {
      for (let offset = 0; offset < total; offset += chunkSize) {
        const chunk = current.slice(offset, offset + chunkSize);
        const from = offset + 1;
        const to = offset + chunk.length;

        setMessage(
          total === 1
            ? keepQueueVisible
              ? `AI analyzing ${chunk[0]?.libraryTitle || chunk[0]?.workingTitle || "track"}…`
              : "AI analyzing audio…"
            : total <= chunkSize
              ? `AI analyzing ${total} tracks…`
              : `AI analyzing ${from}–${to} of ${total}…`,
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
          const track = chunk[i];
          if (!track.localPreviewUrl) continue;
          try {
            const blob = await fetch(track.localPreviewUrl).then((res) => res.blob());
            const filename =
              (track.workingTitle || track.libraryTitle || "track").replace(/[^\w.\- ]+/g, "_") +
              (blob.type.includes("wav") ? ".wav" : ".mp3");
            form.append(`audio_${i}`, blob, filename);
          } catch {
            // Server falls back to Dropbox fetch.
          }
        }

        const res = await fetch("/api/tracks/suggest-tags", {
          method: "POST",
          body: form,
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setError(formatAiError(data.error || data.errors?.[0]?.error));
          stoppedEarly = taggedCount > 0;
          break;
        }

        if (Array.isArray(data.errors) && data.errors.length) {
          const first = String(data.errors[0]?.error || "");
          if (isAiQuotaError(first)) {
            setError(formatAiError(first));
            stoppedEarly = taggedCount > 0;
            break;
          }
        }

        const suggestions = (Array.isArray(data.suggestions) ? data.suggestions : []) as AiSuggestion[];

        if (!suggestions.length) {
          setError("AI returned no suggestion — you can tag manually");
          stoppedEarly = taggedCount > 0;
          break;
        }

        applySuggestionsToChunk(chunk, suggestions);
        if (albumTagging) {
          setDrafts((prev) => {
            const targetIds = new Set(current.map((track) => track.clientId));
            const targetTracks = prev.filter((track) => targetIds.has(track.clientId));
            const merged = {
              genre: joinTags(mergeTagLists(targetTracks.map((track) => track.genre))),
              mood: joinTags(mergeTagLists(targetTracks.map((track) => track.mood))),
              instruments: joinTags(mergeTagLists(targetTracks.map((track) => track.instruments))),
              attributes: joinTags(mergeTagLists(targetTracks.map((track) => track.attributes))),
            };
            return prev.map((track) =>
              targetIds.has(track.clientId)
                ? {
                    ...track,
                    genre: merged.genre,
                    mood: merged.mood,
                    instruments: merged.instruments,
                    attributes: merged.attributes,
                  }
                : track,
            );
          });
        }
        taggedCount += chunk.length;
        audioCountTotal += Number(data.audioCount) || 0;
      }

      const renamedNote =
        titleMode === "keep"
          ? " · titles kept"
          : titleMode === "cleanup"
            ? " · titles cleaned"
            : exclusive
              ? " · exclusive — source titles kept"
              : " · library titles suggested";

      if (taggedCount > 0) {
        setMessage(
          `AI tags ready` +
            (audioCountTotal ? " · audio analyzed" : "") +
            (total > 1 ? ` · ${taggedCount}${stoppedEarly ? ` of ${total}` : ""} tracks` : keepQueueVisible ? " · 1 track" : "") +
            (stoppedEarly ? " · stopped early" : "") +
            (albumTagging ? " · album shared tags" : "") +
            renamedNote,
        );
      } else if (!stoppedEarly) {
        // Error already set when the first chunk failed with no tags.
        setMessage("");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err || "");
      if (/failed to fetch|networkerror|load failed/i.test(message)) {
        setError(
          "Connection dropped while talking to AI (often after updating .env / restarting). Wait a moment and click Re-run AI — you can also tag manually.",
        );
      } else {
        setError(formatAiError(message));
      }
      if (taggedCount > 0) {
        setMessage(
          `AI tags ready · ${taggedCount} of ${total} tracks · stopped early` +
            (titleMode === "cleanup"
              ? " · titles cleaned"
              : titleMode === "creative" && !exclusive
                ? " · library titles suggested"
                : " · titles kept"),
        );
      } else {
        setMessage("");
      }
    } finally {
      setBusy("idle");
      setAiPending(false);
      setAiScanClientId(null);
    }
  }

  function rerunAiForTrack(index: number) {
    const track = drafts[index];
    if (!track?.dropboxLink.trim() || working) return;
    void submitForAi([track], { titleMode: "creative", keepQueueVisible: true });
  }

  async function onImport(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    setError("");

    if (!drafts.length) {
      setError("Add tracks first");
      return;
    }

    for (const track of drafts) {
      if (!track.dropboxLink.trim()) {
        setError("Every track needs a Dropbox link before import");
        return;
      }
    }

    if (hardDupBlocked) {
      setError(
        "This file is already in the database. Verify the existing track below, or click Proceed anyway.",
      );
      return;
    }

    const softDupes = drafts.flatMap((draft, index) => {
      if (clearedSoftDupByClientId[draft.clientId]) return [];
      return (dupWarnings[index] || []).filter((match) => match.reason !== "same_file");
    });
    if (softDupes.length) {
      const summary = [...new Set(softDupes.map((match) => matchLabel(match)))].slice(0, 6);
      const ok = window.confirm(
        `Similar track(s) already in the catalog.\n\n${summary.join("\n")}\n\nImport anyway?`,
      );
      if (!ok) return;
    }

    if (!composerAssignments.length) {
      setError("Select at least one composer");
      return;
    }
    if (composerAssignmentsTotal(composerAssignments) !== 100) {
      setError("Composer perf shares must total 100%");
      return;
    }

    // Only validate/log a sync deal when status+publisher allow it.
    // Leftover deal fields after switching back to Clear are ignored (not an error).
    if (wantsLicenseEntry && canIssueLicense) {
      const entry = licenseEntryToApiPayload(licenseEntry);
      if (!entry.client.trim()) {
        setError("License client is required when logging a deal");
        return;
      }
      if (!entry.usedFor.trim()) {
        setError("Used for is required when logging a deal");
        return;
      }
      if (!entry.territory.trim() || !entry.media.trim() || !entry.duration.trim()) {
        setError("Fill media, territory, and duration for the license");
        return;
      }
      if (!entry.licensedAt.trim()) {
        setError("Start date is required");
        return;
      }
      if (entry.perpetuity === "No" && !entry.expiresAt.trim()) {
        setError("End date is required when perpetuity is No");
        return;
      }
    }

    setBusy("importing");
    try {
      const res = await fetch("/api/tracks/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          shared: {
            ...shared,
            composers: composerAssignments,
          },
          licenseEntry:
            wantsLicenseEntry && canIssueLicense
              ? licenseEntryToApiPayload(licenseEntry)
              : null,
          derivedFrom: isSingle ? derivedFrom : [],
          tracks: drafts.map((track) => ({
            dropboxLink: track.dropboxLink,
            sourceDropboxPath: track.sourceDropboxPath || "",
            workingTitle: track.workingTitle,
            libraryTitle: track.libraryTitle,
            description: track.description || shared.description || "",
            duration: track.duration || "",
            bpm: track.bpm || "",
            musicalKey: track.musicalKey || "",
            genre: track.genre || "",
            mood: track.mood || "",
            instruments: track.instruments || "",
            attributes: track.attributes || "",
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      setBusy("idle");

      if (!res.ok) {
        setError(data.error || "Import failed");
        return;
      }

      clearPlayer();
      setDupWarnings([]);
      setMessage(`Imported ${data.count}: ${(data.ids || []).join(", ")}`);
      const waves = data.waveforms as { ok?: number; failed?: number } | undefined;
      if (waves && typeof waves.ok === "number") {
        if (waves.failed) {
          setMessage(
            `Imported ${data.count}: ${(data.ids || []).join(", ")} · waveforms ${waves.ok} ok, ${waves.failed} skipped`,
          );
        } else if (waves.ok > 0) {
          setMessage(
            `Imported ${data.count}: ${(data.ids || []).join(", ")} · waveforms ready`,
          );
        }
      }
      resetTagState();
      setDrafts((prev) => {
        revokeAll(prev);
        return [];
      });
    } catch {
      setBusy("idle");
      setError(
        "Connection dropped during import. If the server just restarted, wait a moment and try Import again.",
      );
    }
  }

  function updateDraft(index: number, patch: Partial<DraftTrack>) {
    setDrafts((prev) => prev.map((track, i) => (i === index ? { ...track, ...patch } : track)));
  }

  function removeDraft(index: number) {
    setDrafts((prev) => {
      const target = prev[index];
      if (target?.localPreviewUrl) URL.revokeObjectURL(target.localPreviewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  function applyAlbumSharedTagPatch(patch: {
    genre?: string[];
    mood?: string[];
    instruments?: string[];
    attributes?: string[];
  }) {
    setDrafts((prev) =>
      prev.map((track) => ({
        ...track,
        genre: patch.genre ? joinTags(patch.genre) : track.genre,
        mood: patch.mood ? joinTags(patch.mood) : track.mood,
        instruments: patch.instruments ? joinTags(patch.instruments) : track.instruments,
        attributes: patch.attributes ? joinTags(patch.attributes) : track.attributes,
      })),
    );
  }

  function playDraft(index: number) {
    const playerTrack = draftToPlayerTrack(drafts[index]);
    if (!playerTrack) return;
    if (current?.id === playerTrack.id) {
      toggle();
      return;
    }
    playTrack(playerTrack, importQueue);
  }

  function playCatalogMatch(matchId: string) {
    const catalog = dupCatalogTracks.find((t) => t.id === matchId);
    if (!catalog) return;
    const playerTrack = catalogMatchToPlayerTrack(catalog);
    if (!playerTrack) return;
    if (current?.id === playerTrack.id) {
      toggle();
      return;
    }
    const queue = dupCatalogTracks
      .map(catalogMatchToPlayerTrack)
      .filter((t): t is PlayerTrack => Boolean(t));
    playTrack(playerTrack, queue.length ? queue : [playerTrack]);
  }

  const working = busy !== "idle" || aiPending;
  /** Hide queue until Dropbox resolve / full-batch AI finish (not single-track rescan). */
  const isPipelineProcessing =
    busy === "resolving" || aiPending || (busy === "tagging" && !aiScanClientId);
  const showResults = drafts.length > 0 && !isPipelineProcessing;
  const statusLabel =
    busy === "resolving"
      ? "Looking up Dropbox…"
      : busy === "tagging" || aiPending
        ? "AI tagging…"
        : busy === "importing"
          ? "Importing…"
          : null;
  const processingTitle =
    busy === "resolving"
      ? "Looking up Dropbox…"
      : aiOptionsPrompt
        ? "Before AI tagging…"
        : "Analyzing audio…";
  const processingDetail =
    busy === "resolving"
      ? "Finding the shared link for your file."
      : aiOptionsPrompt
        ? "Choose title mode and tag mode."
        : isSingle || aiPending || busy === "tagging"
          ? "Measuring tempo and key, then suggesting tags."
          : "Preparing your upload…";

  return (
    <form
      onSubmit={onImport}
      className={`mx-auto space-y-4 ${hardDupBlocked ? "max-w-5xl" : "max-w-3xl"}`}
    >
      <section className="space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
          1. Add tracks
        </h2>

        <div
          onDragEnter={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files?.length && !working) {
              void resolveFiles(e.dataTransfer.files);
            }
          }}
          className={`rounded-lg border border-dashed px-4 py-5 text-center transition ${
            dragOver
              ? "border-[var(--accent)] bg-[var(--accent-soft)]"
              : "border-[var(--line)] bg-[var(--bg-elevated)]/60"
          }`}
        >
          <p className="text-sm font-medium text-[var(--ink)]">
            {statusLabel || "Drop MP3 or WAV from Dropbox"}
          </p>
          <p className="mt-1 text-xs text-[var(--ink-dim)]">
            1 track = AI runs automatically · multiple = shared manual tags · vault stores −16 LUFS MP3
          </p>
          <button
            type="button"
            disabled={working}
            onClick={() => fileInputRef.current?.click()}
            className="mt-3 rounded-md border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)] disabled:opacity-50"
          >
            Browse files
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/mpeg,audio/wav,.mp3,.wav"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void resolveFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)]/40">
          <button
            type="button"
            onClick={() => setShowPasteLinks((open) => !open)}
            className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-[var(--bg-elevated)]/80"
            aria-expanded={showPasteLinks}
          >
            <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
              Or paste Dropbox MP3 links
            </span>
            <span className="text-xs text-[var(--ink-muted)]">{showPasteLinks ? "Hide" : "Show"}</span>
          </button>
          {showPasteLinks ? (
            <div className="border-t border-[var(--line)] p-3 pt-2.5">
              <label className="block">
                <span className="sr-only">Paste Dropbox links</span>
                <textarea
                  className={`${fieldClass} min-h-16 font-mono text-xs`}
                  value={linksText}
                  onChange={(e) => setLinksText(e.target.value)}
                  placeholder={"https://www.dropbox.com/s/...\nhttps://www.dropbox.com/scl/fi/..."}
                />
              </label>
              <button
                type="button"
                disabled={working || !linksText.trim()}
                onClick={addFromLinks}
                className="mt-2 rounded-md border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)] disabled:opacity-50"
              >
                Add links to queue
              </button>
            </div>
          ) : null}
        </div>
      </section>

      {isPipelineProcessing ? (
        <section
          ref={batchRef}
          className="space-y-3 rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)]/60 p-5"
          aria-busy="true"
          aria-live="polite"
        >
          <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
            Processing
          </h2>
          <div className="flex items-start gap-3">
            {!aiOptionsPrompt ? (
              <span
                className="mt-0.5 inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--accent)]"
                aria-hidden
              />
            ) : null}
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--ink)]">{processingTitle}</p>
              <p className="mt-1 text-[11px] text-[var(--ink-dim)]">{processingDetail}</p>
            </div>
          </div>
        </section>
      ) : null}

      {showResults ? (
        <section className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)]/55">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
            <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
              Queue · {trackCountLabel}
              <span className="ml-2 rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-[var(--accent)]">
                AI
              </span>
            </h2>
            <button
              type="button"
              onClick={() => {
                revokeAll(drafts);
                setDrafts([]);
                setDupWarnings([]);
                setDupCatalogTracks([]);
                setHardDupProceed(false);
                setAiPending(false);
                setAiScanClientId(null);
                setClearedSoftDupByClientId({});
                resetTagState();
                setMessage("");
                setError("");
              }}
              className="text-[11px] text-[var(--ink-dim)] hover:text-[var(--exclusive)]"
            >
              Clear
            </button>
          </div>
          <ul className="divide-y divide-[var(--line)]">
            {drafts.map((track, index) => {
              const playerTrack = draftToPlayerTrack(track);
              const active = Boolean(playerTrack && current?.id === playerTrack.id);
              const rowPlaying = active && isPlaying;
              const matches = dupWarnings[index] || [];
              const hard = hardMatches(matches);
              const soft = matches.filter((match) => match.reason !== "same_file");
              const softCleared = Boolean(clearedSoftDupByClientId[track.clientId]);
              const scanning = aiScanClientId === track.clientId;
              return (
                <li
                  key={track.clientId}
                  className={`px-4 py-4 ${scanning ? "bg-[var(--accent-soft)]/25" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    {playerTrack ? (
                      <button
                        type="button"
                        onClick={() => playDraft(index)}
                        disabled={scanning}
                        className={`mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-full border text-sm transition disabled:opacity-40 ${
                          active && rowPlaying
                            ? "border-[var(--accent)] bg-[var(--accent)] text-white shadow-[0_0_0_3px_var(--accent-soft)]"
                            : active
                              ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink)]"
                              : "border-[var(--line)] text-[var(--ink)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
                        }`}
                        aria-label={
                          rowPlaying
                            ? `Pause ${playerTrack.title}`
                            : `Play ${playerTrack.title}`
                        }
                      >
                        {rowPlaying ? "❚❚" : "▶"}
                      </button>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <label className="block min-w-0 flex-1">
                              <span className="mb-1 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
                                Library title
                                <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold normal-case tracking-normal text-[var(--accent)] bg-[var(--accent-soft)]">
                                  AI
                                </span>
                                {scanning ? (
                                  <span className="normal-case tracking-normal text-[var(--accent)]">
                                    Analyzing…
                                  </span>
                                ) : null}
                              </span>
                              <input
                                value={track.libraryTitle}
                                onChange={(e) =>
                                  updateDraft(index, { libraryTitle: e.target.value })
                                }
                                disabled={scanning}
                                className="w-full rounded-md border border-transparent bg-transparent px-0 py-0.5 text-[17px] font-semibold leading-snug tracking-tight text-[var(--ink)] outline-none transition placeholder:text-[var(--ink-dim)] hover:border-[var(--line)] hover:px-2 focus:border-[var(--accent)] focus:px-2 disabled:opacity-60"
                                placeholder="Library title"
                              />
                            </label>
                            <button
                              type="button"
                              disabled={working || hardDupBlocked || !track.dropboxLink.trim()}
                              onClick={() => rerunAiForTrack(index)}
                              className="mt-0.5 shrink-0 rounded-md border border-[var(--line)] px-2.5 py-1.5 text-[11px] text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-40"
                              title="Re-run AI on this track"
                            >
                              {scanning ? "AI…" : "Re-run AI"}
                            </button>
                          </div>

                          <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                            <label className="block rounded-md border border-[var(--line)] bg-[rgba(0,0,0,0.18)] px-2.5 py-2">
                              <span className="mb-1 block text-[9px] font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
                                Working title
                              </span>
                              <input
                                value={track.workingTitle}
                                onChange={(e) => updateDraft(index, { workingTitle: e.target.value })}
                                className="w-full truncate bg-transparent text-[12px] leading-snug text-[var(--ink-muted)] outline-none"
                                placeholder="Source file name"
                                title={track.workingTitle}
                              />
                            </label>
                            <label className="block rounded-md border border-[var(--line)] bg-[rgba(0,0,0,0.18)] px-2.5 py-2">
                              <span className="mb-1 block text-[9px] font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
                                Dropbox link
                              </span>
                              <input
                                value={track.dropboxLink}
                                onChange={(e) => updateDraft(index, { dropboxLink: e.target.value })}
                                className="w-full truncate bg-transparent font-mono text-[11px] leading-snug text-[var(--ink-dim)] outline-none"
                                placeholder="https://www.dropbox.com/..."
                                title={track.dropboxLink}
                              />
                            </label>
                          </div>

                          <label className="mt-2 block rounded-md border border-[var(--line)] bg-[rgba(0,0,0,0.18)] px-2.5 py-2">
                            <span className="mb-1 flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
                              Description
                              <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold normal-case tracking-normal text-[var(--accent)] bg-[var(--accent-soft)]">
                                AI
                              </span>
                            </span>
                            <textarea
                              value={track.description}
                              onChange={(e) => updateDraft(index, { description: e.target.value })}
                              rows={2}
                              className="w-full resize-none bg-transparent text-[12px] leading-relaxed text-[var(--ink-muted)] outline-none"
                              placeholder="Short description of feel and use-case"
                            />
                          </label>

                          <div className="mt-2 grid gap-2 sm:grid-cols-3">
                            <label className="block rounded-md border border-[var(--line)] bg-[rgba(0,0,0,0.18)] px-2.5 py-2">
                              <span className="mb-1 flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
                                BPM
                                <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold normal-case tracking-normal text-[var(--accent)] bg-[var(--accent-soft)]">
                                  AI
                                </span>
                              </span>
                              <input
                                value={track.bpm}
                                onChange={(e) =>
                                  updateDraft(index, {
                                    bpm: e.target.value.replace(/[^\d]/g, ""),
                                  })
                                }
                                className="w-full bg-transparent text-[12px] tabular-nums text-[var(--ink-muted)] outline-none"
                                placeholder="e.g. 92"
                                inputMode="numeric"
                              />
                            </label>
                            <label className="block rounded-md border border-[var(--line)] bg-[rgba(0,0,0,0.18)] px-2.5 py-2">
                              <span className="mb-1 flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
                                Key
                                <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold normal-case tracking-normal text-[var(--accent)] bg-[var(--accent-soft)]">
                                  AI
                                </span>
                              </span>
                              <input
                                value={track.musicalKey}
                                onChange={(e) =>
                                  updateDraft(index, { musicalKey: e.target.value })
                                }
                                className="w-full bg-transparent text-[12px] text-[var(--ink-muted)] outline-none"
                                placeholder="e.g. Am"
                              />
                            </label>
                            <label className="block rounded-md border border-[var(--line)] bg-[rgba(0,0,0,0.18)] px-2.5 py-2">
                              <span className="mb-1 block text-[9px] font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
                                Duration{" "}
                                <span className="normal-case tracking-normal opacity-70">
                                  auto
                                </span>
                              </span>
                              <input
                                value={track.duration}
                                onChange={(e) =>
                                  updateDraft(index, { duration: e.target.value })
                                }
                                className="w-full bg-transparent text-[12px] tabular-nums text-[var(--ink-muted)] outline-none"
                                placeholder="0:00"
                              />
                            </label>
                          </div>

                          {isMulti && multiTagMode === "album" ? (
                            <div className="mt-2 rounded-md border border-[var(--line)] bg-[rgba(0,0,0,0.12)] px-2.5 py-2 text-[11px] text-[var(--ink-dim)]">
                              Album tagging mode: this track uses the shared tag cloud in Settings.
                            </div>
                          ) : (
                            <div className="mt-2 rounded-md border border-[var(--line)] bg-[rgba(0,0,0,0.18)] px-2.5 py-2.5">
                              <div className="mb-2 flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
                                Tags
                                <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold normal-case tracking-normal text-[var(--accent)] bg-[var(--accent-soft)]">
                                  AI
                                </span>
                              </div>
                              <SharedTagPicker
                                vocabulary={vocabulary}
                                genre={splitTags(track.genre)}
                                mood={splitTags(track.mood)}
                                instruments={splitTags(track.instruments)}
                                attributes={splitTags(track.attributes)}
                                onChange={(patch) => {
                                  const next = {
                                    genre: splitTags(track.genre),
                                    mood: splitTags(track.mood),
                                    instruments: splitTags(track.instruments),
                                    attributes: splitTags(track.attributes),
                                    ...patch,
                                  };
                                  updateDraft(index, {
                                    genre: joinTags(next.genre),
                                    mood: joinTags(next.mood),
                                    instruments: joinTags(next.instruments),
                                    attributes: joinTags(next.attributes),
                                  });
                                }}
                              />
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => removeDraft(index)}
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-base leading-none text-[var(--ink-dim)] transition hover:bg-white/5 hover:text-[var(--exclusive)]"
                          aria-label="Remove"
                        >
                          ×
                        </button>
                      </div>

                      {hard.length ? (
                        <div
                          className="mt-3 rounded-md border border-[rgba(248,113,113,0.45)] bg-[rgba(248,113,113,0.12)] px-2.5 py-2 text-[11px] leading-relaxed text-[#fecaca]"
                          role="alert"
                        >
                          <div className="font-medium">
                            Already in the database — import paused
                          </div>
                          <p className="mt-1 opacity-90">
                            Verify the existing catalog entry below before continuing.
                          </p>
                        </div>
                      ) : soft.length && softCleared ? (
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-[rgba(74,222,128,0.35)] bg-[rgba(74,222,128,0.1)] px-2.5 py-2 text-[11px] text-[var(--available)]">
                          <div className="min-w-0">
                            <span className="font-medium">Similar titles checked</span>
                            <span className="opacity-80">
                              {" "}
                              · {soft.length} match{soft.length === 1 ? "" : "es"} cleared
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setClearedSoftDupByClientId((prev) => {
                                const next = { ...prev };
                                delete next[track.clientId];
                                return next;
                              })
                            }
                            className="shrink-0 text-[11px] text-[var(--ink-dim)] underline-offset-2 transition hover:text-[var(--ink-muted)] hover:underline"
                          >
                            Show again
                          </button>
                        </div>
                      ) : soft.length ? (
                        <div
                          className="mt-3 rounded-md border border-[rgba(251,191,36,0.4)] bg-[rgba(251,191,36,0.1)] px-2.5 py-2 text-[11px] leading-relaxed text-[#fde68a]"
                          role="alert"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="font-medium">Similar track already in the catalog</div>
                            <button
                              type="button"
                              onClick={() =>
                                setClearedSoftDupByClientId((prev) => ({
                                  ...prev,
                                  [track.clientId]: true,
                                }))
                              }
                              className="shrink-0 rounded-md border border-[rgba(251,191,36,0.45)] bg-[rgba(0,0,0,0.2)] px-2.5 py-1 text-[11px] font-medium text-[#fde68a] transition hover:border-[rgba(251,191,36,0.7)] hover:bg-[rgba(0,0,0,0.35)] hover:text-white"
                            >
                              Clear
                            </button>
                          </div>
                          <ul className="mt-2 space-y-2">
                            {soft.slice(0, 4).map((match) => {
                              const catalog = dupCatalogTracks.find((t) => t.id === match.id);
                              const canPlay = Boolean(catalog?.dropboxDl);
                              const active = current?.id === match.id && !current?.preview;
                              const rowPlaying = active && isPlaying;
                              const library = match.libraryTitle?.trim() || "";
                              const workingTitle = match.workingTitle?.trim() || "";
                              const primary = library || workingTitle || match.id;
                              return (
                                <li
                                  key={`${match.id}-${match.reason}`}
                                  className="flex items-start gap-2.5 rounded-md border border-[rgba(251,191,36,0.28)] bg-[rgba(0,0,0,0.18)] px-2 py-1.5"
                                >
                                  <button
                                    type="button"
                                    disabled={!canPlay}
                                    onClick={() => playCatalogMatch(match.id)}
                                    className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border text-[10px] transition disabled:cursor-not-allowed disabled:opacity-35 ${
                                      rowPlaying
                                        ? "border-current bg-current/15"
                                        : "border-current/45 hover:border-current"
                                    }`}
                                    aria-label={
                                      rowPlaying
                                        ? `Pause ${primary}`
                                        : `Play ${primary} to compare`
                                    }
                                    title={
                                      canPlay
                                        ? rowPlaying
                                          ? "Pause"
                                          : "Play catalog track"
                                        : "No audio available"
                                    }
                                  >
                                    {rowPlaying ? "❚❚" : "▶"}
                                  </button>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                      <Link
                                        href={`/tracks/${encodeURIComponent(match.id)}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="truncate font-medium underline underline-offset-2 hover:text-white"
                                      >
                                        {primary}
                                      </Link>
                                      <span className="shrink-0 opacity-70">
                                        · {reasonLabel(match.reason)}
                                      </span>
                                    </div>
                                    <div className="mt-0.5 truncate opacity-80">
                                      {workingTitle
                                        ? `Working title: ${workingTitle}`
                                        : "No working title"}
                                    </div>
                                    <div className="mt-0.5 truncate font-mono text-[10px] opacity-55">
                                      {match.id}
                                    </div>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {showResults && hardDupBlocked ? (
        <section
          className="space-y-3 rounded-lg border border-[rgba(248,113,113,0.35)] bg-[var(--bg-elevated)]/60 p-3"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-[#fecaca]">
                2. Verify existing track
              </h2>
              <p className="mt-1 text-[11px] text-[var(--ink-dim)]">
                This file is already in the catalog. Review the track below (same layout as Browse),
                then clear the queue — or proceed anyway to import a duplicate.
              </p>
            </div>
            <button
              type="button"
              onClick={proceedDespiteHardDup}
              className="rounded-md border border-[rgba(248,113,113,0.55)] bg-[rgba(248,113,113,0.16)] px-3 py-2 text-sm font-medium text-[#fecaca] transition hover:bg-[rgba(248,113,113,0.28)] hover:text-white"
            >
              Proceed anyway
            </button>
          </div>
          {hardDupTracks.length ? (
            <TrackList
              tracks={hardDupTracks}
              canEdit
              vocabulary={vocabulary}
              initiallyExpanded
            />
          ) : (
            <p className="rounded-md border border-[var(--line)] px-3 py-4 text-sm text-[var(--ink-dim)]">
              Loading existing track details…
            </p>
          )}
        </section>
      ) : showResults ? (
        <section
          className="space-y-3 rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)]/60 p-3"
        >
          <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
            2. Settings
          </h2>
          <p className="text-[11px] text-[var(--ink-dim)]">
            Project details shared across this import batch
          </p>

          {isMulti ? (
            <div className="rounded-md border border-[var(--line)] bg-[rgba(0,0,0,0.18)] p-2.5 sm:col-span-2">
              <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--ink-dim)]">
                Multi-import tagging mode
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setMultiTagMode("individual")}
                  className={`rounded-md px-2.5 py-1.5 text-xs transition ${
                    multiTagMode === "individual"
                      ? "bg-[var(--accent)] text-white"
                      : "border border-[var(--line)] text-[var(--ink-muted)] hover:border-[var(--accent)]"
                  }`}
                >
                  Individual tagging
                </button>
                <button
                  type="button"
                  onClick={() => setMultiTagMode("album")}
                  className={`rounded-md px-2.5 py-1.5 text-xs transition ${
                    multiTagMode === "album"
                      ? "bg-[var(--accent)] text-white"
                      : "border border-[var(--line)] text-[var(--ink-muted)] hover:border-[var(--accent)]"
                  }`}
                >
                  Album tagging
                </button>
              </div>
              <p className="mt-2 text-[10px] text-[var(--ink-dim)]">
                Album tagging keeps AI title/BPM/key per track, but uses one shared tag cloud.
              </p>
              {multiTagMode === "album" ? (
                <div className="mt-2">
                  <SharedTagPicker
                    vocabulary={vocabulary}
                    genre={sharedAlbumTags.genre}
                    mood={sharedAlbumTags.mood}
                    instruments={sharedAlbumTags.instruments}
                    attributes={sharedAlbumTags.attributes}
                    onChange={(patch) => {
                      const next = {
                        genre: sharedAlbumTags.genre,
                        mood: sharedAlbumTags.mood,
                        instruments: sharedAlbumTags.instruments,
                        attributes: sharedAlbumTags.attributes,
                        ...patch,
                      };
                      applyAlbumSharedTagPatch(next);
                    }}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2">
            <label>
              <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
                Client
              </span>
              <MetaSuggestInput
                value={shared.client}
                onChange={(client) => setShared((s) => ({ ...s, client }))}
                suggestions={metaSuggestions?.clients || []}
                placeholder="Optional"
              />
            </label>
            <label>
              <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
                Project
              </span>
              <MetaSuggestInput
                value={shared.project}
                onChange={(project) => setShared((s) => ({ ...s, project }))}
                suggestions={metaSuggestions?.projects || []}
                placeholder="Optional"
              />
            </label>
            <label>
              <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
                Year
              </span>
              <input
                className={fieldClass}
                value={shared.year}
                onChange={(e) => setShared((s) => ({ ...s, year: e.target.value }))}
              />
            </label>

            <div className="sm:col-span-2">
              <ComposerPicker
                composers={composers}
                value={composerAssignments}
                onChange={setComposerAssignments}
              />
            </div>
            <label>
              <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
                Publisher
              </span>
              <MetaSuggestInput
                value={shared.publisher}
                onChange={(publisher) => setShared((s) => ({ ...s, publisher }))}
                suggestions={metaSuggestions?.publishers || []}
                placeholder={housePublisherName || "Publisher"}
              />
              <p className="mt-1 text-[10px] text-[var(--ink-dim)]">
                Defaults to house publisher. Other publishers: status only (no sync deals).
              </p>
            </label>

            <label>
              <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
                SAMRO
              </span>
              <select
                className={fieldClass}
                value={shared.samro}
                onChange={(e) => setShared((s) => ({ ...s, samro: e.target.value }))}
              >
                <option value="No">Not submitted</option>
                <option value="Yes">Submitted</option>
              </select>
              <p className="mt-1 text-[10px] text-[var(--ink-dim)]">Defaults to not submitted</p>
            </label>

            <TrackLicenseSection
              license={shared.license}
              onLicenseChange={(license) => setShared((s) => ({ ...s, license }))}
              publisher={shared.publisher}
              housePublisherName={housePublisherName}
              metaSuggestions={metaSuggestions}
              licenseEntry={licenseEntry}
              onLicenseEntryChange={setLicenseEntry}
              clientPrefill={shared.client}
              projectPrefill={shared.project}
            />

            {!isSingle ? (
              <label className="sm:col-span-2">
                <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
                  Shared description
                </span>
                <textarea
                  className={`${fieldClass} min-h-[72px] resize-y`}
                  value={shared.description}
                  onChange={(e) => setShared((s) => ({ ...s, description: e.target.value }))}
                  placeholder="Applied when a queued track has no description"
                />
              </label>
            ) : null}

            <label className="sm:col-span-2">
              <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
                Notes
              </span>
              <textarea
                className={`${fieldClass} min-h-[64px] resize-y`}
                value={shared.notes}
                onChange={(e) => setShared((s) => ({ ...s, notes: e.target.value }))}
                placeholder="Techniques, production details — searchable later"
              />
            </label>
          </div>

          <button
            type="button"
            disabled={working || hardDupBlocked}
            onClick={() => {
              setAiPending(true);
              startAiWithRenameChoice(drafts);
            }}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-50"
            title={
              hardDupBlocked
                ? "Already in database — verify the existing track, or click Proceed anyway"
                : undefined
            }
          >
            Re-run AI
          </button>

          {isSingle ? <TrackLineageLinker value={derivedFrom} onChange={setDerivedFrom} /> : null}

          <div className="sticky bottom-4 z-10 flex justify-end pt-1">
            <button
              type="submit"
              disabled={working || hardDupBlocked}
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white shadow-lg transition hover:brightness-110 disabled:opacity-50"
              title={
                hardDupBlocked
                  ? "Already in database — verify the existing track, or click Proceed anyway"
                  : undefined
              }
            >
              {busy === "importing" ? "Importing…" : `Import ${trackCountLabel}`}
            </button>
          </div>
        </section>
      ) : null}

      {aiOptionsPrompt ? (
        <AiRenamePromptModal
          trackCount={aiOptionsPrompt.trackCount}
          initialTagMode={multiTagMode}
          onConfirm={(titleMode, tagMode) => resolveAiRenamePrompt(titleMode, tagMode)}
          onCancel={cancelAiRenamePrompt}
        />
      ) : null}

      {error ? (
        <div
          className={`rounded-md border px-3 py-2.5 text-xs leading-relaxed ${
            isAiQuotaError(error)
              ? "border-[rgba(251,191,36,0.45)] bg-[rgba(251,191,36,0.12)] text-[#fde68a]"
              : "border-[rgba(248,113,113,0.4)] bg-[rgba(248,113,113,0.1)] text-[#fecaca]"
          }`}
          role="alert"
        >
          {isAiQuotaError(error) ? (
            <>
              <div className="font-medium">AI limit reached</div>
              <p className="mt-1 opacity-95">{error}</p>
            </>
          ) : (
            error
          )}
        </div>
      ) : null}
      {message ? <p className="text-xs text-[var(--available)]">{message}</p> : null}
    </form>
  );
}
