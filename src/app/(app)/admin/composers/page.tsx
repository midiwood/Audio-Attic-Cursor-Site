import Link from "next/link";
import { ComposersManager } from "@/components/composers-manager";
import { requireCatalogStaff } from "@/lib/auth";
import { listComposers, ensureHouseComposer } from "@/lib/composers";
import { getHousePublisherName } from "@/lib/publisher";
import { getPublisherRuntimeConfig } from "@/lib/site-settings";

export const dynamic = "force-dynamic";

export default async function AdminComposersPage() {
  await requireCatalogStaff("/admin/composers");

  const cfg = getPublisherRuntimeConfig();
  const houseName = cfg.houseName.trim() || getHousePublisherName();
  if (houseName) {
    ensureHouseComposer({
      displayName: houseName,
      ipiPa: cfg.proPaIpiNameNumber.trim() || cfg.proIpiBaseNumber.trim(),
      ipiBase: cfg.proIpiBaseNumber.trim() || undefined,
    });
  }

  const composers = listComposers({ includeDisabled: true });

  return (
    <main className="min-w-0 flex-1 px-5 py-6 md:px-8 md:py-8">
      <Link
        href="/admin/site"
        className="mb-4 inline-flex text-sm text-[var(--ink-dim)] transition hover:text-[var(--accent)]"
      >
        ← Admin
      </Link>
      <header className="mb-6 max-w-3xl border-b border-[var(--line)] pb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)] md:text-3xl">
          Composers
        </h1>
        <p className="mt-1 text-sm text-[var(--ink-dim)]">
          Registry of composer names and IPI numbers for SAMRO export.
        </p>
      </header>
      <ComposersManager initialComposers={composers} />
    </main>
  );
}
