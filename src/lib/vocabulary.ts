/**
 * Controlled catalog vocabulary — four non-overlapping buckets:
 * Genre (style) · Mood (feel) · Instruments · Usage (where it plays)
 * DB column remains `attributes` for Usage values.
 */

export type CatalogVocabulary = {
  genres: string[];
  moods: string[];
  instruments: string[];
  attributes: string[]; // Usage (placement / media context)
};

export const CATALOG_VOCABULARY: CatalogVocabulary = {
  genres: [
    "Alternative",
    "Ambient",
    "Blues",
    "Classical",
    "Cinematic",
    "Country",
    "Dance",
    "Electronic",
    "Experimental",
    "Folk",
    "Funk",
    "Hip Hop",
    "Indie",
    "Jazz",
    "Latin",
    "Orchestral",
    "Pop",
    "R&B",
    "Reggae",
    "Rock",
    "Score",
    "Singer-Songwriter",
    "Soul",
    "Spoken Word",
    "World",
  ],
  moods: [
    "Aggressive",
    "Calm",
    "Dark",
    "Dramatic",
    "Energetic",
    "Epic",
    "Happy",
    "Hopeful",
    "Melancholy",
    "Mysterious",
    "Peaceful",
    "Playful",
    "Quirky",
    "Romantic",
    "Sad",
    "Serious",
    "Somber",
    "Suspenseful",
    "Tense",
    "Uplifting",
  ],
  instruments: [
    "Acoustic Guitar",
    "Bass",
    "Brass",
    "Cello",
    "Choir",
    "Drums",
    "Dulcimer",
    "Electric Guitar",
    "Flute",
    "Harp",
    "Horns",
    "Organ",
    "Percussion",
    "Piano",
    "Saxophone",
    "Sound Design",
    "Strings",
    "Synth",
    "Ukulele",
    "Violin",
    "Vocal",
    "Woodwinds",
    "World Percussion",
  ],
  /** Usage = media / placement context only (not mood or genre). */
  attributes: [
    "Advertising",
    "Corporate",
    "Documentary",
    "Drama",
    "Film",
    "Games",
    "Holiday",
    "Kids",
    "News",
    "Podcast",
    "Social",
    "Sports",
    "Theatre",
    "Trailer",
    "Travel",
    "TV",
    "Wedding",
  ],
};

/** Map historical / messy labels onto the controlled vocabulary. */
const ALIASES: Record<keyof CatalogVocabulary, Record<string, string | null>> = {
  genres: {
    dnb: "Electronic",
    "drum and bass": "Electronic",
    "drum & bass": "Electronic",
    "post rock": "Rock",
    "post-rock": "Rock",
    test: null,
    orchestral: "Orchestral",
    funk: "Funk",
    reggae: "Reggae",
    experimental: "Experimental",
    latin: "Latin",
    holiday: null, // Holiday is Usage now
    bluegrass: "Folk",
    gospel: "Soul",
    motown: "Soul",
    industrial: "Electronic",
    psychedelic: "Experimental",
    psychadelic: "Experimental",
    "easy listening": "Pop",
    lounge: "Jazz",
    surf: "Rock",
    americana: "Country",
    celtic: "Folk",
    african: "World",
    "east asian": "World",
    "middle eastern": "World",
    tribal: "World",
    western: "Country",
    french: "World",
  },
  moods: {
    uplfifting: "Uplifting",
    uplifting: "Uplifting",
    playful: "Playful",
    love: "Romantic",
    ecstatic: "Energetic",
    suspense: "Suspenseful",
    suspenseful: "Suspenseful",
    hopeful: "Hopeful",
    melancholy: "Melancholy",
    romantic: "Romantic",
    aggressive: "Aggressive",
    angry: "Aggressive",
    dark: "Dark",
    dramatic: "Dramatic",
    energetic: "Energetic",
    epic: "Epic",
    mysterious: "Mysterious",
    quirky: "Quirky",
    chill: "Calm",
    carefree: "Playful",
    contemplative: "Peaceful",
    eerie: "Suspenseful",
    fun: "Playful",
    gloomy: "Somber",
    light: "Happy",
    soft: "Peaceful",
    beautiful: "Hopeful",
    bouncy: "Playful",
    driving: "Energetic",
    upbeat: "Energetic",
    adventurous: "Energetic",
    enchanted: "Mysterious",
    ethereal: "Peaceful",
    whimsical: "Quirky",
    wondrous: "Hopeful",
    swagger: "Aggressive",
    pulsing: "Energetic",
  },
  instruments: {
    clav: "Synth",
    clavinet: "Synth",
    pitz: "Strings",
    pizzicato: "Strings",
    strings: "Strings",
    xylophone: "Percussion",
    marimba: "Percussion",
    voice: "Vocal",
    vocal: "Vocal",
    vocals: "Vocal",
    humming: "Vocal",
    whistling: "Vocal",
    whistle: "Vocal",
    world: "World Percussion",
    "world percussion": "World Percussion",
    "ambient sounds": "Sound Design",
    "nature sounds": "Sound Design",
    "sound fx": "Sound Design",
    "sound design": "Sound Design",
    "string bass": "Bass",
    "double bass": "Bass",
    bass: "Bass",
    horns: "Horns",
    brass: "Brass",
    choir: "Choir",
    flute: "Flute",
    bagpipes: "Woodwinds",
    banjo: "Acoustic Guitar",
    accordion: "Organ",
    mandolin: "Acoustic Guitar",
    dulcimer: "Dulcimer",
    "music box": "Percussion",
    "steel guitar": "Electric Guitar",
    theremin: "Synth",
    turntable: "Synth",
    viola: "Violin",
    vocoder: "Vocal",
    wurlitzer: "Piano",
    rhodes: "Piano",
    harpsichord: "Piano",
    bells: "Percussion",
    claps: "Percussion",
    snaps: "Percussion",
    stomps: "Percussion",
    beats: "Drums",
    "acoustic guitar": "Acoustic Guitar",
    "electric guitar": "Electric Guitar",
  },
  attributes: {
    // Usages
    documentary: "Documentary",
    travel: "Travel",
    trailer: "Trailer",
    sports: "Sports",
    corporate: "Corporate",
    advertising: "Advertising",
    film: "Film",
    tv: "TV",
    games: "Games",
    kids: "Kids",
    wedding: "Wedding",
    news: "News",
    podcast: "Podcast",
    drama: "Drama",
    theatre: "Theatre",
    theater: "Theatre",
    holiday: "Holiday",
    social: "Social",
    youtube: "Social",
    "social media": "Social",
    nature: "Documentary",
    espionage: "Drama",
    "sci-fi": "Film",
    // Drop mood/genre/style leftovers from old attributes
    dark: null,
    dramatic: null,
    mysterious: null,
    playful: null,
    quirky: null,
    uplifting: null,
    epic: null,
    latin: null,
    orchestral: null,
    acoustic: null,
    atmospheric: null,
    ballad: null,
    beach: null,
    beautiful: null,
    bluegrass: null,
    bouncy: null,
    celtic: null,
    danceable: null,
    dance: null,
    driving: null,
    earthy: null,
    "east asian": null,
    "easy listening": null,
    enchanted: null,
    ethereal: null,
    french: null,
    fun: null,
    funky: null,
    glitchy: null,
    gloomy: null,
    gospel: null,
    grungy: null,
    industrial: null,
    light: null,
    lounge: null,
    lullaby: null,
    "middle eastern": null,
    minimal: null,
    motown: null,
    african: null,
    americana: null,
    psychedelic: null,
    psychadelic: null,
    pulsing: null,
    retro: null,
    soft: null,
    "solo instrument": null,
    spiritual: null,
    surf: null,
    suspense: null,
    swagger: null,
    tribal: null,
    upbeat: null,
    urban: null,
    western: null,
    whimsical: null,
    wondrous: null,
    worship: null,
    adventurous: null,
    "a cappella": null,
    demo: null,
    explicit: null,
    "foreign language": null,
    sexy: null,
    static: null,
    wild: null,
    shuffle: null,
    "bpm: slow": null,
    "bpm: medium-slow": null,
    "bpm: medium": null,
    "bpm: medium-fast": null,
    "bpm: fast": null,
    dubstep: null,
    rap: null,
    beat: null,
    abstract: null,
  },
};

function canonicalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function getCatalogVocabulary(): CatalogVocabulary {
  return {
    genres: [...CATALOG_VOCABULARY.genres],
    moods: [...CATALOG_VOCABULARY.moods],
    instruments: [...CATALOG_VOCABULARY.instruments],
    attributes: [...CATALOG_VOCABULARY.attributes],
  };
}

export function resolveVocabularyTag(
  value: string,
  kind: keyof CatalogVocabulary,
): string | null {
  const raw = value.trim();
  if (!raw) return null;

  const allowed = CATALOG_VOCABULARY[kind];
  const allowedLower = new Map(allowed.map((item) => [canonicalizeKey(item), item]));
  const key = canonicalizeKey(raw);

  const exact = allowedLower.get(key);
  if (exact) return exact;

  const aliased = ALIASES[kind][key];
  if (aliased === null) return null;
  if (aliased) return aliased;

  return null;
}

/** Keep only tags that exist in (or alias onto) the controlled vocabulary. */
export function constrainToVocabulary(
  value: string | null | undefined,
  kind: keyof CatalogVocabulary,
): string {
  if (!value?.trim()) return "";
  const resolved = value
    .split(",")
    .map((part) => resolveVocabularyTag(part, kind))
    .filter((part): part is string => Boolean(part));
  return [...new Set(resolved)].join(", ");
}

/**
 * Re-home a free-form tag into the correct bucket (genre / mood / instrument / usage).
 * Prefer Usage → Mood → Genre → Instrument so misplaced legacy attributes land cleanly.
 */
export function classifyTag(
  value: string,
): { kind: keyof CatalogVocabulary; value: string } | null {
  for (const kind of ["attributes", "moods", "genres", "instruments"] as const) {
    const resolved = resolveVocabularyTag(value, kind);
    if (resolved) return { kind, value: resolved };
  }
  return null;
}

/** Merge comma-separated tag strings uniquely. */
export function mergeTagStrings(...parts: Array<string | null | undefined>): string {
  const all = parts
    .flatMap((part) => (part || "").split(","))
    .map((p) => p.trim())
    .filter(Boolean);
  return [...new Set(all)].join(", ");
}

export function pickFromVocabulary(value: string, allowed: string[]): string {
  if (!value.trim() || !allowed.length) return "";
  const allowedLower = new Map(allowed.map((item) => [canonicalizeKey(item), item]));
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => allowedLower.get(canonicalizeKey(part)) || null)
    .filter((part): part is string => Boolean(part));
  return [...new Set(parts)].join(", ");
}
