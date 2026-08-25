"use client";

import { useEffect, useMemo, useState } from "react";
import { AudioWaveform } from "@/components/audio-waveform";
import type { CatalogVocabulary } from "@/lib/vocabulary";

export type ReviewDraft = {
  dropboxLink: string;
  workingTitle: string;
  libraryTitle: string;
  description: string;
  genre: string;
  mood: string;
  instruments: string;
  attributes: string;
  bpm: string;
  duration: string;
  localPreviewUrl?: string;
};

function splitTags(value: string) {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function joinTags(tags: string[]) {
  return tags.join(", ");
}

function TagRow({
  label,
  tone,
  tags,
  options,
  onChange,
}: {
  label: string;
  tone: "genre" | "mood" | "instrument" | "usage";
  tags: string[];
  options: string[];
  onChange: (tags: string[]) => void;
}) {
  const available = useMemo(
    () => options.filter((option) => !tags.includes(option)),
    [options, tags],
  );

  const toneClass =
    tone === "genre"
      ? "bg-[rgba(99,102,241,0.22)] text-[#c7d2fe] border-[rgba(99,102,241,0.35)]"
      : tone === "mood"
        ? "bg-[rgba(236,72,153,0.18)] text-[#f9a8d4] border-[rgba(236,72,153,0.3)]"
        : tone === "instrument"
          ? "bg-[rgba(59,130,246,0.18)] text-[#93c5fd] border-[rgba(59,130,246,0.3)]"
          : "bg-[rgba(34,197,94,0.16)] text-[#86efac] border-[rgba(34,197,94,0.28)]";

  return (
    <div className="flex min-w-0 items-start gap-2">
      <div className="w-20 shrink-0 pt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--ink-dim)]">
        {label}
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <button
            key={`${label}-${tag}`}
            type="button"
            onClick={() => onChange(tags.filter((item) => item !== tag))}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-normal leading-none transition hover:brightness-110 ${toneClass}`}
            title="Remove"
          >
            {tag} ×
          </button>
        ))}
        {available.length ? (
          <select
            value=""
            onChange={(e) => {
              const next = e.target.value;
              if (!next || tags.includes(next)) return;
              onChange([...tags, next]);
            }}
            className="rounded-full border border-[var(--line)] bg-transparent px-2.5 py-1 text-[11px] leading-none text-[var(--ink-dim)] outline-none focus:border-[var(--accent)]"
            aria-label={`Add ${label.toLowerCase()}`}
          >
            <option value="">Add…</option>
            {available.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : null}
      </div>
    </div>
  );
}

export function ReviewTrackCard({
  track,
  index,
  vocabulary,
  allowAiLibraryTitle = true,
  isPlaying,
  onTogglePlay,
  onRemove,
  onChange,
}: {
  track: ReviewDraft;
  index: number;
  vocabulary: CatalogVocabulary;
  allowAiLibraryTitle?: boolean;
  isPlaying: boolean;
  /** @deprecated WaveSurfer shows its own progress */
  progress?: number;
  currentTimeLabel?: string;
  onTogglePlay: () => void;
  onRemove: () => void;
  onChange: (patch: Partial<ReviewDraft>) => void;
}) {
  const [tagsOpen, setTagsOpen] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [libraryTitle, setLibraryTitle] = useState(track.libraryTitle);
  const [workingTitle, setWorkingTitle] = useState(track.workingTitle);

  useEffect(() => {
    setLibraryTitle(track.libraryTitle);
  }, [track.libraryTitle]);

  useEffect(() => {
    setWorkingTitle(track.workingTitle);
  }, [track.workingTitle]);

  const previewUrl =
    track.localPreviewUrl ||
    (track.dropboxLink ? `/api/audio/preview?url=${encodeURIComponent(track.dropboxLink)}` : "");

  return (
    <article className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)]/80">
      <div className="flex items-start gap-3 px-3 py-2.5">
        <button
          type="button"
          onClick={onTogglePlay}
          disabled={!previewUrl}
          className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[var(--line)] text-xs text-[var(--ink)] transition hover:border-[var(--accent)] disabled:opacity-40"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? "❚❚" : "▶"}
        </button>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start gap-2">
            <label className="min-w-0 flex-1">
              <span className="mb-0.5 block text-[10px] uppercase tracking-[0.1em] text-[var(--ink-dim)]">
                Library title
                {allowAiLibraryTitle ? (
                  <span className="ml-1.5 normal-case tracking-normal text-[var(--accent)]">AI</span>
                ) : (
                  <span className="ml-1.5 normal-case tracking-normal text-[var(--ink-dim)]">
                    exclusive — source naming
                  </span>
                )}
              </span>
              <input
                value={libraryTitle}
                onChange={(e) => setLibraryTitle(e.target.value)}
                onBlur={() =>
                  onChange({ libraryTitle: libraryTitle.trim() || track.libraryTitle || track.workingTitle })
                }
                className="w-full truncate bg-transparent text-sm font-medium text-[var(--ink)] outline-none"
                placeholder="Library title"
              />
            </label>
            <button
              type="button"
              onClick={onRemove}
              className="shrink-0 px-1 text-sm text-[var(--ink-dim)] hover:text-[var(--exclusive)]"
              aria-label="Remove"
            >
              ×
            </button>
          </div>

          <label className="block">
            <span className="mb-0.5 block text-[10px] uppercase tracking-[0.1em] text-[var(--ink-dim)]">
              Working title
            </span>
            <input
              value={workingTitle}
              onChange={(e) => setWorkingTitle(e.target.value)}
              onBlur={() => onChange({ workingTitle: workingTitle.trim() || track.workingTitle })}
              className="w-full truncate bg-transparent text-xs text-[var(--ink-muted)] outline-none"
              placeholder="Working / source title"
            />
          </label>

          <div className="text-[11px] text-[var(--ink-dim)]">
            {[track.duration, track.bpm ? `${track.bpm} BPM` : ""].filter(Boolean).join(" · ") ||
              `track ${index + 1}`}
          </div>

          {previewUrl ? (
            <AudioWaveform
              url={previewUrl}
              playing={isPlaying}
              onPlayingChange={(next) => {
                if (next !== isPlaying) onTogglePlay();
              }}
            />
          ) : null}
        </div>
      </div>

      <div className="border-t border-[var(--line)] px-3 py-2">
        <button
          type="button"
          onClick={() => setTagsOpen((open) => !open)}
          className="flex w-full items-center gap-1.5 text-left text-[11px] font-medium text-[var(--ink-muted)]"
        >
          <span>{tagsOpen ? "▾" : "▸"}</span>
          Tags
        </button>

        {tagsOpen ? (
          <div className="mt-2 space-y-1.5">
            <TagRow
              label="Genre"
              tone="genre"
              tags={splitTags(track.genre)}
              options={vocabulary.genres}
              onChange={(tags) => onChange({ genre: joinTags(tags) })}
            />
            <TagRow
              label="Mood"
              tone="mood"
              tags={splitTags(track.mood)}
              options={vocabulary.moods}
              onChange={(tags) => onChange({ mood: joinTags(tags) })}
            />
            <TagRow
              label="Instr."
              tone="instrument"
              tags={splitTags(track.instruments)}
              options={vocabulary.instruments}
              onChange={(tags) => onChange({ instruments: joinTags(tags) })}
            />
            <TagRow
              label="Usage"
              tone="usage"
              tags={splitTags(track.attributes)}
              options={vocabulary.attributes}
              onChange={(tags) => onChange({ attributes: joinTags(tags) })}
            />
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setDetailsOpen((open) => !open)}
          className="mt-2 text-[11px] text-[var(--accent)]"
        >
          {detailsOpen ? "Hide details" : "Details"}
        </button>

        {detailsOpen ? (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="mb-0.5 block text-[10px] uppercase tracking-[0.1em] text-[var(--ink-dim)]">
                Dropbox link
              </span>
              <input
                value={track.dropboxLink}
                onChange={(e) => onChange({ dropboxLink: e.target.value })}
                className="w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1 text-xs text-[var(--ink)] outline-none focus:border-[var(--accent)]"
              />
            </label>
            <label>
              <span className="mb-0.5 block text-[10px] uppercase tracking-[0.1em] text-[var(--ink-dim)]">
                Duration
              </span>
              <input
                value={track.duration}
                onChange={(e) => onChange({ duration: e.target.value })}
                placeholder="3:04"
                className="w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1 text-xs text-[var(--ink)] outline-none focus:border-[var(--accent)]"
              />
            </label>
            <label>
              <span className="mb-0.5 block text-[10px] uppercase tracking-[0.1em] text-[var(--ink-dim)]">
                BPM
              </span>
              <input
                value={track.bpm}
                onChange={(e) => onChange({ bpm: e.target.value })}
                className="w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1 text-xs text-[var(--ink)] outline-none focus:border-[var(--accent)]"
              />
            </label>
            <label className="sm:col-span-2">
              <span className="mb-0.5 block text-[10px] uppercase tracking-[0.1em] text-[var(--ink-dim)]">
                Description
              </span>
              <textarea
                value={track.description}
                onChange={(e) => onChange({ description: e.target.value })}
                className="min-h-14 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1 text-xs text-[var(--ink)] outline-none focus:border-[var(--accent)]"
              />
            </label>
          </div>
        ) : null}
      </div>
    </article>
  );
}
