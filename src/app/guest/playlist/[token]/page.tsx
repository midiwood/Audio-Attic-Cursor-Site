import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { GuestPlaylistClient } from "@/components/guest-playlist-client";
import { getPlaylistByGuestToken, getPlaylistTracks } from "@/lib/playlists";
import { toTrackListItem } from "@/lib/track-list-item";

export const dynamic = "force-dynamic";

export default async function GuestPlaylistPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const playlist = getPlaylistByGuestToken(decodeURIComponent(token));
  if (!playlist?.guestToken) notFound();

  const tracks = getPlaylistTracks(playlist.id);

  return (
    <AppShell mode="guest" showCounts={false}>
      <main className="min-w-0 flex-1 px-5 py-6 md:px-8 md:py-8">
        <header className="mb-6 max-w-3xl border-b border-[var(--line)] pb-5">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)] md:text-3xl">
            {playlist.name}
          </h1>
          <p className="mt-1 text-sm text-[var(--ink-dim)]">
            Shared playlist — listen only.
          </p>
        </header>
        <GuestPlaylistClient
          playlistName={playlist.name}
          tracks={tracks.map(toTrackListItem)}
        />
      </main>
    </AppShell>
  );
}
