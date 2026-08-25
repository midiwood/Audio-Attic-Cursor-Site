import { redirect } from "next/navigation";

/** Old Trash URL — keep a redirect so bookmarks still work. */
export default function PlaylistsTrashRedirect() {
  redirect("/trash");
}
