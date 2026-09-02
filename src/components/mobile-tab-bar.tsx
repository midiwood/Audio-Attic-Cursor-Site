"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  queueMobileFiltersOpen,
  requestMobileFiltersOpen,
  setMobileFiltersOpen,
  subscribeMobileFiltersOpen,
} from "@/lib/mobile-filters-panel";

function IconBrowse({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 5.5h7v13H4V5.5Zm9 0h7v13h-7V5.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 9h2M6.5 12.5h2M15.5 9h2M15.5 12.5h2"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

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

function IconFilters({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16M7 12h10M10 17h4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconProfile({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="9" r="3.25" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M6.5 19.5c.85-2.75 3.15-4.5 5.5-4.5s4.65 1.75 5.5 4.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function avatarInitials(name: string | null | undefined, email: string | null | undefined) {
  const base = (name || email || "?").trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

function isBrowsePath(pathname: string) {
  return pathname === "/" || pathname.startsWith("/tracks/");
}

function tabItemClass(active: boolean) {
  return `flex min-h-11 w-full flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] font-medium transition appearance-none border-0 bg-transparent cursor-pointer ${
    active ? "text-[var(--accent)]" : "text-[var(--ink-muted)]"
  }`;
}

export function MobileTabBar({
  userImage,
  userName,
  userEmail,
}: {
  userImage?: string | null;
  userName?: string | null;
  userEmail?: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [filtersOpen, setFiltersOpenState] = useState(false);

  useEffect(() => subscribeMobileFiltersOpen(setFiltersOpenState), []);

  function handleBrowseClick() {
    setMobileFiltersOpen(false);
  }

  function handleFiltersClick() {
    if (!isBrowsePath(pathname)) {
      queueMobileFiltersOpen();
      router.push("/");
      return;
    }
    if (filtersOpen) {
      setMobileFiltersOpen(false);
      return;
    }
    requestMobileFiltersOpen();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const browseActive = isBrowsePath(pathname) && !filtersOpen;
  const filtersActive = isBrowsePath(pathname) && filtersOpen;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[rgba(8,14,22,0.96)] pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-xl lg:hidden"
      aria-label="Main"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around px-1">
        <li className="min-w-0 flex-1">
          <Link
            href="/"
            onClick={handleBrowseClick}
            className={tabItemClass(browseActive)}
            aria-current={browseActive ? "page" : undefined}
          >
            <IconBrowse className="h-6 w-6 shrink-0" />
            <span className="truncate">Browse</span>
          </Link>
        </li>

        <li className="min-w-0 flex-1">
          <Link
            href="/playlists"
            onClick={() => setMobileFiltersOpen(false)}
            className={tabItemClass(
              pathname === "/playlists" || pathname.startsWith("/playlists/"),
            )}
            aria-current={
              pathname === "/playlists" || pathname.startsWith("/playlists/") ? "page" : undefined
            }
          >
            <IconPlaylists className="h-6 w-6 shrink-0" />
            <span className="truncate">Playlists</span>
          </Link>
        </li>

        <li className="min-w-0 flex-1">
          <button
            type="button"
            onClick={handleFiltersClick}
            className={tabItemClass(filtersActive)}
            aria-current={filtersActive ? "page" : undefined}
            aria-expanded={filtersOpen}
          >
            <IconFilters className="h-6 w-6 shrink-0" />
            <span className="truncate">Filters</span>
          </button>
        </li>

        <li className="min-w-0 flex-1">
          <Link
            href="/profile"
            onClick={() => setMobileFiltersOpen(false)}
            className={tabItemClass(
              pathname === "/profile" || pathname.startsWith("/profile/"),
            )}
            aria-current={
              pathname === "/profile" || pathname.startsWith("/profile/") ? "page" : undefined
            }
          >
            {userImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={userImage}
                alt=""
                className={`h-6 w-6 rounded-full border object-cover ${
                  pathname === "/profile" || pathname.startsWith("/profile/")
                    ? "border-[var(--accent)]"
                    : "border-[var(--line)]"
                }`}
              />
            ) : userName || userEmail ? (
              <span
                className={`grid h-6 w-6 place-items-center rounded-full border text-[9px] font-semibold ${
                  pathname === "/profile" || pathname.startsWith("/profile/")
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-[var(--line)] bg-[var(--bg-soft)] text-[var(--ink-muted)]"
                }`}
              >
                {avatarInitials(userName, userEmail)}
              </span>
            ) : (
              <IconProfile className="h-6 w-6 shrink-0" />
            )}
            <span className="truncate">Profile</span>
          </Link>
        </li>
      </ul>
    </nav>
  );
}
