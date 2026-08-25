"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { clearAudioPlayer } from "@/components/player-provider";
import { authClient } from "@/lib/auth-client";
import {
  catalogBrowseHref,
  subscribeCatalogFilterQuery,
} from "@/lib/catalog-filter-storage";

const NAV_STORAGE_KEY = "attic-nav-open";
const NAV_WIDTH_OPEN = "14rem";
const NAV_WIDTH_COLLAPSED = "2.75rem"; // 11 = w-11

type NavItem = {
  href: string;
  label: string;
  match?: (pathname: string) => boolean;
};

/** Catalog shelves — browse the collection */
function IconBrowse({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 5.5h7v13H4V5.5Zm9 0h7v13h-7V5.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M6.5 9h2M6.5 12.5h2M15.5 9h2M15.5 12.5h2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

/** Queue of tracks with play mark */
function IconPlaylists({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 6h10M5 12h10M5 18h7"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M17.5 14.5v5.2l4-2.6-4-2.6Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Upload into crate */
function IconUpload({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 14V4.5m0 0 3.25 3.25M12 4.5 8.75 7.75"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 14v4.5a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 18.5V14"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Site / admin console */
function IconAdmin({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4.5 19.5h15M6.5 19.5V9.25L12 5l5.5 4.25V19.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10 19.5v-4h4v4" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M9.5 11h1M13.5 11h1M9.5 14h1M13.5 14h1" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconMenu({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconClose({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

/** Temporary wordmark glyph until a logo option is chosen */
function IconBrandMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 18.5 12 5.5l7 13"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="14.25" r="2.35" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

const ICONS: Record<string, (props: { className?: string }) => ReactNode> = {
  Browse: IconBrowse,
  Playlists: IconPlaylists,
  Upload: IconUpload,
  Admin: IconAdmin,
};

function avatarInitials(name: string | null | undefined, email: string | null | undefined) {
  const base = (name || email || "?").trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

function NavPendingDot() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={`h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)] transition-opacity duration-200 ${
        pending ? "opacity-100" : "opacity-0"
      }`}
    />
  );
}

function navItemClass(active: boolean, pending: boolean, collapsed: boolean) {
  const highlight = active || pending;
  if (collapsed) {
    return `relative grid h-10 w-10 place-items-center rounded-lg transition ${
      highlight
        ? "bg-[var(--accent-soft)] text-[var(--accent)]"
        : "text-[var(--ink-dim)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--ink)]"
    }`;
  }
  return `group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
    highlight
      ? "bg-[var(--accent-soft)] font-medium text-[var(--ink)]"
      : "text-[var(--ink-muted)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--ink)]"
  }`;
}

function setNavWidthVar(open: boolean) {
  document.documentElement.style.setProperty(
    "--nav-width",
    open ? NAV_WIDTH_OPEN : NAV_WIDTH_COLLAPSED,
  );
}

export function AppNav({
  canManageAccount,
  canManageCatalog = true,
  userEmail,
  userName,
  userImage,
  availableCount,
  totalCount,
  pendingUserCount = 0,
  mode = "app",
}: {
  canManageAccount: boolean;
  canManageCatalog?: boolean;
  userEmail?: string | null;
  userName?: string | null;
  userImage?: string | null;
  availableCount?: number;
  totalCount?: number;
  pendingUserCount?: number;
  mode?: "app" | "guest";
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [browseHref, setBrowseHref] = useState("/");
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(true);
  const isGuest = mode === "guest";

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(NAV_STORAGE_KEY);
      if (stored === "0") {
        setNavOpen(false);
        setNavWidthVar(false);
      } else {
        setNavWidthVar(true);
      }
    } catch {
      setNavWidthVar(true);
    }
    return () => {
      document.documentElement.style.setProperty("--nav-width", NAV_WIDTH_OPEN);
    };
  }, []);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname, searchParams]);

  useEffect(() => {
    if (isGuest) return;
    const sync = () => setBrowseHref(catalogBrowseHref());
    sync();
    return subscribeCatalogFilterQuery(sync);
  }, [pathname, isGuest]);

  function setNavOpenPersist(next: boolean) {
    setNavOpen(next);
    setNavWidthVar(next);
    try {
      window.localStorage.setItem(NAV_STORAGE_KEY, next ? "1" : "0");
    } catch {
      // ignore
    }
  }

  const items: NavItem[] = isGuest
    ? []
    : [
        {
          href: browseHref,
          label: "Browse",
          match: (p) => p === "/",
        },
        {
          href: "/playlists",
          label: "Playlists",
          match: (p) => p === "/playlists" || p.startsWith("/playlists/"),
        },
      ];

  if (!isGuest && canManageCatalog) {
    items.push({
      href: "/admin",
      label: "Upload",
      match: (p) => p === "/admin" || p.startsWith("/admin/tracks"),
    });
  }

  if (!isGuest && canManageAccount) {
    items.push({
      href: "/admin/site",
      label: "Admin",
      match: (p) =>
        p.startsWith("/admin/site") ||
        p.startsWith("/admin/users") ||
        p.startsWith("/admin/settings"),
    });
  }

  const profileActive = pathname === "/profile" || pathname.startsWith("/profile/");

  async function signOut() {
    setSigningOut(true);
    clearAudioPlayer();
    await authClient.signOut();
    setSigningOut(false);
    setMobileOpen(false);
    router.push("/admin/login");
    router.refresh();
  }

  function NavLinks({
    onNavigate,
    collapsed = false,
  }: {
    onNavigate?: () => void;
    collapsed?: boolean;
  }) {
    if (!items.length) return null;
    return (
      <nav className={`flex flex-col gap-0.5 ${collapsed ? "items-center px-0" : "px-2"}`}>
        {items.map((item) => {
          const active = item.match ? item.match(pathname) : pathname === item.href;
          const clickPending = pendingHref === item.href;
          const Icon = ICONS[item.label];
          const showPendingBadge = item.label === "Admin" && pendingUserCount > 0;
          return (
            <Link
              key={item.label}
              href={item.href}
              title={collapsed ? item.label : undefined}
              onClick={() => {
                setPendingHref(item.href);
                onNavigate?.();
              }}
              className={navItemClass(active, clickPending, collapsed)}
              aria-busy={clickPending || undefined}
              aria-label={collapsed ? item.label : undefined}
            >
              {Icon ? (
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    collapsed
                      ? ""
                      : active || clickPending
                        ? "text-[var(--accent)]"
                        : "text-[var(--ink-dim)] group-hover:text-[var(--ink-muted)]"
                  }`}
                />
              ) : null}
              {!collapsed ? (
                <>
                  <span className="min-w-0 flex-1">{item.label}</span>
                  <NavPendingDot />
                  {showPendingBadge ? (
                    <span
                      className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-[var(--exclusive)] px-1.5 text-[10px] font-semibold tabular-nums text-white"
                      aria-label={`${pendingUserCount} pending`}
                    >
                      {pendingUserCount > 99 ? "99+" : pendingUserCount}
                    </span>
                  ) : null}
                </>
              ) : showPendingBadge ? (
                <span
                  className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-[var(--exclusive)]"
                  aria-label={`${pendingUserCount} pending`}
                />
              ) : null}
            </Link>
          );
        })}
      </nav>
    );
  }

  const expandedBody = (showCollapse: boolean) => (
    <>
      <div className="border-b border-[var(--line)] px-4 py-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[var(--line)] bg-[var(--bg-soft)] text-[var(--ink)]">
                <IconBrandMark className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="truncate text-base font-semibold tracking-tight text-[var(--ink)]">
                  Audio Attic
                </div>
                <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--ink-dim)]">
                  {isGuest ? "Guest" : "Catalog"}
                </div>
              </div>
            </div>
            {!isGuest && typeof availableCount === "number" ? (
              <p className="mt-3 text-[11px] tabular-nums text-[var(--ink-dim)]">
                {availableCount.toLocaleString()} available
                {canManageCatalog && typeof totalCount === "number" ? (
                  <>
                    <span className="mx-1.5 text-[var(--line)]">·</span>
                    {totalCount.toLocaleString()} total
                  </>
                ) : null}
              </p>
            ) : isGuest ? (
              <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-dim)]">
                Listening to a shared playlist.
              </p>
            ) : null}
          </div>
          {showCollapse ? (
            <button
              type="button"
              onClick={() => setNavOpenPersist(false)}
              className="shrink-0 rounded-md px-2 py-1 text-[11px] text-[var(--ink-dim)] transition hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--ink)]"
              aria-label="Collapse navigation"
            >
              Hide
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto py-3">
          <NavLinks onNavigate={() => setMobileOpen(false)} />

          <div className={`border-t border-[var(--line)] px-3 pt-4 ${items.length ? "mt-5" : ""}`}>
            <div className="mb-2 px-1 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
              Shortcuts
            </div>
            <ul className="space-y-1">
              {(
                isGuest
                  ? [
                      { keys: ["Space"], label: "Play / pause" },
                      { keys: ["↑", "↓"], label: "Prev / next" },
                      { keys: ["←", "→"], label: "Seek ±10s" },
                    ]
                  : [
                      { keys: ["Space"], label: "Play / pause" },
                      { keys: ["↑", "↓"], label: "Prev / next" },
                      { keys: ["←", "→"], label: "Seek ±10s" },
                      { keys: ["P"], label: "Quick-add to playlist" },
                      { keys: ["L"], label: "Choose / create playlist" },
                    ]
              ).map((row) => (
                <li
                  key={row.label}
                  className="flex items-center justify-between gap-2 rounded-md px-1 py-0.5 text-[11px] text-[var(--ink-dim)]"
                >
                  <span className="min-w-0 truncate">{row.label}</span>
                  <span className="flex shrink-0 items-center gap-0.5">
                    {row.keys.map((key) => (
                      <kbd
                        key={key}
                        className="inline-flex min-w-[1.35rem] items-center justify-center rounded border border-[var(--line)] bg-[rgba(0,0,0,0.28)] px-1 py-0.5 font-sans text-[10px] font-medium tabular-nums text-[var(--ink-muted)]"
                      >
                        {key}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {showCollapse ? (
          <button
            type="button"
            onClick={() => setNavOpenPersist(false)}
            className="min-h-6 flex-1 cursor-default border-0 bg-transparent"
            aria-label="Collapse navigation"
            title="Click to hide navigation"
          />
        ) : null}
      </div>

      <div className="border-t border-[var(--line)] p-3">
        {isGuest ? (
          <div className="space-y-1">
            <Link
              href="/signup"
              onClick={() => setMobileOpen(false)}
              className="block rounded-lg bg-[var(--accent)] px-3 py-2.5 text-center text-sm font-medium text-white transition hover:brightness-110"
            >
              Sign up
            </Link>
            <Link
              href="/admin/login"
              onClick={() => setMobileOpen(false)}
              className="block rounded-lg px-3 py-2 text-center text-sm text-[var(--ink-muted)] transition hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--ink)]"
            >
              Already have an account? Sign in
            </Link>
          </div>
        ) : (
          <>
            <Link
              href="/profile"
              onClick={() => {
                setPendingHref("/profile");
                setMobileOpen(false);
              }}
              className={`mb-1 flex items-center gap-3 rounded-lg px-2 py-2 transition ${
                profileActive || pendingHref === "/profile"
                  ? "bg-[var(--accent-soft)]"
                  : "hover:bg-[rgba(255,255,255,0.04)]"
              }`}
              aria-busy={pendingHref === "/profile" || undefined}
            >
              <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-[var(--line)] bg-[var(--bg-soft)]">
                {userImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={userImage} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center text-[10px] font-semibold text-[var(--ink-muted)]">
                    {avatarInitials(userName, userEmail)}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <span
                  className={`block truncate text-sm ${
                    profileActive ? "font-medium text-[var(--ink)]" : "text-[var(--ink-muted)]"
                  }`}
                >
                  {userName || "Profile"}
                </span>
                {userEmail ? (
                  <span className="block truncate text-[11px] text-[var(--ink-dim)]">{userEmail}</span>
                ) : null}
              </div>
            </Link>
            <button
              type="button"
              onClick={signOut}
              disabled={signingOut}
              className="w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--ink-muted)] transition hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--ink)] disabled:opacity-50"
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </>
        )}
      </div>
    </>
  );

  const collapsedBody = (
    <div className="relative flex h-full w-full flex-col">
      {/* Full-rail hit target — same pattern as collapsed Filters */}
      <button
        type="button"
        onClick={() => setNavOpenPersist(true)}
        className="absolute inset-0 z-0 transition hover:bg-[rgba(255,255,255,0.03)]"
        aria-label="Show navigation"
        title="Show navigation"
      />

      <div className="relative z-10 flex h-full w-full flex-col items-center py-3 pointer-events-none">
        <button
          type="button"
          onClick={() => setNavOpenPersist(true)}
          className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full border border-[var(--line)] bg-[var(--bg-soft)] text-[var(--ink)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          aria-label="Show navigation"
          title="Show navigation"
        >
          <IconBrandMark className="h-4 w-4" />
        </button>

        <div className="pointer-events-auto mt-4">
          <NavLinks collapsed />
        </div>

        {/* Empty stretch — click passes through to expand */}
        <div className="min-h-4 flex-1" aria-hidden />

        {!isGuest ? (
          <Link
            href="/profile"
            title="Profile"
            aria-label="Profile"
            onClick={() => setPendingHref("/profile")}
            className={`pointer-events-auto mb-1 grid h-10 w-10 place-items-center overflow-hidden rounded-full border border-[var(--line)] bg-[var(--bg-elevated)] transition ${
              profileActive || pendingHref === "/profile"
                ? "border-[var(--accent)] ring-2 ring-[var(--accent-soft)]"
                : "hover:border-[var(--ink-dim)]"
            }`}
          >
            {userImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={userImage} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-[9px] font-semibold text-[var(--ink-muted)]">
                {avatarInitials(userName, userEmail)}
              </span>
            )}
          </Link>
        ) : null}
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-[var(--line)] bg-[rgba(11,20,32,0.92)] px-4 py-3 backdrop-blur-xl lg:hidden">
        <span className="flex items-center gap-2 text-base font-semibold tracking-tight text-[var(--ink)]">
          <span className="grid h-7 w-7 place-items-center rounded-full border border-[var(--line)] bg-[var(--bg-soft)]">
            <IconBrandMark className="h-3.5 w-3.5" />
          </span>
          Audio Attic
        </span>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="rounded-lg border border-[var(--line)] p-2 text-[var(--ink-muted)] transition hover:text-[var(--ink)]"
          aria-label="Open menu"
        >
          <IconMenu className="h-5 w-5" />
        </button>
      </div>

      {/* Desktop primary sidebar */}
      <aside
        className="relative hidden w-[var(--nav-width)] shrink-0 flex-col border-r border-[var(--line)] bg-[rgba(9,15,24,0.92)] transition-[width] duration-200 ease-out lg:sticky lg:top-0 lg:flex lg:h-[100dvh]"
      >
        {navOpen ? expandedBody(true) : collapsedBody}
      </aside>

      {/* Mobile drawer — always full labels */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/55"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(18rem,88vw)] flex-col border-r border-[var(--line)] bg-[var(--bg-elevated)] shadow-2xl">
            <div className="flex items-center justify-end border-b border-[var(--line)] px-3 py-3">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-2 text-[var(--ink-muted)] hover:text-[var(--ink)]"
                aria-label="Close menu"
              >
                <IconClose className="h-5 w-5" />
              </button>
            </div>
            {expandedBody(false)}
          </aside>
        </div>
      ) : null}
    </>
  );
}
