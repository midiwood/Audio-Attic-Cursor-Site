import { NextRequest, NextResponse } from "next/server";
import { getApiSession, getCatalogStaffSession, isSubscriber } from "@/lib/auth";
import { guestMayAccessTrack } from "@/lib/guest-playlist-access";
import { getTrackById } from "@/lib/queries";
import { isSubscriberVisible } from "@/lib/publisher";
import { spacesConfigured, spacesSetupMessage } from "@/lib/vault-storage";
import {
  deleteTrackAsset,
  getTrackAssetForTrack,
  insertTrackAsset,
  isTrackAssetKind,
  listTrackAssets,
  nextVersionLabel,
  resolveStemLabel,
  uniqueAssetSlug,
} from "@/lib/track-assets";
import { ingestTrackAsset, removeTrackAssetFile } from "@/lib/track-assets-ingest";
import { isAllowedImportAudioUrl, mp3OnlyErrorMessage } from "@/lib/tracks";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string }> };

async function canReadTrack(trackId: string) {
  const session = await getApiSession();
  const track = getTrackById(trackId);
  if (!track) return { ok: false as const, status: 404, error: "Track not found" };
  if (session && isSubscriber(session) && !isSubscriberVisible(track)) {
    return { ok: false as const, status: 404, error: "Track not found" };
  }
  if (!session) {
    if (!(await guestMayAccessTrack(trackId))) {
      return { ok: false as const, status: 401, error: "Unauthorized" };
    }
  }
  return { ok: true as const, track };
}

export async function GET(_req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const access = await canReadTrack(id);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const assets = listTrackAssets(id);
  return NextResponse.json({ assets });
}

export async function POST(req: NextRequest, context: RouteContext) {
  const staff = await getCatalogStaffSession();
  if (!staff.ok) {
    return NextResponse.json(
      { error: staff.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: staff.status },
    );
  }

  if (!spacesConfigured()) {
    return NextResponse.json({ error: spacesSetupMessage() }, { status: 500 });
  }

  const { id } = await context.params;
  const track = getTrackById(id);
  if (!track) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const kindRaw = String(form.get("kind") || "").trim();
  const labelInput = String(form.get("label") || "").trim();
  const file = form.get("audio");

  if (!isTrackAssetKind(kindRaw)) {
    return NextResponse.json({ error: "kind must be version or stem" }, { status: 400 });
  }
  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json({ error: "audio file is required" }, { status: 400 });
  }
  if (!isAllowedImportAudioUrl(file.name)) {
    return NextResponse.json({ error: mp3OnlyErrorMessage() }, { status: 400 });
  }

  const label =
    kindRaw === "version"
      ? nextVersionLabel(id)
      : resolveStemLabel(labelInput, file.name);

  const slug = uniqueAssetSlug(id, kindRaw, label);
  const sourceBytes = Buffer.from(await file.arrayBuffer());

  try {
    const vault = await ingestTrackAsset({
      trackId: id,
      kind: kindRaw,
      slug,
      sourceBytes,
      sourceHint: file.name,
    });

    const asset = insertTrackAsset({
      trackId: id,
      kind: kindRaw,
      label,
      slug,
      dropboxLink: vault.dropboxLink,
      dropboxDl: vault.dropboxDl,
      dropboxPath: vault.dropboxPath,
    });

    return NextResponse.json({ asset });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    console.error("[tracks/assets POST]", message, err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const staff = await getCatalogStaffSession();
  if (!staff.ok) {
    return NextResponse.json(
      { error: staff.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: staff.status },
    );
  }

  const { id } = await context.params;
  const assetId = req.nextUrl.searchParams.get("assetId")?.trim() || "";
  if (!assetId) {
    return NextResponse.json({ error: "assetId is required" }, { status: 400 });
  }

  const existing = getTrackAssetForTrack(id, assetId);
  if (!existing) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  try {
    await removeTrackAssetFile(existing.dropboxPath);
    deleteTrackAsset(assetId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
