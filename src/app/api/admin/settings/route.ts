import { NextRequest, NextResponse } from "next/server";
import { isSiteAdmin, getSession } from "@/lib/auth";
import { clearDropboxAccessTokenCache } from "@/lib/dropbox-auth";
import { clearSpacesClientCache } from "@/lib/storage/spaces";
import { ensureHouseComposer } from "@/lib/composers";
import {
  SETTINGS,
  applySettingUpdates,
  getPublisherRuntimeConfig,
  type SettingKey,
} from "@/lib/site-settings";

export const runtime = "nodejs";

const ALLOWED = new Set<string>(Object.values(SETTINGS));

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!isSiteAdmin(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const valuesIn = (body.values || {}) as Record<string, string>;
  const clearIn = Array.isArray(body.clear) ? (body.clear as string[]) : [];

  const values: Partial<Record<SettingKey, string>> = {};
  for (const [key, value] of Object.entries(valuesIn)) {
    if (!ALLOWED.has(key)) continue;
    values[key as SettingKey] = String(value ?? "");
  }

  if (SETTINGS.DROPBOX_APP_KEY in values) {
    const appKey = String(values[SETTINGS.DROPBOX_APP_KEY] || "").trim();
    if (appKey && (/@/.test(appKey) || /\s/.test(appKey))) {
      return NextResponse.json(
        {
          error:
            "Dropbox App key looks invalid (not an email). Paste the App key from the Dropbox App Console.",
        },
        { status: 400 },
      );
    }
  }

  const clear = clearIn.filter((key): key is SettingKey => ALLOWED.has(key));

  applySettingUpdates({ values, clear });

  const publisherKeys = [
    SETTINGS.PUBLISHER_HOUSE_NAME,
    SETTINGS.PUBLISHER_PRO_PA_IPI,
    SETTINGS.PUBLISHER_PRO_IPI_BASE,
  ] as const;
  if (
    publisherKeys.some((key) => key in values || clear.includes(key))
  ) {
    const cfg = getPublisherRuntimeConfig();
    if (cfg.houseName.trim()) {
      ensureHouseComposer({
        displayName: cfg.houseName.trim(),
        ipiPa: cfg.proPaIpiNameNumber.trim() || cfg.proIpiBaseNumber.trim(),
        ipiBase: cfg.proIpiBaseNumber.trim() || undefined,
      });
    }
  }

  // Dropbox tokens may have changed — force refresh on next call.
  if (
    clear.some((k) => k.startsWith("dropbox.")) ||
    Object.keys(values).some((k) => k.startsWith("dropbox."))
  ) {
    clearDropboxAccessTokenCache();
  }

  if (
    clear.some((k) => k.startsWith("spaces.")) ||
    Object.keys(values).some((k) => k.startsWith("spaces."))
  ) {
    clearSpacesClientCache();
  }

  return NextResponse.json({ ok: true });
}
