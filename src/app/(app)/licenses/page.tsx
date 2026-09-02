import { redirect } from "next/navigation";
import { SubscriberLicenses } from "@/components/subscriber-licenses";
import { canManageCatalog, isSubscriber, requireSession } from "@/lib/auth";
import {
  listLicenseRequestsForUser,
  markAcceptedLicenseRequestsSeen,
} from "@/lib/license-requests";

export const dynamic = "force-dynamic";

export default async function LicensesPage() {
  const session = await requireSession("/licenses");
  // Staff use Admin → Licensing; this page is the client view.
  if (canManageCatalog(session) && !isSubscriber(session)) {
    redirect("/admin/licensing");
  }

  // Clear the Licenses nav alert once they’ve opened the page.
  markAcceptedLicenseRequestsSeen(session.user.id);

  const rows = listLicenseRequestsForUser(session.user.id).map((row) => ({
    id: row.id,
    trackId: row.trackId,
    trackTitle: row.trackTitle,
    scope: row.scope,
    territory: row.territory,
    media: row.media,
    duration: row.duration,
    branding: row.branding,
    intendedUse: row.intendedUse,
    message: row.message,
    status: row.status,
    createdAt: row.createdAt,
    dropboxDl: row.dropboxDl,
    dropboxPath: row.dropboxPath,
    trackDuration: row.trackDuration,
  }));

  return (
    <main className="min-w-0 flex-1 px-5 py-6 md:px-8 md:py-8">
      <header className="mb-6 max-w-3xl border-b border-[var(--line)] pb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)] md:text-3xl">
          Licenses
        </h1>
        <p className="mt-1 text-sm text-[var(--ink-dim)]">
          Your licensed tracks and open requests.
        </p>
      </header>
      <SubscriberLicenses initialRows={rows} />
    </main>
  );
}
