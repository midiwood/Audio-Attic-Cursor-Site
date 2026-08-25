export const AI_QUOTA_MESSAGE =
  "AI limit reached — Gemini quota is used up for now. You can still tag and import manually. Try again later, or check billing / rate limits.";

export function isAiQuotaError(message: string | null | undefined): boolean {
  const text = String(message || "");
  return /quota|rate limit|resource_exhausted|429|ai limit reached|exceeded/i.test(text);
}

export function formatAiError(message: string | null | undefined): string {
  if (isAiQuotaError(message)) return AI_QUOTA_MESSAGE;
  return String(message || "AI tagging failed — you can tag manually").trim();
}
