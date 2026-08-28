/** Shared limits/helpers safe for client + server (no Node-only deps). */

export const MAX_ZIP_TRACKS = 80;

export function safeAudioFilename(name: string) {
  return name.replace(/[^\w.\- ()[\]]+/g, "_").slice(0, 120) || "track";
}
