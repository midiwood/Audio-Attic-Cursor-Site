"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AudioWaveform } from "@/components/audio-waveform";
import {
  ComposerPicker,
  defaultComposerAssignment,
  type ComposerOption,
} from "@/components/composer-picker";
import { MetaSuggestInput } from "@/components/meta-suggest-input";
import { SharedTagPicker } from "@/components/shared-tag-picker";
import { TrackLicenseSection } from "@/components/track-license-section";
import { TrackLineageLinker } from "@/components/track-lineage-linker";
import { aiSuggestStatusMessage, fetchAiTrackSuggestion } from "@/lib/run-ai-suggest";
import type { CatalogMetaSuggestions } from "@/lib/queries";
import {
  canonicalizeLicense,
  normalizeLicenseStatus,
  formatDisplayTitle,
} from "@/lib/tracks";
import type { DerivedFromLink, TrackRelationView } from "@/lib/track-relations";
import type { TrackListItem } from "@/lib/track-list-item";
import type { ComposerAssignmentInput } from "@/lib/composer-types";
import type { CatalogVocabulary } from "@/lib/vocabulary";

const fieldClass =
  "w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]";

function splitTags(value: string | null | undefined) {
  return (value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function joinTags(tags: string[]) {
  return tags.join(", ");
}

function derivedFromFromRelations(relations: TrackRelationView[]): DerivedFromLink[] {
  return relations
    .filter((rel) => rel.direction === "from")
    .map((rel) => ({
      trackId: rel.neighbor.id,
      relation: rel.relation,
      note: rel.note,
    }));
}

export function EditTrackForm({
  track,
  vocabulary,
  metaSuggestions,
  composers,
  initialComposerAssignments = [],
  initialRelations = [],
  housePublisherName = "",
}: {
  track: TrackListItem;
  vocabulary: CatalogVocabulary;
  metaSuggestions?: CatalogMetaSuggestions;
  composers: ComposerOption[];
  initialComposerAssignments?: ComposerAssignmentInput[];
  initialRelations?: TrackRelationView[];
  housePublisherName?: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    libraryTitle: track.libraryTitle || "",
    workingTitle: track.workingTitle || "",
    description: track.description || "",
    notes: track.notes || "",
    client: track.client || "",
    project: track.project || "",
    year: track.year?.toString() || "",
    duration: track.duration || "",
    bpm: track.bpm?.toString() || "",
    musicalKey: track.musicalKey || "",
    publisher: track.publisher || "",
    samro: track.samro || "No",
    license: canonicalizeLicense(track.license),
  });
  const [composerAssignments, setComposerAssignments] = useState<ComposerAssignmentInput[]>(
    () =>
      initialComposerAssignments.length
        ? initialComposerAssignments
        : defaultComposerAssignment(composers, track.artist || "Richard Vossgatter"),
  );
  const [tags, setTags] = useState({
    genre: splitTags(track.genre),
    mood: splitTags(track.mood),
    instruments: splitTags(track.instruments),
    attributes: splitTags(track.attributes),
  });
  const [derivedFrom, setDerivedFrom] = useState<DerivedFromLink[]>(() =>
    derivedFromFromRelations(initialRelations),
  );
  const knownTitles = useMemo(() => {
    const map: Record<string, string> = {};
    for (const rel of initialRelations) {
      if (rel.direction !== "from") continue;
      map[rel.neighbor.id] = formatDisplayTitle(rel.neighbor);
    }
    return map;
  }, [initialRelations]);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [licenseHistoryKey, setLicenseHistoryKey] = useState(0);

  const working = busy || aiBusy;
  const vaultAudioLink = (track.dropboxLink || "").trim();
  const previewUrl = useMemo(() => {
    if (!vaultAudioLink) return "";
    return `/api/audio/preview?url=${encodeURIComponent(vaultAudioLink)}`;
  }, [vaultAudioLink]);

  function patchForm(patch: Partial<typeof form>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  async function runAi() {
    setAiBusy(true);
    setError("");
    setMessage("AI analyzing audio…");

    const result = await fetchAiTrackSuggestion({
      dropboxLink: vaultAudioLink,
      title: form.workingTitle || form.libraryTitle,
      client: form.client,
      license: form.license,
    });

    setAiBusy(false);

    if (!result.ok) {
      setError(result.error);
      setMessage("");
      return;
    }

    const { suggestion } = result;
    const allowTitle =
      suggestion.allowAiLibraryTitle || normalizeLicenseStatus(form.license) !== "exclusive";

    setForm((prev) => ({
      ...prev,
      libraryTitle: allowTitle
        ? suggestion.libraryTitle || prev.libraryTitle
        : prev.libraryTitle || prev.workingTitle,
      description: suggestion.description || prev.description,
      bpm: suggestion.bpm || prev.bpm,
      musicalKey: suggestion.musicalKey || prev.musicalKey,
    }));
    setTags({
      genre: splitTags(suggestion.genre),
      mood: splitTags(suggestion.mood),
      instruments: splitTags(suggestion.instruments),
      attributes: splitTags(suggestion.attributes),
    });
    setMessage(aiSuggestStatusMessage(suggestion));
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    const res = await fetch(`/api/tracks/${encodeURIComponent(track.id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        libraryTitle: form.libraryTitle,
        workingTitle: form.workingTitle,
        description: form.description,
        notes: form.notes,
        client: form.client,
        project: form.project,
        year: form.year,
        duration: form.duration,
        bpm: form.bpm,
        musicalKey: form.musicalKey,
        composers: composerAssignments,
        publisher: form.publisher,
        samro: form.samro,
        license: form.license,
        genre: joinTags(tags.genre),
        mood: joinTags(tags.mood),
        instruments: joinTags(tags.instruments),
        attributes: joinTags(tags.attributes),
        derivedFrom,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok) {
      setError(data.error || "Save failed");
      return;
    }

    if (Array.isArray(data.relations)) {
      setDerivedFrom(derivedFromFromRelations(data.relations));
    }
    setMessage("Saved");
    router.refresh();
  }

  return (
    <form onSubmit={onSave} className="mx-auto max-w-3xl space-y-4">
      <section className="space-y-3 rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)]/60 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--ink-dim)]">
              Editing {track.id}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-[var(--ink)]">
              {form.libraryTitle || form.workingTitle || track.id}
            </h2>
          </div>
          <Link
            href="/"
            className="text-[11px] text-[var(--ink-dim)] transition hover:text-[var(--ink)]"
          >
            ← Catalog
          </Link>
        </div>

        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
            Library title
          </span>
          <input
            className={fieldClass}
            value={form.libraryTitle}
            onChange={(e) => patchForm({ libraryTitle: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
            Working title <span className="normal-case tracking-normal opacity-70">file name</span>
          </span>
          <input
            className={fieldClass}
            value={form.workingTitle}
            onChange={(e) => patchForm({ workingTitle: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
            Description
          </span>
          <textarea
            className={`${fieldClass} min-h-[72px] resize-y`}
            value={form.description}
            onChange={(e) => patchForm({ description: e.target.value })}
          />
        </label>

        {previewUrl ? (
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border text-xs transition ${
                playing
                  ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                  : "border-[var(--line)] text-[var(--ink)] hover:border-[var(--accent)]"
              }`}
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? "❚❚" : "▶"}
            </button>
            <div className="min-w-0 flex-1">
              <AudioWaveform
                url={previewUrl}
                trackId={track.id}
                playing={playing}
                onPlayingChange={setPlaying}
                onDuration={(_seconds, formatted) => {
                  if (!form.duration) patchForm({ duration: formatted });
                }}
              />
            </div>
          </div>
        ) : null}
      </section>

      <TrackLineageLinker
        excludeTrackId={track.id}
        value={derivedFrom}
        onChange={setDerivedFrom}
        knownTitles={knownTitles}
      />

      <section className="space-y-3 rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)]/60 p-4">
        <h3 className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
          Settings & tags
        </h3>

        <div className="grid gap-2 sm:grid-cols-2">
          <label>
            <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
              Client
            </span>
            <MetaSuggestInput
              value={form.client}
              onChange={(client) => patchForm({ client })}
              suggestions={metaSuggestions?.clients || []}
              placeholder="Optional"
            />
          </label>
          <label>
            <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
              Project
            </span>
            <MetaSuggestInput
              value={form.project}
              onChange={(project) => patchForm({ project })}
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
              value={form.year}
              onChange={(e) => patchForm({ year: e.target.value })}
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
              value={form.publisher}
              onChange={(publisher) => patchForm({ publisher })}
              suggestions={metaSuggestions?.publishers || []}
            />
          </label>
          <label>
            <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
              BPM <span className="normal-case tracking-normal text-[var(--accent)]">AI</span>
            </span>
            <input
              className={fieldClass}
              value={form.bpm}
              onChange={(e) => patchForm({ bpm: e.target.value.replace(/[^\d]/g, "") })}
              placeholder="e.g. 92"
              inputMode="numeric"
            />
          </label>
          <label>
            <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
              Key <span className="normal-case tracking-normal text-[var(--accent)]">AI</span>
            </span>
            <input
              className={fieldClass}
              value={form.musicalKey}
              onChange={(e) => patchForm({ musicalKey: e.target.value })}
              placeholder="e.g. Am, C#m, F"
            />
          </label>
          <label>
            <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
              Duration <span className="normal-case tracking-normal opacity-70">auto from audio</span>
            </span>
            <input
              className={fieldClass}
              value={form.duration}
              onChange={(e) => patchForm({ duration: e.target.value })}
              placeholder="e.g. 0:42"
            />
          </label>
          <label>
            <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
              SAMRO
            </span>
            <select
              className={fieldClass}
              value={form.samro}
              onChange={(e) => patchForm({ samro: e.target.value })}
            >
              <option value="No">Not submitted</option>
              <option value="Yes">Submitted</option>
            </select>
          </label>

          <TrackLicenseSection
            license={form.license}
            onLicenseChange={(license) => patchForm({ license })}
            publisher={form.publisher}
            housePublisherName={housePublisherName}
            metaSuggestions={metaSuggestions}
            trackId={track.id}
            licenseHistoryKey={licenseHistoryKey}
            onLicenseAdded={() => setLicenseHistoryKey((k) => k + 1)}
            clientPrefill={form.client}
            projectPrefill={form.project}
          />
        </div>

        <div className="rounded-md border border-[var(--line)] bg-[var(--bg)]/40 p-2.5">
          <SharedTagPicker
            vocabulary={vocabulary}
            genre={tags.genre}
            mood={tags.mood}
            instruments={tags.instruments}
            attributes={tags.attributes}
            onChange={(patch) => setTags((prev) => ({ ...prev, ...patch }))}
          />
        </div>

        <div className="space-y-2 rounded-md border border-[var(--line)] bg-[var(--bg)]/40 p-3">
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
              Notes
            </span>
            <textarea
              className={`${fieldClass} min-h-[64px] resize-y`}
              value={form.notes}
              onChange={(e) => patchForm({ notes: e.target.value })}
              placeholder="Techniques, production details — searchable in Browse"
              disabled={working}
            />
          </label>
          <button
            type="button"
            disabled={working || !vaultAudioLink}
            onClick={() => void runAi()}
            className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--ink)] transition hover:border-[var(--accent)] disabled:opacity-50"
            title={!vaultAudioLink ? "Vault audio not available" : undefined}
          >
            {aiBusy ? "AI analyzing…" : "Re-run AI"}
          </button>
        </div>
      </section>

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs">
          {error ? <span className="text-[var(--exclusive)]">{error}</span> : null}
          {message ? <span className="text-[var(--available)]">{message}</span> : null}
        </div>
        <div className="flex gap-2">
          <a
            href="/admin"
            className="rounded-md border border-[var(--line)] px-4 py-2 text-sm text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)]"
          >
            Upload
          </a>
          <button
            type="submit"
            disabled={working}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white shadow-lg transition hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </form>
  );
}
