import type { QualificationConfig } from "../config/qualificationConfig.js";
import { ExtractionError, type ExtractionResult, type Extractor, type RequirementCandidate } from "../extraction/schema.js";
import type { LocalityResolver } from "../geo/localityResolver.js";
import type { Repository } from "../store/repository.js";
import type {
  CandidateOutcome,
  GroupConfig,
  InboundMessage,
  MessageDecision,
  ReasonCode,
  RejectionRecord,
  RequirementContact,
  RequirementRecord,
  Sighting,
  Stage,
} from "../types.js";
import { istDate } from "../util/indian.js";
import { trigramSimilarity } from "../util/text.js";
import { mapRequirement, sightingOf } from "./mapRequirement.js";
import { isInternalSender, prefilter } from "./prefilter.js";
import { qualify } from "./qualify.js";

export interface PipelineDeps {
  repo: Repository;
  extractor: Extractor;
  resolver: LocalityResolver;
  clock?: () => Date;
}

export interface ProcessOptions {
  /** Evaluate against this config instead of the active one (dry-run / tuning). */
  config?: QualificationConfig;
  /** Compute the decision without writing anything (§17 dry-run). */
  dryRun?: boolean;
  /** When false, a message with no cached extraction is not sent to the model (dry-run cost guard). */
  allowExtractionCalls?: boolean;
}

export interface ProcessResult {
  decision: MessageDecision;
  /** True when the decision was served from a previous run (idempotency, §8.3). */
  reused: boolean;
}

const STAGE_OF: Partial<Record<ReasonCode, Stage>> = {
  TOO_SHORT: "prefilter", MEDIA_ONLY: "prefilter", CHATTER: "prefilter", SYSTEM_NOTICE: "prefilter",
  BLOCKED_SENDER: "prefilter", NO_RE_SIGNAL: "prefilter", DUPLICATE_EXACT: "prefilter", INTERNAL_SENDER: "prefilter",
  NOT_A_REQUIREMENT: "classification", IS_PROPERTY_LISTING: "classification", SPAM_PROMO: "classification",
  EXTRACTION_FAILED: "extraction", LOW_CONFIDENCE: "extraction", LANGUAGE_UNSUPPORTED: "extraction",
  LOCALITY_UNRESOLVED: "geocode", OUT_OF_SERVICE_AREA: "geocode", DUPLICATE: "dedupe",
};

const FALLBACK_GROUP = (msg: InboundMessage): GroupConfig => ({
  groupId: msg.groupId,
  displayName: msg.groupName,
  isActive: true,
  trustTier: "low",
  defaultCity: "bengaluru",
  expectedContent: "mixed",
  addedOn: new Date(0),
  addedBy: "unregistered",
});

/** Runs one archived message through stages 2–7 and (unless dry-run) commits the result atomically. */
export async function processMessage(messageId: string, deps: PipelineDeps, opts: ProcessOptions = {}): Promise<ProcessResult> {
  const { repo } = deps;
  const clock = deps.clock ?? (() => new Date());

  const msg = await repo.getRawMessage(messageId);
  if (!msg) throw new Error(`Raw message ${messageId} not found`);
  const config = opts.config ?? (await repo.getActiveConfig());

  if (!opts.dryRun) {
    const previous = await repo.getDecision(messageId);
    if (previous && previous.configVersion === config.version) return { decision: previous, reused: true };
  }

  const group = (await repo.getGroup(msg.groupId)) ?? FALLBACK_GROUP(msg);
  const processedAt = clock();
  const b = new DecisionBuilder(msg, config, processedAt, deps.extractor.promptVersion);

  const run = async (): Promise<string> => {
    if (config.prefilter.skipInternalSenders && isInternalSender(msg, config)) {
      b.reject(null, ["INTERNAL_SENDER"], "Skipped: message from a Property Care staff number.", null);
      return "";
    }

    // Stage 2 — pre-filter
    const pf = await prefilter(msg, config, repo);
    if (pf.kind === "reject") {
      b.reject(null, [pf.reasonCode], pf.reasonText, null);
      return pf.hash;
    }
    if (pf.kind === "exact_sighting") {
      for (const requirementId of pf.entry.requirementIds) b.sighting(requirementId, "L1");
      return pf.hash;
    }

    // Stage 3 — classify & extract
    let extraction: ExtractionResult;
    try {
      const cached = await repo.getCachedExtraction(msg.messageId, deps.extractor.promptVersion, deps.extractor.model);
      if (cached) extraction = cached;
      else if (opts.allowExtractionCalls === false) throw new ExtractionError("EXTRACTION_FAILED", "No cached extraction and model calls are disabled for this run.");
      else {
        extraction = await deps.extractor.extract({
          messageId: msg.messageId,
          text: msg.text,
          groupName: group.displayName,
          groupDefaultCity: group.defaultCity,
          groupExpectedContent: group.expectedContent,
          sentAtIst: istDate(msg.sentAt),
        });
        if (!opts.dryRun) await repo.putCachedExtraction(msg.messageId, deps.extractor.promptVersion, deps.extractor.model, extraction);
      }
    } catch (err) {
      if (err instanceof ExtractionError) {
        b.reject(null, [err.code], `Rejected: ${err.message}`, null);
        return pf.hash;
      }
      throw err; // transport / auth errors: let the worker retry with backoff (§14)
    }

    const cls = extraction.classification;
    if (cls !== "REQUIREMENT" && cls !== "BOTH") {
      const code: ReasonCode = cls === "LISTING" ? "IS_PROPERTY_LISTING" : cls === "SERVICE_OFFER" ? "SPAM_PROMO" : "NOT_A_REQUIREMENT";
      const text =
        cls === "LISTING"
          ? "Rejected: the message offers a property rather than asking for one (archived for the v2 listing pipeline)."
          : cls === "SERVICE_OFFER"
            ? "Rejected: the message advertises a service, not a property requirement."
            : `Rejected: the message was classified as ${cls.toLowerCase().replace("_", " ")}.`;
      b.reject(null, [code], text, { classification: cls, classificationConfidence: extraction.classificationConfidence });
      return pf.hash;
    }
    if (extraction.requirements.length === 0) {
      const code: ReasonCode = extraction.language === "other" ? "LANGUAGE_UNSUPPORTED" : "EXTRACTION_FAILED";
      b.reject(null, [code], "Rejected: classified as a requirement but no requirement fields could be extracted.", { classification: cls });
      return pf.hash;
    }

    const isSplit = extraction.requirements.length > 1;
    const reputation = msg.senderPhone ? await repo.getSenderReputation(msg.senderPhone) : null;
    const senderIsKnownConsultant = msg.senderPhone ? await repo.isKnownActiveConsultant(msg.senderPhone) : false;

    for (const [splitIndex, candidate] of extraction.requirements.entries()) {
      const idx = isSplit ? splitIndex : null;

      // Stage 4 — locality resolution
      const { resolved, unresolved } = await deps.resolver.resolveAll(
        candidate.localities.map((l) => l.rawText),
        { messageId: msg.messageId, cityMentioned: candidate.cityMentioned.value, groupDefaultCity: group.defaultCity },
      );

      // Stage 5 — qualification
      const decision = qualify({ msg, group, config, classification: cls, candidate, isSplit, localities: resolved, reputation, senderIsKnownConsultant });
      if (decision.outcome === "FAILED") {
        const partial = partialOf(candidate, decision.reconciled.extractionConfidence);
        b.reject(idx, decision.reasonCodes, decision.reasonText, partial, decision.score);
        continue;
      }

      const { requirement, contact } = mapRequirement({
        msg, group, config, candidate, splitIndex, reconciled: decision.reconciled, score: decision.score,
        status: decision.status, unresolvedLocalities: unresolved, normalizedTextHash: pf.hash,
        promptVersion: deps.extractor.promptVersion, processedAt,
      });

      // Stage 6 — dedupe (G10)
      const dup = await findDuplicate(repo, msg, requirement, isSplit, config, b);
      if (dup?.kind === "sighting") {
        b.sighting(dup.requirementId, dup.layer);
        continue;
      }
      if (dup?.kind === "rejected") {
        b.reject(idx, ["DUPLICATE"], `Rejected: matches requirement ${dup.requirementId}, which ops already rejected.`, partialOf(candidate, requirement.extractionConfidence), decision.score);
        continue;
      }
      b.pass(requirement, contact);
    }
    return pf.hash;
  };

  const hash = await run();
  const decision = b.decision();
  if (!opts.dryRun) {
    await repo.commitDecision({
      message: msg,
      decision,
      normalizedTextHash: hash,
      newRequirements: b.newRequirements,
      rejections: b.rejections,
      sightings: b.sightings,
    });
  }
  return { decision, reused: false };
}

type DuplicateHit = { kind: "sighting"; requirementId: string; layer: "L2" | "L3" } | { kind: "rejected"; requirementId: string };

async function findDuplicate(
  repo: Repository,
  msg: InboundMessage,
  req: RequirementRecord,
  isSplit: boolean,
  config: QualificationConfig,
  b: DecisionBuilder,
): Promise<DuplicateHit | null> {
  const day = 86_400_000;
  const notSelf = (r: RequirementRecord) => !r.sightings.some((s) => s.messageId === msg.messageId);

  // Same fingerprint twice inside one multi-requirement message.
  const inMessage = b.newRequirements.find((n) => n.requirement.fingerprint === req.fingerprint);
  if (inMessage) return { kind: "sighting", requirementId: inMessage.requirement.requirementId, layer: "L3" };

  // L3 — composite business fingerprint, 30 days
  const byFp = await repo.findRequirementByFingerprint(req.fingerprint, new Date(msg.receivedAt.getTime() - config.dedupe.semanticWindowDays * day));
  if (byFp && notSelf(byFp)) {
    if (byFp.status === "rejected_by_human") return { kind: "rejected", requirementId: byFp.requirementId };
    return { kind: "sighting", requirementId: byFp.requirementId, layer: "L3" };
  }

  // L2 — near-duplicate text, 7 days (whole-message comparison; skipped for split messages)
  if (!isSplit) {
    const recent = await repo.findRecentRequirementTexts(new Date(msg.receivedAt.getTime() - config.dedupe.nearDuplicateWindowDays * day));
    for (const r of recent) {
      if (trigramSimilarity(r.rawText, msg.text) < config.dedupe.nearDuplicateSimilarity) continue;
      const existing = await repo.getRequirement(r.requirementId);
      if (!existing || !notSelf(existing)) continue;
      if (existing.status === "rejected_by_human") return { kind: "rejected", requirementId: existing.requirementId };
      return { kind: "sighting", requirementId: existing.requirementId, layer: "L2" };
    }
  }
  return null;
}

class DecisionBuilder {
  readonly outcomes: CandidateOutcome[] = [];
  readonly newRequirements: Array<{ requirement: RequirementRecord; contact: RequirementContact }> = [];
  readonly rejections: RejectionRecord[] = [];
  readonly sightings: Array<{ requirementId: string; sighting: Sighting }> = [];

  constructor(
    private readonly msg: InboundMessage,
    private readonly config: QualificationConfig,
    private readonly processedAt: Date,
    private readonly promptVersion: string,
  ) {}

  reject(
    splitIndex: number | null,
    reasonCodes: ReasonCode[],
    reasonText: string,
    extractedPartial: Record<string, unknown> | null,
    score?: { total: number; breakdown: Record<string, number> } | null,
  ) {
    const m = this.msg;
    const rejection: RejectionRecord = {
      rejectionId: splitIndex === null ? m.messageId : `${m.messageId}_${splitIndex}`,
      messageId: m.messageId,
      splitIndex,
      groupId: m.groupId,
      groupName: m.groupName,
      senderPhone: m.senderPhone,
      senderName: m.senderDisplayName,
      rawText: m.text,
      receivedAt: m.receivedAt,
      processedAt: this.processedAt,
      stage: STAGE_OF[reasonCodes[0]!] ?? "qualification",
      status: "FAILED",
      reasonCodes,
      reasonText,
      qualityScore: score?.total ?? null,
      scoreBreakdown: score?.breakdown ?? null,
      extractedPartial,
      configVersion: this.config.version,
      promptVersion: STAGE_OF[reasonCodes[0]!] === "prefilter" ? null : this.promptVersion,
      reviewedByHuman: false,
      overturnedToRequirementId: null,
    };
    this.rejections.push(rejection);
    this.outcomes.push({ kind: "FAILED", rejection });
  }

  sighting(requirementId: string, layer: "L1" | "L2" | "L3") {
    const sighting = sightingOf(this.msg);
    this.sightings.push({ requirementId, sighting });
    this.outcomes.push({ kind: "SIGHTING", requirementId, layer, sighting });
  }

  pass(requirement: RequirementRecord, contact: RequirementContact) {
    this.newRequirements.push({ requirement, contact });
    this.outcomes.push({ kind: "PASSED", status: requirement.status as "active" | "pending_review", requirement });
  }

  decision(): MessageDecision {
    return { messageId: this.msg.messageId, configVersion: this.config.version, outcomes: this.outcomes };
  }
}

function partialOf(c: RequirementCandidate, extractionConfidence: number): Record<string, unknown> {
  return {
    propertyCategory: c.propertyCategory.value,
    propertyType: c.propertyType.value,
    serviceType: c.serviceType.value,
    bhk: c.bhk.value,
    areaSqft: c.areaSqft.value,
    budgetMin: c.budgetMin.value,
    budgetMax: c.budgetMax.value,
    budgetKind: c.budgetKind.value,
    localities: c.localities.map((l) => l.rawText),
    cityMentioned: c.cityMentioned.value,
    contactMobile: c.contactMobile.value,
    extractionConfidence,
  };
}
