import { ProfileForm } from "@/components/profile-form";
import { MobileProfileLinks } from "@/components/mobile-profile-links";
import { canManageCatalog, isSiteAdmin, isSubscriber, requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await requireSession("/profile");
  const staff = canManageCatalog(session);
  const siteAdmin = isSiteAdmin(session);
  const subscriber = isSubscriber(session);

  return (
    <main className="min-w-0 flex-1 px-4 pt-4 md:px-8 md:py-8 lg:px-5 lg:py-6">
      <header className="mb-6 max-w-xl border-b border-[var(--line)] pb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)] md:text-3xl">
          Profile
        </h1>
        <p className="mt-1 text-sm text-[var(--ink-dim)]">
          Your account details, photo, and password.
        </p>
      </header>
      <ProfileForm
        initialName={session.user.name || ""}
        initialEmail={session.user.email || ""}
        initialImage={session.user.image || null}
      />
      <MobileProfileLinks
        canManageCatalog={staff}
        canManageAccount={siteAdmin}
        isSubscriber={subscriber}
      />
    </main>
  );
}
