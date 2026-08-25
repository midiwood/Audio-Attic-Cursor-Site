import { NextRequest, NextResponse } from "next/server";
import { getSession, isSiteAdmin } from "@/lib/auth";
import { getMailRuntimeConfig } from "@/lib/site-settings";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!isSiteAdmin(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const to =
    String(body.to || "").trim() ||
    String(session?.user?.email || "").trim();
  if (!to) {
    return NextResponse.json({ error: "Recipient email required" }, { status: 400 });
  }

  const { apiKey, from } = getMailRuntimeConfig();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Resend API key is not set. Save it above first." },
      { status: 400 },
    );
  }

  try {
    const upstream = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: "Audio Attic — test email",
        text: "If you received this, playlist invite email is configured correctly.",
      }),
    });
    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const message =
        (payload as { message?: string })?.message ||
        `Resend request failed (${upstream.status})`;
      return NextResponse.json({ error: String(message) }, { status: 502 });
    }
    return NextResponse.json({ ok: true, to, id: (payload as { id?: string }).id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mail test failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
