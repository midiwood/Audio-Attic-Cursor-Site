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

export function MailSettingsForm({
  initial,
}: {
  initial: {
    apiKey: SettingFieldStatus;
    from: SettingFieldStatus;
  };
}) {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [from, setFrom] = useState(initial.from.displayValue || "");
  const [testTo, setTestTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setStatus("");
    const clear = clearKey ? [SETTINGS.RESEND_API_KEY] : [];
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        values: {
          [SETTINGS.MAIL_FROM]: from.trim(),
          ...(apiKey.trim() && !clearKey ? { [SETTINGS.RESEND_API_KEY]: apiKey.trim() } : {}),
        },
        clear,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Could not save settings");
      return;
    }
    setApiKey("");
    setClearKey(false);
    setStatus("Email settings saved");
    router.refresh();
  }

  async function onTest() {
    setTesting(true);
    setError("");
    setStatus("");
    const res = await fetch("/api/admin/settings/test-mail", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: testTo.trim() || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    setTesting(false);
    if (!res.ok) {
      setError(data.error || "Send test failed");
      return;
    }
    setStatus(`Test email sent to ${data.to || "recipient"}`);
  }

  return (
    <div className="max-w-xl space-y-6">
      <p className="text-sm text-[var(--ink-dim)]">
        Playlist shares and staff license-request alerts use{" "}
        <a
          href="https://resend.com"
          target="_blank"
          rel="noreferrer"
          className="text-[var(--accent)] underline-offset-2 hover:underline"
        >
          Resend
        </a>
        . On the free plan you can only send to your Resend account email until you verify a
        domain. Then set From to an address on that domain. Until a key is set, license
        requests still save — alerts are logged on the server instead of emailed.
      </p>

      <form onSubmit={onSave} className="space-y-4 rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)]/70 p-5">
        <label className="block">
          <span className={labelClass}>Resend API key</span>
          <input
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              if (e.target.value) setClearKey(false);
            }}
            placeholder={
              initial.apiKey.configured
                ? `Saved · ${initial.apiKey.displayValue || "••••"}`
                : "re_…"
            }
            className={fieldClass}
          />
          <SourceHint field={initial.apiKey} />
          {initial.apiKey.source === "admin" ? (
            <label className="mt-2 flex items-center gap-2 text-xs text-[var(--ink-dim)]">
              <input
                type="checkbox"
                checked={clearKey}
                onChange={(e) => setClearKey(e.target.checked)}
              />
              Clear Admin override (fall back to .env)
            </label>
          ) : null}
        </label>

        <label className="block">
          <span className={labelClass}>From</span>
          <input
            type="text"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="Audio Attic <hello@yourdomain.com>"
            className={fieldClass}
          />
          <SourceHint field={initial.from} />
          <p className="mt-1 text-[11px] text-[var(--ink-dim)]">
            Before a domain is verified, use{" "}
            <code className="text-[var(--ink-muted)]">Audio Attic &lt;onboarding@resend.dev&gt;</code>
          </p>
        </label>

        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </form>

      <div className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)]/70 p-5">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
          Send test
        </div>
        <label className="block">
          <span className={labelClass}>To (optional — defaults to your login email)</span>
          <input
            type="email"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="you@example.com"
            className={fieldClass}
          />
        </label>
        <button
          type="button"
          disabled={testing || !initial.apiKey.configured}
          onClick={() => void onTest()}
          className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm text-[var(--ink)] transition hover:border-[var(--accent)] disabled:opacity-50"
        >
          {testing ? "Sending…" : "Send test email"}
        </button>
      </div>

      {status ? <p className="text-sm text-[var(--available)]">{status}</p> : null}
      {error ? <p className="text-sm text-[var(--exclusive)]">{error}</p> : null}
    </div>
  );
}
