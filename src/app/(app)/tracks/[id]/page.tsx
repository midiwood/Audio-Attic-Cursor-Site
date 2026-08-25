import { redirect } from "next/navigation";
import { getTrackById } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** Legacy detail URLs → Browse focused on that track (search by id). */
export default async function TrackPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const track = getTrackById(id);
  if (!track || track.trashedAt) {
    redirect("/");
  }
  redirect(`/?q=${encodeURIComponent(id)}`);
}
