import { createHash } from "node:crypto";

const EMOJI_RE = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;

/** Normalisation used by the L1 exact-duplicate hash (§13): lowercase, emoji and whitespace stripped. */
export function normalizeForHash(text: string): string {
  return text.toLowerCase().replace(EMOJI_RE, "").replace(/\s+/g, "");
}

export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function textHash(text: string): string {
  return sha256(normalizeForHash(text));
}

/** Lowercased, emoji removed, punctuation collapsed, single-spaced. For phrase matching and trigrams. */
export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(EMOJI_RE, " ")
    .replace(/[^\p{L}\p{N}\s+-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function trigrams(text: string): Set<string> {
  const s = `  ${normalizeForMatch(text)} `;
  const grams = new Set<string>();
  for (let i = 0; i < s.length - 2; i++) grams.add(s.slice(i, i + 3));
  return grams;
}

/** Jaccard similarity over character trigrams, 0..1 (§13 L2). */
export function trigramSimilarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  let inter = 0;
  for (const g of ta) if (tb.has(g)) inter++;
  return inter / (ta.size + tb.size - inter);
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True if `phrase` occurs in `text` on word boundaries (works for multi-word phrases). */
export function containsPhrase(normalizedText: string, phrase: string): boolean {
  const p = normalizeForMatch(phrase);
  if (!p) return false;
  return new RegExp(`(^|\\s)${escapeRegex(p)}(\\s|$)`, "u").test(normalizedText);
}
