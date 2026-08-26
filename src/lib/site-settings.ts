import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { siteSettings } from "@/db/schema";
import {
  SETTINGS,
  type SettingKey,
  type SettingFieldStatus,
} from "@/lib/site-settings-shared";

export {
  SETTINGS,
  AI_PROVIDERS,
  GEMINI_MODEL_OPTIONS,
  type SettingKey,
  type SettingFieldStatus,
} from "@/lib/site-settings-shared";

const ENV_FOR_KEY: Partial<Record<SettingKey, string>> = {
  [SETTINGS.GEMINI_API_KEY]: "GEMINI_API_KEY",
  [SETTINGS.GEMINI_API_KEY_2]: "GEMINI_API_KEY_2",
  [SETTINGS.GEMINI_API_KEY_3]: "GEMINI_API_KEY_3",
  [SETTINGS.GEMINI_ACTIVE_KEY]: "GEMINI_ACTIVE_KEY",
  [SETTINGS.GEMINI_MODEL]: "GEMINI_MODEL",
  [SETTINGS.DROPBOX_APP_KEY]: "DROPBOX_APP_KEY",
  [SETTINGS.DROPBOX_APP_SECRET]: "DROPBOX_APP_SECRET",
  [SETTINGS.DROPBOX_REFRESH_TOKEN]: "DROPBOX_REFRESH_TOKEN",
  [SETTINGS.DROPBOX_ACCESS_TOKEN]: "DROPBOX_ACCESS_TOKEN",
  [SETTINGS.DROPBOX_UPLOAD_FOLDER]: "DROPBOX_UPLOAD_FOLDER",
  [SETTINGS.RESEND_API_KEY]: "RESEND_API_KEY",
  [SETTINGS.MAIL_FROM]: "MAIL_FROM",
};

const SECRET_KEYS = new Set<SettingKey>([
  SETTINGS.GEMINI_API_KEY,
  SETTINGS.GEMINI_API_KEY_2,
  SETTINGS.GEMINI_API_KEY_3,
  SETTINGS.DROPBOX_APP_SECRET,
  SETTINGS.DROPBOX_REFRESH_TOKEN,
  SETTINGS.DROPBOX_ACCESS_TOKEN,
  SETTINGS.RESEND_API_KEY,
]);

export function isSecretSetting(key: string) {
  return SECRET_KEYS.has(key as SettingKey);
}

function envValue(key: SettingKey): string {
  const envName = ENV_FOR_KEY[key];
  if (!envName) return "";
  return String(process.env[envName] || "").trim();
}

function dbValue(key: SettingKey): string {
  const row = db
    .select()
    .from(siteSettings)
    .where(eq(siteSettings.key, key))
    .get();
  return String(row?.value || "").trim();
}

/** Stored Admin value if set, otherwise matching env, otherwise fallback. */
export function resolveSetting(key: SettingKey, fallback = ""): string {
  const stored = dbValue(key);
  if (stored) return stored;
  const fromEnv = envValue(key);
  if (fromEnv) return fromEnv;
  return fallback;
}

export function settingSource(key: SettingKey): "admin" | "env" | "none" {
  if (dbValue(key)) return "admin";
  if (envValue(key)) return "env";
  return "none";
}

export function maskSecret(value: string): string {
  const v = value.trim();
  if (!v) return "";
  if (v.length <= 8) return "••••••••";
  return `${v.slice(0, 4)}••••${v.slice(-4)}`;
}

export function getSettingFieldStatus(key: SettingKey): SettingFieldStatus {
  const source = settingSource(key);
  const value = resolveSetting(key);
  return {
    key,
    source,
    configured: Boolean(value),
    displayValue: isSecretSetting(key) ? (value ? maskSecret(value) : "") : value,
  };
}

export function getAiRuntimeConfig() {
  const provider = resolveSetting(SETTINGS.AI_PROVIDER, "gemini") || "gemini";
  const activeKey = resolveSetting(SETTINGS.GEMINI_ACTIVE_KEY, "key1") || "key1";
  const key1 = resolveSetting(SETTINGS.GEMINI_API_KEY);
  const key2 = resolveSetting(SETTINGS.GEMINI_API_KEY_2);
  const key3 = resolveSetting(SETTINGS.GEMINI_API_KEY_3);
  const keyBySlot =
    activeKey === "key2" ? key2 : activeKey === "key3" ? key3 : key1;
  return {
    provider,
    geminiApiKey: keyBySlot || key1 || key2 || key3 || "",
    geminiActiveKey: activeKey,
    geminiModel: resolveSetting(SETTINGS.GEMINI_MODEL, "gemini-3.6-flash") || "gemini-3.6-flash",
  };
}

export function getDropboxRuntimeConfig() {
  return {
    appKey: resolveSetting(SETTINGS.DROPBOX_APP_KEY),
    appSecret: resolveSetting(SETTINGS.DROPBOX_APP_SECRET),
    refreshToken: resolveSetting(SETTINGS.DROPBOX_REFRESH_TOKEN),
    accessToken: resolveSetting(SETTINGS.DROPBOX_ACCESS_TOKEN),
    uploadFolder:
      resolveSetting(SETTINGS.DROPBOX_UPLOAD_FOLDER, "/_Business/Audio Attic/Vault") ||
      "/_Business/Audio Attic/Vault",
  };
}

export function upsertSetting(key: SettingKey, value: string) {
  const now = new Date().toISOString();
  const trimmed = value.trim();
  db.insert(siteSettings)
    .values({ key, value: trimmed, updatedAt: now })
    .onConflictDoUpdate({
      target: siteSettings.key,
      set: { value: trimmed, updatedAt: now },
    })
    .run();
}

export function deleteSetting(key: SettingKey) {
  db.delete(siteSettings).where(eq(siteSettings.key, key)).run();
}

/**
 * Apply Admin form updates.
 * - Secret fields: empty string = leave unchanged; use clear to remove Admin override.
 * - Non-secret empty: remove Admin override so env can take over.
 */
export function applySettingUpdates(opts: {
  values?: Partial<Record<SettingKey, string>>;
  clear?: SettingKey[];
}) {
  for (const key of opts.clear || []) {
    deleteSetting(key);
  }
  for (const [rawKey, rawValue] of Object.entries(opts.values || {})) {
    const key = rawKey as SettingKey;
    if (!Object.values(SETTINGS).includes(key)) continue;
    const value = String(rawValue ?? "");
    if (isSecretSetting(key) && !value.trim()) continue;
    if (!isSecretSetting(key) && !value.trim()) {
      deleteSetting(key);
      continue;
    }
    upsertSetting(key, value);
  }
}

export function getAiSettingsView() {
  const provider = getSettingFieldStatus(SETTINGS.AI_PROVIDER);
  const active = getSettingFieldStatus(SETTINGS.GEMINI_ACTIVE_KEY);
  return {
    provider: {
      ...provider,
      displayValue: resolveSetting(SETTINGS.AI_PROVIDER, "gemini") || "gemini",
    },
    geminiApiKey: getSettingFieldStatus(SETTINGS.GEMINI_API_KEY),
    geminiApiKey2: getSettingFieldStatus(SETTINGS.GEMINI_API_KEY_2),
    geminiApiKey3: getSettingFieldStatus(SETTINGS.GEMINI_API_KEY_3),
    geminiActiveKey: {
      ...active,
      displayValue: resolveSetting(SETTINGS.GEMINI_ACTIVE_KEY, "key1") || "key1",
    },
    geminiModel: {
      ...getSettingFieldStatus(SETTINGS.GEMINI_MODEL),
      displayValue: resolveSetting(SETTINGS.GEMINI_MODEL, "gemini-3.6-flash") || "gemini-3.6-flash",
    },
  };
}

export function getDropboxSettingsView() {
  return {
    appKey: getSettingFieldStatus(SETTINGS.DROPBOX_APP_KEY),
    appSecret: getSettingFieldStatus(SETTINGS.DROPBOX_APP_SECRET),
    refreshToken: getSettingFieldStatus(SETTINGS.DROPBOX_REFRESH_TOKEN),
    accessToken: getSettingFieldStatus(SETTINGS.DROPBOX_ACCESS_TOKEN),
    uploadFolder: {
      ...getSettingFieldStatus(SETTINGS.DROPBOX_UPLOAD_FOLDER),
      displayValue:
        resolveSetting(SETTINGS.DROPBOX_UPLOAD_FOLDER, "/_Business/Audio Attic/Vault") ||
        "/_Business/Audio Attic/Vault",
    },
  };
}

export function getMailRuntimeConfig() {
  return {
    apiKey: resolveSetting(SETTINGS.RESEND_API_KEY),
    from:
      resolveSetting(SETTINGS.MAIL_FROM, "Audio Attic <onboarding@resend.dev>") ||
      "Audio Attic <onboarding@resend.dev>",
  };
}

export function getMailSettingsView() {
  return {
    apiKey: getSettingFieldStatus(SETTINGS.RESEND_API_KEY),
    from: {
      ...getSettingFieldStatus(SETTINGS.MAIL_FROM),
      displayValue:
        resolveSetting(SETTINGS.MAIL_FROM, "Audio Attic <onboarding@resend.dev>") ||
        "Audio Attic <onboarding@resend.dev>",
    },
  };
}

export type PublisherRuntimeConfig = {
  houseName: string;
  proRelationNumber: string;
  proIpiBaseNumber: string;
  proPaIpiNameNumber: string;
};

/** Prefer PA IPI name number for rights-holder IPI; fall back to base. */
export function getPublisherRuntimeConfig(): PublisherRuntimeConfig {
  ensurePublisherSettingsSeeded();
  return {
    houseName: resolveSetting(SETTINGS.PUBLISHER_HOUSE_NAME),
    proRelationNumber: resolveSetting(SETTINGS.PUBLISHER_PRO_RELATION),
    proIpiBaseNumber: resolveSetting(SETTINGS.PUBLISHER_PRO_IPI_BASE),
    proPaIpiNameNumber: resolveSetting(SETTINGS.PUBLISHER_PRO_PA_IPI),
  };
}

export function getPublisherSettingsView() {
  ensurePublisherSettingsSeeded();
  return {
    houseName: getSettingFieldStatus(SETTINGS.PUBLISHER_HOUSE_NAME),
    proRelationNumber: getSettingFieldStatus(SETTINGS.PUBLISHER_PRO_RELATION),
    proIpiBaseNumber: getSettingFieldStatus(SETTINGS.PUBLISHER_PRO_IPI_BASE),
    proPaIpiNameNumber: getSettingFieldStatus(SETTINGS.PUBLISHER_PRO_PA_IPI),
  };
}

let publisherSeedAttempted = false;

/**
 * One-time seed: if house/PRO settings empty, copy from site-admin user (or first
 * staff user with PRO fields / name). Idempotent via publisherSeedAttempted + empty checks.
 */
export function ensurePublisherSettingsSeeded() {
  if (publisherSeedAttempted) return;
  publisherSeedAttempted = true;

  const house = dbValue(SETTINGS.PUBLISHER_HOUSE_NAME);
  const relation = dbValue(SETTINGS.PUBLISHER_PRO_RELATION);
  const ipiBase = dbValue(SETTINGS.PUBLISHER_PRO_IPI_BASE);
  const paIpi = dbValue(SETTINGS.PUBLISHER_PRO_PA_IPI);
  if (house && relation && ipiBase && paIpi) return;

  try {
    const rows = db
      .select({
        name: user.name,
        role: user.role,
        proRelationNumber: user.proRelationNumber,
        proIpiBaseNumber: user.proIpiBaseNumber,
        proPaIpiNameNumber: user.proPaIpiNameNumber,
      })
      .from(user)
      .all();

    const admins = rows.filter((r) => {
      const role = String(r.role || "");
      return role === "admin" || role.split(",").includes("admin");
    });
    const staff = rows.filter((r) => {
      const role = String(r.role || "");
      return (
        role === "admin" ||
        role === "editor" ||
        role.split(",").includes("admin") ||
        role.split(",").includes("editor")
      );
    });

    const withPro =
      admins.find(
        (r) =>
          (r.proPaIpiNameNumber || "").trim() ||
          (r.proIpiBaseNumber || "").trim() ||
          (r.proRelationNumber || "").trim(),
      ) ||
      staff.find(
        (r) =>
          (r.proPaIpiNameNumber || "").trim() ||
          (r.proIpiBaseNumber || "").trim() ||
          (r.proRelationNumber || "").trim(),
      ) ||
      admins[0] ||
      staff[0];

    if (!withPro) return;

    if (!house && (withPro.name || "").trim()) {
      upsertSetting(SETTINGS.PUBLISHER_HOUSE_NAME, withPro.name.trim());
    }
    if (!relation && (withPro.proRelationNumber || "").trim()) {
      upsertSetting(SETTINGS.PUBLISHER_PRO_RELATION, withPro.proRelationNumber!.trim());
    }
    if (!ipiBase && (withPro.proIpiBaseNumber || "").trim()) {
      upsertSetting(SETTINGS.PUBLISHER_PRO_IPI_BASE, withPro.proIpiBaseNumber!.trim());
    }
    if (!paIpi && (withPro.proPaIpiNameNumber || "").trim()) {
      upsertSetting(SETTINGS.PUBLISHER_PRO_PA_IPI, withPro.proPaIpiNameNumber!.trim());
    }
  } catch {
    // Seed is best-effort; settings page still works empty.
  }
}
