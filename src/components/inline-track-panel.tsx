"use client";

import type { ReactNode } from "react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { LicenseBadge } from "@/components/license-badge";
import { LicenseIconButton } from "@/components/license-panel";
import { TrackLicenseHistory } from "@/components/track-license-history";
import { TrackLicenseSection } from "@/components/track-license-section";
import { MetaSuggestInput } from "@/components/meta-suggest-input";
import {
  ComposerPicker,
  defaultComposerAssignment,
  type ComposerOption,
} from "@/components/composer-picker";
import { SharedTagPicker } from "@/components/shared-tag-picker";
import { TrackLineageLinker } from "@/components/track-lineage-linker";
import { TrackAssetsPanel } from "@/components/track-assets-panel";
import { usePlayer, type PlayerTrack } from "@/components/player-provider";
import {
  audioFileTypeFromUrls,
  canonicalizeLicense,
  formatDisplayTitle,
  normalizeLicenseStatus,
  splitTags,
} from "@/lib/tracks";
import { aiSuggestStatusMessage, fetchAiTrackSuggestion } from "@/lib/run-ai-suggest";
import type { CatalogMetaSuggestions } from "@/lib/queries";
import type { UserTrackLicenseStatus } from "@/lib/license-requests";
import { isSamroSubmitted } from "@/lib/samro";
import { TAG_TONE_LABEL, TAG_TONE_PILL, type TagTone } from "@/lib/tag-tones";
import { toTrackListItem, type TrackListItem } from "@/lib/track-list-item";
import {
  relationLabel,
  type DerivedFromLink,
  type TrackRelationView,
} from "@/lib/track-relations";
import type { ComposerAssignmentInput } from "@/lib/composer-types";
import type { CatalogVocabulary } from "@/lib/vocabulary";
import type { Track } from "@/db/schema";

const fieldClass =
  "w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]";

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

function playButtonClass(active: boolean, playing: boolean) {
  if (active && playing) {
    return "border-[var(--accent)] bg-[var(--accent)] text-white shadow-[0_0_0_3px_var(--accent-soft)]";
  }
  if (active) {
    return "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink)]";
  }
  return "border-[var(--line)] text-[var(--ink)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]";
}

function neighborPlayerTrack(rel: TrackRelationView): PlayerTrack {
  const n = rel.neighbor;
  return {
    id: n.id,
    title: formatDisplayTitle(n),
    subtitle: n.year ? String(n.year) : null,
    duration: n.duration,
    dropboxDl: n.dropboxDl,
    license: n.license,
  };
}

function TagPillsReadOnly({
  label,
  tone,
  value,
}: {
  label: string;
  tone: TagTone;
  value: string | null | undefined;
}) {
  const tags = splitTags(value);
  return (
    <div>
      <p
        className={`text-[10px] font-medium uppercase tracking-[0.12em] ${TAG_TONE_LABEL[tone]}`}
      >
        {label}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {tags.length ? (
          tags.map((tag) => (
            <span
              key={`${label}-${tag}`}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-normal leading-none ${TAG_TONE_PILL[tone]}`}
            >
              {tag}
            </span>
          ))
        ) : (
          <span className="text-xs text-[var(--ink-dim)]">—</span>
        )}
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-[0.14em] text-[var(--ink-dim)]">{label}</dt>
      <dd className="mt-0.5 truncate text-sm text-[var(--ink)]" title={typeof value === "string" ? value : undefined}>
        {value || <span className="text-[var(--ink-dim)]">—</span>}
      </dd>
    </div>
  );
}

/** Nested track info for a lineage neighbor — stays inside the current panel. */
function LineageNeighborDetail({ trackId }: { trackId: string }) {
  const [item, setItem] = useState<TrackListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void (async () => {
      const res = await fetch(`/api/tracks/${encodeURIComponent(trackId)}`);
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;
      setLoading(false);
      if (!res.ok || !data.track) {
        setError(data.error || "Could not load track");
        return;
      }
      setItem(toTrackListItem(data.track as Track));
    })();
    return () => {
      cancelled = true;
    };
  }, [trackId]);

  if (loading) {
    return <p className="px-2.5 py-3 text-xs text-[var(--ink-dim)]">Loading track info…</p>;
  }
  if (error || !item) {
    return <p className="px-2.5 py-3 text-xs text-[var(--exclusive)]">{error || "Not found"}</p>;
  }

  const meta: Array<{ label: string; value: ReactNode }> = [
    { label: "ID", value: item.id },
    { label: "Working title", value: item.workingTitle },
    { label: "Client", value: item.client },
    { label: "Project", value: item.project },
    { label: "Year", value: item.year?.toString() },
    { label: "Duration", value: item.duration },
    {
      label: "File type",
      value: audioFileTypeFromUrls(item.dropboxLink, item.dropboxDl),
    },
    { label: "BPM", value: item.bpm?.toString() },
    { label: "Key", value: item.musicalKey },
    { label: "Artist", value: item.artist },
    { label: "Publisher", value: item.publisher },
    { label: "License", value: <LicenseBadge license={item.license} /> },
  ];

  return (
    <div className="border-t border-[var(--line)] bg-[rgba(0,0,0,0.25)] px-2.5 py-3">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="space-y-3">
          <TagPillsReadOnly label="Genre" tone="genre" value={item.genre} />
          <TagPillsReadOnly label="Mood" tone="mood" value={item.mood} />
          <TagPillsReadOnly label="Instruments" tone="instrument" value={item.instruments} />
          <TagPillsReadOnly label="Usage" tone="usage" value={item.attributes} />
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
              Description
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--ink-muted)]">
              {item.description || "No description provided."}
            </p>
          </div>
        </div>
        <dl className="grid gap-2 content-start sm:grid-cols-2">
          {meta.map((row) => (
            <MetaRow key={row.label} label={row.label} value={row.value} />
          ))}
        </dl>
      </div>
      {item.dropboxLink ? (
        <div className="mt-3 flex flex-wrap gap-3">
          <a
            href={item.dropboxLink}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-[var(--ink-dim)] transition hover:text-[var(--accent)]"
          >
            Open in Dropbox →
          </a>
          {item.sourceFolderLink ? (
            <a
              href={item.sourceFolderLink}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-[var(--ink-dim)] transition hover:text-[var(--accent)]"
              title={item.sourceDropboxPath || undefined}
            >
              Original folder →
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function InlineTrackPanel({
  track,
  lineage = [],
  canEdit = false,
  vocabulary,
  metaSuggestions,
  composers = [],
  housePublisherName = "",
  licenseEntryCount = 0,
  licenseHistoryKey = 0,
  onOpenLicensing,
  onLicenseCountChange,
  subscriberView = false,
  userLicenseStatus = null,
  onSaved,
  onTrashed,
}: {
  track: TrackListItem;
  lineage?: TrackRelationView[];
  canEdit?: boolean;
  vocabulary?: CatalogVocabulary;
  metaSuggestions?: CatalogMetaSuggestions;
  composers?: ComposerOption[];
  housePublisherName?: string;
  licenseEntryCount?: number;
  licenseHistoryKey?: number;
  /** Subscribers only — open request / view panel. */
  onOpenLicensing?: () => void;
  onLicenseCountChange?: (count: number) => void;
  subscriberView?: boolean;
  userLicenseStatus?: UserTrackLicenseStatus | null;
  onSaved?: (track: TrackListItem, relations: TrackRelationView[]) => void;
  onTrashed?: (trackId: string) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing && canEdit && vocabulary && !subscriberView) {
    return (
      <InlineTrackEditor
        track={track}
        initialRelations={lineage}
        vocabulary={vocabulary}
        metaSuggestions={metaSuggestions}
        composers={composers}
        housePublisherName={housePublisherName}
        licenseHistoryKey={licenseHistoryKey}
        onLicenseCountChange={onLicenseCountChange}
        onCancel={() => setEditing(false)}
        onSaved={(nextTrack, relations) => {
          onSaved?.(nextTrack, relations);
          setEditing(false);
        }}
        onTrashed={(trackId) => {
          onTrashed?.(trackId);
          setEditing(false);
        }}
      />
    );
  }

  return (
    <InlineTrackView
      track={track}
      lineage={subscriberView ? [] : lineage}
      canEdit={canEdit && Boolean(vocabulary) && !subscriberView}
      subscriberView={subscriberView}
      licenseEntryCount={licenseEntryCount}
      licenseHistoryKey={licenseHistoryKey}
      onOpenLicensing={subscriberView ? onOpenLicensing : undefined}
      onLicenseCountChange={onLicenseCountChange}
      userLicenseStatus={userLicenseStatus}
      onEdit={() => setEditing(true)}
    />
  );
}

function InlineTrackView({
  track,
  lineage,
  canEdit,
  subscriberView,
  licenseEntryCount = 0,
  licenseHistoryKey = 0,
  onOpenLicensing,
  onLicenseCountChange,
  userLicenseStatus = null,
  onEdit,
}: {
  track: TrackListItem;
  lineage: TrackRelationView[];
  canEdit: boolean;
  subscriberView: boolean;
  licenseEntryCount?: number;
  licenseHistoryKey?: number;
  onOpenLicensing?: () => void;
  onLicenseCountChange?: (count: number) => void;
  userLicenseStatus?: UserTrackLicenseStatus | null;
  onEdit: () => void;
}) {
  const { playTrack, current, isPlaying } = usePlayer();
  const [openLineageId, setOpenLineageId] = useState<string | null>(null);
  const lineageQueue = useMemo(
    () => lineage.filter((rel) => rel.neighbor.dropboxDl).map(neighborPlayerTrack),
    [lineage],
  );

  const meta: Array<{ label: string; value: ReactNode }> = subscriberView
    ? [
        { label: "Library title", value: track.libraryTitle },
        { label: "Duration", value: track.duration },
        {
          label: "File type",
          value: audioFileTypeFromUrls(track.dropboxLink, track.dropboxDl),
        },
        { label: "BPM", value: track.bpm?.toString() },
        { label: "Key", value: track.musicalKey },
      ]
    : [
        { label: "ID", value: track.id },
        { label: "Library title", value: track.libraryTitle },
        { label: "Working title", value: track.workingTitle },
        { label: "Client", value: track.client },
        { label: "Project", value: track.project },
        { label: "Artist", value: track.artist },
        { label: "Publisher", value: track.publisher },
        { label: "Year", value: track.year?.toString() },
        { label: "Duration", value: track.duration },
        {
          label: "File type",
          value: audioFileTypeFromUrls(track.dropboxLink, track.dropboxDl),
        },
        { label: "BPM", value: track.bpm?.toString() },
        { label: "Key", value: track.musicalKey },
        { label: "SAMRO", value: isSamroSubmitted(track.samro) ? "Submitted" : "Not submitted" },
        { label: "License", value: <LicenseBadge license={track.license} /> },
      ];

  return (
    <div className="border-t border-[var(--line)] bg-[rgba(8,14,24,0.55)] px-4 py-4 xl:px-5">
      {subscriberView ? (
        <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
          {onOpenLicensing ? (
            <LicenseIconButton
              userStatus={userLicenseStatus?.status}
              onClick={onOpenLicensing}
              title="License"
            />
          ) : null}
        </div>
      ) : (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <LicenseBadge license={track.license} />
            {licenseEntryCount > 0 ? (
              <span className="text-[11px] tabular-nums text-[var(--ink-dim)]">
                {licenseEntryCount} license{licenseEntryCount === 1 ? "" : "s"}
              </span>
            ) : null}
            {track.dropboxLink ? (
              <a
                href={track.dropboxLink}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)]"
              >
                Open in Dropbox
              </a>
            ) : null}
            {track.sourceFolderLink ? (
              <a
                href={track.sourceFolderLink}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)]"
                title={track.sourceDropboxPath || undefined}
              >
                Original folder
              </a>
            ) : null}
          </div>
          {canEdit ? (
            <button
              type="button"
              onClick={onEdit}
              className="rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-medium text-[var(--accent)] transition hover:brightness-110"
            >
              Edit
            </button>
          ) : null}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        {/* Left: tags */}
        <div className="space-y-4">
          <TagPillsReadOnly label="Genre" tone="genre" value={track.genre} />
          <TagPillsReadOnly label="Mood" tone="mood" value={track.mood} />
          <TagPillsReadOnly label="Instruments" tone="instrument" value={track.instruments} />
          <TagPillsReadOnly label="Usage" tone="usage" value={track.attributes} />

          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--ink-dim)]">
              Description
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--ink-muted)]">
              {track.description || "No description provided."}
            </p>
          </div>

          {!subscriberView && track.notes?.trim() ? (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--ink-dim)]">
                Notes
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--ink-muted)] whitespace-pre-wrap">
                {track.notes}
              </p>
            </div>
          ) : null}

        </div>

        {/* Right: track data */}
        <dl className="grid gap-2.5 content-start sm:grid-cols-2">
          {meta.map((item) => (
            <MetaRow key={item.label} label={item.label} value={item.value} />
          ))}
        </dl>
      </div>

      <TrackAssetsPanel
        trackId={track.id}
        trackTitle={formatDisplayTitle(track)}
        canEdit={false}
      />

      {!subscriberView && lineage.length ? (
        <section className="mt-5 rounded-lg border border-[var(--accent)]/35 bg-[var(--accent-soft)]/40 p-3">
          <h3 className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--accent)]">
            Lineage · {lineage.length} link{lineage.length === 1 ? "" : "s"}
          </h3>
          <ul className="mt-2 space-y-2">
            {lineage.map((rel) => {
              const title = formatDisplayTitle(rel.neighbor);
              const canPlay = Boolean(rel.neighbor.dropboxDl);
              const active = current?.id === rel.neighbor.id;
              const detailOpen = openLineageId === rel.id;
              return (
                <li
                  key={rel.id}
                  className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--bg)]"
                >
                  <div className="flex items-center gap-2 px-2.5 py-2">
                    <button
                      type="button"
                      disabled={!canPlay}
                      onClick={() => {
                        if (!canPlay) return;
                        playTrack(neighborPlayerTrack(rel), lineageQueue);
                      }}
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border text-[10px] transition disabled:cursor-not-allowed disabled:opacity-30 ${playButtonClass(active, isPlaying)}`}
                      aria-label={
                        active && isPlaying ? `Pause ${title}` : `Play ${title}`
                      }
                    >
                      {active && isPlaying ? "❚❚" : "▶"}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--accent)]">
                        {relationLabel(rel.relation, rel.direction)}
                      </div>
                      <div
                        className="truncate text-sm font-medium text-[var(--ink)]"
                        title={title}
                      >
                        {title}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--ink-dim)]">
                        <span>{rel.neighbor.id}</span>
                        {rel.neighbor.year ? <span>· {rel.neighbor.year}</span> : null}
                        {rel.note ? <span>· {rel.note}</span> : null}
                      </div>
                    </div>
                    <LicenseBadge license={rel.neighbor.license} />
                    <button
                      type="button"
                      onClick={() =>
                        setOpenLineageId((prev) => (prev === rel.id ? null : rel.id))
                      }
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border text-xs transition ${
                        detailOpen
                          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                          : "border-[var(--line)] text-[var(--ink-dim)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                      }`}
                      aria-expanded={detailOpen}
                      aria-label={
                        detailOpen ? `Hide info for ${title}` : `Show info for ${title}`
                      }
                      title={detailOpen ? "Hide info" : "Track info"}
                    >
                      {detailOpen ? "▴" : "▾"}
                    </button>
                  </div>
                  {detailOpen ? <LineageNeighborDetail trackId={rel.neighbor.id} /> : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {!subscriberView && normalizeLicenseStatus(track.license) !== "clear" ? (
        <TrackLicenseHistory
          trackId={track.id}
          refreshKey={licenseHistoryKey}
          onCountChange={onLicenseCountChange}
          readOnly
        />
      ) : null}
    </div>
  );
}

function InlineTrackEditor({
  track,
  initialRelations,
  vocabulary,
  metaSuggestions,
  composers,
  housePublisherName = "",
  licenseHistoryKey = 0,
  onLicenseCountChange,
  onCancel,
  onSaved,
  onTrashed,
}: {
  track: TrackListItem;
  initialRelations: TrackRelationView[];
  vocabulary: CatalogVocabulary;
  metaSuggestions?: CatalogMetaSuggestions;
  composers: ComposerOption[];
  housePublisherName?: string;
  licenseHistoryKey?: number;
  onLicenseCountChange?: (count: number) => void;
  onCancel: () => void;
  onSaved: (track: TrackListItem, relations: TrackRelationView[]) => void;
  onTrashed: (trackId: string) => void;
}) {
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
  const [composerAssignments, setComposerAssignments] = useState<ComposerAssignmentInput[]>(() =>
    defaultComposerAssignment(composers, track.artist || "Richard Vossgatter"),
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
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [localLicenseKey, setLocalLicenseKey] = useState(0);

  const working = busy || aiBusy;
  const historyKey = licenseHistoryKey + localLicenseKey;
  const vaultAudioLink = (track.dropboxLink || "").trim();

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/tracks/${encodeURIComponent(track.id)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const assignments = Array.isArray(data.composerAssignments)
          ? data.composerAssignments
          : [];
        if (assignments.length) {
          setComposerAssignments(assignments);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [track.id]);

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

  async function onTrash() {
    if (
      !confirm(
        `Move “${formatDisplayTitle(track)}” to Trash?\n\nIt will leave the catalog and sit in Trash until you permanently delete it.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    const res = await fetch("/api/trash", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "trash", trackId: track.id }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Could not move to Trash");
      return;
    }
    onTrashed(track.id);
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
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      track?: Track;
      relations?: TrackRelationView[];
    };
    setBusy(false);

    if (!res.ok || !data.track) {
      setError(data.error || "Save failed");
      return;
    }

    onSaved(toTrackListItem(data.track), data.relations || []);
  }

  return (
    <form
      onSubmit={onSave}
      className="border-t border-[var(--line)] bg-[rgba(8,14,24,0.55)] px-4 py-4 xl:px-5"
    >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
          Editing {track.id}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {error ? <span className="text-xs text-[var(--exclusive)]">{error}</span> : null}
          {message ? <span className="text-xs text-[var(--available)]">{message}</span> : null}
          <button
            type="button"
            onClick={() => void runAi()}
            disabled={working || !vaultAudioLink}
            className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--ink)] transition hover:border-[var(--accent)] disabled:opacity-50"
            title={!vaultAudioLink ? "Vault audio not available" : "Re-analyze audio and refresh tags"}
          >
            {aiBusy ? "AI…" : "Re-run AI"}
          </button>
          <button
            type="button"
            onClick={() => void onTrash()}
            disabled={working}
            className="rounded-lg border border-[var(--exclusive)]/50 px-3 py-1.5 text-xs text-[var(--exclusive)] transition hover:border-[var(--exclusive)] disabled:opacity-50"
            title="Move to Trash"
          >
            Trash
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={working}
            className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={working}
            className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        {/* Left: tags */}
        <div className="space-y-4">
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
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
              Description
            </span>
            <textarea
              className={`${fieldClass} min-h-[88px] resize-y`}
              value={form.description}
              onChange={(e) => patchForm({ description: e.target.value })}
            />
          </label>
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
          <TrackLineageLinker
            excludeTrackId={track.id}
            value={derivedFrom}
            onChange={setDerivedFrom}
            knownTitles={knownTitles}
          />
        </div>

        {/* Right: track fields */}
        <div className="grid gap-2.5 content-start sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
              Library title
            </span>
            <input
              className={fieldClass}
              value={form.libraryTitle}
              onChange={(e) => patchForm({ libraryTitle: e.target.value })}
            />
          </label>
          <label className="sm:col-span-2">
            <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
              Working title
            </span>
            <input
              className={fieldClass}
              value={form.workingTitle}
              onChange={(e) => patchForm({ workingTitle: e.target.value })}
            />
          </label>
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
            licenseHistoryKey={historyKey}
            onLicenseCountChange={onLicenseCountChange}
            onLicenseAdded={() => setLocalLicenseKey((k) => k + 1)}
            clientPrefill={form.client}
            projectPrefill={form.project}
          />
        </div>
      </div>

      <TrackAssetsPanel
        trackId={track.id}
        trackTitle={formatDisplayTitle(track)}
        canEdit
      />
    </form>
  );
}
