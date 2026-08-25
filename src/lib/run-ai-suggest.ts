import { formatAiError } from "@/lib/ai-errors";
import { titleFromFilename } from "@/lib/tracks";

export type AiSuggestRequest = {
  dropboxLink: string;
  title?: string;
  notes?: string;
  client?: string;
  license?: string;
};

export type AiSuggestFields = {
  libraryTitle: string;
  description: string;
  genre: string;
  mood: string;
  instruments: string;
  attributes: string;
  bpm: string;
  musicalKey: string;
  allowAiLibraryTitle: boolean;
  analyzedWithAudio: boolean;
};

/** Call Gemini suggest-tags for one track (server fetches Dropbox audio). */
export async function fetchAiTrackSuggestion(
  input: AiSuggestRequest,
): Promise<{ ok: true; suggestion: AiSuggestFields } | { ok: false; error: string }> {
  const dropboxLink = input.dropboxLink.trim();
  if (!dropboxLink) {
    return { ok: false, error: "Dropbox link is required for AI tagging" };
  }

  try {
    const res = await fetch("/api/tracks/suggest-tags", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        notes: input.notes || "",
        client: input.client || "",
        license: input.license || "Clear",
        tracks: [
          {
            dropboxLink,
            title: input.title || "",
          },
        ],
      }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        ok: false,
        error: formatAiError(data.error || data.errors?.[0]?.error),
      };
    }

    if (Array.isArray(data.errors) && data.errors.length) {
      return {
        ok: false,
        error: formatAiError(data.errors[0]?.error),
      };
    }

    const raw = (data.suggestions || [])[0] as
      | {
          libraryTitle?: string;
          description?: string;
          genre?: string;
          mood?: string;
          instruments?: string;
          attributes?: string;
          bpm?: string;
          musicalKey?: string;
          analyzedWithAudio?: boolean;
        }
      | undefined;

    if (!raw) {
      return { ok: false, error: "AI returned no suggestion — you can tag manually" };
    }

    return {
      ok: true,
      suggestion: {
        libraryTitle: titleFromFilename(String(raw.libraryTitle || "").trim()),
        description: String(raw.description || "").trim(),
        genre: String(raw.genre || "").trim(),
        mood: String(raw.mood || "").trim(),
        instruments: String(raw.instruments || "").trim(),
        attributes: String(raw.attributes || "").trim(),
        bpm: String(raw.bpm || "").trim(),
        musicalKey: String(raw.musicalKey || "").trim(),
        allowAiLibraryTitle: data.aiLibraryTitles === true,
        analyzedWithAudio: Boolean(raw.analyzedWithAudio || data.audioCount),
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err || "");
    if (/failed to fetch|networkerror|load failed/i.test(message)) {
      return {
        ok: false,
        error:
          "Connection dropped while talking to AI. Wait a moment and try Re-run AI again.",
      };
    }
    return { ok: false, error: formatAiError(message) };
  }
}

export function aiSuggestStatusMessage(suggestion: AiSuggestFields): string {
  const measured = [suggestion.bpm ? `${suggestion.bpm} BPM` : "", suggestion.musicalKey]
    .filter(Boolean)
    .join(" · ");
  return (
    `AI tags ready` +
    (suggestion.analyzedWithAudio ? " · audio analyzed" : "") +
    (measured ? ` · measured ${measured}` : "") +
    (suggestion.allowAiLibraryTitle ? " · library title suggested" : " · exclusive — source title kept")
  );
}
