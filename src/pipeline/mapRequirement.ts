import type { BudgetBand, QualificationConfig } from "../config/qualificationConfig.js";
import type { RequirementCandidate } from "../extraction/schema.js";
import type {
  FieldProvenance,
  GroupConfig,
  InboundMessage,
  RequirementContact,
  RequirementRecord,
  Sighting,
} from "../types.js";
import { addDaysIst, istDate, istMonthEnd, maskMobile } from "../util/indian.js";
import { sha256 } from "../util/text.js";
import type { ReconciledCandidate, ScoreResult } from "./qualify.js";

export interface MapInput {
  msg: InboundMessage;
  group: GroupConfig;
  config: QualificationConfig;
  candidate: RequirementCandidate;
  splitIndex: number;
  reconciled: ReconciledCandidate;
  score: ScoreResult;
  status: "active" | "pending_review";
  unresolvedLocalities: string[];
  normalizedTextHash: string;
  promptVersion: string;
  processedAt: Date;
}

export function requirementIdFor(messageId: string, splitIndex: number): string {
  return `wa_${messageId.replace(/[^A-Za-z0-9_-]/g, "_")}_${splitIndex}`;
}

export function budgetBandFor(config: QualificationConfig, period: "monthly" | "total", min: number | null, max: number | null): string {
  const value = min !== null && max !== null ? (min + max) / 2 : (max ?? min ?? 0);
  const bands: BudgetBand[] = config.bands[period];
  const band = bands.find((b) => b.maxInclusive === null || value <= b.maxInclusive) ?? bands[bands.length - 1];
  return band?.label ?? "";
}

/** Composite business fingerprint for L3 dedupe (§13). */
export function fingerprintOf(parts: {
  serviceType: string;
  category: string;
  propertyType: string;
  bhk: number | null;
  budgetBand: string;
  primaryPlaceId: string;
  contactPhone: string;
}): string {
  return sha256(
    [parts.serviceType, parts.category, parts.propertyType, parts.bhk ?? "", parts.budgetBand, parts.primaryPlaceId, parts.contactPhone].join("|"),
  );
}

export function sightingOf(msg: InboundMessage): Sighting {
  return { groupId: msg.groupId, groupName: msg.groupName, messageId: msg.messageId, sentAt: msg.sentAt, senderPhone: msg.senderPhone };
}

/** Maps a qualified candidate to the Post Requirement form shape (§15) plus WhatsApp additions (§16.3). */
export function mapRequirement(input: MapInput): { requirement: RequirementRecord; contact: RequirementContact } {
  const { msg, group, config, candidate: c, reconciled: r, score } = input;
  const prov: Record<string, FieldProvenance> = {};
  const mark = (field: string, f: { value: unknown; sourceSpan: string | null; isInferred?: boolean } | null, defaulted = false) => {
    prov[field] = {
      provenance: defaulted || !f || f.value === null ? "defaulted" : f.isInferred ? "inferred" : "extracted",
      sourceSpan: f?.sourceSpan ?? null,
    };
  };

  const category = r.category!;
  const propertyType = r.propertyType!;
  const serviceType = c.serviceType.value!;
  mark("propertyCategory", { value: category, sourceSpan: c.propertyCategory.sourceSpan ?? c.propertyType.sourceSpan, isInferred: r.categoryInferred });
  mark("propertyType", c.propertyType);
  mark("serviceType", c.serviceType);
  mark("bhk", c.bhk);
  mark("areaSqft", c.areaSqft);

  const furnishStatus = c.furnishStatus.value ?? "unfurnished";
  mark("furnishStatus", c.furnishStatus, c.furnishStatus.value === null);

  const period = c.budgetPeriod.value ?? (serviceType === "buy" ? "total" : "monthly");
  const budgetBand = budgetBandFor(config, period, c.budgetMin.value, c.budgetMax.value);
  mark("budgetBand", { value: budgetBand, sourceSpan: c.budgetMin.sourceSpan ?? c.budgetMax.sourceSpan });

  const { date: requiredWithin, provenance: rwProv } = requiredWithinFor(msg.sentAt, c.requiredWithin, config);
  prov.requiredWithin = { provenance: rwProv, sourceSpan: c.requiredWithin.sourceSpan };

  const serviced = r.servicedLocalities;
  const max = config.gates.maxLocalities;
  const localities = serviced.slice(0, max).map(({ name, placeId, lat, lng, geoPrecision }) => ({ name, placeId, lat, lng, geoPrecision }));
  const extraLocalities = [
    ...serviced.slice(max).map((l) => l.name),
    ...r.outOfAreaLocalities.map((l) => l.name),
    ...input.unresolvedLocalities,
  ];
  prov.localities = { provenance: "extracted", sourceSpan: serviced.map((l) => l.rawText).join(", ") };
  const city = serviced[0]!.city!;
  prov.city = { provenance: "inferred", sourceSpan: null };

  const mobile = r.bodyMobile ?? r.senderMobile!;
  const name = c.contactName.value ?? msg.senderDisplayName ?? config.defaults.fallbackContactName;
  prov.contactName = { provenance: c.contactName.value ? "extracted" : "defaulted", sourceSpan: c.contactName.sourceSpan };
  prov.contactMobile = { provenance: r.bodyMobile ? "extracted" : "defaulted", sourceSpan: r.bodyMobile ? c.contactMobile.sourceSpan : null };
  prov.email = { provenance: "defaulted", sourceSpan: null };
  mark("tenantType", c.tenantType);

  const contact: RequirementContact = {
    contactType: config.defaults.contactType,
    name,
    mobile,
    email: `wa-${sha256(mobile).slice(0, 12)}@${config.defaults.placeholderEmailDomain}`,
    emailIsPlaceholder: true,
    posterMobile: r.senderMobile,
    marketingOptIn: false,
  };

  const requirementId = requirementIdFor(msg.messageId, input.splitIndex);
  const requirement: RequirementRecord = {
    requirementId,
    propertyCategory: category,
    propertyType,
    serviceType,
    bhk: c.bhk.value,
    bhkMax: c.bhk.bhkMax,
    areaSqft: c.areaSqft.value,
    unitSpec: c.unitSpec.value,
    furnishStatus,
    emailAlertFrequency: config.defaults.emailAlertFrequency,
    description: msg.text.slice(0, 2000),
    additionalServices: c.additionalServices,
    tenantType: c.tenantType.value,
    contactMasked: maskMobile(mobile),
    city,
    budgetBand,
    budgetMin: c.budgetMin.value,
    budgetMax: c.budgetMax.value,
    budgetPeriod: period,
    requiredWithin,
    source: "whatsapp_group",
    localities,
    extraLocalities,
    localityUnresolved: input.unresolvedLocalities.length > 0,
    unresolvedLocalities: input.unresolvedLocalities,
    purpose: c.purpose.value,
    notes: c.notes,
    termsAccepted: true,
    consentBasis: "third_party_public_group_post",
    sourceBlock: {
      channel: "whatsapp_group",
      groupId: group.groupId,
      groupName: msg.groupName,
      rawMessageId: msg.messageId,
      parentMessageId: msg.messageId,
      splitIndex: input.splitIndex,
      senderPhone: msg.senderPhone,
      processedAt: input.processedAt,
      configVersion: config.version,
      promptVersion: input.promptVersion,
    },
    extractionConfidence: r.extractionConfidence,
    qualityScore: score.total,
    scoreBreakdown: score.breakdown,
    fieldProvenance: prov,
    sightings: [sightingOf(msg)],
    sightingCount: 1,
    status: input.status,
    dataCompleteness: score.dataCompleteness,
    fingerprint: fingerprintOf({
      serviceType,
      category,
      propertyType,
      bhk: c.bhk.value,
      budgetBand,
      primaryPlaceId: localities[0]!.placeId,
      contactPhone: mobile,
    }),
    normalizedTextHash: input.normalizedTextHash,
    createdAt: input.processedAt,
    updatedAt: input.processedAt,
  };
  return { requirement, contact };
}

function requiredWithinFor(
  sentAt: Date,
  rw: RequirementCandidate["requiredWithin"],
  config: QualificationConfig,
): { date: string; provenance: FieldProvenance["provenance"] } {
  const d = config.defaults;
  switch (rw.kind) {
    case "immediate":
      return { date: addDaysIst(sentAt, d.immediateDays), provenance: "inferred" };
    case "this_month":
      return { date: istMonthEnd(sentAt), provenance: "inferred" };
    case "next_month":
      return { date: addDaysIst(sentAt, d.nextMonthDays), provenance: "inferred" };
    case "date":
      if (rw.date && /^\d{4}-\d{2}-\d{2}$/.test(rw.date) && rw.date >= istDate(sentAt)) return { date: rw.date, provenance: "extracted" };
      return { date: addDaysIst(sentAt, d.requiredWithinDays), provenance: "defaulted" };
    case "soon":
    case null:
      return { date: addDaysIst(sentAt, d.requiredWithinDays), provenance: rw.kind === "soon" ? "inferred" : "defaulted" };
  }
}
