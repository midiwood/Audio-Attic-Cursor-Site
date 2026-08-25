import { NextResponse } from "next/server";
import { getSession, isSiteAdmin } from "@/lib/auth";
import { getAiRuntimeConfig } from "@/lib/site-settings";

export const runtime = "nodejs";

export async function POST() {
  const session = await getSession();
  if (!isSiteAdmin(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { provider, geminiApiKey, geminiModel } = getAiRuntimeConfig();
  if (provider !== "gemini") {
    return NextResponse.json(
      { error: `Provider “${provider}” is not available yet. Choose Gemini.` },
      { status: 400 },
    );
  }
  if (!geminiApiKey) {
    return NextResponse.json({ error: "Gemini API key is not set." }, { status: 400 });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`;
  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": geminiApiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: 'Reply with exactly: {"ok":true}' }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    });
    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const message =
        payload?.error?.message ||
        payload?.error?.status ||
        `Gemini request failed (${upstream.status})`;
      return NextResponse.json({ error: String(message) }, { status: 502 });
    }
    return NextResponse.json({
      ok: true,
      provider: "gemini",
      model: geminiModel,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gemini test failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
