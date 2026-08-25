export const SETTINGS = {
  AI_PROVIDER: "ai.provider",
  GEMINI_API_KEY: "ai.gemini.apiKey",
  GEMINI_API_KEY_2: "ai.gemini.apiKey2",
  GEMINI_API_KEY_3: "ai.gemini.apiKey3",
  GEMINI_ACTIVE_KEY: "ai.gemini.activeKey",
  GEMINI_MODEL: "ai.gemini.model",
  DROPBOX_APP_KEY: "dropbox.appKey",
  DROPBOX_APP_SECRET: "dropbox.appSecret",
  DROPBOX_REFRESH_TOKEN: "dropbox.refreshToken",
  DROPBOX_ACCESS_TOKEN: "dropbox.accessToken",
  DROPBOX_UPLOAD_FOLDER: "dropbox.uploadFolder",
  RESEND_API_KEY: "mail.resend.apiKey",
  MAIL_FROM: "mail.from",
  PUBLISHER_HOUSE_NAME: "publisher.houseName",
  PUBLISHER_PRO_RELATION: "publisher.proRelationNumber",
  PUBLISHER_PRO_IPI_BASE: "publisher.proIpiBaseNumber",
  PUBLISHER_PRO_PA_IPI: "publisher.proPaIpiNameNumber",
} as const;

export type SettingKey = (typeof SETTINGS)[keyof typeof SETTINGS];

export const AI_PROVIDERS = [
  { value: "gemini", label: "Google Gemini", available: true },
  { value: "openai", label: "OpenAI", available: false },
  { value: "anthropic", label: "Anthropic", available: false },
] as const;

export const GEMINI_MODEL_OPTIONS = [
  "gemini-3.6-flash",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
] as const;

export const GEMINI_KEY_SLOT_OPTIONS = ["key1", "key2", "key3"] as const;

export type SettingFieldStatus = {
  key: SettingKey;
  source: "admin" | "env" | "none";
  configured: boolean;
  /** Non-secret: current value. Secret: masked preview or "". */
  displayValue: string;
};
