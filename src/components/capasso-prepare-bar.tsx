"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TrackListItem } from "@/lib/track-list-item";
import {
  assessCapassoReadiness,
  formatCapassoPublisherShare,
  type CapassoProProfile,
} from "@/lib/capasso";

export function CapassoPrepareBar({
  tracks,
  selectedIds,
  profile,
  onClear,
  onBatchEdit,
}: {
  tracks: TrackListItem[];
  selectedIds: string[];
  profile: CapassoProProfile;
  onClear: () => void;
  onBatchEdit?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selected = useMemo(
    () => tracks.filter((t) => selectedIds.includes(t.id)),
    [tracks, selectedIds],
  );

  const readyCount = useMemo(
    () => selected.filter((t) => assessCapassoReadiness(t, profile).ready).length,
    [selected, profile],
  );

  const shareHint = useMemo(() => {
    if (selected.length !== 1) return null;
    const share = assessCapassoReadiness(selected[0], profile).publisherShare;
    return share && share < 100 ? formatCapassoPublisherShare(share) : null;
  }, [selected, profile]);

  async function prepare() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/admin/capasso-submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackIds: selectedIds }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      submission?: { id: string };
    };
    if (!res.ok || !data.submission?.id) {
      setBusy(false);
      setError(data.error || "Could not create submission");
      return;
    }
    try {
      const exportRes = await fetch(
        `/api/admin/capasso-submissions/${data.submission.id}/export`,
      );
      if (!exportRes.ok) {
        const err = (await exportRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || "Export failed");
      }
      const blob = await exportRes.blob();
      const disposition = exportRes.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/);
      const fileName = match?.[1] || "CAPASSO-SWI.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Export failed");
      return;
    }
    setBusy(false);
    onClear();
    router.push("/admin/capasso");
    router.refresh();
  }

  if (!selectedIds.length) return null;

  const canExport = readyCount === selected.length && selected.length > 0;

  return (
    <div className="sticky bottom-[calc(var(--mobile-chrome-bottom,var(--bottom-player-height,0px))+0.75rem)] z-30 mx-auto mb-3 max-w-3xl rounded-xl border border-[var(--line)] bg-[rgba(8,14,22,0.96)] px-4 py-3 shadow-xl backdrop-blur-xl lg:bottom-[calc(var(--bottom-player-height,0px)+0.75rem)]">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 text-sm text-[var(--ink)]">
          <span className="font-medium">{selected.length} selected</span>
          <span className="text-[var(--ink-dim)]">
            {" "}
            · {readyCount} Ready
            {profile.houseName ? ` · ${profile.houseName}` : null}
            {shareHint ? ` · ${shareHint} pub` : null}
          </span>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="rounded-lg px-3 py-1.5 text-sm text-[var(--ink-muted)] transition hover:text-[var(--ink)]"
        >
          Clear
        </button>
        {onBatchEdit ? (
          <button
            type="button"
            onClick={onBatchEdit}
            className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--ink)] transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
          >
            Batch edit
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy || !canExport}
          onClick={() => void prepare()}
          className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-50"
          title={
            readyCount < selected.length
              ? "Only Ready tracks can be exported"
              : "Create Capasso SWI and download"
          }
        >
          {busy ? "Preparing…" : "Export Capasso SWI"}
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-[var(--exclusive)]">{error}</p> : null}
    </div>
  );
}
