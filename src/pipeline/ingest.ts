import type { Repository } from "../store/repository.js";
import type { InboundMessage } from "../types.js";

export type IngestResult =
  | { accepted: true; messageId: string }
  | { accepted: false; messageId: string; reason: "DUPLICATE_MESSAGE_ID" | "GROUP_NOT_REGISTERED" | "GROUP_PAUSED" | "INVALID" };

/** Direct messages are only ingested when this pseudo-group is registered and active (§8.3). */
export const DIRECT_PSEUDO_GROUP_ID = "direct";

/**
 * Stage 1 — Ingest API (§7.1, §8). Validates, archives verbatim and idempotently on
 * messageId, then hands the id to the processing queue. Nothing here inspects content.
 */
export async function ingest(
  msg: InboundMessage,
  repo: Repository,
  publish: (messageId: string) => Promise<void>,
): Promise<IngestResult> {
  const problem = validate(msg);
  if (problem) return { accepted: false, messageId: msg.messageId ?? "", reason: "INVALID" };

  const group = await repo.getGroup(msg.groupId);
  if (!group) return { accepted: false, messageId: msg.messageId, reason: "GROUP_NOT_REGISTERED" };
  if (!group.isActive) return { accepted: false, messageId: msg.messageId, reason: "GROUP_PAUSED" };

  const isNew = await repo.archiveRawMessage(msg);
  if (!isNew) return { accepted: false, messageId: msg.messageId, reason: "DUPLICATE_MESSAGE_ID" };

  await publish(msg.messageId);
  return { accepted: true, messageId: msg.messageId };
}

function validate(msg: InboundMessage): string | null {
  if (!msg || typeof msg.messageId !== "string" || !msg.messageId) return "messageId missing";
  if (typeof msg.groupId !== "string" || !msg.groupId) return "groupId missing";
  if (!(msg.sentAt instanceof Date) || Number.isNaN(msg.sentAt.getTime())) return "sentAt invalid";
  if (!(msg.receivedAt instanceof Date) || Number.isNaN(msg.receivedAt.getTime())) return "receivedAt invalid";
  if (typeof msg.text !== "string") return "text missing";
  return null;
}
