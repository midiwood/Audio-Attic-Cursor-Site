import Link from "next/link";
import { SamroSubmissionsManager } from "@/components/samro-submissions-manager";
import { requireCatalogStaff } from "@/lib/auth";
import { listSamroSubmissions } from "@/lib/samro-submissions";

export const dynamic = "force-dynamic";

export default async function AdminSamroPage() {
  await requireCatalogStaff("/admin/samro");
  const submissions = listSamroSubmissions({ view: "active" });
  const archivedSubmissions = listSamroSubmissions({ view: "archived" });
  const trashedSubmissions = listSamroSubmissions({ view: "trash" });

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
          SAMRO submissions
        </h1>
        <p className="mt-1 text-sm text-[var(--ink-dim)]">
          Notification of Works forms prepared from the catalog. One publisher per form.
        </p>
      </header>
      <SamroSubmissionsManager
        initialSubmissions={submissions}
        initialArchived={archivedSubmissions}
        initialTrashed={trashedSubmissions}
      />
    </main>
  );
}
