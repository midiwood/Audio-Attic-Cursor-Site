import { notFound } from "next/navigation";
import { AdminActions } from "@/components/admin-actions";
import { EditTrackForm } from "@/components/edit-track-form";
import { isSiteAdmin, requireSession } from "@/lib/auth";
import { getHousePublisherName } from "@/lib/publisher";
import { getTrackById, getCatalogMetaSuggestions } from "@/lib/queries";
import { getComposerAssignmentsForTrack, listComposersForPicker, ensureHouseComposer } from "@/lib/composers";
import { getPublisherRuntimeConfig } from "@/lib/site-settings";
import { listRelationsForTrack } from "@/lib/track-relation-queries";
import { toTrackListItem } from "@/lib/track-list-item";
import { formatDisplayTitle } from "@/lib/tracks";
import { getCatalogVocabulary } from "@/lib/vocabulary";

export const dynamic = "force-dynamic";

export default async function EditTrackPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession(`/admin/tracks/${id}/edit`);

  const track = getTrackById(id);
  if (!track) notFound();

  const vocabulary = getCatalogVocabulary();
  const metaSuggestions = getCatalogMetaSuggestions();
  const housePublisherName = getHousePublisherName();
  const cfg = getPublisherRuntimeConfig();
  if (cfg.houseName.trim()) {
    ensureHouseComposer({
      displayName: cfg.houseName.trim(),
      ipiPa: cfg.proPaIpiNameNumber.trim() || cfg.proIpiBaseNumber.trim(),
      ipiBase: cfg.proIpiBaseNumber.trim() || undefined,
    });
  }
  const composers = listComposersForPicker();
  const composerAssignments = getComposerAssignmentsForTrack(id);
  const item = toTrackListItem(track);
  const relations = listRelationsForTrack(id);

  return (
    <main className="min-w-0 flex-1 px-5 py-6 md:px-8 md:py-8">
      <header className="mb-6 flex max-w-3xl flex-col gap-3 border-b border-[var(--line)] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)] md:text-3xl">
            Edit track
          </h1>
          <p className="mt-1 text-sm text-[var(--ink-dim)]">
            {formatDisplayTitle(item)} · {item.id}
          </p>
        </div>
        <AdminActions canManageUsers={isSiteAdmin(session)} />
      </header>
      <EditTrackForm
        track={item}
        vocabulary={vocabulary}
        metaSuggestions={metaSuggestions}
        composers={composers}
        initialComposerAssignments={composerAssignments}
        initialRelations={relations}
        housePublisherName={housePublisherName}
      />
    </main>
  );
}
