import { PlaylistsManager } from "@/components/playlists-manager";
import { canManageCatalog, requireSession } from "@/lib/auth";
import { listPlaylistsForUser, listShareableUsers } from "@/lib/playlists";
import { countTrashedTracks } from "@/lib/trash";

export const dynamic = "force-dynamic";

export default async function PlaylistsPage() {
  const session = await requireSession("/playlists");
  const staff = canManageCatalog(session);
  const playlists = listPlaylistsForUser(session.user.id);
  const shareableUsers = listShareableUsers(session.user.id);
  const trashCount = staff ? countTrashedTracks() : 0;

  return (
    <main className="min-w-0 flex-1 px-5 py-6 md:px-8 md:py-8">
      <header className="mb-6 max-w-3xl border-b border-[var(--line)] pb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)] md:text-3xl">
          Playlists
        </h1>
        <p className="mt-1 text-sm text-[var(--ink-dim)]">
          Share a guest link, or add existing users so it appears in their account.
        </p>
      </header>
      <PlaylistsManager
        initialPlaylists={playlists}
        shareableUsers={shareableUsers}
        trashCount={trashCount}
        showTrash={staff}
      />
    </main>
  );
}
