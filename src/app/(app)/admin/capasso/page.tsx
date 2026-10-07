import Link from "next/link";
import { CapassoSubmissionsManager } from "@/components/capasso-submissions-manager";
import { requireCatalogStaff } from "@/lib/auth";
import { listCapassoSubmissions } from "@/lib/capasso-submissions";

export const dynamic = "force-dynamic";

export default async function AdminCapassoPage() {
  await requireCatalogStaff("/admin/capasso");
  const submissions = listCapassoSubmissions({ view: "active" });
  const archivedSubmissions = listCapassoSubmissions({ view: "archived" });
  const trashedSubmissions = listCapassoSubmissions({ view: "trash" });

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
          Capasso submissions
        </h1>
        <p className="mt-1 text-sm text-[var(--ink-dim)]">
          SWI work registration forms prepared from the catalog. Independent of SAMRO.
          {" · "}
          <Link href="/?capasso=prepare" className="text-[var(--accent)] hover:underline">
            Prepare Capasso
          </Link>
        </p>
      </header>
      <CapassoSubmissionsManager
        initialSubmissions={submissions}
        initialArchived={archivedSubmissions}
        initialTrashed={trashedSubmissions}
      />
    </main>
  );
}
