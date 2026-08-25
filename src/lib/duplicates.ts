import { filenameFromDropboxUrl, titleFromFilename, toDropboxDlUrl } from "@/lib/tracks";

export type DuplicateReason = "same_file" | "same_title" | "similar_title";

export type DuplicateMatch = {
  id: string;
  libraryTitle: string | null;
  workingTitle: string | null;
  reason: DuplicateReason;
};

/** Keep letters + digits (so codes like M3 stay distinct). */
export function normalizeTitleKey(value: string | null | undefined): string {
  if (!value) return "";
  return titleFromFilename(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Significant words only — ignore digits and tiny tokens (m, a, to, …). */
export function significantTitleTokens(value: string | null | undefined): string[] {
  return normalizeTitleKey(value)
    .replace(/[0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((part) => part.length >= 3);
}

/**
 * Similarity is word-based only.
 * - Exact alphanumeric keys can match as same title elsewhere
 * - Never treat short leftovers like "m" (from "M3") as a substring hit
 * - Require real multi-word overlap for "similar"
 */
export function titlesAreSimilar(a: string, b: string): boolean {
  const leftKey = normalizeTitleKey(a);
  const rightKey = normalizeTitleKey(b);
  if (!leftKey || !rightKey) return false;
  if (leftKey === rightKey) return true;

  const ta = significantTitleTokens(a);
  const tb = significantTitleTokens(b);
  if (!ta.length || !tb.length) return false;

  // Phrase containment only when the shorter side has ≥2 real words
  // and the shorter phrase is long enough to be meaningful.
  const leftJoined = ta.join(" ");
  const rightJoined = tb.join(" ");
  const shorter = ta.length <= tb.length ? ta : tb;
  const longerJoined = ta.length <= tb.length ? rightJoined : leftJoined;
  const shorterJoined = ta.length <= tb.length ? leftJoined : rightJoined;
  if (
    shorter.length >= 2 &&
    shorterJoined.length >= 8 &&
    longerJoined.includes(shorterJoined)
  ) {
    return true;
  }

  const setB = new Set(tb);
  let overlap = 0;
  for (const token of ta) {
    if (setB.has(token)) overlap += 1;
  }
  const ratio = overlap / Math.min(ta.length, tb.length);
  return overlap >= 2 && ratio >= 0.7;
}

function linkKeys(link: string | null | undefined): string[] {
  if (!link?.trim()) return [];
  const keys = new Set<string>();
  const trimmed = link.trim().toLowerCase();
  keys.add(trimmed);
  try {
    keys.add(toDropboxDlUrl(trimmed).toLowerCase());
  } catch {
    // ignore
  }
  const filename = filenameFromDropboxUrl(link).toLowerCase();
  if (filename) keys.add(`file:${filename}`);
  return [...keys];
}

export function findDuplicateMatches(
  candidate: {
    dropboxLink?: string | null;
    workingTitle?: string | null;
    libraryTitle?: string | null;
  },
  catalog: Array<{
    id: string;
    dropboxLink: string | null;
    dropboxDl?: string | null;
    workingTitle: string | null;
    libraryTitle: string | null;
  }>,
): DuplicateMatch[] {
  const candLinks = new Set([
    ...linkKeys(candidate.dropboxLink),
    ...linkKeys(candidate.workingTitle?.includes("http") ? candidate.workingTitle : ""),
  ]);
  const workingFile = (candidate.workingTitle || "").trim().toLowerCase();
  if (workingFile && /\.(mp3|wav|aiff|aif|flac|m4a)$/i.test(workingFile)) {
    candLinks.add(`file:${workingFile}`);
  }

  const candKeys = [candidate.workingTitle, candidate.libraryTitle]
    .map(normalizeTitleKey)
    .filter(Boolean);

  const matches: DuplicateMatch[] = [];
  const seen = new Set<string>();

  for (const track of catalog) {
    const reasons: DuplicateReason[] = [];

    const existingLinks = new Set([
      ...linkKeys(track.dropboxLink),
      ...linkKeys(track.dropboxDl),
      ...(track.workingTitle && /\.(mp3|wav|aiff|aif|flac|m4a)$/i.test(track.workingTitle)
        ? [`file:${track.workingTitle.trim().toLowerCase()}`]
        : []),
    ]);

    for (const key of candLinks) {
      if (existingLinks.has(key)) {
        reasons.push("same_file");
        break;
      }
    }

    const existingKeys = [track.workingTitle, track.libraryTitle]
      .map(normalizeTitleKey)
      .filter(Boolean);

    let sameTitle = false;
    let similarTitle = false;
    for (const cand of candKeys) {
      for (const existing of existingKeys) {
        if (cand === existing) sameTitle = true;
      }
    }
    // Fuzzy compare raw titles (not pre-stripped keys) so digit codes stay meaningful
    for (const candRaw of [candidate.workingTitle, candidate.libraryTitle]) {
      for (const existingRaw of [track.workingTitle, track.libraryTitle]) {
        if (!candRaw || !existingRaw) continue;
        if (normalizeTitleKey(candRaw) === normalizeTitleKey(existingRaw)) continue;
        if (titlesAreSimilar(candRaw, existingRaw)) similarTitle = true;
      }
    }

    if (sameTitle) reasons.push("same_title");
    else if (similarTitle) reasons.push("similar_title");

    if (!reasons.length) continue;

    const reason: DuplicateReason = reasons.includes("same_file")
      ? "same_file"
      : reasons.includes("same_title")
        ? "same_title"
        : "similar_title";

    if (seen.has(track.id)) continue;
    seen.add(track.id);

    matches.push({
      id: track.id,
      libraryTitle: track.libraryTitle,
      workingTitle: track.workingTitle,
      reason,
    });
  }

  return matches.sort((a, b) => {
    const rank = { same_file: 0, same_title: 1, similar_title: 2 };
    return rank[a.reason] - rank[b.reason];
  });
}
