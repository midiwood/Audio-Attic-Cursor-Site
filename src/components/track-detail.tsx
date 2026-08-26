"use client";

import { AddToPlaylistButton } from "@/components/add-to-playlist-button";
import { LicenseBadge } from "@/components/license-badge";
import { usePlayer, type PlayerTrack } from "@/components/player-provider";
import { audioFileTypeFromUrls, formatDisplayTitle } from "@/lib/tracks";
import { isSamroSubmitted } from "@/lib/samro";
import type { Track } from "@/db/schema";

export function TrackDetail({ track, queue }: { track: Track; queue: PlayerTrack[] }) {
  const { playTrack, current, isPlaying } = usePlayer();
  const title = formatDisplayTitle(track);
  const playerTrack: PlayerTrack = {
    id: track.id,
    title,
    subtitle: [track.client, track.project, track.year].filter(Boolean).join(" · ") || null,
    duration: track.duration,
    dropboxDl: track.dropboxDl,
    license: track.license,
  };
  const active = current?.id === track.id && isPlaying;

  const meta = [
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
    { label: "Genre", value: track.genre },
    { label: "Mood", value: track.mood },
    { label: "Instruments", value: track.instruments },
    { label: "Usage", value: track.attributes },
    { label: "SAMRO", value: isSamroSubmitted(track.samro) ? "Submitted" : "Not submitted" },
    { label: "License detail", value: track.licenseDetail },
    { label: "Perpetuity", value: track.perpetuity },
    { label: "License expires", value: track.licenseExpires },
  ].filter((item) => item.value);

  return (
    <article className="grid gap-10 xl:grid-cols-[1.15fr_0.85fr]">
      <div>
        <div className="mb-4">
          <LicenseBadge license={track.license} />
        </div>
        <h1 className="max-w-4xl text-4xl font-semibold leading-tight tracking-tight text-[var(--ink)] md:text-6xl">
          {title}
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--ink-muted)] md:text-lg">
          {track.description || "No description provided."}
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!track.dropboxDl}
            onClick={() => playTrack(playerTrack, queue.length ? queue : [playerTrack])}
            className="rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {active ? "Playing" : "Play track"}
          </button>
          {track.dropboxDl ? (
            <a
              href={`/api/audio?id=${encodeURIComponent(track.id)}&download=1`}
              className="rounded-lg border border-[var(--line)] px-5 py-3 text-sm font-medium text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)]"
            >
              Download
            </a>
          ) : null}
          <AddToPlaylistButton trackId={track.id} />
          {track.dropboxLink ? (
            <a
              href={track.dropboxLink}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-[var(--line)] px-5 py-3 text-sm text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)]"
            >
              Open in Dropbox
            </a>
          ) : null}
          {track.sourceFolderLink ? (
            <a
              href={track.sourceFolderLink}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-[var(--line)] px-5 py-3 text-sm text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)]"
              title={track.sourceDropboxPath || undefined}
            >
              Original folder
            </a>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)]/70 p-6">
        <h2 className="mb-5 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--ink-dim)]">
          Metadata
        </h2>
        <dl className="grid gap-4">
          <div className="grid grid-cols-[140px_1fr] gap-3 border-b border-[var(--line)] pb-3">
            <dt className="text-xs uppercase tracking-[0.14em] text-[var(--ink-dim)]">ID</dt>
            <dd className="text-sm text-[var(--ink)]">{track.id}</dd>
          </div>
          {meta.map((item) => (
            <div
              key={item.label}
              className="grid grid-cols-[140px_1fr] gap-3 border-b border-[var(--line)] pb-3 last:border-b-0 last:pb-0"
            >
              <dt className="text-xs uppercase tracking-[0.14em] text-[var(--ink-dim)]">{item.label}</dt>
              <dd className="text-sm leading-relaxed text-[var(--ink)]">{item.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </article>
  );
}
