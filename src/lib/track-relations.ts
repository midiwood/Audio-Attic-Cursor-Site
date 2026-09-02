export const TRACK_RELATION_TYPES = [
  "library_adaptation",
  "instrumentation_rewrite",
  "alternate_mix",
  "remix",
  "other",
] as const;

export type TrackRelationType = (typeof TRACK_RELATION_TYPES)[number];

export type TrackRelationNeighbor = {
  id: string;
  libraryTitle: string | null;
  workingTitle: string | null;
  license: string | null;
  year: number | null;
  duration: string | null;
  dropboxDl: string | null;
  dropboxPath: string | null;
};

/** Relation as seen from a focal track. */
export type TrackRelationView = {
  id: string;
  relation: TrackRelationType;
  note: string | null;
  /** `from` = this track is derived from the neighbor; `to` = this track was adapted into the neighbor */
  direction: "from" | "to";
  neighbor: TrackRelationNeighbor;
};

export type DerivedFromLink = {
  trackId: string;
  relation: TrackRelationType;
  note?: string | null;
};

export function isTrackRelationType(value: string): value is TrackRelationType {
  return (TRACK_RELATION_TYPES as readonly string[]).includes(value);
}

export function relationLabel(
  relation: TrackRelationType,
  direction: "from" | "to",
): string {
  const labels: Record<TrackRelationType, { from: string; to: string }> = {
    library_adaptation: { from: "Derived from", to: "Library adaptation" },
    instrumentation_rewrite: {
      from: "Instrumentation rewrite of",
      to: "Rewritten as",
    },
    alternate_mix: { from: "Alternate mix of", to: "Alternate mix" },
    remix: { from: "Remix of", to: "Remixed as" },
    other: { from: "Related to", to: "Related" },
  };
  return labels[relation][direction];
}

export const RELATION_TYPE_OPTIONS: Array<{ value: TrackRelationType; label: string }> = [
  { value: "library_adaptation", label: "Library adaptation" },
  { value: "instrumentation_rewrite", label: "Instrumentation rewrite" },
  { value: "alternate_mix", label: "Alternate mix" },
  { value: "remix", label: "Remix" },
  { value: "other", label: "Other / related" },
];
