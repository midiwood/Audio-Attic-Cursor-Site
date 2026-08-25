"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function AdminActions({ canManageUsers }: { canManageUsers: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [missingDuration, setMissingDuration] = useState<number | null>(null);
  const [loading, setLoading] = useState<"seed" | "duration-waveforms" | "duration-audio" | null>(
    null,
  );

  useEffect(() => {
    if (!canManageUsers) return;
    void fetch("/api/admin/durations/backfill")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.missing === "number") setMissingDuration(data.missing);
      })
      .catch(() => undefined);
  }, [canManageUsers]);

  async function reseed() {
    setLoading("seed");
    setStatus("");
    const res = await fetch("/api/admin/seed", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setLoading(null);
    if (!res.ok) {
      setStatus(data.error || "Seed failed");
      return;
    }
    setStatus(`Sheet sync complete: ${data.upserted} tracks upserted.`);
    router.refresh();
  }

  async function backfillDurations(mode: "waveforms" | "audio") {
    setLoading(mode === "audio" ? "duration-audio" : "duration-waveforms");
    setStatus("");
    const res = await fetch("/api/admin/durations/backfill", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode, limit: mode === "audio" ? 25 : 200 }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(null);
    if (!res.ok) {
      setStatus(data.error || "Duration backfill failed");
      return;
    }
    const updated = Number(data.updated ?? 0);
    const missingAfter = Number(data.missingAfter ?? 0);
    setMissingDuration(missingAfter);
    setStatus(
      mode === "waveforms"
        ? `Duration backfill: ${updated} updated from waveforms · ${missingAfter} still missing`
        : `Duration backfill: ${updated} updated from audio · ${missingAfter} still missing`,
    );
    router.refresh();
  }

  if (!canManageUsers) return null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={reseed}
        disabled={loading !== null}
        className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)] disabled:opacity-50"
      >
        {loading === "seed" ? "Syncing…" : "Re-sync sheet"}
      </button>
      {missingDuration != null && missingDuration > 0 ? (
        <>
          <button
            type="button"
            onClick={() => void backfillDurations("waveforms")}
            disabled={loading !== null}
            className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)] disabled:opacity-50"
          >
            {loading === "duration-waveforms"
              ? "Filling durations…"
              : `Fill ${missingDuration} missing durations`}
          </button>
          <button
            type="button"
            onClick={() => void backfillDurations("audio")}
            disabled={loading !== null}
            className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)] disabled:opacity-50"
          >
            {loading === "duration-audio" ? "Decoding audio…" : "Decode from audio (slow)"}
          </button>
        </>
      ) : null}
      {status ? <span className="text-sm text-[var(--ink-muted)]">{status}</span> : null}
    </div>
  );
}
