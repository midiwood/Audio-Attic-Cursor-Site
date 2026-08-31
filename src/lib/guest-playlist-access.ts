import { cookies } from "next/headers";
import { GUEST_PLAYLIST_COOKIE } from "@/lib/guest-playlist";
import { getPlaylistByGuestToken, playlistContainsTrack } from "@/lib/playlists";

/** Guest playlist cookie — may stream/download tracks on that playlist only. */
export async function guestMayAccessTrack(trackId: string): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(GUEST_PLAYLIST_COOKIE)?.value;
  if (!token) return false;
  const playlist = getPlaylistByGuestToken(token);
  if (!playlist) return false;
  return playlistContainsTrack(playlist.id, trackId);
}
