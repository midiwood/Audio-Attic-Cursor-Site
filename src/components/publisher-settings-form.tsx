"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { SETTINGS, type SettingFieldStatus } from "@/lib/site-settings-shared";

const fieldClass =
  "w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]";

const labelClass =
  "mb-1 block text-[10px] uppercase tracking-[0.12em] text-[var(--ink-dim)]";

function CopyFieldButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    const text = value.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }
  return (
    <button
      type="button"
      onClick={() => void copy()}
      disabled={!value.trim()}
      className="shrink-0 rounded-md border border-[var(--line)] px-2.5 py-1.5 text-[11px] text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--ink)] disabled:opacity-40"
      title={`Copy ${label}`}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function PublisherSettingsForm({
  initial,
}: {
  initial: {
    houseName: SettingFieldStatus;
    proRelationNumber: SettingFieldStatus;
    proIpiBaseNumber: SettingFieldStatus;
    proPaIpiNameNumber: SettingFieldStatus;
  };
}) {
  const router = useRouter();
  const [houseName, setHouseName] = useState(initial.houseName.displayValue || "");
  const [proRelationNumber, setProRelationNumber] = useState(
    initial.proRelationNumber.displayValue || "",
  );
  const [proIpiBaseNumber, setProIpiBaseNumber] = useState(
    initial.proIpiBaseNumber.displayValue || "",
  );
  const [proPaIpiNameNumber, setProPaIpiNameNumber] = useState(
    initial.proPaIpiNameNumber.displayValue || "",
  );
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setStatus("");
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        values: {
          [SETTINGS.PUBLISHER_HOUSE_NAME]: houseName.trim(),
          [SETTINGS.PUBLISHER_PRO_RELATION]: proRelationNumber.trim(),
          [SETTINGS.PUBLISHER_PRO_IPI_BASE]: proIpiBaseNumber.trim(),
          [SETTINGS.PUBLISHER_PRO_PA_IPI]: proPaIpiNameNumber.trim(),
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Could not save settings");
      return;
    }
    setStatus("Publisher / PRO settings saved");
    router.refresh();
  }

  return (
    <form onSubmit={onSave} className="max-w-xl space-y-5">
      <p className="text-sm text-[var(--ink-dim)]">
        House publisher is the Account Admin default for imports and marks tracks as
        self-published (required to issue sync licenses). PRO numbers feed SAMRO forms.
      </p>

      <label className="block">
        <span className={labelClass}>Default publisher (house name)</span>
        <div className="flex items-center gap-2">
          <input
            className={fieldClass}
            value={houseName}
            onChange={(e) => setHouseName(e.target.value)}
            placeholder="Account Admin publisher name"
            autoComplete="organization"
          />
          <CopyFieldButton value={houseName} label="House publisher" />
        </div>
        <p className="mt-1 text-[11px] text-[var(--ink-dim)]">
          Tracks with this publisher are self-published. Match existing catalog spelling.
        </p>
      </label>

      <div className="border-t border-[var(--line)] pt-4">
        <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">
          PRO / SAMRO
        </h2>
        <p className="mt-1 text-[11px] text-[var(--ink-dim)]">
          Membership identifiers for Notification of Works exports.
        </p>
      </div>

      <label className="block">
        <span className={labelClass}>Relation number</span>
        <div className="flex items-center gap-2">
          <input
            className={fieldClass}
            value={proRelationNumber}
            onChange={(e) => setProRelationNumber(e.target.value)}
            placeholder="Relation number"
            autoComplete="off"
          />
          <CopyFieldButton value={proRelationNumber} label="Relation number" />
        </div>
      </label>

      <label className="block">
        <span className={labelClass}>IPI base number</span>
        <div className="flex items-center gap-2">
          <input
            className={fieldClass}
            value={proIpiBaseNumber}
            onChange={(e) => setProIpiBaseNumber(e.target.value)}
            placeholder="IPI base number"
            autoComplete="off"
          />
          <CopyFieldButton value={proIpiBaseNumber} label="IPI base number" />
        </div>
      </label>

      <label className="block">
        <span className={labelClass}>PA IPI name number</span>
        <div className="flex items-center gap-2">
          <input
            className={fieldClass}
            value={proPaIpiNameNumber}
            onChange={(e) => setProPaIpiNameNumber(e.target.value)}
            placeholder="PA IPI name number"
            autoComplete="off"
          />
          <CopyFieldButton value={proPaIpiNameNumber} label="PA IPI name number" />
        </div>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save publisher settings"}
        </button>
        {error ? <span className="text-sm text-[var(--exclusive)]">{error}</span> : null}
        {status ? <span className="text-sm text-[var(--available)]">{status}</span> : null}
      </div>
    </form>
  );
}
