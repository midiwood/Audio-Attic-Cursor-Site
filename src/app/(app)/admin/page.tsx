import { AdminActions } from "@/components/admin-actions";
import { ImportForm } from "@/components/import-form";
import { isSiteAdmin, requireCatalogStaff } from "@/lib/auth";
import { getHousePublisherName } from "@/lib/publisher";
import { getCatalogMetaSuggestions } from "@/lib/queries";
import { listComposersForPicker, ensureHouseComposer } from "@/lib/composers";
import { getPublisherRuntimeConfig } from "@/lib/site-settings";
import { getCatalogVocabulary } from "@/lib/vocabulary";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await requireCatalogStaff("/admin");
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

  return (
    <main className="min-w-0 flex-1 px-5 py-6 md:px-8 md:py-8">
      <header className="mb-6 flex max-w-3xl flex-col gap-3 border-b border-[var(--line)] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)] md:text-3xl">
            Upload
          </h1>
          <p className="mt-1 text-sm text-[var(--ink-dim)]">
            One track: AI auto-tags · multiple: shared manual tags
          </p>
        </div>
        <AdminActions canManageUsers={isSiteAdmin(session)} />
      </header>
      <ImportForm
        vocabulary={vocabulary}
        metaSuggestions={metaSuggestions}
        composers={composers}
        housePublisherName={housePublisherName}
      />
    </main>
  );
}
