import Link from "next/link";
import { notFound } from "next/navigation";
import { PlaylistDetailClient } from "@/components/playlist-detail-client";
import { PlaylistHeading } from "@/components/playlist-heading";
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
import { listComposersForPicker, ensureHouseComposer } from "@/lib/composers";
import { getPublisherRuntimeConfig } from "@/lib/site-settings";

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
  const metaSuggestions = staff ? getCatalogMetaSuggestions() : undefined;
  const housePublisherName = staff ? getHousePublisherName() : "";
  let composers: ReturnType<typeof listComposersForPicker> = [];
  if (staff) {
    const cfg = getPublisherRuntimeConfig();
    if (cfg.houseName.trim()) {
      ensureHouseComposer({
        displayName: cfg.houseName.trim(),
        ipiPa: cfg.proPaIpiNameNumber.trim() || cfg.proIpiBaseNumber.trim(),
        ipiBase: cfg.proIpiBaseNumber.trim() || undefined,
      });
    }
    composers = listComposersForPicker();
  }
  const trackItems = tracks.map(toTrackListItem);
  const licenseEntryCounts = staff
    ? getLicenseEntryCounts(trackItems.map((t) => t.id))
    : undefined;
  const userLicenseByTrack =
    subscriber && !staff
      ? getUserLicenseRequestStatusByTrack(
          session.user.id,
          trackItems.map((t) => t.id),
        )
      : undefined;

  return (
    <main className="min-w-0 flex-1 py-6">
      <div className="px-5 md:px-8">
      <Link
        href="/playlists"
        className="mb-4 inline-flex text-sm text-[var(--ink-dim)] transition hover:text-[var(--accent)]"
      >
        ← Playlists
      </Link>
      <PlaylistHeading
        playlistId={playlist!.id}
        name={playlist!.name}
        canRename={isOwner}
        subtitle={!isOwner ? "Shared with you" : undefined}
      />
      </div>
      <PlaylistDetailClient
        playlistId={playlist!.id}
        playlistName={playlist!.name}
        tracks={trackItems}
        canEdit={staff && isOwner}
        canBatchEdit={staff}
        canModifyPlaylist={isOwner}
        vocabulary={vocabulary}
        metaSuggestions={metaSuggestions}
        composers={composers}
        housePublisherName={housePublisherName}
        licenseEntryCounts={licenseEntryCounts}
        userLicenseByTrack={userLicenseByTrack}
        subscriberView={subscriber}
      />
    </main>
  );
}
