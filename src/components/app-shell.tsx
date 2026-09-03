import { Suspense, type ReactNode } from "react";
import { AppNav } from "@/components/app-nav";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { canManageCatalog, getSession, isSiteAdmin } from "@/lib/auth";
import { countPendingApprovals } from "@/lib/pending-approval-count";
import { getAvailableCount, getTrackCount } from "@/lib/queries";

function NavFallback() {
  return (
    <aside
      className="hidden w-[var(--nav-width)] shrink-0 border-r border-[var(--line)] bg-[rgba(9,15,24,0.92)] lg:block lg:h-[100dvh]"
      aria-hidden
    />
  );
}

export async function AppShell({
  children,
  showCounts = true,
  mode = "app",
}: {
  children: ReactNode;
  showCounts?: boolean;
  /** Guest: brand sidebar only — Sign up / Sign in, no catalog nav. */
  mode?: "app" | "guest";
}) {
  const isGuest = mode === "guest";
  const session = isGuest ? null : await getSession();
  const staff = !isGuest && canManageCatalog(session);
  const siteAdmin = !isGuest && isSiteAdmin(session);
  const availableCount = !isGuest && showCounts ? getAvailableCount() : undefined;
  const totalCount = !isGuest && showCounts && staff ? getTrackCount() : undefined;
  const pendingUserCount = siteAdmin ? countPendingApprovals() : 0;

  return (
    <div className="flex h-full min-h-0 flex-col lg:h-auto lg:min-h-[100dvh] lg:flex-row">
      <Suspense fallback={<NavFallback />}>
        <AppNav
          mode={mode}
          canManageAccount={siteAdmin}
          canManageCatalog={Boolean(staff)}
          userEmail={session?.user?.email}
          userName={session?.user?.name}
          userImage={session?.user?.image}
          availableCount={availableCount}
          totalCount={totalCount}
          pendingUserCount={pendingUserCount}
        />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col pt-[var(--mobile-chrome-top)] pb-[var(--mobile-chrome-bottom)] lg:flex-row lg:pt-0 lg:pb-[var(--bottom-player-height,0px)]">
        {children}
      </div>
      {!isGuest ? (
        <MobileTabBar
          userEmail={session?.user?.email}
          userName={session?.user?.name}
          userImage={session?.user?.image}
        />
      ) : null}
    </div>
  );
}
