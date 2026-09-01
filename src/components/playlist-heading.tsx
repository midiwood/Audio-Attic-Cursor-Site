"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getLastPlaylist, setLastPlaylist } from "@/lib/last-playlist";

export function PlaylistHeading({
  playlistId,
  name,
  canRename,
  subtitle,
}: {
  playlistId: string;
  name: string;
  canRename: boolean;
  subtitle?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setValue(name);
  }, [name]);

  useEffect(() => {
    if (!editing) return;
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(t);
  }, [editing]);

  async function save(nextName: string) {
    const trimmed = nextName.trim();
    if (!trimmed || busy) return;
    if (trimmed === name) {
      setEditing(false);
      setError("");
      return;
    }
    setBusy(true);
    setError("");
    const res = await fetch("/api/playlists", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "rename", id: playlistId, name: trimmed }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Could not rename playlist");
      return;
    }
    const last = getLastPlaylist();
    if (last?.id === playlistId) setLastPlaylist({ id: playlistId, name: trimmed });
    setEditing(false);
    router.refresh();
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void save(value);
  }

  return (
    <header className="mb-6 border-b border-[var(--line)] pb-5">
      {editing && canRename ? (
        <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            value={value}
            disabled={busy}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => void save(value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setValue(name);
                setEditing(false);
                setError("");
              }
            }}
            aria-label="Playlist name"
            className="min-w-0 flex-1 rounded-lg border border-[var(--accent)] bg-[var(--bg)] px-3 py-2 text-2xl font-semibold tracking-tight text-[var(--ink)] outline-none md:text-3xl"
          />
          <button
            type="submit"
            disabled={busy || !value.trim()}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)] md:text-3xl">
            {name}
          </h1>
          {canRename ? (
            <button
              type="button"
              onClick={() => {
                setValue(name);
                setError("");
                setEditing(true);
              }}
              className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)]"
            >
              Rename
            </button>
          ) : null}
        </div>
      )}
      {subtitle ? <p className="mt-1 text-sm text-[var(--ink-dim)]">{subtitle}</p> : null}
      {error ? <p className="mt-2 text-sm text-[var(--exclusive)]">{error}</p> : null}
    </header>
  );
}
