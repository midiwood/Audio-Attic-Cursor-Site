import Link from "next/link";
import { DropboxSettingsForm } from "@/components/dropbox-settings-form";
import { requireSiteAdmin } from "@/lib/auth";
import { getDropboxSettingsView } from "@/lib/site-settings";

export const dynamic = "force-dynamic";

export default async function AdminDropboxSettingsPage() {
  await requireSiteAdmin("/admin/settings/dropbox");
  const initial = getDropboxSettingsView();

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
          Dropbox
        </h1>
        <p className="mt-1 text-sm text-[var(--ink-dim)]">
          Connect Dropbox for shared links, previews, and imports.
        </p>
      </header>
      <DropboxSettingsForm initial={initial} />
    </main>
  );
}
