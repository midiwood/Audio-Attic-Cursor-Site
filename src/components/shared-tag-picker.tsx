"use client";

import { useMemo } from "react";
import { TAG_TONE_PILL, type TagTone } from "@/lib/tag-tones";

function TagRow({
  label,
  tone,
  tags,
  options,
  onChange,
}: {
  label: string;
  tone: TagTone;
  tags: string[];
  options: string[];
  onChange: (tags: string[]) => void;
}) {
  const available = useMemo(
    () => options.filter((option) => !tags.includes(option)),
    [options, tags],
  );

  const toneClass = TAG_TONE_PILL[tone];

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
            className={`rounded-full border bg-transparent px-2.5 py-1 text-[11px] leading-none text-[var(--ink-dim)] outline-none ${toneClass}`}
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

export function SharedTagPicker({
  vocabulary,
  genre,
  mood,
  instruments,
  attributes,
  onChange,
}: {
  vocabulary: {
    genres: string[];
    moods: string[];
    instruments: string[];
    attributes: string[];
  };
  genre: string[];
  mood: string[];
  instruments: string[];
  attributes: string[];
  onChange: (patch: {
    genre?: string[];
    mood?: string[];
    instruments?: string[];
    attributes?: string[];
  }) => void;
}) {
  return (
    <div className="space-y-2">
      <TagRow
        label="Genre"
        tone="genre"
        tags={genre}
        options={vocabulary.genres}
        onChange={(tags) => onChange({ genre: tags })}
      />
      <TagRow
        label="Mood"
        tone="mood"
        tags={mood}
        options={vocabulary.moods}
        onChange={(tags) => onChange({ mood: tags })}
      />
      <TagRow
        label="Instruments"
        tone="instrument"
        tags={instruments}
        options={vocabulary.instruments}
        onChange={(tags) => onChange({ instruments: tags })}
      />
      <TagRow
        label="Usage"
        tone="usage"
        tags={attributes}
        options={vocabulary.attributes}
        onChange={(tags) => onChange({ attributes: tags })}
      />
    </div>
  );
}
