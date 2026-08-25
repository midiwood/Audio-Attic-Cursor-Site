import { NextRequest, NextResponse } from "next/server";
import { getCatalogStaffSession } from "@/lib/auth";
import {
  dropboxAuthConfigured,
  dropboxAuthSetupMessage,
  formatDropboxApiError,
  withDropboxToken,
} from "@/lib/dropbox-auth";
import { isMp3AudioUrl, mp3OnlyErrorMessage } from "@/lib/tracks";

export const runtime = "nodejs";

type SearchMatch = {
  path: string;
  name: string;
  size?: number;
};

async function searchDropboxFiles(token: string, filename: string): Promise<SearchMatch[]> {
  const res = await fetch("https://api.dropboxapi.com/2/files/search_v2", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: filename,
      options: {
        filename_only: true,
        max_results: 25,
      },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const summary = String(data?.error_summary || "");
    if (/expired_access_token|invalid_access_token/i.test(summary)) {
      throw new Error(summary);
    }
    throw new Error(formatDropboxApiError(data, res.status, "Dropbox search failed"));
  }

  const matches: SearchMatch[] = [];
  for (const item of data?.matches || []) {
    const metadata = item?.metadata?.metadata || item?.metadata;
    if (!metadata || metadata[".tag"] === "deleted") continue;
    const name = String(metadata.name || "");
    if (name.toLowerCase() !== filename.toLowerCase()) continue;
    matches.push({
      path: String(metadata.path_display || metadata.path_lower || ""),
      name,
      size: typeof metadata.size === "number" ? metadata.size : undefined,
    });
  }
  return matches.filter((m) => m.path);
}

async function createOrGetSharedLink(token: string, path: string): Promise<string> {
  const createRes = await fetch("https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      path,
      settings: { requested_visibility: "public", audience: "public", access: "viewer" },
    }),
  });

  if (createRes.ok) {
    const data = await createRes.json();
    return String(data.url || "");
  }

  const err = await createRes.json().catch(() => ({}));
  const alreadyExists =
    String(err?.error_summary || "").includes("shared_link_already_exists") ||
    err?.error?.[".tag"] === "shared_link_already_exists";

  if (alreadyExists) {
    const listRes = await fetch("https://api.dropboxapi.com/2/sharing/list_shared_links", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path, direct_only: true }),
    });
    const listData = await listRes.json().catch(() => ({}));
    const url = listData?.links?.[0]?.url;
    if (url) return String(url);
  }

  throw new Error(
    (() => {
      const summary = String(err?.error_summary || err?.error?.[".tag"] || "");
      if (/expired_access_token|invalid_access_token/i.test(summary)) {
        return summary;
      }
      return formatDropboxApiError(err, createRes.status, "Dropbox share failed");
    })(),
  );
}

export async function POST(req: NextRequest) {
  const staff = await getCatalogStaffSession();
  if (!staff.ok) {
    return NextResponse.json(
      { error: staff.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: staff.status },
    );
  }

  if (!dropboxAuthConfigured()) {
    return NextResponse.json({ error: dropboxAuthSetupMessage() }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const filename = String(body?.filename || "").trim();
  const size = typeof body?.size === "number" ? body.size : undefined;

  if (!filename) {
    return NextResponse.json({ error: "filename is required" }, { status: 400 });
  }

  if (!isMp3AudioUrl(filename) && !/\.mp3$/i.test(filename)) {
    return NextResponse.json({ error: mp3OnlyErrorMessage() }, { status: 400 });
  }

  try {
    return await withDropboxToken(async (token) => {
      const matches = await searchDropboxFiles(token, filename);
      if (!matches.length) {
        return NextResponse.json(
          {
            error: `No Dropbox file named “${filename}” found. Make sure it’s synced to Dropbox.`,
          },
          { status: 404 },
        );
      }

      const preferred =
        (typeof size === "number" ? matches.find((m) => m.size === size) : undefined) || matches[0];

      const dropboxLink = await createOrGetSharedLink(token, preferred.path);

      return NextResponse.json({
        dropboxLink,
        path: preferred.path,
        name: preferred.name,
        matchCount: matches.length,
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dropbox lookup failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
