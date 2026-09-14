import type { QualificationConfig } from "../config/qualificationConfig.js";
import type { ExtractionResult } from "../extraction/schema.js";
import type {
  GroupConfig,
  InboundMessage,
  MessageDecision,
  RejectionRecord,
  RequirementContact,
  RequirementRecord,
  SenderReputation,
  Sighting,
} from "../types.js";

export interface HashEntry {
  hash: string;
  firstMessageId: string;
  firstSeenAt: Date;
  /** Requirements the first message with this text produced (empty if it was rejected). */
  requirementIds: string[];
}

export interface RecentRequirementText {
  requirementId: string;
  rawText: string;
  sentAt: Date;
}

/**
 * Persistence boundary for stages 1–7. Implemented by FirestoreRepository
 * (production) and MemoryRepository (tests, dry-run).
 */
export interface Repository {
  // Stage 1 — raw archive (§8.2). Returns false when the messageId already exists.
  archiveRawMessage(msg: InboundMessage): Promise<boolean>;
  getRawMessage(messageId: string): Promise<InboundMessage | null>;
  listRawMessages(opts: { from?: Date; to?: Date; limit?: number }): Promise<InboundMessage[]>;
  getDecision(messageId: string): Promise<MessageDecision | null>;

  // Config (§8.1, §12)
  getGroup(groupId: string): Promise<GroupConfig | null>;
  getActiveConfig(): Promise<QualificationConfig>;
  isBlockedSender(phone: string): Promise<boolean>;
  isKnownActiveConsultant(phone: string): Promise<boolean>;
  getSenderReputation(phone: string): Promise<SenderReputation | null>;

  // Extraction cache: keeps replays deterministic and free (§6, §18 idempotency).
  getCachedExtraction(messageId: string, promptVersion: string, model: string): Promise<ExtractionResult | null>;
  putCachedExtraction(messageId: string, promptVersion: string, model: string, result: ExtractionResult): Promise<void>;

  // Dedupe lookups (§13)
  findHash(hash: string, since: Date): Promise<HashEntry | null>;
  findRecentRequirementTexts(since: Date): Promise<RecentRequirementText[]>;
  getRequirement(requirementId: string): Promise<RequirementRecord | null>;
  findRequirementByFingerprint(fingerprint: string, since: Date): Promise<RequirementRecord | null>;

  /**
   * Stage 7 — atomically writes the decision stamp, every requirement / rejection /
   * sighting it produced, hash-index updates, reputation counters and the audit entry.
   * All or nothing (§14).
   */
  commitDecision(input: CommitInput): Promise<void>;
}

export interface CommitInput {
  message: InboundMessage;
  decision: MessageDecision;
  normalizedTextHash: string;
  newRequirements: Array<{ requirement: RequirementRecord; contact: RequirementContact }>;
  rejections: RejectionRecord[];
  sightings: Array<{ requirementId: string; sighting: Sighting }>;
}
