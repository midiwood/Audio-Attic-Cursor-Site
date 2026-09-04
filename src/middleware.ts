import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { GUEST_PLAYLIST_COOKIE, guestCookieOptions } from "@/lib/guest-playlist";

function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/admin/login" ||
    pathname === "/signup" ||
    pathname.startsWith("/api/auth") ||
    pathname === "/api/signup" ||
    pathname.startsWith("/api/catalog") ||
    pathname.startsWith("/guest/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico"
  );
}

function isGuestApiPath(pathname: string): boolean {
  return (
    pathname.startsWith("/api/audio") ||
    /^\/api\/tracks\/[^/]+\/waveform$/.test(pathname)
  );
}

function loginRedirect(req: NextRequest): NextResponse {
  const login = new URL("/admin/login", req.url);
  const next = `${req.nextUrl.pathname}${req.nextUrl.search}`;
  if (next && next !== "/admin/login") {
    login.searchParams.set("next", next);
  }
  return NextResponse.redirect(login);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Guest playlist deep link — set cookie so audio/waveform APIs work.
  if (pathname.startsWith("/guest/playlist/")) {
    const token = pathname.split("/")[3] || "";
    const res = NextResponse.next();
    if (token) {
      res.cookies.set(GUEST_PLAYLIST_COOKIE, decodeURIComponent(token), guestCookieOptions());
    }
    return res;
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(req);
  if (!sessionCookie) {
    const guestToken = req.cookies.get(GUEST_PLAYLIST_COOKIE)?.value;
    if (guestToken && isGuestApiPath(pathname)) {
      return NextResponse.next();
    }
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return loginRedirect(req);
  }

  return NextResponse.next();
}

export const config = {
  // Exclude multipart upload APIs so middleware body buffering (default ~10MB)
  // cannot truncate audio FormData. These routes enforce auth themselves.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/tracks/prepare-vault|api/tracks/import|api/tracks/suggest-tags|api/profile/avatar|api/audio/zip).*)",
  ],
};
