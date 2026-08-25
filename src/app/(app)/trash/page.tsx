import Link from "next/link";
import { TrashPlaylistClient } from "@/components/trash-playlist-client";
import { requireCatalogStaff } from "@/lib/auth";
import { toTrackListItem } from "@/lib/track-list-item";
import { listTrashedTracks } from "@/lib/trash";

export const dynamic = "force-dynamic";

export default async function TrashPage() {
  await requireCatalogStaff("/trash");
  const tracks = listTrashedTracks().map(toTrackListItem);

  return (
    <main className="min-w-0 flex-1 px-5 py-6 md:px-8 md:py-8">
      <Link
        href="/playlists"
        className="mb-4 inline-flex text-sm text-[var(--ink-dim)] transition hover:text-[var(--accent)]"
      >
        ← Playlists
      </Link>
      <header className="mb-6 border-b border-[var(--line)] pb-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--ink-dim)]">
          System
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--ink)] md:text-3xl">
          Trash
        </h1>
        <p className="mt-1 text-sm text-[var(--ink-dim)]">
          Soft-deleted tracks. Restore them to the catalog, or permanently delete.
        </p>
      </header>
      <TrashPlaylistClient initialTracks={tracks} />
    </main>
  );
}
