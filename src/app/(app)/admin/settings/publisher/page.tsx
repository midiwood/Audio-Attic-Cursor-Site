import Link from "next/link";
import { PublisherSettingsForm } from "@/components/publisher-settings-form";
import { requireSiteAdmin } from "@/lib/auth";
import { getPublisherSettingsView } from "@/lib/site-settings";

export const dynamic = "force-dynamic";

export default async function AdminPublisherSettingsPage() {
  await requireSiteAdmin("/admin/settings/publisher");
  const initial = getPublisherSettingsView();

  return (
    <main className="min-w-0 flex-1 px-5 py-6 md:px-8 md:py-8">
      <Link
        href="/admin/site"
        className="mb-4 inline-flex text-sm text-[var(--ink-dim)] transition hover:text-[var(--accent)]"
      >
        ← Admin
      </Link>
      <header className="mb-6 max-w-xl border-b border-[var(--line)] pb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)] md:text-3xl">
          Publisher / PRO
        </h1>
        <p className="mt-1 text-sm text-[var(--ink-dim)]">
          House publisher for imports and self-published availability, plus SAMRO identifiers.
        </p>
      </header>
      <PublisherSettingsForm initial={initial} />
    </main>
  );
}
