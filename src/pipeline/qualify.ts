import { effectiveAutoPost, type QualificationConfig } from "../config/qualificationConfig.js";
import type { ExtractionResult, RequirementCandidate } from "../extraction/schema.js";
import type { GroupConfig, InboundMessage, PropertyCategory, ReasonCode, ResolvedLocality, SenderReputation } from "../types.js";
import { amountMatchesSpan, findIndianMobiles, normalizeIndianMobile } from "../util/indian.js";

/** Candidate after deterministic reconciliation, ready for gates. */
export interface ReconciledCandidate {
  category: PropertyCategory | null;
  categoryInferred: boolean;
  propertyType: string | null;
  bodyMobile: string | null;
  senderMobile: string | null;
  bodyNumberInvalid: boolean;
  budgetConfidence: number;
  budgetSpanMismatch: boolean;
  servicedLocalities: ResolvedLocality[];
  outOfAreaLocalities: ResolvedLocality[];
  extractionConfidence: number;
}

export interface GateResult {
  passed: boolean;
  reasonCodes: ReasonCode[];
  reasonParts: string[];
}

export interface QualificationContext {
  msg: InboundMessage;
  group: GroupConfig;
  config: QualificationConfig;
  classification: ExtractionResult["classification"];
  candidate: RequirementCandidate;
  isSplit: boolean;
  localities: ResolvedLocality[];
  reputation: SenderReputation | null;
  senderIsKnownConsultant: boolean;
}

export type QualificationDecision =
  | { outcome: "FAILED"; reasonCodes: ReasonCode[]; reasonText: string; score: ScoreResult | null; reconciled: ReconciledCandidate }
  | { outcome: "PASSED"; status: "active" | "pending_review"; score: ScoreResult; reconciled: ReconciledCandidate };

export interface ScoreResult {
  total: number;
  breakdown: Record<string, number>;
  dataCompleteness: number;
}

// ---------------------------------------------------------------------------
// Reconciliation — deterministic checks on model output before any gate.
// ---------------------------------------------------------------------------

export function reconcile(ctx: QualificationContext): ReconciledCandidate {
  const { candidate: c, config, msg } = ctx;

  let category = c.propertyCategory.value;
  let categoryInferred = c.propertyCategory.isInferred;
  const propertyType = c.propertyType.value;
  if (propertyType) {
    const owning = (Object.keys(config.propertyTypes) as PropertyCategory[]).filter((cat) =>
      config.propertyTypes[cat].includes(propertyType),
    );
    // Permitted inference (§15.2): category from type, and type wins over a contradictory category.
    if (owning.length === 1 && category !== owning[0]) {
      category = owning[0] ?? null;
      categoryInferred = true;
    }
  }

  const modelMobile = normalizeIndianMobile(c.contactMobile.value);
  const textMobiles = findIndianMobiles(msg.text);
  const bodyMobile = modelMobile && textMobiles.includes(modelMobile) ? modelMobile : (textMobiles[0] ?? null);
  const bodyNumberInvalid = !bodyMobile && !!c.contactMobile.value;
  const senderMobile = normalizeIndianMobile(msg.senderPhone);

  // Cross-check budget figures against the cited words; a mismatch lowers confidence (sends to review).
  let budgetConfidence = Math.max(c.budgetMin.confidence, c.budgetMax.confidence);
  let budgetSpanMismatch = false;
  for (const f of [c.budgetMin, c.budgetMax]) {
    if (f.value !== null && !amountMatchesSpan(f.value, f.sourceSpan)) budgetSpanMismatch = true;
  }
  if (budgetSpanMismatch) budgetConfidence *= 0.8;

  const servicedLocalities = ctx.localities.filter((l) => l.city && config.serviceCities.includes(l.city));
  const outOfAreaLocalities = ctx.localities.filter((l) => !l.city || !config.serviceCities.includes(l.city));

  // extractionConfidence = how surely the model read what it did extract (§10.3). Fields the message
  // does not evidence are excluded here — their absence is judged by their own hard gates, not twice.
  const configMode = propertyType ? config.configByType[propertyType] : undefined;
  const weighted: Array<[number | null, number]> = [
    [c.propertyCategory.value ? c.propertyCategory.confidence : category && c.propertyType.value ? c.propertyType.confidence : null, 1],
    [c.propertyType.value ? c.propertyType.confidence : null, 1],
    [c.serviceType.value ? c.serviceType.confidence : null, 1.5],
    [c.budgetMin.value !== null || c.budgetMax.value !== null ? budgetConfidence : null, 1.5],
    [c.localities.length ? c.localities.reduce((s, l) => s + l.confidence, 0) / c.localities.length : null, 1.5],
  ];
  if (configMode === "bhk") weighted.push([c.bhk.value !== null ? c.bhk.confidence : null, 1]);
  if (configMode === "area") weighted.push([c.areaSqft.value !== null || c.unitSpec.value ? Math.max(c.areaSqft.confidence, c.unitSpec.confidence) : null, 1]);
  if (bodyMobile) weighted.push([modelMobile === bodyMobile ? c.contactMobile.confidence || 0.9 : 0.9, 1]);
  const present = weighted.filter((p): p is [number, number] => p[0] !== null);
  const totalWeight = present.reduce((s, [, w]) => s + w, 0);
  const extractionConfidence = totalWeight ? round2(present.reduce((s, [v, w]) => s + v * w, 0) / totalWeight) : 0;

  return {
    category,
    categoryInferred,
    propertyType,
    bodyMobile,
    senderMobile,
    bodyNumberInvalid,
    budgetConfidence,
    budgetSpanMismatch,
    servicedLocalities,
    outOfAreaLocalities,
    extractionConfidence,
  };
}

// ---------------------------------------------------------------------------
// Stage 5a — hard gates G1–G9, G11 (§12.1). G10 (dedupe) runs in stage 6.
// ---------------------------------------------------------------------------

export function runGates(ctx: QualificationContext, r: ReconciledCandidate): GateResult {
  const { candidate: c, config, msg } = ctx;
  const codes: ReasonCode[] = [];
  const parts: string[] = [];
  const fail = (code: ReasonCode, part: string) => {
    codes.push(code);
    parts.push(part);
  };

  // G1 — intent
  if (ctx.classification === "LISTING") fail("IS_PROPERTY_LISTING", "the message offers a property rather than asking for one");
  else if (ctx.classification !== "REQUIREMENT" && ctx.classification !== "BOTH")
    fail("NOT_A_REQUIREMENT", `the message was classified as ${ctx.classification.toLowerCase().replace("_", " ")}`);

  // G2 — category
  if (!r.category) fail("CATEGORY_UNRESOLVED", "no property category could be determined");

  // G3 — type (must belong to the category)
  if (!r.propertyType || (r.category && !config.propertyTypes[r.category].includes(r.propertyType)))
    fail("TYPE_UNRESOLVED", "no property type could be determined");

  // G4 — service type
  if (!c.serviceType.value) fail("SERVICE_TYPE_UNRESOLVED", "it is not clear whether this is rent, lease or buy");

  // G5 — locality inside a serviced city
  if (r.servicedLocalities.length === 0) {
    const outside = r.outOfAreaLocalities[0];
    if (outside) fail("OUT_OF_SERVICE_AREA", `the location resolves to ${outside.cityName || "a place"} outside Bengaluru, Hosur and Coimbatore`);
    else fail("LOCALITY_UNRESOLVED", c.localities.length ? "no locality could be matched to a serviced city" : "no locality was named");
  }

  // G6 — configuration
  const mode = r.propertyType ? config.configByType[r.propertyType] : undefined;
  if (mode === "bhk" && c.bhk.value === null) fail("CONFIG_MISSING", "no BHK configuration was stated");
  if (mode === "area" && c.areaSqft.value === null && !c.unitSpec.value) fail("CONFIG_MISSING", "no area or plot/unit specification was stated");

  // G7 — budget
  if ((c.budgetMin.value === null && c.budgetMax.value === null) || c.budgetKind.value === "vague") {
    const vague = c.budgetKind.value === "vague" && c.budgetKind.sourceSpan;
    fail(
      "BUDGET_MISSING",
      vague
        ? `no budget figure, range or band could be identified — '${c.budgetKind.sourceSpan}' is not specific enough to map to a budget band`
        : "no budget figure, range or band could be identified",
    );
  }

  // G8 — contact
  if (!r.bodyMobile && !r.senderMobile) {
    if (r.bodyNumberInvalid || msg.senderPhone) fail("INVALID_PHONE", "the contact number is not a valid Indian mobile");
    else fail("NO_CONTACT", "no contact number is available");
  }

  // G9 — freshness, measured against when the message reached us (deterministic on replay)
  const ageHours = (msg.receivedAt.getTime() - msg.sentAt.getTime()) / 3_600_000;
  if (ageHours > config.gates.freshnessHours) fail("STALE_MESSAGE", `the message was ${Math.round(ageHours)} hours old when received`);

  // G11 — extraction confidence
  if (r.extractionConfidence < config.gates.minExtractionConfidence)
    fail("LOW_CONFIDENCE", `extraction confidence ${r.extractionConfidence} is below ${config.gates.minExtractionConfidence}`);

  return { passed: codes.length === 0, reasonCodes: codes, reasonParts: parts };
}

// ---------------------------------------------------------------------------
// Stage 5b — quality score, 100 points (§12.2). Deterministic; never from the model.
// ---------------------------------------------------------------------------

export function score(ctx: QualificationContext, r: ReconciledCandidate): ScoreResult {
  const { candidate: c, config } = ctx;
  const w = config.weights;
  const b: Record<string, number> = {};

  // Budget specificity: exact / tight range 15, broad range 10, band-only (open-ended) 6
  const kind = c.budgetKind.value;
  const min = c.budgetMin.value;
  const max = c.budgetMax.value;
  let budgetFrac = 0;
  if (kind === "exact" || (min !== null && max !== null && min === max)) budgetFrac = 1;
  else if (min !== null && max !== null) budgetFrac = (max - min) / max <= 0.25 ? 1 : 10 / 15;
  else if (min !== null || max !== null) budgetFrac = 6 / 15;
  b.budgetSpecificity = w.budgetSpecificity * budgetFrac;

  // Locality specificity: micro-market exact 15, broad locality 10, city only 4
  const best = r.servicedLocalities.reduce<number>((acc, l) => {
    const v = l.granularity === "micro" && l.geoPrecision === "exact" ? 1 : l.granularity === "city" ? 4 / 15 : 10 / 15;
    return Math.max(acc, v);
  }, 0);
  b.localitySpecificity = w.localitySpecificity * best;

  // Configuration clarity: exact 10, range 7, vague 4
  const mode = r.propertyType ? config.configByType[r.propertyType] : undefined;
  let configFrac = 0.4;
  if (mode === "bhk" || mode === "bhk_or_none") {
    if (c.bhk.value !== null) configFrac = c.bhk.bhkMax !== null && c.bhk.bhkMax !== c.bhk.value ? 0.7 : 1;
    else if (mode === "bhk_or_none") configFrac = 0.7;
  } else if (mode === "area") {
    if (c.areaSqft.value !== null || c.unitSpec.value) configFrac = 1;
  }
  if (c.clarity === "ambiguous") configFrac = Math.min(configFrac, 0.4);
  b.configurationClarity = w.configurationClarity * configFrac;

  // Contact quality: in body 10, sender only 7, known active consultant 10
  b.contactQuality = r.bodyMobile || ctx.senderIsKnownConsultant ? w.contactQuality : r.senderMobile ? w.contactQuality * 0.7 : 0;

  // Timeline: explicit / immediate / this month 10, soon 5, absent 0
  const tk = c.requiredWithin.kind;
  b.timelineStated = tk === null ? 0 : tk === "soon" ? w.timelineStated * 0.5 : w.timelineStated;

  b.furnishingStated = c.furnishStatus.value ? w.furnishingStated : 0;
  b.tenantTypeOrPurposeStated = c.tenantType.value || c.purpose.value ? w.tenantTypeOrPurposeStated : 0;

  // Message clarity: structured single unambiguous 10; run-on / ambiguous / multi-requirement 5
  b.messageClarity = c.clarity === "clear" && !ctx.isSplit ? w.messageClarity : w.messageClarity * 0.5;

  b.reputation = reputationPoints(ctx);

  const dataCompleteness = completeness(ctx, r);
  b.mandatoryCompleteness = w.mandatoryCompleteness * (dataCompleteness / 100);

  for (const k of Object.keys(b)) b[k] = round1(b[k] ?? 0);
  const total = Math.round(Object.values(b).reduce((s, v) => s + v, 0));
  return { total, breakdown: b, dataCompleteness };
}

function reputationPoints(ctx: QualificationContext): number {
  const { config, group, reputation } = ctx;
  const max = config.weights.reputation;
  let pts = config.reputation.trustTierPoints[group.trustTier];
  if (reputation && reputation.seen >= config.reputation.bonusMinMessages) {
    const passRate = reputation.passed / reputation.seen;
    if (passRate > config.reputation.bonusMinPassRate) pts += max - config.reputation.trustTierPoints.high;
    if (reputation.passed > 0 && reputation.editedOrDeletedByOps / reputation.passed > 0.5) pts -= 3;
  }
  if (ctx.senderIsKnownConsultant) pts = max;
  return Math.max(0, Math.min(max, pts));
}

/** Share of the UI's message-derivable mandatory fields filled from the message rather than defaulted (§16.3). */
export function completeness(ctx: QualificationContext, r: ReconciledCandidate): number {
  const { candidate: c, config } = ctx;
  const mode = r.propertyType ? config.configByType[r.propertyType] : undefined;
  const filled = [
    !!r.category,
    !!r.propertyType,
    !!c.serviceType.value,
    mode === "bhk_or_none" || c.bhk.value !== null || c.areaSqft.value !== null || !!c.unitSpec.value,
    !!c.furnishStatus.value,
    c.budgetMin.value !== null || c.budgetMax.value !== null,
    c.requiredWithin.kind !== null,
    r.servicedLocalities.length > 0,
    !!c.contactName.value,
    !!r.bodyMobile,
  ];
  return Math.round((filled.filter(Boolean).length / filled.length) * 100);
}

// ---------------------------------------------------------------------------
// Stage 5c — thresholds and outcome (§12.3)
// ---------------------------------------------------------------------------

export function qualify(ctx: QualificationContext): QualificationDecision {
  const r = reconcile(ctx);
  const gates = runGates(ctx, r);
  if (!gates.passed) {
    return { outcome: "FAILED", reasonCodes: gates.reasonCodes, reasonText: sentence(gates.reasonParts), score: null, reconciled: r };
  }

  const s = score(ctx, r);
  const { config } = ctx;
  if (s.total < config.thresholds.minReviewScore) {
    return {
      outcome: "FAILED",
      reasonCodes: ["BELOW_QUALITY_THRESHOLD"],
      reasonText: `Rejected: all gates passed but the quality score ${s.total} is below ${config.thresholds.minReviewScore}.`,
      score: s,
      reconciled: r,
    };
  }

  const auto = effectiveAutoPost(config);
  const status = s.total >= auto.minScore && r.extractionConfidence >= auto.minConfidence ? "active" : "pending_review";
  return { outcome: "PASSED", status, score: s, reconciled: r };
}

function sentence(parts: string[]): string {
  if (parts.length === 0) return "Rejected.";
  const joined = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join("; ")} and ${parts[parts.length - 1]}`;
  return `Rejected: ${joined}.`;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
