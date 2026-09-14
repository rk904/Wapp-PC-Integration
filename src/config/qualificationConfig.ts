import type { City, PropertyCategory } from "../types.js";

/**
 * qualification_config document (§12). Every gate, weight and threshold lives
 * here so RK can change behaviour without a deploy. Versions are immutable;
 * the active version id is stamped on every decision.
 */
export interface QualificationConfig {
  version: string;
  createdAt: string;
  createdBy: string;
  notes: string;

  prefilter: {
    minTextLength: number;
    chatterPhrases: string[];
    systemNoticePatterns: string[];
    realEstateVocabulary: string[];
    exactDuplicateWindowDays: number;
    skipInternalSenders: boolean;
  };

  /** Allowed property types per category (§15.1, extended — see DECISIONS.md D3). */
  propertyTypes: Record<PropertyCategory, string[]>;
  /** Types that satisfy G6 with an area/unit spec instead of BHK. */
  configByType: Record<string, "bhk" | "area" | "bhk_or_none">;

  gates: {
    freshnessHours: number;
    minExtractionConfidence: number;
    maxLocalities: number;
  };

  weights: {
    budgetSpecificity: number;
    localitySpecificity: number;
    configurationClarity: number;
    contactQuality: number;
    timelineStated: number;
    furnishingStated: number;
    tenantTypeOrPurposeStated: number;
    messageClarity: number;
    reputation: number;
    mandatoryCompleteness: number;
  };

  thresholds: {
    autoPost: { minScore: number; minConfidence: number };
    rampUp: { enabled: boolean; minScore: number; minConfidence: number };
    minReviewScore: number;
  };

  reputation: {
    bonusMinMessages: number;
    bonusMinPassRate: number;
    trustTierPoints: Record<"high" | "medium" | "low", number>;
  };

  dedupe: {
    nearDuplicateSimilarity: number;
    nearDuplicateWindowDays: number;
    semanticWindowDays: number;
  };

  bands: {
    monthly: BudgetBand[];
    total: BudgetBand[];
  };

  defaults: {
    emailAlertFrequency: "daily" | "alternate_day" | "weekend";
    requiredWithinDays: number;
    immediateDays: number;
    nextMonthDays: number;
    contactType: string;
    placeholderEmailDomain: string;
    fallbackContactName: string;
  };

  serviceCities: City[];
  /** Senders whose numbers are Property Care staff (§8.3). */
  internalSenderPhones: string[];
}

export interface BudgetBand {
  label: string;
  /** Inclusive upper bound in rupees; null = open-ended top band. */
  maxInclusive: number | null;
}

const L = 100_000;
const CR = 10_000_000;

export const DEFAULT_CONFIG: QualificationConfig = {
  version: "criteria-v1",
  createdAt: "2026-09-14T00:00:00+05:30",
  createdBy: "wa-intake bootstrap",
  notes: "PRD v1.0 §12 starting set. Ramp-up thresholds ON for the first four weeks.",

  prefilter: {
    minTextLength: 15,
    chatterPhrases: [
      "good morning", "gm", "good night", "gn", "good evening", "good afternoon",
      "thanks", "thank you", "thankyou", "tq", "ty", "ok", "okay", "ok done", "done",
      "noted", "sure", "welcome", "congrats", "congratulations", "happy birthday",
      "hbd", "👍", "🙏", "👏", "hi", "hello", "hi all", "hello all", "namaste",
      "namaskara", "shubhodaya", "vanakkam", "dhanyavad", "dhanyavadagalu", "nandri",
      // Filler words that only ever accompany a greeting
      "all", "everyone", "friends", "dear", "sir", "madam", "ji", "team", "members", "have a nice day",
      "have a great day", "wish you", "a", "very", "happy", "sunday", "weekend",
    ],
    systemNoticePatterns: [
      "\\badded\\b", "\\bleft\\b$", "\\bremoved\\b", "changed the subject",
      "changed this group's", "changed the group description", "joined using this group's invite link",
      "created group", "security code changed", "messages and calls are end-to-end encrypted",
      "this message was deleted",
    ],
    realEstateVocabulary: [
      "bhk", "1rk", "rent", "rental", "lease", "sale", "sell", "buy", "purchase", "flat",
      "apartment", "apt", "villa", "plot", "site", "land", "office", "shop", "showroom",
      "warehouse", "godown", "factory", "shed", "pg", "co-living", "coliving", "hostel",
      "budget", "sqft", "sft", "sq ft", "square feet", "acre", "gunta", "requirement",
      "required", "looking for", "need", "needed", "wanted", "want", "urgent", "tenant",
      "owner", "independent house", "duplex", "bedroom", "furnished", "khata", "lakh",
      "lac", "crore", "cr", "deposit", "advance", "property", "house", "home",
      // Common transliterations (Kannada / Hindi / Tamil)
      "mane", "baadige", "badige", "bhogya", "manege", "beku", "bekagide", "chahiye",
      "kiraya", "kiraye", "makaan", "ghar", "zameen", "veedu", "vaadagai", "vadagai",
      "venum", "vendum", "nilam", "manai",
    ],
    exactDuplicateWindowDays: 7,
    skipInternalSenders: true,
  },

  propertyTypes: {
    residential: ["apartment", "villa", "plot", "pg_coliving", "independent_house", "farm_house"],
    commercial: ["office_space", "shop", "showroom", "commercial_space", "commercial_building", "commercial_plot"],
    industrial: ["warehouse", "factory", "industrial_shed", "industrial_land"],
    agricultural: ["agricultural_land", "farm_house", "managed_farmland"],
  },
  configByType: {
    apartment: "bhk",
    villa: "bhk",
    independent_house: "bhk",
    farm_house: "bhk_or_none",
    pg_coliving: "bhk_or_none",
    plot: "area",
    office_space: "area",
    shop: "area",
    showroom: "area",
    commercial_space: "area",
    commercial_building: "area",
    commercial_plot: "area",
    warehouse: "area",
    factory: "area",
    industrial_shed: "area",
    industrial_land: "area",
    agricultural_land: "area",
    managed_farmland: "area",
  },

  gates: {
    freshnessHours: 72,
    minExtractionConfidence: 0.6,
    maxLocalities: 4,
  },

  weights: {
    budgetSpecificity: 15,
    localitySpecificity: 15,
    configurationClarity: 10,
    contactQuality: 10,
    timelineStated: 10,
    furnishingStated: 5,
    tenantTypeOrPurposeStated: 5,
    messageClarity: 10,
    reputation: 10,
    mandatoryCompleteness: 10,
  },

  thresholds: {
    autoPost: { minScore: 70, minConfidence: 0.85 },
    rampUp: { enabled: true, minScore: 85, minConfidence: 0.92 },
    minReviewScore: 50,
  },

  reputation: {
    bonusMinMessages: 20,
    bonusMinPassRate: 0.4,
    trustTierPoints: { high: 7, medium: 5, low: 2 },
  },

  dedupe: {
    nearDuplicateSimilarity: 0.85,
    nearDuplicateWindowDays: 7,
    semanticWindowDays: 30,
  },

  bands: {
    monthly: [
      { label: "<=15K", maxInclusive: 15_000 },
      { label: "15K-30K", maxInclusive: 30_000 },
      { label: "30K-45K", maxInclusive: 45_000 },
      { label: "45K-60K", maxInclusive: 60_000 },
      { label: "60K-1L", maxInclusive: 1 * L },
      { label: "1L+", maxInclusive: null },
    ],
    // Change C5 — buy/sale bands, pending RK confirmation (open question Q2).
    total: [
      { label: "<=50L", maxInclusive: 50 * L },
      { label: "50L-75L", maxInclusive: 75 * L },
      { label: "75L-1Cr", maxInclusive: 1 * CR },
      { label: "1Cr-1.5Cr", maxInclusive: 1.5 * CR },
      { label: "1.5Cr-2Cr", maxInclusive: 2 * CR },
      { label: "2Cr+", maxInclusive: null },
    ],
  },

  defaults: {
    emailAlertFrequency: "weekend",
    requiredWithinDays: 30,
    immediateDays: 7,
    nextMonthDays: 45,
    contactType: "realtor_whatsapp",
    placeholderEmailDomain: "leads.propertycare.co.in",
    fallbackContactName: "WhatsApp Contact",
  },

  serviceCities: ["bengaluru", "hosur", "coimbatore"],
  internalSenderPhones: [],
};

/** Thresholds actually in force for auto-posting, honouring the ramp-up rule (§12.3). */
export function effectiveAutoPost(config: QualificationConfig): { minScore: number; minConfidence: number } {
  return config.thresholds.rampUp.enabled
    ? { minScore: config.thresholds.rampUp.minScore, minConfidence: config.thresholds.rampUp.minConfidence }
    : config.thresholds.autoPost;
}
