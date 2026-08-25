import Link from "next/link";
import { notFound } from "next/navigation";
import { PlaylistDetailClient } from "@/components/playlist-detail-client";
import { canManageCatalog, isSubscriber, requireSession } from "@/lib/auth";
import {
  getPlaylistById,
  getPlaylistTracks,
  userCanAccessPlaylist,
  userOwnsPlaylist,
} from "@/lib/playlists";
import { toTrackListItem } from "@/lib/track-list-item";
import { isSubscriberVisible, getHousePublisherName } from "@/lib/publisher";
import { getLicenseEntryCounts } from "@/lib/license-entries";
import { getUserLicenseRequestStatusByTrack } from "@/lib/license-requests";
import { getCatalogMetaSuggestions } from "@/lib/queries";
import { getCatalogVocabulary } from "@/lib/vocabulary";

export const dynamic = "force-dynamic";

export default async function PlaylistPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession("/playlists");
  const staff = canManageCatalog(session);
  const subscriber = isSubscriber(session);
  const { id } = await params;
  const playlist = getPlaylistById(id);
  if (!userCanAccessPlaylist(playlist, session.user.id, session.user.email)) {
    notFound();
  }

  const isOwner = userOwnsPlaylist(playlist, session.user.id);
  let tracks = getPlaylistTracks(id);
  if (subscriber) {
    tracks = tracks.filter((t) => isSubscriberVisible(t));
  }
  const vocabulary = getCatalogVocabulary();
  const metaSuggestions = staff && isOwner ? getCatalogMetaSuggestions() : undefined;
  const housePublisherName = staff && isOwner ? getHousePublisherName() : "";
  const trackItems = tracks.map(toTrackListItem);
  const licenseEntryCounts =
    staff && isOwner ? getLicenseEntryCounts(trackItems.map((t) => t.id)) : undefined;
  const userLicenseByTrack =
    subscriber && !staff
      ? getUserLicenseRequestStatusByTrack(
          session.user.id,
          trackItems.map((t) => t.id),
        )
      : undefined;

  return (
    <main className="min-w-0 flex-1 px-5 py-6 md:px-8 md:py-8">
      <Link
        href="/playlists"
        className="mb-4 inline-flex text-sm text-[var(--ink-dim)] transition hover:text-[var(--accent)]"
      >
        ← Playlists
      </Link>
      <header className="mb-6 border-b border-[var(--line)] pb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)] md:text-3xl">
          {playlist!.name}
        </h1>
        {!isOwner ? (
          <p className="mt-1 text-sm text-[var(--ink-dim)]">Shared with you</p>
        ) : null}
      </header>
      <PlaylistDetailClient
        playlistId={playlist!.id}
        playlistName={playlist!.name}
        tracks={trackItems}
        canEdit={staff && isOwner}
        canModifyPlaylist={isOwner}
        vocabulary={vocabulary}
        metaSuggestions={metaSuggestions}
        housePublisherName={housePublisherName}
        licenseEntryCounts={licenseEntryCounts}
        userLicenseByTrack={userLicenseByTrack}
        subscriberView={subscriber}
      />
    </main>
  );
}
