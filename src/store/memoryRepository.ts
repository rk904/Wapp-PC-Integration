import { DEFAULT_CONFIG, type QualificationConfig } from "../config/qualificationConfig.js";
import type { ExtractionResult } from "../extraction/schema.js";
import type { LocalityAlias, LocalityMasterEntry, LocalityStore } from "../geo/localityResolver.js";
import type {
  City,
  GroupConfig,
  InboundMessage,
  MessageDecision,
  RejectionRecord,
  RequirementContact,
  RequirementRecord,
  SenderReputation,
} from "../types.js";
import type { CommitInput, HashEntry, RecentRequirementText, Repository } from "./repository.js";

const clone = <T>(v: T): T => structuredClone(v);

/** In-memory Repository + LocalityStore. Used by tests and local experiments; mirrors Firestore semantics. */
export class MemoryRepository implements Repository, LocalityStore {
  readonly raw = new Map<string, InboundMessage>();
  readonly decisions = new Map<string, MessageDecision>();
  readonly requirements = new Map<string, RequirementRecord>();
  readonly contacts = new Map<string, RequirementContact>();
  readonly rejections = new Map<string, RejectionRecord>();
  readonly groups = new Map<string, GroupConfig>();
  readonly hashes = new Map<string, HashEntry>();
  readonly reputation = new Map<string, SenderReputation>();
  readonly extractions = new Map<string, ExtractionResult>();
  readonly aliases = new Map<string, LocalityAlias>();
  readonly master = new Map<string, LocalityMasterEntry>();
  readonly unresolved: Array<{ rawText: string; messageId: string; cityBias: City | null }> = [];
  readonly audit: Array<{ at: Date; messageId: string; configVersion: string; outcomes: string[] }> = [];
  readonly blocked = new Set<string>();
  readonly consultants = new Set<string>();
  config: QualificationConfig = clone(DEFAULT_CONFIG);

  // --- Stage 1
  async archiveRawMessage(msg: InboundMessage): Promise<boolean> {
    if (this.raw.has(msg.messageId)) return false;
    this.raw.set(msg.messageId, clone(msg));
    return true;
  }
  async getRawMessage(id: string) {
    const m = this.raw.get(id);
    return m ? clone(m) : null;
  }
  async listRawMessages(opts: { from?: Date; to?: Date; limit?: number }) {
    return [...this.raw.values()]
      .filter((m) => (!opts.from || m.receivedAt >= opts.from) && (!opts.to || m.receivedAt <= opts.to))
      .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())
      .slice(0, opts.limit ?? Infinity)
      .map(clone);
  }
  async getDecision(id: string) {
    const d = this.decisions.get(id);
    return d ? clone(d) : null;
  }

  // --- Config
  async getGroup(id: string) {
    const g = this.groups.get(id);
    return g ? clone(g) : null;
  }
  async getActiveConfig() {
    return clone(this.config);
  }
  async isBlockedSender(phone: string) {
    return this.blocked.has(phone);
  }
  async isKnownActiveConsultant(phone: string) {
    return this.consultants.has(phone);
  }
  async getSenderReputation(phone: string) {
    const r = this.reputation.get(phone);
    return r ? clone(r) : null;
  }

  // --- Extraction cache
  private extKey = (id: string, pv: string, model: string) => `${id}|${pv}|${model}`;
  async getCachedExtraction(id: string, pv: string, model: string) {
    const e = this.extractions.get(this.extKey(id, pv, model));
    return e ? clone(e) : null;
  }
  async putCachedExtraction(id: string, pv: string, model: string, result: ExtractionResult) {
    this.extractions.set(this.extKey(id, pv, model), clone(result));
  }

  // --- Dedupe
  async findHash(hash: string, since: Date) {
    const h = this.hashes.get(hash);
    return h && h.firstSeenAt >= since ? clone(h) : null;
  }
  async findRecentRequirementTexts(since: Date): Promise<RecentRequirementText[]> {
    return [...this.requirements.values()]
      .filter((r) => r.createdAt >= since)
      .map((r) => ({ requirementId: r.requirementId, rawText: r.description, sentAt: r.sightings[0]!.sentAt }));
  }
  async getRequirement(id: string) {
    const r = this.requirements.get(id);
    return r ? clone(r) : null;
  }
  async findRequirementByFingerprint(fp: string, since: Date) {
    const r = [...this.requirements.values()].find((x) => x.fingerprint === fp && x.createdAt >= since);
    return r ? clone(r) : null;
  }

  // --- Stage 7
  async commitDecision(input: CommitInput): Promise<void> {
    // Validate everything first so a failure leaves no partial state (transaction semantics).
    for (const s of input.sightings) {
      if (!this.requirements.has(s.requirementId)) throw new Error(`Sighting target ${s.requirementId} does not exist`);
    }
    const { message: msg, decision } = input;

    for (const { requirement, contact } of input.newRequirements) {
      this.requirements.set(requirement.requirementId, clone(requirement));
      this.contacts.set(requirement.requirementId, clone(contact));
    }
    for (const r of input.rejections) this.rejections.set(r.rejectionId, clone(r));
    for (const { requirementId, sighting } of input.sightings) {
      const req = this.requirements.get(requirementId)!;
      if (!req.sightings.some((s) => s.messageId === sighting.messageId)) {
        req.sightings.push(clone(sighting));
        req.sightingCount = req.sightings.length;
        req.updatedAt = new Date();
      }
    }
    if (input.normalizedTextHash && !this.hashes.has(input.normalizedTextHash)) {
      this.hashes.set(input.normalizedTextHash, {
        hash: input.normalizedTextHash,
        firstMessageId: msg.messageId,
        firstSeenAt: msg.receivedAt,
        requirementIds: input.newRequirements.map((n) => n.requirement.requirementId),
      });
    }
    if (msg.senderPhone) {
      const rep = this.reputation.get(msg.senderPhone) ?? { senderPhone: msg.senderPhone, seen: 0, passed: 0, rejected: 0, editedOrDeletedByOps: 0 };
      rep.seen += 1;
      if (decision.outcomes.some((o) => o.kind !== "FAILED")) rep.passed += 1;
      else rep.rejected += 1;
      this.reputation.set(msg.senderPhone, rep);
    }
    this.decisions.set(msg.messageId, clone(decision));
    this.audit.push({
      at: new Date(),
      messageId: msg.messageId,
      configVersion: decision.configVersion,
      outcomes: decision.outcomes.map((o) => (o.kind === "FAILED" ? `FAILED:${o.rejection.reasonCodes.join(",")}` : o.kind === "PASSED" ? `PASSED:${o.status}` : `SIGHTING:${o.layer}`)),
    });
  }

  // --- LocalityStore
  async getAlias(normalized: string) {
    return this.aliases.get(normalized) ?? null;
  }
  async getMaster(key: string) {
    const e = this.master.get(key);
    return e ? clone(e) : null;
  }
  async putMaster(entry: LocalityMasterEntry) {
    this.master.set(entry.key, clone(entry));
  }
  async incrementHit(key: string) {
    const e = this.master.get(key);
    if (e) e.hitCount += 1;
  }
  async recordUnresolved(rawText: string, messageId: string, cityBias: City | null) {
    this.unresolved.push({ rawText, messageId, cityBias });
  }
}
