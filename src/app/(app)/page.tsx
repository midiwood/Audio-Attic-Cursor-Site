import { Suspense } from "react";
import { redirect } from "next/navigation";
import { BrowseFiltersRail } from "@/components/browse-filters-rail";
import { CatalogFilters } from "@/components/catalog-filters";
import { CatalogTrackList } from "@/components/catalog-track-list";
import { PrepareProInfo } from "@/components/prepare-pro-info";
import { canManageCatalog, isSubscriber, requireSession } from "@/lib/auth";
import { catalogFiltersToQuery, parseCatalogFilters } from "@/lib/catalog-filters";
import { toTrackListItem } from "@/lib/track-list-item";
import { getLicenseEntryCounts } from "@/lib/license-entries";
import { getUserLicenseRequestStatusByTrack } from "@/lib/license-requests";
import {
  CATALOG_PAGE_SIZE,
  countTracks,
  getCatalogMetaSuggestions,
  getFacetOptions,
  getFilterOptions,
  queryTracksPage,
  type TrackFilters,
} from "@/lib/queries";
import { listRelationsForTrackIds } from "@/lib/track-relation-queries";
import { getSamroProProfileFromSiteSettings, getHousePublisherName } from "@/lib/publisher";
import {
  listComposersForPicker,
  ensureHouseComposer,
  attachSamroComposerSlots,
} from "@/lib/composers";
import { getPublisherRuntimeConfig } from "@/lib/site-settings";
import { getCatalogVocabulary } from "@/lib/vocabulary";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSession("/");
  const subscriber = isSubscriber(session);
  const staff = canManageCatalog(session);
  const params = await searchParams;

  const filters = parseCatalogFilters(params);
  if (subscriber) {
    filters.license = "available";
  }
  // SAMRO is staff-only; ignore if a subscriber somehow has it in the URL.
  if (!staff) {
    filters.samro = undefined;
  }

  // Subscribers: always available-only; keep license out of the URL.
  // Non-staff: strip samro from the shareable/clean query.
  const queryFilters: TrackFilters = subscriber
    ? { ...filters, license: "all", samro: undefined }
    : staff
      ? filters
      : { ...filters, samro: undefined };
  const cleanQuery = catalogFiltersToQuery(queryFilters);
  const incomingQuery = catalogFiltersToQuery(parseCatalogFilters(params));
  const licenseInUrl = Array.isArray(params.license) ? params.license[0] : params.license;
  const samroInUrl = Array.isArray(params.samro) ? params.samro[0] : params.samro;
  if (
    incomingQuery !== cleanQuery ||
    (subscriber && licenseInUrl) ||
    (!staff && samroInUrl)
  ) {
    redirect(cleanQuery ? `/?${cleanQuery}` : "/");
  }

  const total = countTracks(filters);
  const pageRows = queryTracksPage(filters, { limit: CATALOG_PAGE_SIZE, offset: 0 });
  let tracks = pageRows.map(toTrackListItem);
  const relationsByTrack = staff
    ? listRelationsForTrackIds(pageRows.map((track) => track.id))
    : {};
  const licenseEntryCounts = staff
    ? getLicenseEntryCounts(pageRows.map((track) => track.id))
    : {};
  const userLicenseByTrack =
    subscriber && !staff
      ? getUserLicenseRequestStatusByTrack(
          session.user.id,
          pageRows.map((track) => track.id),
        )
      : {};
  const facets = getFacetOptions(filters);
  const vocabulary = getCatalogVocabulary();
  const metaSuggestions = staff ? getCatalogMetaSuggestions() : undefined;
  const filterOptions = getFilterOptions();

  const prepareProMode = staff && filters.samro === "prepare";
  const samroProfile = staff ? getSamroProProfileFromSiteSettings() : undefined;
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
  if (prepareProMode && samroProfile) {
    tracks = attachSamroComposerSlots(tracks, samroProfile);
  }

  return (
    <>
      <Suspense fallback={<div className="hidden w-72 border-r border-[var(--line)] lg:block" />}>
        <BrowseFiltersRail>
          <CatalogFilters
            options={{
              genres: vocabulary.genres,
              moods: vocabulary.moods,
              instruments: vocabulary.instruments,
              usages: vocabulary.attributes,
              years: filterOptions.years,
            }}
            available={{
              genres: facets.genres,
              moods: facets.moods,
              instruments: facets.instruments,
              usages: facets.usages,
              years: facets.years,
              licenses: facets.licenses,
            }}
            matchCount={total}
            hideLicenseFilter={subscriber}
            showSamroFilter={staff}
          />
        </BrowseFiltersRail>
      </Suspense>
      <main className="min-w-0 flex-1 px-4 pt-4 md:px-8 md:py-8 lg:px-5 lg:py-6">
        <header className="mb-4 border-b border-[var(--line)] pb-4 lg:mb-6 lg:pb-5">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight text-[var(--ink)] lg:text-3xl">
            Browse
            {prepareProMode ? <PrepareProInfo /> : null}
          </h1>
          <p className="mt-1 hidden text-sm text-[var(--ink-dim)] lg:block">
            {prepareProMode
              ? "Licensed tracks not yet submitted to SAMRO — select Ready tracks (one publisher) to export a form."
              : subscriber
                ? "Listen and shortlist available tracks."
                : "Filter, listen, and shortlist tracks for licensing."}
          </p>
          {prepareProMode ? (
            <p className="mt-2 text-xs text-[var(--ink-dim)]">
              <a href="/admin/samro" className="text-[var(--accent)] hover:underline">
                SAMRO submission log
              </a>
              {" · "}
              <a href="/admin/composers" className="text-[var(--accent)] hover:underline">
                Composers registry
              </a>
              {" · "}
              <a
                href="/admin/settings/publisher"
                className="text-[var(--accent)] hover:underline"
              >
                Publisher / PRO settings
              </a>
            </p>
          ) : null}
        </header>

        <CatalogTrackList
          key={cleanQuery || "all"}
          filterQuery={cleanQuery}
          initialTracks={tracks}
          initialRelations={relationsByTrack}
          initialLicenseCounts={licenseEntryCounts}
          initialUserLicenseByTrack={userLicenseByTrack}
          initialTotal={total}
          canEdit={staff}
          vocabulary={vocabulary}
          metaSuggestions={metaSuggestions}
          composers={composers}
          subscriberView={subscriber}
          prepareProMode={prepareProMode}
          samroProfile={samroProfile}
          housePublisherName={housePublisherName}
        />
      </main>
    </>
  );
}
