import { NextResponse } from "next/server";
import { getSession, isSiteAdmin } from "@/lib/auth";
import {
  dropboxAuthConfigured,
  dropboxAuthSetupMessage,
  withDropboxToken,
  formatDropboxApiError,
} from "@/lib/dropbox-auth";

export const runtime = "nodejs";

export async function POST() {
  const session = await getSession();
  if (!isSiteAdmin(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!dropboxAuthConfigured()) {
    return NextResponse.json({ error: dropboxAuthSetupMessage() }, { status: 400 });
  }

  try {
    const result = await withDropboxToken(async (accessToken) => {
      const res = await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(formatDropboxApiError(data, res.status, "Dropbox account check failed"));
      }
      return {
        name: String(data?.name?.display_name || data?.email || "Connected"),
        email: String(data?.email || ""),
        accountId: String(data?.account_id || ""),
      };
    });

    return NextResponse.json({ ok: true, account: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dropbox test failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
