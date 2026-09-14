import { z } from "zod";

/**
 * Extraction contract (§10.2, Appendix B). Every field carries value, confidence
 * and the verbatim source span that justified it. The model never fills gaps —
 * defaulting is the rules engine's job.
 *
 * Structured outputs do not support numeric min/max, so confidence ranges are
 * enforced by clampConfidences() after parsing.
 */

export const ALL_PROPERTY_TYPES = [
  "apartment", "villa", "plot", "pg_coliving", "independent_house", "farm_house",
  "office_space", "shop", "showroom", "commercial_space", "commercial_building", "commercial_plot",
  "warehouse", "factory", "industrial_shed", "industrial_land",
  "agricultural_land", "managed_farmland",
] as const;

function field<T extends z.ZodType>(value: T) {
  return z.object({
    value: value.nullable(),
    confidence: z.number(),
    sourceSpan: z.string().nullable(),
    isInferred: z.boolean(),
  });
}

export const RequirementCandidateSchema = z.object({
  propertyCategory: field(z.enum(["residential", "commercial", "industrial", "agricultural"])),
  propertyType: field(z.enum(ALL_PROPERTY_TYPES)),
  serviceType: field(z.enum(["rent", "lease", "buy"])),
  bhk: z.object({
    value: z.number().nullable(),
    bhkMax: z.number().nullable(),
    confidence: z.number(),
    sourceSpan: z.string().nullable(),
    isInferred: z.boolean(),
  }),
  areaSqft: field(z.number()),
  unitSpec: field(z.string()),
  furnishStatus: field(z.enum(["unfurnished", "semi_furnished", "furnished"])),
  tenantType: field(z.enum(["single", "family", "bachelors"])),
  purpose: field(z.string()),
  budgetMin: field(z.number()),
  budgetMax: field(z.number()),
  budgetPeriod: field(z.enum(["monthly", "total"])),
  budgetKind: field(z.enum(["exact", "range", "upper_limit", "lower_limit", "vague"])),
  localities: z.array(z.object({ rawText: z.string(), confidence: z.number() })),
  cityMentioned: field(z.string()),
  requiredWithin: z.object({
    kind: z.enum(["immediate", "this_month", "next_month", "date", "soon"]).nullable(),
    date: z.string().nullable(),
    confidence: z.number(),
    sourceSpan: z.string().nullable(),
  }),
  contactName: field(z.string()),
  contactMobile: field(z.string()),
  additionalServices: z.array(z.string()),
  clarity: z.enum(["clear", "ambiguous"]),
  notes: z.string(),
});

export const ExtractionSchema = z.object({
  classification: z.enum(["REQUIREMENT", "LISTING", "BOTH", "SERVICE_OFFER", "CHATTER", "JOB_POST"]),
  classificationConfidence: z.number(),
  language: z.enum(["en", "kn", "hi", "ta", "mixed", "other"]),
  requirements: z.array(RequirementCandidateSchema),
  listingPortion: z.string().nullable(),
});

export type RequirementCandidate = z.infer<typeof RequirementCandidateSchema>;
export type ExtractionResult = z.infer<typeof ExtractionSchema>;

const clamp = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** Enforces 0..1 confidences and "null value ⇒ confidence 0" (Appendix B closing rule). */
export function sanitizeExtraction(result: ExtractionResult): ExtractionResult {
  const fixField = <F extends { value: unknown; confidence: number }>(f: F): F => ({
    ...f,
    confidence: f.value === null ? 0 : clamp(f.confidence),
  });
  return {
    ...result,
    classificationConfidence: clamp(result.classificationConfidence),
    requirements: result.requirements.map((r) => ({
      ...r,
      propertyCategory: fixField(r.propertyCategory),
      propertyType: fixField(r.propertyType),
      serviceType: fixField(r.serviceType),
      bhk: fixField(r.bhk),
      areaSqft: fixField(r.areaSqft),
      unitSpec: fixField(r.unitSpec),
      furnishStatus: fixField(r.furnishStatus),
      tenantType: fixField(r.tenantType),
      purpose: fixField(r.purpose),
      budgetMin: fixField(r.budgetMin),
      budgetMax: fixField(r.budgetMax),
      budgetPeriod: fixField(r.budgetPeriod),
      budgetKind: fixField(r.budgetKind),
      cityMentioned: fixField(r.cityMentioned),
      contactName: fixField(r.contactName),
      contactMobile: fixField(r.contactMobile),
      localities: r.localities.filter((l) => l.rawText.trim()).map((l) => ({ ...l, confidence: clamp(l.confidence) })),
      requiredWithin: { ...r.requiredWithin, confidence: r.requiredWithin.kind === null ? 0 : clamp(r.requiredWithin.confidence) },
    })),
  };
}

export interface ExtractionInput {
  messageId: string;
  text: string;
  groupName: string;
  groupDefaultCity: string;
  groupExpectedContent: string;
  sentAtIst: string; // YYYY-MM-DD
}

export class ExtractionError extends Error {
  constructor(
    readonly code: "EXTRACTION_FAILED" | "LANGUAGE_UNSUPPORTED",
    message: string,
  ) {
    super(message);
    this.name = "ExtractionError";
  }
}

export interface Extractor {
  readonly model: string;
  readonly promptVersion: string;
  extract(input: ExtractionInput): Promise<ExtractionResult>;
}
