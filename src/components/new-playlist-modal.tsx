"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function NewPlaylistModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName("");
    setError("");
    setBusy(false);
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError("");
    const res = await fetch("/api/playlists", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "create", name: trimmed }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      setError(data.error || "Could not create playlist");
      return;
    }
    onClose();
    router.push(`/playlists/${data.playlist.id}`);
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center p-3 pt-[var(--mobile-chrome-top)] pb-[var(--mobile-chrome-bottom)] lg:items-center lg:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/55"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-playlist-title"
        className="relative w-full max-w-sm max-h-full overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] shadow-2xl"
      >
        <div className="border-b border-[var(--line)] px-4 py-3">
          <h2 id="new-playlist-title" className="text-sm font-medium text-[var(--ink)]">
            New playlist
          </h2>
          <p className="mt-1 text-[11px] text-[var(--ink-dim)]">
            Name it, then you’ll land on the empty playlist.
          </p>
        </div>

        <form onSubmit={(e) => void onSubmit(e)} className="p-3">
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
              Playlist name
            </span>
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Twende pitch"
              disabled={busy}
              className="mb-3 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="flex-1 rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="flex-1 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {busy ? "Creating…" : "Create"}
            </button>
          </div>
          {error ? <p className="mt-2 text-center text-xs text-[var(--exclusive)]">{error}</p> : null}
        </form>
      </div>
    </div>
  );
}
