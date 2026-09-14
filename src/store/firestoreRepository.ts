import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { DEFAULT_CONFIG, type QualificationConfig } from "../config/qualificationConfig.js";
import type { ExtractionResult } from "../extraction/schema.js";
import type { LocalityAlias, LocalityMasterEntry, LocalityStore } from "../geo/localityResolver.js";
import type { City, GroupConfig, InboundMessage, MessageDecision, RequirementRecord, SenderReputation } from "../types.js";
import type { CommitInput, HashEntry, RecentRequirementText, Repository } from "./repository.js";

/** Collection names (§16.1). `requirements` is the existing live collection shared with manual entries. */
export const C = {
  raw: "wa_raw_messages",
  rejected: "wa_rejected_messages",
  requirements: "requirements",
  reviewQueue: "wa_review_queue",
  groups: "wa_groups",
  reputation: "wa_sender_reputation",
  localityMaster: "locality_master",
  localityAliases: "locality_aliases",
  unresolvedLocalities: "wa_unresolved_localities",
  config: "qualification_config",
  audit: "wa_audit_log",
  hashes: "wa_text_hashes",
  extractions: "wa_extractions",
  blocklist: "wa_blocklist",
  consultants: "wa_known_consultants",
} as const;

/** Raised when a concurrent worker claimed the same text first; the caller retries and gets an L1 sighting. */
export class ConcurrentDuplicateError extends Error {
  constructor(readonly hash: string) {
    super(`Text hash ${hash} was claimed by a concurrent message; retry`);
    this.name = "ConcurrentDuplicateError";
  }
}

/** Firestore implementation of Repository and LocalityStore (region asia-south1, §18). */
export class FirestoreRepository implements Repository, LocalityStore {
  constructor(private readonly db: Firestore) {}

  // --- Stage 1
  async archiveRawMessage(msg: InboundMessage): Promise<boolean> {
    try {
      await this.db.collection(C.raw).doc(msg.messageId).create(toFs({ ...msg, rawPayload: msg.rawPayload ?? null, decision: null }));
      return true;
    } catch (err) {
      if ((err as { code?: number }).code === 6 /* ALREADY_EXISTS */) return false;
      throw err;
    }
  }

  async getRawMessage(id: string): Promise<InboundMessage | null> {
    const snap = await this.db.collection(C.raw).doc(id).get();
    if (!snap.exists) return null;
    const { decision: _d, ...msg } = fromFs(snap.data()!) as InboundMessage & { decision: unknown };
    return msg;
  }

  async listRawMessages(opts: { from?: Date; to?: Date; limit?: number }): Promise<InboundMessage[]> {
    let q = this.db.collection(C.raw).orderBy("receivedAt", "desc");
    if (opts.from) q = q.where("receivedAt", ">=", opts.from);
    if (opts.to) q = q.where("receivedAt", "<=", opts.to);
    const snap = await q.limit(opts.limit ?? 500).get();
    return snap.docs.map((d) => {
      const { decision: _d, ...msg } = fromFs(d.data()) as InboundMessage & { decision: unknown };
      return msg;
    });
  }

  async getDecision(id: string): Promise<MessageDecision | null> {
    const snap = await this.db.collection(C.raw).doc(id).get();
    return (snap.exists && (fromFs(snap.get("decision")) as MessageDecision | null)) || null;
  }

  // --- Config
  async getGroup(id: string): Promise<GroupConfig | null> {
    const snap = await this.db.collection(C.groups).doc(id).get();
    return snap.exists ? (fromFs(snap.data()!) as GroupConfig) : null;
  }

  /** qualification_config/_active holds { version }; each version is an immutable document. */
  async getActiveConfig(): Promise<QualificationConfig> {
    const pointer = await this.db.collection(C.config).doc("_active").get();
    const version = pointer.get("version") as string | undefined;
    if (!version) return DEFAULT_CONFIG;
    const snap = await this.db.collection(C.config).doc(version).get();
    if (!snap.exists) throw new Error(`Active qualification_config version ${version} not found`);
    return snap.data() as QualificationConfig;
  }

  async isBlockedSender(phone: string) {
    return (await this.db.collection(C.blocklist).doc(phone).get()).exists;
  }
  async isKnownActiveConsultant(phone: string) {
    const snap = await this.db.collection(C.consultants).doc(phone).get();
    return snap.exists && snap.get("active") === true;
  }
  async getSenderReputation(phone: string) {
    const snap = await this.db.collection(C.reputation).doc(phone).get();
    return snap.exists ? (snap.data() as SenderReputation) : null;
  }

  // --- Extraction cache
  private extId = (id: string, pv: string, model: string) => `${id}__${pv}__${model}`.replace(/\//g, "_");
  async getCachedExtraction(id: string, pv: string, model: string) {
    const snap = await this.db.collection(C.extractions).doc(this.extId(id, pv, model)).get();
    return snap.exists ? (snap.get("result") as ExtractionResult) : null;
  }
  async putCachedExtraction(id: string, pv: string, model: string, result: ExtractionResult) {
    await this.db.collection(C.extractions).doc(this.extId(id, pv, model)).set({ messageId: id, promptVersion: pv, model, result, createdAt: FieldValue.serverTimestamp() });
  }

  // --- Dedupe
  async findHash(hash: string, since: Date): Promise<HashEntry | null> {
    const snap = await this.db.collection(C.hashes).doc(hash).get();
    if (!snap.exists) return null;
    const entry = fromFs(snap.data()!) as HashEntry;
    return entry.firstSeenAt >= since ? entry : null;
  }

  async findRecentRequirementTexts(since: Date): Promise<RecentRequirementText[]> {
    const snap = await this.db
      .collection(C.requirements)
      .where("source", "==", "whatsapp_group")
      .where("createdAt", ">=", since)
      .select("description", "createdAt")
      .get();
    return snap.docs.map((d) => ({ requirementId: d.id, rawText: d.get("description") as string, sentAt: (d.get("createdAt") as Timestamp).toDate() }));
  }

  async getRequirement(id: string) {
    const snap = await this.db.collection(C.requirements).doc(id).get();
    return snap.exists ? (fromFs(snap.data()!) as RequirementRecord) : null;
  }

  async findRequirementByFingerprint(fp: string, since: Date) {
    const snap = await this.db.collection(C.requirements).where("fingerprint", "==", fp).where("createdAt", ">=", since).orderBy("createdAt", "desc").limit(1).get();
    const doc = snap.docs[0];
    return doc ? (fromFs(doc.data()) as RequirementRecord) : null;
  }

  // --- Stage 7: one transaction per message (§14)
  async commitDecision(input: CommitInput): Promise<void> {
    const { message: msg, decision } = input;
    await this.db.runTransaction(async (tx) => {
      // Reads first (Firestore transaction rule).
      const hashRef = input.normalizedTextHash ? this.db.collection(C.hashes).doc(input.normalizedTextHash) : null;
      const hashSnap = hashRef ? await tx.get(hashRef) : null;
      const sightingRefs = input.sightings.map((s) => this.db.collection(C.requirements).doc(s.requirementId));
      const sightingSnaps = sightingRefs.length ? await tx.getAll(...sightingRefs) : [];
      const repRef = msg.senderPhone ? this.db.collection(C.reputation).doc(msg.senderPhone) : null;
      const repSnap = repRef ? await tx.get(repRef) : null;

      if (hashSnap?.exists && hashSnap.get("firstMessageId") !== msg.messageId && input.newRequirements.length > 0) {
        throw new ConcurrentDuplicateError(input.normalizedTextHash);
      }
      for (const s of sightingSnaps) if (!s.exists) throw new Error(`Sighting target ${s.id} does not exist`);

      for (const { requirement, contact } of input.newRequirements) {
        const ref = this.db.collection(C.requirements).doc(requirement.requirementId);
        tx.create(ref, toFs(requirement));
        tx.create(ref.collection("private").doc("contact"), toFs(contact));
        if (requirement.status === "pending_review") {
          tx.set(this.db.collection(C.reviewQueue).doc(requirement.requirementId), {
            requirementId: requirement.requirementId,
            qualityScore: requirement.qualityScore,
            extractionConfidence: requirement.extractionConfidence,
            createdAt: requirement.createdAt,
          });
        }
      }
      for (const r of input.rejections) tx.set(this.db.collection(C.rejected).doc(r.rejectionId), toFs(r));
      input.sightings.forEach(({ sighting }, i) => {
        const already = ((sightingSnaps[i]!.get("sightings") as Array<{ messageId: string }>) ?? []).some((x) => x.messageId === sighting.messageId);
        if (already) return;
        tx.update(sightingRefs[i]!, {
          sightings: FieldValue.arrayUnion(toFs(sighting)),
          sightingCount: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        });
      });

      if (hashRef && !hashSnap?.exists) {
        tx.create(hashRef, {
          hash: input.normalizedTextHash,
          firstMessageId: msg.messageId,
          firstSeenAt: msg.receivedAt,
          requirementIds: input.newRequirements.map((n) => n.requirement.requirementId),
        });
      }
      if (repRef) {
        const ok = decision.outcomes.some((o) => o.kind !== "FAILED");
        const base = repSnap?.exists ? {} : { senderPhone: msg.senderPhone, editedOrDeletedByOps: 0 };
        tx.set(repRef, { ...base, seen: FieldValue.increment(1), passed: FieldValue.increment(ok ? 1 : 0), rejected: FieldValue.increment(ok ? 0 : 1) }, { merge: true });
      }
      tx.update(this.db.collection(C.raw).doc(msg.messageId), { decision: toFs(decision) });
      tx.create(this.db.collection(C.audit).doc(), {
        kind: "decision",
        messageId: msg.messageId,
        configVersion: decision.configVersion,
        outcomes: decision.outcomes.map((o) => (o.kind === "FAILED" ? { kind: o.kind, reasonCodes: o.rejection.reasonCodes } : o.kind === "PASSED" ? { kind: o.kind, status: o.status, requirementId: o.requirement.requirementId } : { kind: o.kind, layer: o.layer, requirementId: o.requirementId })),
        at: FieldValue.serverTimestamp(),
      });
    });
  }

  // --- LocalityStore
  async getAlias(normalized: string) {
    const snap = await this.db.collection(C.localityAliases).doc(docId(normalized)).get();
    return snap.exists ? (snap.data() as LocalityAlias) : null;
  }
  async getMaster(key: string) {
    const snap = await this.db.collection(C.localityMaster).doc(docId(key)).get();
    return snap.exists ? (snap.data() as LocalityMasterEntry) : null;
  }
  async putMaster(entry: LocalityMasterEntry) {
    await this.db.collection(C.localityMaster).doc(docId(entry.key)).set(entry);
  }
  async incrementHit(key: string) {
    await this.db.collection(C.localityMaster).doc(docId(key)).update({ hitCount: FieldValue.increment(1) });
  }
  async recordUnresolved(rawText: string, messageId: string, cityBias: City | null) {
    await this.db
      .collection(C.unresolvedLocalities)
      .doc(docId(`${cityBias ?? "any"}:${rawText.toLowerCase().trim()}`))
      .set({ rawText, cityBias, lastMessageId: messageId, count: FieldValue.increment(1), lastSeenAt: FieldValue.serverTimestamp() }, { merge: true });
  }
}

const docId = (s: string) => encodeURIComponent(s).replace(/\./g, "%2E").slice(0, 1400);

/** Firestore rejects `undefined`; Dates are stored as Timestamps. */
function toFs<T>(value: T): T {
  if (value instanceof Date) return Timestamp.fromDate(value) as unknown as T;
  if (Array.isArray(value)) return value.map(toFs) as unknown as T;
  if (value && typeof value === "object" && !(value instanceof Timestamp)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = toFs(v);
    return out as T;
  }
  return value;
}

function fromFs(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate();
  if (Array.isArray(value)) return value.map(fromFs);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = fromFs(v);
    return out;
  }
  return value;
}
