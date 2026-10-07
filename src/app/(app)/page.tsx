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
import {
  getCapassoProProfileFromSiteSettings,
  getPublisherRuntimeConfig,
} from "@/lib/site-settings";
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
  // SAMRO / Capasso and year are staff-only; ignore if a subscriber somehow has them in the URL.
  if (!staff) {
    filters.samro = undefined;
    filters.capasso = undefined;
    filters.year = undefined;
    filters.publisher = undefined;
  }

  // Subscribers: always available-only; keep license out of the URL.
  // Non-staff: strip samro and year from the shareable/clean query.
  const queryFilters: TrackFilters = subscriber
    ? { ...filters, license: "all", samro: undefined, capasso: undefined, year: undefined, publisher: undefined }
    : staff
      ? filters
      : { ...filters, samro: undefined, capasso: undefined, year: undefined, publisher: undefined };
  const cleanQuery = catalogFiltersToQuery(queryFilters);
  const incomingQuery = catalogFiltersToQuery(parseCatalogFilters(params));
  const licenseInUrl = Array.isArray(params.license) ? params.license[0] : params.license;
  const samroInUrl = Array.isArray(params.samro) ? params.samro[0] : params.samro;
  const capassoInUrl = Array.isArray(params.capasso) ? params.capasso[0] : params.capasso;
  const yearInUrl = Array.isArray(params.year) ? params.year[0] : params.year;
  const publisherInUrl = Array.isArray(params.publisher) ? params.publisher[0] : params.publisher;
  if (
    incomingQuery !== cleanQuery ||
    (subscriber && licenseInUrl) ||
    (!staff && samroInUrl) ||
    (!staff && capassoInUrl) ||
    (!staff && yearInUrl) ||
    (!staff && publisherInUrl)
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

  const prepareSociety =
    staff && filters.capasso === "prepare"
      ? "capasso"
      : staff && filters.samro === "prepare"
        ? "samro"
        : undefined;
  const prepareProMode = Boolean(prepareSociety);
  const samroProfile = staff ? getSamroProProfileFromSiteSettings() : undefined;
  const capassoProfile = staff ? getCapassoProProfileFromSiteSettings() : undefined;
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
              publishers: filterOptions.publishers,
            }}
            available={{
              genres: facets.genres,
              moods: facets.moods,
              instruments: facets.instruments,
              usages: facets.usages,
              years: facets.years,
              publishers: facets.publishers,
              publisherNone: facets.publisherNone,
              licenses: facets.licenses,
            }}
            matchCount={total}
            hideLicenseFilter={subscriber}
            showSamroFilter={staff}
            showYearFilter={staff}
            showPublisherFilter={staff}
          />
        </BrowseFiltersRail>
      </Suspense>
      <main className="min-w-0 flex-1 pt-4 lg:pt-6">
        <header className="mb-4 border-b border-[var(--line)] px-4 pb-4 lg:mb-6 lg:px-6 lg:pb-5">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight text-[var(--ink)] lg:text-3xl">
            Browse
            {prepareProMode ? (
              <PrepareProInfo kind={prepareSociety === "capasso" ? "capasso" : "samro"} />
            ) : null}
          </h1>
          <p className="mt-1 hidden text-sm text-[var(--ink-dim)] lg:block">
            {prepareSociety === "capasso"
              ? "House-published Library, Exclusive, and On Hold tracks not yet submitted to Capasso — select Ready tracks to export an SWI."
              : prepareSociety === "samro"
                ? "Licensed tracks not yet submitted to SAMRO — select Ready tracks (one publisher) to export a form."
              : subscriber
                ? "Listen and shortlist available tracks."
                : "Filter, listen, and shortlist tracks for licensing."}
          </p>
          {prepareProMode ? (
            <p className="mt-2 text-xs text-[var(--ink-dim)]">
              {prepareSociety === "capasso" ? (
                <a href="/admin/capasso" className="text-[var(--accent)] hover:underline">
                  Capasso submission log
                </a>
              ) : (
                <a href="/admin/samro" className="text-[var(--accent)] hover:underline">
                  SAMRO submission log
                </a>
              )}
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
          prepareSociety={prepareSociety}
          samroProfile={samroProfile}
          capassoProfile={capassoProfile}
          housePublisherName={housePublisherName}
        />
      </main>
    </>
  );
}
