import { NextRequest, NextResponse } from "next/server";
import { getCatalogStaffSession } from "@/lib/auth";
import { toDropboxDlUrl } from "@/lib/tracks";

export const runtime = "nodejs";

function guessAudioContentType(url: string, fallback = "audio/mpeg") {
  const lower = url.toLowerCase();
  if (lower.includes(".wav")) return "audio/wav";
  if (lower.includes(".flac")) return "audio/flac";
  if (lower.includes(".aiff") || lower.includes(".aif")) return "audio/aiff";
  if (lower.includes(".m4a")) return "audio/mp4";
  if (lower.includes(".ogg")) return "audio/ogg";
  if (lower.includes(".mp3")) return "audio/mpeg";
  return fallback;
}

export async function GET(req: NextRequest) {
  const staff = await getCatalogStaffSession();
  if (!staff.ok) {
    return NextResponse.json(
      { error: staff.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: staff.status },
    );
  }

  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (!parsed.hostname.includes("dropbox.com") && !parsed.hostname.includes("dropboxusercontent.com")) {
    return NextResponse.json({ error: "Only Dropbox URLs are allowed" }, { status: 400 });
  }

  const target = toDropboxDlUrl(url);
  const range = req.headers.get("range") ?? undefined;
  const upstream = await fetch(target, {
    headers: range ? { Range: range } : undefined,
    redirect: "follow",
  });

  if (!upstream.ok && upstream.status !== 206) {
    return NextResponse.json(
      { error: `Upstream audio failed: ${upstream.status}` },
      { status: 502 },
    );
  }

  const headers = new Headers();
  for (const key of ["content-type", "content-length", "content-range", "accept-ranges"]) {
    const value = upstream.headers.get(key);
    if (value) headers.set(key, value);
  }

  const contentType = (headers.get("content-type") || "").toLowerCase();
  if (
    !contentType ||
    contentType.includes("octet-stream") ||
    contentType.includes("binary") ||
    contentType.includes("text/html")
  ) {
    headers.set("content-type", guessAudioContentType(url));
  }
  headers.set("cache-control", "private, max-age=300");
  headers.set("access-control-allow-origin", req.nextUrl.origin);

  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
