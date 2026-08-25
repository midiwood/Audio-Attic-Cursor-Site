/** Shared colour coding for Genre / Mood / Instruments / Usage across catalog + admin. */
export type TagTone = "genre" | "mood" | "instrument" | "usage";

export const TAG_TONE_PILL: Record<TagTone, string> = {
  genre: "bg-[rgba(99,102,241,0.22)] text-[#c7d2fe] border-[rgba(99,102,241,0.35)]",
  mood: "bg-[rgba(236,72,153,0.18)] text-[#f9a8d4] border-[rgba(236,72,153,0.3)]",
  instrument: "bg-[rgba(59,130,246,0.18)] text-[#93c5fd] border-[rgba(59,130,246,0.3)]",
  usage: "bg-[rgba(34,197,94,0.16)] text-[#86efac] border-[rgba(34,197,94,0.28)]",
};

export const TAG_TONE_LABEL: Record<TagTone, string> = {
  genre: "text-[#a5b4fc]",
  mood: "text-[#f9a8d4]",
  instrument: "text-[#93c5fd]",
  usage: "text-[#86efac]",
};

export const TAG_TONE_FIELD: Record<TagTone, string> = {
  genre:
    "border-[rgba(99,102,241,0.45)] focus:border-[#818cf8] focus:ring-[rgba(99,102,241,0.25)]",
  mood: "border-[rgba(236,72,153,0.45)] focus:border-[#f472b6] focus:ring-[rgba(236,72,153,0.25)]",
  instrument:
    "border-[rgba(59,130,246,0.45)] focus:border-[#60a5fa] focus:ring-[rgba(59,130,246,0.25)]",
  usage: "border-[rgba(34,197,94,0.45)] focus:border-[#4ade80] focus:ring-[rgba(34,197,94,0.25)]",
};

export { formatAudioDuration } from "@/lib/audio-duration";
