"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { audioUrlFor, usePlayer, type PlayerTrack } from "@/components/player-provider";
import {
  formatAudioDuration,
  readDurationFromAudioUrl,
} from "@/lib/audio-duration";
import type { TrackAssetKind } from "@/lib/track-assets";
import { mp3OnlyErrorMessage, titleFromFilename } from "@/lib/tracks";

export type TrackAssetRow = {
  id: string;
  trackId: string;
  kind: TrackAssetKind;
  label: string;
  slug: string;
  dropboxLink: string | null;
  dropboxDl: string | null;
  dropboxPath: string | null;
  duration: string | null;
  sortOrder: number;
  createdAt: string;
};

type AssetListItem = {
  key: string;
  kind: TrackAssetKind;
  label: string;
  duration?: string | null;
  assetId: string;
  dropboxDl?: string | null;
};

function playButtonClass(active: boolean, playing: boolean) {
  if (active && playing) {
    return "border-[var(--accent)] bg-[var(--accent)] text-[var(--bg)]";
  }
  if (active) {
    return "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]";
  }
  return "border-[var(--line)] text-[var(--ink-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]";
}

function toPlayerTrack(trackId: string, item: AssetListItem, trackTitle: string): PlayerTrack {
  return {
    id: trackId,
    assetId: item.assetId,
    title: `${trackTitle} — ${item.label}`,
    subtitle: item.kind === "version" ? "Version" : "Stem",
    duration: item.duration,
    dropboxDl: "1",
  };
}

function audioFilesFromList(files: FileList | File[]): File[] {
  return [...files].filter((file) => /\.(mp3|wav|aiff|aif)$/i.test(file.name));
}

function firstAudioFile(files: FileList | File[]): File | null {
  return audioFilesFromList(files)[0] ?? null;
}

function defaultStemName(file: File): string {
  return titleFromFilename(file.name) || file.name.replace(/\.[^.]+$/i, "");
}

type PendingStem = {
  id: string;
  file: File;
  label: string;
};

function dropZoneClass(active: boolean) {
  return `rounded-lg border border-dashed p-3 transition ${
    active
      ? "border-[var(--accent)] bg-[var(--accent-soft)]"
      : "border-[var(--line)] bg-[var(--bg)]/40"
  }`;
}

function AssetRow({
  item,
  trackId,
  trackTitle,
  canEdit,
  current,
  isPlaying,
  deleting,
  onPlay,
  onDelete,
}: {
  item: AssetListItem;
  trackId: string;
  trackTitle: string;
  canEdit: boolean;
  current: PlayerTrack | null;
  isPlaying: boolean;
  deleting: boolean;
  onPlay: (track: PlayerTrack) => void;
  onDelete: (assetId: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const playable = Boolean(item.assetId);
  const playerTrack = toPlayerTrack(trackId, item, trackTitle);
  const active = current?.id === trackId && current.assetId === item.assetId;
  const kindLabel = item.kind === "version" ? "Version" : "Stem";

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--bg)] px-2.5 py-2">
      <button
        type="button"
        disabled={!playable}
        onClick={() => {
          if (!playable) return;
          onPlay(playerTrack);
        }}
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border text-[10px] transition disabled:cursor-not-allowed disabled:opacity-30 ${playButtonClass(active, isPlaying)}`}
        aria-label={active && isPlaying ? `Pause ${item.label}` : `Play ${item.label}`}
      >
        {active && isPlaying ? "❚❚" : "▶"}
      </button>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--accent)]">
          {kindLabel}
        </div>
        <div className="truncate text-sm font-medium text-[var(--ink)]" title={item.label}>
          {item.label}
        </div>
        {item.duration ? (
          <div className="text-[11px] text-[var(--ink-dim)]">{item.duration}</div>
        ) : null}
      </div>
      {playable ? (
        <a
          href={`${audioUrlFor(trackId, item.assetId)}&download=1`}
          className="rounded-md border border-[var(--line)] px-2 py-1 text-[11px] text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)]"
        >
          Download
        </a>
      ) : null}
      {canEdit ? (
        confirmDelete ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--line)] bg-[rgba(0,0,0,0.18)] px-2 py-1">
            <span className="text-[11px] text-[var(--ink-muted)]">Delete from vault?</span>
            <button
              type="button"
              disabled={deleting}
              onClick={() => setConfirmDelete(false)}
              className="rounded-md px-2 py-0.5 text-[11px] text-[var(--ink-dim)] transition hover:text-[var(--ink)] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={() => void onDelete(item.assetId)}
              className="rounded-md bg-[var(--exclusive)]/15 px-2 py-0.5 text-[11px] font-medium text-[var(--exclusive)] transition hover:brightness-110 disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={deleting}
            onClick={() => setConfirmDelete(true)}
            className="rounded-md border border-[var(--line)] px-2 py-1 text-[11px] text-[var(--ink-dim)] transition hover:border-red-400/50 hover:text-red-300 disabled:opacity-50"
          >
            Delete
          </button>
        )
      ) : null}
    </li>
  );
}

export function TrackAssetsPanel({
  trackId,
  trackTitle,
  canEdit = false,
}: {
  trackId: string;
  trackTitle: string;
  /** Show add/delete controls — only when editing track info */
  canEdit?: boolean;
}) {
  const { playTrack, toggle, current, isPlaying } = usePlayer();
  const [assets, setAssets] = useState<TrackAssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyKind, setBusyKind] = useState<TrackAssetKind | null>(null);
  const [stemSubmitting, setStemSubmitting] = useState(false);
  const [pendingStems, setPendingStems] = useState<PendingStem[]>([]);
  const versionInputRef = useRef<HTMLInputElement>(null);
  const stemInputRef = useRef<HTMLInputElement>(null);
  const [versionDragOver, setVersionDragOver] = useState(false);
  const [stemDragOver, setStemDragOver] = useState(false);
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);
  const stemBusy = stemSubmitting || busyKind === "stem";

  const loadAssets = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/tracks/${encodeURIComponent(trackId)}/assets`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not load versions and stems");
        setAssets([]);
        return;
      }
      setAssets(Array.isArray(data.assets) ? data.assets : []);
    } catch {
      setError("Could not load versions and stems");
    } finally {
      setLoading(false);
    }
  }, [trackId]);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  const versions = useMemo<AssetListItem[]>(
    () =>
      assets
        .filter((asset) => asset.kind === "version")
        .map((asset) => ({
          key: asset.id,
          kind: asset.kind,
          label: asset.label,
          duration: asset.duration,
          assetId: asset.id,
          dropboxDl: asset.dropboxDl,
        })),
    [assets],
  );

  const stems = useMemo<AssetListItem[]>(
    () =>
      assets
        .filter((asset) => asset.kind === "stem")
        .map((asset) => ({
          key: asset.id,
          kind: asset.kind,
          label: asset.label,
          duration: asset.duration,
          assetId: asset.id,
          dropboxDl: asset.dropboxDl,
        })),
    [assets],
  );

  const playableQueue = useMemo(
    () => [...versions, ...stems].map((item) => toPlayerTrack(trackId, item, trackTitle)),
    [versions, stems, trackId, trackTitle],
  );

  const handlePlay = useCallback(
    (playerTrack: PlayerTrack) => {
      const active =
        current?.id === trackId && current.assetId === playerTrack.assetId;
      if (active) {
        toggle();
        return;
      }
      playTrack(playerTrack, playableQueue);
    },
    [current, trackId, toggle, playTrack, playableQueue],
  );

  async function uploadAsset(kind: TrackAssetKind, file: File): Promise<boolean> {
    setBusyKind(kind);
    setError("");
    setMessage(kind === "version" ? "Normalizing version…" : "Uploading stem…");

    const form = new FormData();
    form.append("kind", kind);
    form.append("audio", file, file.name);

    try {
      const res = await fetch(`/api/tracks/${encodeURIComponent(trackId)}/assets`, {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Upload failed");
        setMessage("");
        return false;
      }

      const asset = data.asset as TrackAssetRow | undefined;
      if (asset?.dropboxLink) {
        const seconds = await readDurationFromAudioUrl(
          audioUrlFor(trackId, asset.id),
        );
        if (seconds != null) {
          asset.duration = formatAudioDuration(seconds);
        }
      }

      setMessage(kind === "version" ? "Version added" : "Stem added");
      await loadAssets();
      return true;
    } catch {
      setError("Upload failed");
      setMessage("");
      return false;
    } finally {
      setBusyKind(null);
    }
  }

  async function uploadStem(file: File, label: string): Promise<boolean> {
    const form = new FormData();
    form.append("kind", "stem");
    form.append("label", label.trim());
    form.append("audio", file, file.name);

    try {
      const res = await fetch(`/api/tracks/${encodeURIComponent(trackId)}/assets`, {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Upload failed for ${label.trim()}`);
        return false;
      }
      return true;
    } catch {
      setError(`Upload failed for ${label.trim()}`);
      return false;
    }
  }

  function stageStemFiles(files: FileList | File[]) {
    if (stemBusy || busyKind !== null) return;
    const audio = audioFilesFromList(files);
    if (!audio.length) {
      setError(mp3OnlyErrorMessage());
      return;
    }
    setError("");
    setPendingStems((prev) => [
      ...prev,
      ...audio.map((file) => ({
        id: crypto.randomUUID(),
        file,
        label: defaultStemName(file),
      })),
    ]);
  }

  function updatePendingStem(id: string, label: string) {
    setPendingStems((prev) => prev.map((stem) => (stem.id === id ? { ...stem, label } : stem)));
  }

  function removePendingStem(id: string) {
    setPendingStems((prev) => prev.filter((stem) => stem.id !== id));
  }

  async function submitPendingStems() {
    if (!pendingStems.length || stemSubmitting) return;

    const unnamed = pendingStems.find((stem) => !stem.label.trim());
    if (unnamed) {
      setError("Name every stem before submitting");
      return;
    }

    setStemSubmitting(true);
    setError("");
    const remaining: PendingStem[] = [];
    let uploaded = 0;

    for (let i = 0; i < pendingStems.length; i++) {
      const stem = pendingStems[i];
      setMessage(`Uploading stem ${i + 1} of ${pendingStems.length}…`);
      const ok = await uploadStem(stem.file, stem.label);
      if (ok) {
        uploaded += 1;
      } else {
        remaining.push(...pendingStems.slice(i));
        break;
      }
    }

    setPendingStems(remaining);
    setStemSubmitting(false);

    if (uploaded > 0) {
      await loadAssets();
    }

    if (remaining.length === 0 && uploaded > 0) {
      setMessage(`Added ${uploaded} stem${uploaded === 1 ? "" : "s"}`);
    } else if (uploaded > 0) {
      setMessage(`Added ${uploaded} stem${uploaded === 1 ? "" : "s"} — ${remaining.length} still pending`);
    } else if (remaining.length > 0) {
      setMessage("");
    }
  }

  async function onPickFile(kind: TrackAssetKind, file: File | null) {
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!/\.(mp3|wav|aiff|aif)$/i.test(lower)) {
      setError(mp3OnlyErrorMessage());
      return;
    }
    await uploadAsset(kind, file);
  }

  function onDropFiles(kind: TrackAssetKind, files: FileList) {
    if (busyKind !== null || stemSubmitting) return;
    if (kind === "stem") {
      stageStemFiles(files);
      return;
    }
    const file = firstAudioFile(files);
    if (!file) {
      setError(mp3OnlyErrorMessage());
      return;
    }
    void onPickFile(kind, file);
  }

  async function onDelete(assetId: string) {
    setDeletingAssetId(assetId);
    setError("");
    setMessage("");
    try {
      const res = await fetch(
        `/api/tracks/${encodeURIComponent(trackId)}/assets?assetId=${encodeURIComponent(assetId)}`,
        { method: "DELETE" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Delete failed");
        return;
      }
      setMessage("File removed");
      await loadAssets();
    } catch {
      setError("Delete failed");
    } finally {
      setDeletingAssetId(null);
    }
  }

  const hasAssets = versions.length > 0 || stems.length > 0;

  if (!canEdit && !loading && !hasAssets) {
    return null;
  }

  return (
    <section className="mt-5 rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)]/40 p-3">
      <h3 className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--ink-dim)]">
        Audio files
      </h3>
      <p className="mt-1 text-xs text-[var(--ink-dim)]">
        {canEdit
          ? "Optional versions (normalized) and stems (as uploaded). Main mix is the catalog track."
          : "Alternate versions and stems for this track."}
      </p>

      {loading ? (
        <p className="mt-3 text-sm text-[var(--ink-muted)]">Loading…</p>
      ) : (
        <div className="mt-3 space-y-4">
          {canEdit && !hasAssets ? (
            <p className="text-sm text-[var(--ink-muted)]">No versions or stems yet.</p>
          ) : null}

          {versions.length > 0 ? (
            <div>
              <h4 className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
                Versions
              </h4>
              <ul className="mt-2 space-y-2">
                {versions.map((item) => (
                  <AssetRow
                    key={item.key}
                    item={item}
                    trackId={trackId}
                    trackTitle={trackTitle}
                    canEdit={canEdit}
                    current={current}
                    isPlaying={isPlaying}
                    deleting={deletingAssetId === item.assetId}
                    onPlay={handlePlay}
                    onDelete={onDelete}
                  />
                ))}
              </ul>
            </div>
          ) : null}

          {stems.length > 0 ? (
            <div>
              <h4 className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
                Stems
              </h4>
              <ul className="mt-2 space-y-2">
                {stems.map((item) => (
                  <AssetRow
                    key={item.key}
                    item={item}
                    trackId={trackId}
                    trackTitle={trackTitle}
                    canEdit={canEdit}
                    current={current}
                    isPlaying={isPlaying}
                    deleting={deletingAssetId === item.assetId}
                    onPlay={handlePlay}
                    onDelete={onDelete}
                  />
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}

      {canEdit ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div
            onDragEnter={(e) => {
              e.preventDefault();
              if (busyKind === null) setVersionDragOver(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (busyKind === null) setVersionDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setVersionDragOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setVersionDragOver(false);
              if (e.dataTransfer.files?.length) {
                onDropFiles("version", e.dataTransfer.files);
              }
            }}
            className={dropZoneClass(versionDragOver)}
          >
            <p className="text-xs font-medium text-[var(--ink)]">Add version</p>
            <p className="mt-0.5 text-[11px] text-[var(--ink-dim)]">
              Drop MP3, WAV, or AIFF — labeled Version1, Version2…
            </p>
            <input
              ref={versionInputRef}
              type="file"
              accept="audio/mpeg,audio/wav,audio/aiff,audio/x-aiff,.mp3,.wav,.aif,.aiff"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                e.target.value = "";
                void onPickFile("version", file);
              }}
            />
            <button
              type="button"
              disabled={busyKind !== null}
              onClick={() => versionInputRef.current?.click()}
              className="mt-2 rounded-md border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)] disabled:opacity-50"
            >
              {busyKind === "version" ? "Normalizing…" : "Browse file"}
            </button>
          </div>

          <div
            onDragEnter={(e) => {
              e.preventDefault();
              if (!stemBusy && busyKind === null) setStemDragOver(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (!stemBusy && busyKind === null) setStemDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setStemDragOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setStemDragOver(false);
              if (e.dataTransfer.files?.length) {
                onDropFiles("stem", e.dataTransfer.files);
              }
            }}
            className={dropZoneClass(stemDragOver)}
          >
            <p className="text-xs font-medium text-[var(--ink)]">Add stems</p>
            <p className="mt-0.5 text-[11px] text-[var(--ink-dim)]">
              Drop or browse multiple MP3, WAV, or AIFF files — name each stem, then submit
            </p>
            <input
              ref={stemInputRef}
              type="file"
              multiple
              accept="audio/mpeg,audio/wav,audio/aiff,audio/x-aiff,.mp3,.wav,.aif,.aiff"
              className="hidden"
              onChange={(e) => {
                const files = e.target.files;
                e.target.value = "";
                if (files?.length) stageStemFiles(files);
              }}
            />
            <button
              type="button"
              disabled={stemBusy || busyKind !== null}
              onClick={() => stemInputRef.current?.click()}
              className="mt-2 rounded-md border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)] disabled:opacity-50"
            >
              Browse files
            </button>

            {pendingStems.length > 0 ? (
              <div className="mt-3 space-y-2">
                <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--ink-dim)]">
                  Pending ({pendingStems.length})
                </p>
                <ul className="space-y-2">
                  {pendingStems.map((stem) => (
                    <li
                      key={stem.id}
                      className="rounded-md border border-[var(--line)] bg-[var(--bg)] p-2"
                    >
                      <div
                        className="truncate text-[11px] text-[var(--ink-dim)]"
                        title={stem.file.name}
                      >
                        {stem.file.name}
                      </div>
                      <div className="mt-1.5 flex gap-2">
                        <input
                          type="text"
                          value={stem.label}
                          onChange={(e) => updatePendingStem(stem.id, e.target.value)}
                          placeholder="Stem name, e.g. Strings"
                          disabled={stemSubmitting}
                          className="min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)] disabled:opacity-50"
                        />
                        <button
                          type="button"
                          disabled={stemSubmitting}
                          onClick={() => removePendingStem(stem.id)}
                          className="shrink-0 rounded-md border border-[var(--line)] px-2 py-1.5 text-[11px] text-[var(--ink-dim)] transition hover:border-red-400/50 hover:text-red-300 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    disabled={stemSubmitting}
                    onClick={() => void submitPendingStems()}
                    className="rounded-md border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-medium text-[var(--accent)] transition hover:brightness-110 disabled:opacity-50"
                  >
                    {stemSubmitting
                      ? "Uploading…"
                      : `Submit ${pendingStems.length} stem${pendingStems.length === 1 ? "" : "s"}`}
                  </button>
                  <button
                    type="button"
                    disabled={stemSubmitting}
                    onClick={() => setPendingStems([])}
                    className="rounded-md border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)] disabled:opacity-50"
                  >
                    Clear
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {message ? <p className="mt-3 text-xs text-[var(--available)]">{message}</p> : null}
      {error ? <p className="mt-3 text-xs text-red-300">{error}</p> : null}
    </section>
  );
}
