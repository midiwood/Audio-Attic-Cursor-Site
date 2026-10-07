"use client";

import { useRef, useState, type ReactNode } from "react";

export function AudioDropZone({
  hint,
  statusLabel,
  disabled,
  onFiles,
  heading,
}: {
  heading?: ReactNode;
  hint: string;
  statusLabel?: string | null;
  disabled?: boolean;
  onFiles: (files: FileList | File[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <section className="space-y-2">
      {heading ?? (
        <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
          1. Add tracks
        </h2>
      )}
      <div
        onDragEnter={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (disabled) return;
          if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files);
        }}
        className={`rounded-lg border border-dashed px-4 py-5 text-center transition ${
          dragOver
            ? "border-[var(--accent)] bg-[var(--accent-soft)]"
            : "border-[var(--line)] bg-[var(--bg-elevated)]/60"
        } ${disabled ? "opacity-50" : ""}`}
      >
        <p className="text-sm font-medium text-[var(--ink)]">
          {statusLabel || "Drop MP3, WAV, or AIFF"}
        </p>
        <p className="mt-1 text-xs text-[var(--ink-dim)]">{hint}</p>
        <button
          type="button"
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
          className="mt-3 rounded-md border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)] disabled:opacity-50"
        >
          Browse files
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/mpeg,audio/wav,audio/aiff,audio/x-aiff,.mp3,.wav,.aif,.aiff"
          multiple
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            if (e.target.files?.length) onFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
    </section>
  );
}
