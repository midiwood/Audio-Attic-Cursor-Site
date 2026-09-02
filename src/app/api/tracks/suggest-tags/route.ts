import { NextRequest, NextResponse } from "next/server";
import { getCatalogStaffSession } from "@/lib/auth";
import { AI_QUOTA_MESSAGE, isAiQuotaError } from "@/lib/ai-errors";
import { analyzeAudioBytes } from "@/lib/audio-analysis";
import { getAiRuntimeConfig, resolveSetting, SETTINGS, upsertSetting } from "@/lib/site-settings";
import { isSpacesObjectKey } from "@/lib/storage/paths";
import { getObjectBuffer } from "@/lib/storage/spaces";
import { normalizeLicenseStatus, filenameFromDropboxUrl, normalizeMusicalKey, titleFromDropboxUrl, titleFromFilename, toDropboxDlUrl } from "@/lib/tracks";
import { getCatalogVocabulary, pickFromVocabulary } from "@/lib/vocabulary";

export const runtime = "nodejs";

type SuggestInput = {
  dropboxLink?: string;
  dropboxPath?: string;
  title?: string;
  notes?: string;
  client?: string;
};

type SuggestResult = {
  dropboxLink: string;
  workingTitle: string;
  libraryTitle: string;
  description: string;
  genre: string;
  mood: string;
  instruments: string;
  attributes: string;
  bpm: string;
  musicalKey: string;
  analyzedWithAudio: boolean;
};

type GeminiSlot = "key1" | "key2" | "key3";

/** How Gemini should fill libraryTitle. */
export type LibraryTitleMode = "keep" | "cleanup" | "creative";

const MAX_AUDIO_BYTES = 12 * 1024 * 1024; // ~12MB inline safety limit

function normalizeLibraryTitleMode(raw: unknown, exclusive: boolean): LibraryTitleMode {
  const value = String(raw || "").trim().toLowerCase();
  if (value === "cleanup") return "cleanup";
  if (value === "keep" || value === "none" || value === "echo") return "keep";
  if (value === "creative" || value === "rename" || value === "invent") {
    // Exclusive catalogs keep source naming — cleanup is still OK (derived from filename).
    return exclusive ? "keep" : "creative";
  }
  // Legacy: allowAiLibraryTitle inferred from non-exclusive when mode omitted.
  return exclusive ? "keep" : "creative";
}

function libraryTitleRuleForMode(mode: LibraryTitleMode): string {
  if (mode === "cleanup") {
    return `- libraryTitle: Clean the SOURCE / working filename into a short human title. Formats vary — do not assume one pattern.
  Strip: timecodes (e.g. 00:01:12:01), reel/scene codes, version junk (v2, _oo1, Mix1, Final, Take3), underscores/hyphens used as separators, trailing numbers that are not part of the name.
  Keep the meaningful words (e.g. "00:01:12:01_Enter Susan_v2_oo1" → "Enter Susan").
  Title Case, 1–8 words. Do NOT invent a wholly new creative name unrelated to the source. Never include a file extension.`;
  }
  if (mode === "creative") {
    return `- libraryTitle: invent a short, evocative production-library title based on what you HEAR (mood, imagery, use-case). Do not copy the filename. 2–6 words, Title Case.`;
  }
  return `- libraryTitle: return the source title with file extension removed only — do not rewrite words. Exclusive / keep-titles mode.`;
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced?.[1]?.trim() || text.trim();
  return JSON.parse(raw);
}

function guessMime(filenameOrUrl: string, fallback = "audio/mpeg") {
  const lower = filenameOrUrl.toLowerCase();
  if (lower.includes(".wav")) return "audio/wav";
  if (lower.includes(".flac")) return "audio/flac";
  if (lower.includes(".aiff") || lower.includes(".aif")) return "audio/aiff";
  if (lower.includes(".m4a")) return "audio/mp4";
  if (lower.includes(".ogg")) return "audio/ogg";
  if (lower.includes(".mp3")) return "audio/mpeg";
  return fallback;
}

async function fetchVaultAudio(source: {
  dropboxPath?: string;
  dropboxLink?: string;
}): Promise<{ bytes: Buffer; mimeType: string } | null> {
  const key = source.dropboxPath?.trim() || "";
  if (key && isSpacesObjectKey(key)) {
    try {
      let bytes = await getObjectBuffer(key);
      if (bytes.length > MAX_AUDIO_BYTES) bytes = bytes.subarray(0, MAX_AUDIO_BYTES);
      return {
        bytes,
        mimeType: guessMime(key),
      };
    } catch {
      return null;
    }
  }
  const link = source.dropboxLink?.trim() || "";
  if (!link) return null;
  const target = toDropboxDlUrl(link);
  const res = await fetch(target, { redirect: "follow" });
  if (!res.ok) return null;
  const arrayBuffer = await res.arrayBuffer();
  let bytes = Buffer.from(arrayBuffer);
  if (bytes.length > MAX_AUDIO_BYTES) {
    bytes = bytes.subarray(0, MAX_AUDIO_BYTES);
  }
  const mimeType =
    res.headers.get("content-type")?.split(";")[0] ||
    guessMime(link);
  return { bytes, mimeType };
}

async function tagOneTrackWithGemini(opts: {
  apiKey: string;
  model: string;
  track: {
    index: number;
    title: string;
    notes: string;
    client: string;
    dropboxLink: string;
  };
  audio?: { bytes: Buffer; mimeType: string } | null;
  vocabulary: {
    genres: string[];
    moods: string[];
    instruments: string[];
    attributes: string[];
  };
  libraryTitleMode: LibraryTitleMode;
}): Promise<SuggestResult> {
  const { apiKey, model, track, audio, vocabulary, libraryTitleMode } = opts;

  const libraryTitleRule = libraryTitleRuleForMode(libraryTitleMode);

  const prompt = `You are tagging production / library music for a composer catalog.

${audio ? "Listen to the attached audio carefully and base tags primarily on what you HEAR." : "No audio was provided. Infer cautiously from title/notes only, and leave uncertain fields empty."}

Use ONLY tags from these allowed lists (comma-separated in output). If nothing fits, leave that field empty.
- genre allow-list: ${vocabulary.genres.join(" | ") || "(none)"}
- mood allow-list: ${vocabulary.moods.join(" | ") || "(none)"}
- instruments allow-list: ${vocabulary.instruments.join(" | ") || "(none)"}
- attributes allow-list (usage / placement only): ${vocabulary.attributes.join(" | ") || "(none)"}

Rules:
- Prefer 1-3 genres, 1-3 moods, 2-5 instruments, 1-3 usages when confident.
${libraryTitleRule}
- workingTitle: return the source title provided in Track context.title exactly — do not rewrite it, and never add a file extension.
- description: one short sentence about musical feel/use-case.
- bpm: integer BPM if you can estimate from the audio; otherwise "".
- musicalKey: short key if audible (e.g. "Am", "C#m", "F", "Bb"); otherwise "".
  Prefer leaving blank over guessing when unsure — a separate analyzer may override these.
- attributes = media usage only (TV, Film, Documentary, etc.) — never mood or genre words.
- Do not invent clients/licenses.
- Return ONLY JSON:
{"workingTitle":"","libraryTitle":"","description":"","genre":"","mood":"","instruments":"","attributes":"","bpm":"","musicalKey":""}

Track context:
${JSON.stringify(
  {
    title: track.title,
    notes: track.notes,
    client: track.client,
    dropboxLink: track.dropboxLink,
    libraryTitleMode,
  },
  null,
  2,
)}`;

  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  if (audio?.bytes?.length) {
    parts.push({
      inline_data: {
        mime_type: audio.mimeType || "audio/mpeg",
        data: audio.bytes.toString("base64"),
      },
    });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseMimeType: "application/json",
        },
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "");
    throw new Error(
      /enotfound|fetch failed|network/i.test(message)
        ? "Could not reach Gemini (network error). Check your connection and try Re-run AI."
        : `Gemini request failed: ${message}`,
    );
  }

  const payload = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const raw =
      payload?.error?.message ||
      payload?.error?.status ||
      `Gemini request failed (${upstream.status})`;
    const status = String(payload?.error?.status || "");
    if (
      upstream.status === 429 ||
      status === "RESOURCE_EXHAUSTED" ||
      isAiQuotaError(String(raw))
    ) {
      throw new Error(AI_QUOTA_MESSAGE);
    }
    throw new Error(String(raw));
  }

  const text =
    payload?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("\n") ||
    "";
  if (!text.trim()) {
    throw new Error("Gemini returned an empty response");
  }

  const parsed = extractJson(text) as Record<string, unknown>;
  // Working title is always the source title passed in (no extension) — never AI-rewritten
  const workingTitle = titleFromFilename(track.title) || track.title;
  const aiLibraryTitle = titleFromFilename(String(parsed.libraryTitle || "").trim());
  const libraryTitle =
    libraryTitleMode === "keep"
      ? workingTitle
      : aiLibraryTitle || workingTitle;

  return {
    dropboxLink: track.dropboxLink,
    workingTitle,
    libraryTitle,
    description: String(parsed.description || ""),
    genre: pickFromVocabulary(String(parsed.genre || ""), vocabulary.genres),
    mood: pickFromVocabulary(String(parsed.mood || ""), vocabulary.moods),
    instruments: pickFromVocabulary(String(parsed.instruments || ""), vocabulary.instruments),
    attributes: pickFromVocabulary(String(parsed.attributes || ""), vocabulary.attributes),
    bpm: String(parsed.bpm || "").replace(/[^\d]/g, ""),
    musicalKey: normalizeMusicalKey(String(parsed.musicalKey || parsed.key || "")),
    analyzedWithAudio: Boolean(audio?.bytes?.length),
  };
}

export async function POST(req: NextRequest) {
  const staff = await getCatalogStaffSession();
  if (!staff.ok) {
    return NextResponse.json(
      { error: staff.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: staff.status },
    );
  }

  const aiConfig = getAiRuntimeConfig();
  const activeSlot = (aiConfig.geminiActiveKey || "key1") as GeminiSlot;
  const model = aiConfig.geminiModel;
  const keyBySlot: Record<GeminiSlot, string> = {
    key1: resolveSetting(SETTINGS.GEMINI_API_KEY),
    key2: resolveSetting(SETTINGS.GEMINI_API_KEY_2),
    key3: resolveSetting(SETTINGS.GEMINI_API_KEY_3),
  };
  const orderedSlots: GeminiSlot[] =
    activeSlot === "key2"
      ? ["key2", "key3", "key1"]
      : activeSlot === "key3"
        ? ["key3", "key1", "key2"]
        : ["key1", "key2", "key3"];
  const keyCandidates = orderedSlots
    .map((slot) => ({ slot, key: keyBySlot[slot].trim() }))
    .filter((item) => Boolean(item.key));

  if (!keyCandidates.length) {
    return NextResponse.json(
      { error: "Gemini API key is not set. Add it in Admin → AI, or set GEMINI_API_KEY in .env.local." },
      { status: 500 },
    );
  }
  const contentType = req.headers.get("content-type") || "";

  let tracks: SuggestInput[] = [];
  let sharedNotes = "";
  let sharedClient = "";
  let sharedLicense = "Clear";
  let requestedTitleMode: unknown;
  const audioByIndex = new Map<number, { bytes: Buffer; mimeType: string }>();

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const payloadRaw = String(form.get("payload") || "");
    const payload = JSON.parse(payloadRaw || "{}");
    tracks = (payload.tracks || []) as SuggestInput[];
    sharedNotes = String(payload.notes || "").trim();
    sharedClient = String(payload.client || "").trim();
    sharedLicense = String(payload.license || sharedLicense).trim();
    requestedTitleMode = payload.libraryTitleMode ?? payload.titleMode;

    for (const [key, value] of form.entries()) {
      const match = /^audio_(\d+)$/.exec(key);
      if (!match || !(value instanceof File)) continue;
      const index = Number(match[1]);
      const arrayBuffer = await value.arrayBuffer();
      let bytes = Buffer.from(arrayBuffer);
      if (bytes.length > MAX_AUDIO_BYTES) bytes = bytes.subarray(0, MAX_AUDIO_BYTES);
      audioByIndex.set(index, {
        bytes,
        mimeType: value.type || guessMime(value.name),
      });
    }
  } else {
    const body = await req.json().catch(() => null);
    tracks = (body?.tracks || []) as SuggestInput[];
    sharedNotes = String(body?.notes || "").trim();
    sharedClient = String(body?.client || "").trim();
    sharedLicense = String(body?.license || sharedLicense).trim();
    requestedTitleMode = body?.libraryTitleMode ?? body?.titleMode;
  }

  if (!Array.isArray(tracks) || !tracks.length) {
    return NextResponse.json({ error: "Provide at least one track" }, { status: 400 });
  }
  if (tracks.length > 10) {
    return NextResponse.json({ error: "Max 10 tracks per audio AI request" }, { status: 400 });
  }

  const vocabulary = getCatalogVocabulary();
  const exclusive = normalizeLicenseStatus(sharedLicense) === "exclusive";
  const libraryTitleMode = normalizeLibraryTitleMode(requestedTitleMode, exclusive);
  const allowAiLibraryTitle = libraryTitleMode !== "keep";

  const prepared = tracks.map((track, index) => {
    const dropboxLink = String(track.dropboxLink || "").trim();
    const dropboxPath = String(track.dropboxPath || "").trim();
    const fromFile = titleFromFilename(filenameFromDropboxUrl(dropboxLink));
    const title =
      titleFromFilename(String(track.title || "").trim()) ||
      fromFile ||
      titleFromDropboxUrl(dropboxLink) ||
      `Track ${index + 1}`;
    return {
      index,
      dropboxLink,
      dropboxPath,
      title,
      notes: String(track.notes || sharedNotes || "").trim(),
      client: String(track.client || sharedClient || "").trim(),
    };
  });

  for (const track of prepared) {
    if (!track.dropboxPath && !track.dropboxLink && !audioByIndex.has(track.index)) {
      return NextResponse.json(
        { error: "Each track needs vault audio or attached audio file" },
        { status: 400 },
      );
    }
  }

  const suggestions: SuggestResult[] = [];
  const errors: Array<{ index: number; error: string }> = [];
  let preferredSlot = keyCandidates[0]?.slot || activeSlot;

  for (const track of prepared) {
    try {
      let audio = audioByIndex.get(track.index) || null;
      if (!audio) {
        audio = await fetchVaultAudio(track);
      }
      const measuredPromise = audio?.bytes?.length
        ? analyzeAudioBytes(audio.bytes, {
            mimeType: audio.mimeType,
            titleHint: track.title,
            notesHint: track.notes,
          }).catch(() => null)
        : Promise.resolve(null);

      const [suggestion, measured] = await Promise.all([
        (async () => {
          const dynamicOrder: GeminiSlot[] =
            preferredSlot === "key2"
              ? ["key2", "key3", "key1"]
              : preferredSlot === "key3"
                ? ["key3", "key1", "key2"]
                : ["key1", "key2", "key3"];
          const orderedCandidates = dynamicOrder
            .map((slot) => ({ slot, key: keyBySlot[slot].trim() }))
            .filter((item) => Boolean(item.key));

          let lastQuotaError: string | null = null;
          for (const candidate of orderedCandidates) {
            try {
              const suggestion = await tagOneTrackWithGemini({
                apiKey: candidate.key,
                model,
                track,
                audio,
                vocabulary,
                libraryTitleMode,
              });
              if (candidate.slot !== preferredSlot) {
                preferredSlot = candidate.slot;
                upsertSetting(SETTINGS.GEMINI_ACTIVE_KEY, candidate.slot);
              }
              return suggestion;
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error || "Tagging failed");
              if (isAiQuotaError(message)) {
                lastQuotaError = message;
                continue;
              }
              throw error;
            }
          }
          throw new Error(lastQuotaError || AI_QUOTA_MESSAGE);
        })(),
        measuredPromise,
      ]);

      // Prefer DSP measurements; keep Gemini estimates only as fallback.
      suggestion.bpm = measured?.bpm || suggestion.bpm || "";
      suggestion.musicalKey = measured?.musicalKey || suggestion.musicalKey || "";

      suggestions.push(suggestion);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tagging failed";
      errors.push({ index: track.index, error: message });
      suggestions.push({
        dropboxLink: track.dropboxLink,
        workingTitle: track.title,
        libraryTitle: track.title,
        description: "",
        genre: "",
        mood: "",
        instruments: "",
        attributes: "",
        bpm: "",
        musicalKey: "",
        analyzedWithAudio: false,
      });
    }
  }

  const audioCount = suggestions.filter((s) => s.analyzedWithAudio).length;
  const quotaError = errors.find((item) => isAiQuotaError(item.error));
  if (quotaError) {
    return NextResponse.json(
      {
        error: AI_QUOTA_MESSAGE,
        code: "AI_QUOTA",
        suggestions: [],
        audioCount: 0,
        errors,
        aiLibraryTitles: allowAiLibraryTitle,
        libraryTitleMode,
      },
      { status: 429 },
    );
  }

  if (errors.length && !suggestions.some((s) => s.genre || s.mood || s.description)) {
    return NextResponse.json(
      {
        error: errors[0]?.error || "AI tagging failed — you can tag manually",
        suggestions: [],
        audioCount: 0,
        errors,
        aiLibraryTitles: allowAiLibraryTitle,
        libraryTitleMode,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    suggestions,
    audioCount,
    errors,
    aiLibraryTitles: allowAiLibraryTitle,
    libraryTitleMode,
  });
}
