/**
 * Core domain types for WA-Intake. PRD references are to
 * "WhatsApp Requirement Intake Engine — PRD v1.0" (12 Sep 2026).
 *
 * Architectural rule (PRD §7.3): nothing in stages 2–7 may depend on a
 * WhatsApp-library type. The ingestion adapter emits InboundMessage and
 * everything downstream consumes only that.
 */

export type City = "bengaluru" | "hosur" | "coimbatore";

/** Normalised message emitted by any ingestion adapter (§7.3, §8.2). */
export interface InboundMessage {
  messageId: string;
  groupId: string;
  groupName: string;
  senderPhone: string | null; // E.164 without '+', e.g. "919845012345"; null if the platform hides it
  senderDisplayName: string | null;
  sentAt: Date;
  receivedAt: Date;
  text: string;
  hasMedia: boolean;
  mediaType: "image" | "video" | "audio" | "sticker" | "document" | null;
  quotedMessageId: string | null;
  isForwarded: boolean;
  forwardScore: number;
  isSystemNotice: boolean;
  rawPayload?: unknown;
}

/** §8.1 group registry entry (Firestore: wa_groups). */
export interface GroupConfig {
  groupId: string;
  displayName: string;
  isActive: boolean;
  trustTier: "high" | "medium" | "low";
  defaultCity: City;
  expectedContent: "requirements" | "listings" | "mixed";
  addedOn: Date;
  addedBy: string;
}

export type Stage =
  | "prefilter"
  | "classification"
  | "extraction"
  | "geocode"
  | "qualification"
  | "dedupe";

/** Appendix C. */
export type ReasonCode =
  | "TOO_SHORT"
  | "MEDIA_ONLY"
  | "CHATTER"
  | "SYSTEM_NOTICE"
  | "BLOCKED_SENDER"
  | "NO_RE_SIGNAL"
  | "DUPLICATE_EXACT"
  | "NOT_A_REQUIREMENT"
  | "IS_PROPERTY_LISTING"
  | "SPAM_PROMO"
  | "EXTRACTION_FAILED"
  | "LOW_CONFIDENCE"
  | "LANGUAGE_UNSUPPORTED"
  | "CATEGORY_UNRESOLVED"
  | "TYPE_UNRESOLVED"
  | "SERVICE_TYPE_UNRESOLVED"
  | "LOCALITY_UNRESOLVED"
  | "OUT_OF_SERVICE_AREA"
  | "CONFIG_MISSING"
  | "BUDGET_MISSING"
  | "NO_CONTACT"
  | "INVALID_PHONE"
  | "STALE_MESSAGE"
  | "DUPLICATE"
  | "BELOW_QUALITY_THRESHOLD"
  /** [NEW] Message from a Property Care staff number, skipped by default (§8.3). */
  | "INTERNAL_SENDER";

export type PropertyCategory = "residential" | "commercial" | "industrial" | "agricultural";
export type ServiceType = "rent" | "lease" | "buy";
export type FurnishStatus = "unfurnished" | "semi_furnished" | "furnished";
export type TenantType = "single" | "family" | "bachelors";
export type GeoPrecision = "exact" | "approximate" | "city_centroid";
/** Used by the locality-specificity score (§12.2). */
export type LocalityGranularity = "micro" | "locality" | "city";

export interface ResolvedLocality {
  name: string;
  rawText: string;
  placeId: string;
  lat: number;
  lng: number;
  city: City | null; // null = resolved but outside the serviced cities
  cityName: string; // as reported by the geocoder, e.g. "Chennai"
  geoPrecision: GeoPrecision;
  granularity: LocalityGranularity;
}

export type Provenance = "extracted" | "inferred" | "defaulted";

export interface FieldProvenance {
  provenance: Provenance;
  sourceSpan: string | null;
}

export interface Sighting {
  groupId: string;
  groupName: string;
  messageId: string;
  sentAt: Date;
  senderPhone: string | null;
}

export type RequirementStatus = "active" | "pending_review" | "rejected_by_human" | "expired";

/** Contact block. Stored in a private sub-document so security rules can mask it (§19.2, §19.3). */
export interface RequirementContact {
  contactType: string;
  name: string;
  mobile: string; // +91XXXXXXXXXX
  email: string;
  emailIsPlaceholder: boolean;
  posterMobile: string | null;
  marketingOptIn: false;
}

/** The requirement document: Post Requirement form shape (§15) + WhatsApp additions (§16.3). */
export interface RequirementRecord {
  requirementId: string;
  // Step 1
  propertyCategory: PropertyCategory;
  propertyType: string;
  serviceType: ServiceType;
  // Step 2
  bhk: number | null;
  bhkMax: number | null;
  areaSqft: number | null;
  unitSpec: string | null;
  furnishStatus: FurnishStatus;
  emailAlertFrequency: "daily" | "alternate_day" | "weekend";
  description: string;
  additionalServices: string[];
  tenantType: TenantType | null;
  contactMasked: string;
  // Step 3
  city: City;
  budgetBand: string;
  budgetMin: number | null;
  budgetMax: number | null;
  budgetPeriod: "monthly" | "total";
  requiredWithin: string; // YYYY-MM-DD (IST)
  source: "whatsapp_group";
  localities: Array<Pick<ResolvedLocality, "name" | "placeId" | "lat" | "lng" | "geoPrecision">>;
  extraLocalities: string[];
  localityUnresolved: boolean;
  unresolvedLocalities: string[];
  purpose: string | null;
  notes: string;
  termsAccepted: true;
  consentBasis: "third_party_public_group_post";
  // WhatsApp additions
  sourceBlock: {
    channel: "whatsapp_group";
    groupId: string;
    groupName: string;
    rawMessageId: string;
    parentMessageId: string;
    splitIndex: number;
    senderPhone: string | null;
    processedAt: Date;
    configVersion: string;
    promptVersion: string;
  };
  extractionConfidence: number;
  qualityScore: number;
  scoreBreakdown: Record<string, number>;
  fieldProvenance: Record<string, FieldProvenance>;
  sightings: Sighting[];
  sightingCount: number;
  status: RequirementStatus;
  dataCompleteness: number;
  fingerprint: string;
  normalizedTextHash: string;
  createdAt: Date;
  updatedAt: Date;
}

/** §16.2 */
export interface RejectionRecord {
  rejectionId: string; // `${messageId}` or `${messageId}_${splitIndex}`
  messageId: string;
  splitIndex: number | null;
  groupId: string;
  groupName: string;
  senderPhone: string | null;
  senderName: string | null;
  rawText: string;
  receivedAt: Date;
  processedAt: Date;
  stage: Stage;
  status: "FAILED";
  reasonCodes: ReasonCode[];
  reasonText: string;
  qualityScore: number | null;
  scoreBreakdown: Record<string, number> | null;
  extractedPartial: Record<string, unknown> | null;
  configVersion: string;
  promptVersion: string | null;
  reviewedByHuman: boolean;
  overturnedToRequirementId: string | null;
}

/** Per-candidate result of running a message through stages 2–7. */
export type CandidateOutcome =
  | { kind: "PASSED"; status: "active" | "pending_review"; requirement: RequirementRecord }
  | { kind: "SIGHTING"; requirementId: string; layer: "L1" | "L2" | "L3"; sighting: Sighting }
  | { kind: "FAILED"; rejection: RejectionRecord };

export interface MessageDecision {
  messageId: string;
  configVersion: string;
  outcomes: CandidateOutcome[];
}

export interface SenderReputation {
  senderPhone: string;
  seen: number;
  passed: number;
  rejected: number;
  editedOrDeletedByOps: number;
}
