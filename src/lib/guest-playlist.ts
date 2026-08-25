export const GUEST_PLAYLIST_COOKIE = "attic_guest_pl";

export function guestCookieOptions(maxAgeSec = 60 * 60 * 24 * 30) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSec,
    secure: process.env.NODE_ENV === "production",
  };
}
