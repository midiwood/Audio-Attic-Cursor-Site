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

export function SpacesSettingsForm({
  initial,
}: {
  initial: {
    key: SettingFieldStatus;
    secret: SettingFieldStatus;
    bucket: SettingFieldStatus;
    region: SettingFieldStatus;
    prefix: SettingFieldStatus;
    presignTtlSec: SettingFieldStatus;
    cdnEndpoint: SettingFieldStatus;
  };
}) {
  const router = useRouter();
  const [accessKey, setAccessKey] = useState(initial.key.source === "admin" ? initial.key.displayValue : "");
  const [secret, setSecret] = useState("");
  const [bucket, setBucket] = useState(initial.bucket.displayValue);
  const [region, setRegion] = useState(initial.region.displayValue);
  const [prefix, setPrefix] = useState(initial.prefix.displayValue);
  const [presignTtlSec, setPresignTtlSec] = useState(initial.presignTtlSec.displayValue);
  const [cdnEndpoint, setCdnEndpoint] = useState(initial.cdnEndpoint.displayValue);
  const [clearSecret, setClearSecret] = useState(false);
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
    if (clearSecret) clear.push(SETTINGS.SPACES_SECRET);

    const values: Record<string, string> = {
      [SETTINGS.SPACES_KEY]: accessKey.trim(),
      [SETTINGS.SPACES_BUCKET]: bucket.trim(),
      [SETTINGS.SPACES_REGION]: region.trim(),
      [SETTINGS.SPACES_PREFIX]: prefix.trim(),
      [SETTINGS.SPACES_PRESIGN_TTL_SEC]: presignTtlSec.trim(),
      [SETTINGS.SPACES_CDN_ENDPOINT]: cdnEndpoint.trim(),
    };
    if (secret.trim() && !clearSecret) values[SETTINGS.SPACES_SECRET] = secret.trim();

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
    setSecret("");
    setClearSecret(false);
    setStatus("Storage settings saved");
    router.refresh();
  }

  async function onTest() {
    setTesting(true);
    setError("");
    setStatus("");
    const res = await fetch("/api/admin/settings/test-spaces", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        key: accessKey.trim(),
        secret: secret.trim(),
        bucket: bucket.trim(),
        region: region.trim(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setTesting(false);
    if (!res.ok) {
      setError(data.error || "Connection test failed");
      return;
    }
    if (typeof data.bucket === "string" && data.bucket && data.bucket !== bucket.trim()) {
      setBucket(data.bucket);
    }
    if (typeof data.region === "string" && data.region && data.region !== region.trim()) {
      setRegion(data.region);
    }
    setStatus(
      data.regionCorrected
        ? `Connected — bucket is in ${data.region} (region field updated)`
        : "Connected to bucket",
    );
  }

  return (
    <form onSubmit={onSave} className="mx-auto max-w-xl space-y-5">
      <section className="space-y-4 rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)]/70 p-5">
        <div>
          <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
            DigitalOcean Spaces
          </h2>
          <p className="mt-1.5 text-sm text-[var(--ink-dim)]">
            Private bucket for vault audio. Playback uses short-lived presigned URLs — audio does not
            stream through cPanel.
          </p>
        </div>

        <label className="block">
          <span className={labelClass}>Access key</span>
          <input className={fieldClass} value={accessKey} onChange={(e) => setAccessKey(e.target.value)} autoComplete="off" />
          <SourceHint field={initial.key} />
        </label>

        <label className="block">
          <span className={labelClass}>Secret key</span>
          <input
            type="password"
            className={fieldClass}
            value={secret}
            onChange={(e) => {
              setSecret(e.target.value);
              if (e.target.value) setClearSecret(false);
            }}
            placeholder={initial.secret.configured ? `Saved · ${initial.secret.displayValue || "••••"}` : "Secret key"}
            autoComplete="off"
            disabled={clearSecret}
          />
          <SourceHint field={initial.secret} />
        </label>
        {initial.secret.source === "admin" ? (
          <label className="flex items-center gap-2 text-sm text-[var(--ink-muted)]">
            <input type="checkbox" checked={clearSecret} onChange={(e) => { setClearSecret(e.target.checked); if (e.target.checked) setSecret(""); }} />
            Remove Admin-saved secret
          </label>
        ) : null}

        <label className="block">
          <span className={labelClass}>Bucket name</span>
          <input className={fieldClass} value={bucket} onChange={(e) => setBucket(e.target.value)} placeholder="my-space-name" />
          <SourceHint field={initial.bucket} />
          <p className="mt-1 text-[11px] text-[var(--ink-dim)]">
            Name only — not the full URL. Example: <code className="text-[var(--ink-muted)]">audio-attic-vault</code>
          </p>
        </label>

        <label className="block">
          <span className={labelClass}>Region</span>
          <input className={fieldClass} value={region} onChange={(e) => setRegion(e.target.value)} placeholder="nyc3" />
          <SourceHint field={initial.region} />
          <p className="mt-1 text-[11px] text-[var(--ink-dim)]">
            Datacenter where the Space was created (shown in DigitalOcean → Spaces). Common: nyc3, sfo3, ams3, sgp1.
          </p>
        </label>

        <label className="block">
          <span className={labelClass}>Object key prefix</span>
          <input className={fieldClass} value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="vault" />
          <SourceHint field={initial.prefix} />
          <p className="mt-1 text-[11px] text-[var(--ink-dim)]">
            Files stored as <code className="text-[var(--ink-muted)]">{"{prefix}/{trackId}/track.mp3"}</code>
          </p>
        </label>

        <label className="block">
          <span className={labelClass}>Presigned URL TTL (seconds)</span>
          <input className={fieldClass} value={presignTtlSec} onChange={(e) => setPresignTtlSec(e.target.value)} placeholder="14400" />
          <SourceHint field={initial.presignTtlSec} />
        </label>

        <label className="block">
          <span className={labelClass}>CDN endpoint (optional)</span>
          <input className={fieldClass} value={cdnEndpoint} onChange={(e) => setCdnEndpoint(e.target.value)} placeholder="https://bucket.nyc3.cdn.digitaloceanspaces.com" />
          <SourceHint field={initial.cdnEndpoint} />
        </label>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={busy} className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-50">
          {busy ? "Saving…" : "Save storage settings"}
        </button>
        <button type="button" disabled={testing || busy} onClick={() => void onTest()} className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)] disabled:opacity-50">
          {testing ? "Testing…" : "Test connection"}
        </button>
        <p className="w-full text-[11px] text-[var(--ink-dim)]">
          Tests the values in this form. Save first if you want production to use Admin-saved settings.
        </p>
      </div>

      {error ? <p className="text-sm text-[var(--exclusive)]">{error}</p> : null}
      {status ? <p className="text-sm text-[var(--available)]">{status}</p> : null}
    </form>
  );
}
