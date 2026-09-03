import "server-only";

import { isSpacesObjectKey, presignGetUrl, spacesConfigured } from "@/lib/vault-storage";

function safeFilename(name: string) {
  return name.replace(/[^\w.\- ()[\]]+/g, "_").slice(0, 120) || "track";
}

export type AudioRedirectInput = {
  objectKey?: string | null;
  legacyDlUrl?: string | null;
  download?: boolean;
  downloadLabel?: string;
};

export type AudioRedirectDebug = {
  spacesConfigured: boolean;
  keyPresent: boolean;
  keyIsSpaces: boolean;
  usedLegacy: boolean;
  hasLegacy: boolean;
  keyPrefix: string;
};

/** Resolve a redirect URL for playback/download without proxying bytes through cPanel. */
export async function resolveAudioRedirectUrl(
  input: AudioRedirectInput,
  debugOut?: AudioRedirectDebug,
): Promise<string | null> {
  const key = input.objectKey?.trim() || "";
  const legacy = input.legacyDlUrl?.trim() || "";
  const keyIsSpaces = Boolean(key && isSpacesObjectKey(key));
  const configured = spacesConfigured();

  if (debugOut) {
    debugOut.spacesConfigured = configured;
    debugOut.keyPresent = Boolean(key);
    debugOut.keyIsSpaces = keyIsSpaces;
    debugOut.hasLegacy = Boolean(legacy);
    debugOut.keyPrefix = key.includes("/") ? key.split("/").slice(0, 2).join("/") : key.slice(0, 24);
    debugOut.usedLegacy = false;
  }

  if (keyIsSpaces) {
    if (!configured) return null;
    const ext = key.toLowerCase().endsWith(".wav") ? "wav" : "mp3";
    const downloadFilename =
      input.download && input.downloadLabel
        ? `${safeFilename(input.downloadLabel)}.${ext}`
        : undefined;
    const url = await presignGetUrl(key, { downloadFilename });
    // #region agent log
    fetch("http://127.0.0.1:7612/ingest/5cddcac2-af09-42bd-9712-68bde244498e", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e9662a" },
      body: JSON.stringify({
        sessionId: "e9662a",
        runId: "pre-fix",
        hypothesisId: "B",
        location: "audio-access.ts:presign",
        message: "download filename decision",
        data: {
          download: Boolean(input.download),
          hasLabel: Boolean(input.downloadLabel),
          filenameSet: Boolean(downloadFilename),
          filenameLen: downloadFilename?.length || 0,
          filenameHasSpace: Boolean(downloadFilename?.includes(" ")),
          keyTail: key.split("/").pop() || "",
          spacesConfigured: configured,
          keyIsSpaces,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    return url;
  }

  if (legacy) {
    if (debugOut) debugOut.usedLegacy = true;
    // #region agent log
    fetch("http://127.0.0.1:7612/ingest/5cddcac2-af09-42bd-9712-68bde244498e", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e9662a" },
      body: JSON.stringify({
        sessionId: "e9662a",
        runId: "pre-fix",
        hypothesisId: "D",
        location: "audio-access.ts:legacy",
        message: "fell back to legacy dropboxDl",
        data: {
          spacesConfigured: configured,
          keyPresent: Boolean(key),
          keyIsSpaces,
          keyPrefix: key.includes("/") ? key.split("/").slice(0, 2).join("/") : key.slice(0, 24),
          hasLegacy: true,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    return legacy;
  }
  return null;
}
