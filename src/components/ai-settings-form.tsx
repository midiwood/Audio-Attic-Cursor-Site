"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AI_PROVIDERS,
  GEMINI_KEY_SLOT_OPTIONS,
  GEMINI_MODEL_OPTIONS,
  SETTINGS,
  type SettingFieldStatus,
} from "@/lib/site-settings-shared";

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

export function AiSettingsForm({
  initial,
}: {
  initial: {
    provider: SettingFieldStatus;
    geminiApiKey: SettingFieldStatus;
    geminiApiKey2: SettingFieldStatus;
    geminiApiKey3: SettingFieldStatus;
    geminiActiveKey: SettingFieldStatus;
    geminiModel: SettingFieldStatus;
  };
}) {
  const router = useRouter();
  const [provider, setProvider] = useState(initial.provider.displayValue || "gemini");
  const [activeKey, setActiveKey] = useState(initial.geminiActiveKey.displayValue || "key1");
  const [apiKey1, setApiKey1] = useState("");
  const [apiKey2, setApiKey2] = useState("");
  const [apiKey3, setApiKey3] = useState("");
  const [clearKey1, setClearKey1] = useState(false);
  const [clearKey2, setClearKey2] = useState(false);
  const [clearKey3, setClearKey3] = useState(false);
  const [model, setModel] = useState(initial.geminiModel.displayValue || "gemini-3.6-flash");
  const [customModel, setCustomModel] = useState(
    GEMINI_MODEL_OPTIONS.includes(initial.geminiModel.displayValue as (typeof GEMINI_MODEL_OPTIONS)[number])
      ? ""
      : initial.geminiModel.displayValue,
  );
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const modelValue = customModel.trim() || model;

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setStatus("");
    const clear = [
      ...(clearKey1 ? [SETTINGS.GEMINI_API_KEY] : []),
      ...(clearKey2 ? [SETTINGS.GEMINI_API_KEY_2] : []),
      ...(clearKey3 ? [SETTINGS.GEMINI_API_KEY_3] : []),
    ];
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        values: {
          [SETTINGS.AI_PROVIDER]: provider,
          [SETTINGS.GEMINI_ACTIVE_KEY]: activeKey,
          [SETTINGS.GEMINI_MODEL]: modelValue,
          ...(apiKey1.trim() && !clearKey1 ? { [SETTINGS.GEMINI_API_KEY]: apiKey1.trim() } : {}),
          ...(apiKey2.trim() && !clearKey2
            ? { [SETTINGS.GEMINI_API_KEY_2]: apiKey2.trim() }
            : {}),
          ...(apiKey3.trim() && !clearKey3
            ? { [SETTINGS.GEMINI_API_KEY_3]: apiKey3.trim() }
            : {}),
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
    setApiKey1("");
    setApiKey2("");
    setApiKey3("");
    setClearKey1(false);
    setClearKey2(false);
    setClearKey3(false);
    setStatus("AI settings saved");
    router.refresh();
  }

  async function onTest() {
    setTesting(true);
    setError("");
    setStatus("");
    const res = await fetch("/api/admin/settings/test-ai", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setTesting(false);
    if (!res.ok) {
      setError(data.error || "Connection test failed");
      return;
    }
    setStatus(`Connected · ${data.model || modelValue}`);
  }

  return (
    <form onSubmit={onSave} className="mx-auto max-w-xl space-y-5">
      <section className="space-y-4 rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)]/70 p-5">
        <div>
          <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
            Provider
          </h2>
          <p className="mt-1.5 text-sm text-[var(--ink-dim)]">
            Used for catalog tagging. More providers can be added later.
          </p>
        </div>
        <label className="block">
          <span className={labelClass}>AI provider</span>
          <select
            className={fieldClass}
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
          >
            {AI_PROVIDERS.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={!opt.available}>
                {opt.label}
                {!opt.available ? " (soon)" : ""}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="space-y-4 rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)]/70 p-5">
        <div>
          <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
            Gemini
          </h2>
          <p className="mt-1.5 text-sm text-[var(--ink-dim)]">
            Up to 3 Gemini keys. Pick the active key used for tagging.
          </p>
        </div>

        <label className="block">
          <span className={labelClass}>Active Gemini key</span>
          <select
            className={fieldClass}
            value={activeKey}
            onChange={(e) => setActiveKey(e.target.value)}
          >
            {GEMINI_KEY_SLOT_OPTIONS.map((slot) => (
              <option key={slot} value={slot}>
                {slot === "key1" ? "Key 1" : slot === "key2" ? "Key 2" : "Key 3"}
              </option>
            ))}
          </select>
          <SourceHint field={initial.geminiActiveKey} />
        </label>

        <label className="block">
          <span className={labelClass}>API key 1</span>
          <input
            type="password"
            className={fieldClass}
            value={apiKey1}
            onChange={(e) => {
              setApiKey1(e.target.value);
              if (e.target.value) setClearKey1(false);
            }}
            placeholder={
              initial.geminiApiKey.configured
                ? `Saved · ${initial.geminiApiKey.displayValue || "••••"}`
                : "Paste Gemini API key"
            }
            autoComplete="off"
            disabled={clearKey1}
          />
          <SourceHint field={initial.geminiApiKey} />
        </label>

        {initial.geminiApiKey.source === "admin" ? (
          <label className="flex items-center gap-2 text-sm text-[var(--ink-muted)]">
            <input
              type="checkbox"
              checked={clearKey1}
              onChange={(e) => {
                setClearKey1(e.target.checked);
                if (e.target.checked) setApiKey1("");
              }}
            />
            Remove Admin-saved key 1 (fall back to .env if set)
          </label>
        ) : null}

        <label className="block">
          <span className={labelClass}>API key 2</span>
          <input
            type="password"
            className={fieldClass}
            value={apiKey2}
            onChange={(e) => {
              setApiKey2(e.target.value);
              if (e.target.value) setClearKey2(false);
            }}
            placeholder={
              initial.geminiApiKey2.configured
                ? `Saved · ${initial.geminiApiKey2.displayValue || "••••"}`
                : "Optional"
            }
            autoComplete="off"
            disabled={clearKey2}
          />
          <SourceHint field={initial.geminiApiKey2} />
        </label>

        {initial.geminiApiKey2.source === "admin" ? (
          <label className="flex items-center gap-2 text-sm text-[var(--ink-muted)]">
            <input
              type="checkbox"
              checked={clearKey2}
              onChange={(e) => {
                setClearKey2(e.target.checked);
                if (e.target.checked) setApiKey2("");
              }}
            />
            Remove Admin-saved key 2 (fall back to .env if set)
          </label>
        ) : null}

        <label className="block">
          <span className={labelClass}>API key 3</span>
          <input
            type="password"
            className={fieldClass}
            value={apiKey3}
            onChange={(e) => {
              setApiKey3(e.target.value);
              if (e.target.value) setClearKey3(false);
            }}
            placeholder={
              initial.geminiApiKey3.configured
                ? `Saved · ${initial.geminiApiKey3.displayValue || "••••"}`
                : "Optional"
            }
            autoComplete="off"
            disabled={clearKey3}
          />
          <SourceHint field={initial.geminiApiKey3} />
        </label>

        {initial.geminiApiKey3.source === "admin" ? (
          <label className="flex items-center gap-2 text-sm text-[var(--ink-muted)]">
            <input
              type="checkbox"
              checked={clearKey3}
              onChange={(e) => {
                setClearKey3(e.target.checked);
                if (e.target.checked) setApiKey3("");
              }}
            />
            Remove Admin-saved key 3 (fall back to .env if set)
          </label>
        ) : null}

        <label className="block">
          <span className={labelClass}>Model</span>
          <select
            className={fieldClass}
            value={
              GEMINI_MODEL_OPTIONS.includes(model as (typeof GEMINI_MODEL_OPTIONS)[number]) &&
              !customModel
                ? model
                : "__custom__"
            }
            onChange={(e) => {
              if (e.target.value === "__custom__") {
                setCustomModel(model);
                return;
              }
              setCustomModel("");
              setModel(e.target.value);
            }}
          >
            {GEMINI_MODEL_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
            <option value="__custom__">Custom…</option>
          </select>
          <SourceHint field={initial.geminiModel} />
        </label>

        {(customModel ||
          !GEMINI_MODEL_OPTIONS.includes(model as (typeof GEMINI_MODEL_OPTIONS)[number])) && (
          <label className="block">
            <span className={labelClass}>Custom model id</span>
            <input
              className={fieldClass}
              value={customModel || model}
              onChange={(e) => setCustomModel(e.target.value)}
              placeholder="e.g. gemini-2.5-pro"
            />
          </label>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save AI settings"}
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
