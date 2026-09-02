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

/** Resolve a redirect URL for playback/download without proxying bytes through cPanel. */
export async function resolveAudioRedirectUrl(input: AudioRedirectInput): Promise<string | null> {
  const key = input.objectKey?.trim() || "";
  const legacy = input.legacyDlUrl?.trim() || "";

  if (key && isSpacesObjectKey(key)) {
    if (!spacesConfigured()) return null;
    const ext = key.toLowerCase().endsWith(".wav") ? "wav" : "mp3";
    const downloadFilename =
      input.download && input.downloadLabel
        ? `${safeFilename(input.downloadLabel)}.${ext}`
        : undefined;
    return presignGetUrl(key, { downloadFilename });
  }

  if (legacy) return legacy;
  return null;
}
