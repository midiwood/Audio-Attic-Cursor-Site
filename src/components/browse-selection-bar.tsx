"use client";

export function BrowseSelectionBar({
  selectedCount,
  downloadBusy = false,
  onClear,
  onBatchEdit,
  onDownload,
}: {
  selectedCount: number;
  downloadBusy?: boolean;
  onClear: () => void;
  onBatchEdit: () => void;
  onDownload?: () => void;
}) {
  if (!selectedCount) return null;

  return (
    <div className="sticky bottom-[calc(var(--mobile-chrome-bottom,var(--bottom-player-height,0px))+0.75rem)] z-30 mx-auto mb-3 max-w-3xl rounded-xl border border-[var(--line)] bg-[rgba(8,14,22,0.96)] px-4 py-3 shadow-xl backdrop-blur-xl lg:bottom-[calc(var(--bottom-player-height,0px)+0.75rem)]">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 text-sm text-[var(--ink)]">
          <span className="font-medium">{selectedCount} selected</span>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="rounded-lg px-3 py-1.5 text-sm text-[var(--ink-muted)] transition hover:text-[var(--ink)]"
        >
          Clear
        </button>
        {onDownload ? (
          <button
            type="button"
            onClick={onDownload}
            disabled={downloadBusy}
            className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {downloadBusy ? "Preparing…" : "Download"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onBatchEdit}
          className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white transition hover:brightness-110"
        >
          Batch edit
        </button>
      </div>
    </div>
  );
}
