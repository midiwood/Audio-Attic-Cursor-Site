import Link from "next/link";
import { LicenseRequestsManager } from "@/components/license-requests-manager";
import { requireCatalogStaff } from "@/lib/auth";
import { listLicenseRequests } from "@/lib/license-requests";
import { getCatalogMetaSuggestions } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AdminLicensingPage() {
  await requireCatalogStaff("/admin/licensing");
  const requests = listLicenseRequests();
  const trashedRequests = listLicenseRequests({ trashed: true });
  const metaSuggestions = getCatalogMetaSuggestions();

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
          Licensing
        </h1>
        <p className="mt-1 text-sm text-[var(--ink-dim)]">
          Client license requests — accept to log a deal. Trashed items can be restored or
          permanently deleted.{" "}
          <Link href="/admin/samro" className="text-[var(--accent)] hover:underline">
            SAMRO forms
          </Link>
          {" · "}
          <Link href="/?samro=prepare" className="text-[var(--accent)] hover:underline">
            Prepare PRO
          </Link>
        </p>
      </header>
      <LicenseRequestsManager
        initialRequests={requests}
        initialTrashed={trashedRequests}
        metaSuggestions={metaSuggestions}
      />
    </main>
  );
}
