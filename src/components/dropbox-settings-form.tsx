"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { SETTINGS, type SettingFieldStatus } from "@/lib/site-settings-shared";

const fieldClass =
  "w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]";

const labelClass =
  "mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]";

function SourceHint({ field }: { field: SettingFieldStatus }) {
  if (field.source === "admin") {
    return <p className="mt-1 text-[11px] text-[var(--available)]">Saved in Admin</p>;
  }
  if (field.source === "env") {
    return (
      <p className="mt-1 text-[11px] text-[var(--ink-dim)]">
        Using environment variable{field.displayValue ? ` · ${field.displayValue}` : ""}
      </p>
    );
  }
  return <p className="mt-1 text-[11px] text-[var(--ink-dim)]">Not set</p>;
}

export function DropboxSettingsForm({
  initial,
}: {
  initial: {
    appKey: SettingFieldStatus;
    appSecret: SettingFieldStatus;
    refreshToken: SettingFieldStatus;
    accessToken: SettingFieldStatus;
    uploadFolder: SettingFieldStatus;
  };
}) {
  const router = useRouter();
  const [appKey, setAppKey] = useState(initial.appKey.source === "admin" ? initial.appKey.displayValue : "");
  const [appSecret, setAppSecret] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [uploadFolder, setUploadFolder] = useState(initial.uploadFolder.displayValue);
  const [clearSecret, setClearSecret] = useState(false);
  const [clearRefresh, setClearRefresh] = useState(false);
  const [clearAccess, setClearAccess] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setStatus("");

    const clear: string[] = [];
    if (clearSecret) clear.push(SETTINGS.DROPBOX_APP_SECRET);
    if (clearRefresh) clear.push(SETTINGS.DROPBOX_REFRESH_TOKEN);
    if (clearAccess) clear.push(SETTINGS.DROPBOX_ACCESS_TOKEN);

    const values: Record<string, string> = {
      [SETTINGS.DROPBOX_APP_KEY]: appKey.trim(),
      [SETTINGS.DROPBOX_UPLOAD_FOLDER]: uploadFolder.trim(),
    };
    if (appSecret.trim() && !clearSecret) values[SETTINGS.DROPBOX_APP_SECRET] = appSecret.trim();
    if (refreshToken.trim() && !clearRefresh) {
      values[SETTINGS.DROPBOX_REFRESH_TOKEN] = refreshToken.trim();
    }
    if (accessToken.trim() && !clearAccess) {
      values[SETTINGS.DROPBOX_ACCESS_TOKEN] = accessToken.trim();
    }

    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values, clear }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Could not save settings");
      return;
    }
    setAppSecret("");
    setRefreshToken("");
    setAccessToken("");
    setClearSecret(false);
    setClearRefresh(false);
    setClearAccess(false);
    setStatus("Dropbox settings saved");
    router.refresh();
  }

  async function onTest() {
    setTesting(true);
    setError("");
    setStatus("");
    const res = await fetch("/api/admin/settings/test-dropbox", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setTesting(false);
    if (!res.ok) {
      setError(data.error || "Connection test failed");
      return;
    }
    const name = data.account?.name || "Connected";
    const email = data.account?.email ? ` · ${data.account.email}` : "";
    setStatus(`Connected · ${name}${email}`);
  }

  return (
    <form onSubmit={onSave} className="mx-auto max-w-xl space-y-5">
      <section className="space-y-4 rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)]/70 p-5">
        <div>
          <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
            App credentials
          </h2>
          <p className="mt-1.5 text-sm text-[var(--ink-dim)]">
            From the Dropbox App Console. Prefer refresh-token auth for long-term access.
          </p>
        </div>

        <label className="block">
          <span className={labelClass}>App key</span>
          <input
            className={fieldClass}
            value={appKey}
            onChange={(e) => setAppKey(e.target.value)}
            placeholder={
              initial.appKey.configured && initial.appKey.source === "env"
                ? `Using env · ${initial.appKey.displayValue}`
                : "App key"
            }
            autoComplete="off"
          />
          <SourceHint field={initial.appKey} />
        </label>

        <label className="block">
          <span className={labelClass}>App secret</span>
          <input
            type="password"
            className={fieldClass}
            value={appSecret}
            onChange={(e) => {
              setAppSecret(e.target.value);
              if (e.target.value) setClearSecret(false);
            }}
            placeholder={
              initial.appSecret.configured
                ? `Saved · ${initial.appSecret.displayValue || "••••"}`
                : "App secret"
            }
            autoComplete="off"
            disabled={clearSecret}
          />
          <SourceHint field={initial.appSecret} />
        </label>
        {initial.appSecret.source === "admin" ? (
          <label className="flex items-center gap-2 text-sm text-[var(--ink-muted)]">
            <input
              type="checkbox"
              checked={clearSecret}
              onChange={(e) => {
                setClearSecret(e.target.checked);
                if (e.target.checked) setAppSecret("");
              }}
            />
            Remove Admin-saved app secret
          </label>
        ) : null}

        <label className="block">
          <span className={labelClass}>Refresh token</span>
          <input
            type="password"
            className={fieldClass}
            value={refreshToken}
            onChange={(e) => {
              setRefreshToken(e.target.value);
              if (e.target.value) setClearRefresh(false);
            }}
            placeholder={
              initial.refreshToken.configured
                ? `Saved · ${initial.refreshToken.displayValue || "••••"}`
                : "Offline refresh token"
            }
            autoComplete="off"
            disabled={clearRefresh}
          />
          <SourceHint field={initial.refreshToken} />
          <p className="mt-1 text-[11px] text-[var(--ink-dim)]">
            Generate with <code className="text-[var(--ink-muted)]">npm run dropbox:oauth</code>
          </p>
        </label>
        {initial.refreshToken.source === "admin" ? (
          <label className="flex items-center gap-2 text-sm text-[var(--ink-muted)]">
            <input
              type="checkbox"
              checked={clearRefresh}
              onChange={(e) => {
                setClearRefresh(e.target.checked);
                if (e.target.checked) setRefreshToken("");
              }}
            />
            Remove Admin-saved refresh token
          </label>
        ) : null}
      </section>

      <section className="space-y-4 rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)]/70 p-5">
        <div>
          <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
            Optional
          </h2>
        </div>

        <label className="block">
          <span className={labelClass}>Short-lived access token</span>
          <input
            type="password"
            className={fieldClass}
            value={accessToken}
            onChange={(e) => {
              setAccessToken(e.target.value);
              if (e.target.value) setClearAccess(false);
            }}
            placeholder={
              initial.accessToken.configured
                ? `Saved · ${initial.accessToken.displayValue || "••••"}`
                : "Only if you are not using a refresh token"
            }
            autoComplete="off"
            disabled={clearAccess}
          />
          <SourceHint field={initial.accessToken} />
        </label>
        {initial.accessToken.source === "admin" ? (
          <label className="flex items-center gap-2 text-sm text-[var(--ink-muted)]">
            <input
              type="checkbox"
              checked={clearAccess}
              onChange={(e) => {
                setClearAccess(e.target.checked);
                if (e.target.checked) setAccessToken("");
              }}
            />
            Remove Admin-saved access token
          </label>
        ) : null}

        <label className="block">
          <span className={labelClass}>Upload folder</span>
          <input
            className={fieldClass}
            value={uploadFolder}
            onChange={(e) => setUploadFolder(e.target.value)}
            placeholder="/Audio Attic Imports"
          />
          <SourceHint field={initial.uploadFolder} />
        </label>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save Dropbox settings"}
        </button>
        <button
          type="button"
          disabled={testing || busy}
          onClick={() => void onTest()}
          className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)] disabled:opacity-50"
        >
          {testing ? "Testing…" : "Test connection"}
        </button>
      </div>

      {error ? <p className="text-sm text-[var(--exclusive)]">{error}</p> : null}
      {status ? <p className="text-sm text-[var(--available)]">{status}</p> : null}
    </form>
  );
}
