import type { QualificationConfig } from "../config/qualificationConfig.js";
import type { HashEntry, Repository } from "../store/repository.js";
import type { InboundMessage, ReasonCode } from "../types.js";
import { containsPhrase, normalizeForMatch, textHash } from "../util/text.js";

export type PrefilterResult =
  | { kind: "candidate"; hash: string }
  | { kind: "reject"; hash: string; reasonCode: ReasonCode; reasonText: string }
  /** Exact cross-post of a message that already produced a requirement: record a sighting, skip the LLM. */
  | { kind: "exact_sighting"; hash: string; entry: HashEntry };

/** Stage 2 — deterministic pre-filter (§9). No model cost. */
export async function prefilter(
  msg: InboundMessage,
  config: QualificationConfig,
  repo: Repository,
): Promise<PrefilterResult> {
  const pf = config.prefilter;
  const text = msg.text.trim();
  const hash = textHash(text);
  const reject = (reasonCode: ReasonCode, reasonText: string): PrefilterResult => ({
    kind: "reject",
    hash,
    reasonCode,
    reasonText,
  });

  if (msg.isSystemNotice) return reject("SYSTEM_NOTICE", "Rejected: WhatsApp group system notice.");
  if (text.length === 0) {
    return msg.hasMedia
      ? reject("MEDIA_ONLY", `Rejected: ${msg.mediaType ?? "media"} with no text (logged for v2 media handling).`)
      : reject("TOO_SHORT", "Rejected: empty message.");
  }
  if (text.length < pf.minTextLength) {
    return reject("TOO_SHORT", `Rejected: only ${text.length} characters of text (minimum ${pf.minTextLength}).`);
  }

  const normalized = normalizeForMatch(text);
  if (isPureChatter(normalized, pf.chatterPhrases)) {
    return reject("CHATTER", "Rejected: greeting or acknowledgement with no requirement content.");
  }
  if (text.length < 120 && pf.systemNoticePatterns.some((p) => new RegExp(p, "i").test(text)) && !hasRealEstateSignal(normalized, pf.realEstateVocabulary)) {
    return reject("SYSTEM_NOTICE", "Rejected: looks like a group admin/system notice.");
  }
  if (msg.senderPhone && (await repo.isBlockedSender(msg.senderPhone))) {
    return reject("BLOCKED_SENDER", "Rejected: sender is on the blocklist.");
  }

  const since = new Date(msg.receivedAt.getTime() - pf.exactDuplicateWindowDays * 86_400_000);
  const seen = await repo.findHash(hash, since);
  if (seen && seen.firstMessageId !== msg.messageId) {
    if (seen.requirementIds.length > 0) return { kind: "exact_sighting", hash, entry: seen };
    return reject(
      "DUPLICATE_EXACT",
      `Rejected: identical text was already seen ${formatAgo(msg.receivedAt, seen.firstSeenAt)} (message ${seen.firstMessageId}).`,
    );
  }

  if (!hasRealEstateSignal(normalized, pf.realEstateVocabulary)) {
    return reject("NO_RE_SIGNAL", "Rejected: no real-estate vocabulary found in the message.");
  }
  return { kind: "candidate", hash };
}

export function isInternalSender(msg: InboundMessage, config: QualificationConfig): boolean {
  return !!msg.senderPhone && config.internalSenderPhones.includes(msg.senderPhone);
}

function isPureChatter(normalized: string, phrases: string[]): boolean {
  let remainder = ` ${normalized} `;
  // Longest phrases first so "ok done" is removed before "ok".
  for (const p of [...phrases].sort((a, b) => b.length - a.length)) {
    const np = normalizeForMatch(p);
    if (!np) continue;
    remainder = remainder.split(` ${np} `).join(" ");
    remainder = remainder.split(` ${np} `).join(" ");
  }
  // Also treat emoji-only / punctuation-only messages as chatter.
  return remainder.replace(/\s+/g, "").length === 0 || /^[\s\p{P}\p{S}]*$/u.test(remainder);
}

function hasRealEstateSignal(normalized: string, vocab: string[]): boolean {
  if (/\b\d+(?:\.\d+)?\s*bhk\b|\b\d+\s*rk\b|\d+\s*x\s*\d+/.test(normalized)) return true;
  return vocab.some((v) => containsPhrase(normalized, v));
}

function formatAgo(now: Date, then: Date): string {
  const mins = Math.round((now.getTime() - then.getTime()) / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}
