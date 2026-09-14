import { candidate, extraction, f } from "../helpers.js";

/** PRD Appendix A messages with the extraction Claude is expected to return for each. */
export const A1 = {
  text: "Urgent requirement 3 BHK semi furnished flat in Electronic City Phase 1, family, budget 45-50k, need by month end. Contact 98450 12345",
  extraction: extraction([
    candidate({
      propertyCategory: f("residential", "flat", 0.95, true),
      propertyType: f("apartment", "flat", 0.97),
      serviceType: f("rent", "budget 45-50k", 0.9, true),
      bhk: { value: 3, bhkMax: null, confidence: 0.98, sourceSpan: "3 BHK", isInferred: false },
      furnishStatus: f("semi_furnished", "semi furnished"),
      tenantType: f("family", "family"),
      budgetMin: f(45000, "45-50k"),
      budgetMax: f(50000, "45-50k"),
      budgetPeriod: f("monthly", "45-50k", 0.9, true),
      budgetKind: f("range", "budget 45-50k"),
      localities: [{ rawText: "Electronic City Phase 1", confidence: 0.97 }],
      requiredWithin: { kind: "this_month", date: null, confidence: 0.95, sourceSpan: "need by month end" },
      contactMobile: f("98450 12345", "Contact 98450 12345", 0.99),
    }),
  ]),
};

export const A2 = {
  text: "Need 2bhk rent koramangala 35k",
  extraction: extraction([
    candidate({
      propertyCategory: f("residential", "2bhk", 0.93, true),
      propertyType: f("apartment", "2bhk", 0.9, true),
      serviceType: f("rent", "rent", 0.98),
      bhk: { value: 2, bhkMax: null, confidence: 0.98, sourceSpan: "2bhk", isInferred: false },
      budgetMin: f(35000, "35k"),
      budgetMax: f(35000, "35k"),
      budgetPeriod: f("monthly", "35k", 0.9, true),
      budgetKind: f("exact", "35k"),
      localities: [{ rawText: "koramangala", confidence: 0.96 }],
    }),
  ]),
};

export const A3 = {
  text: "Looking for good 3bhk in HSR layout for a client, budget friendly, pls share options",
  extraction: extraction([
    candidate({
      propertyCategory: f("residential", "3bhk", 0.93, true),
      propertyType: f("apartment", "3bhk", 0.88, true),
      bhk: { value: 3, bhkMax: null, confidence: 0.97, sourceSpan: "3bhk", isInferred: false },
      budgetKind: f("vague", "budget friendly", 0.95),
      localities: [{ rawText: "HSR layout", confidence: 0.97 }],
    }),
  ]),
};

export const A4 = {
  text: "AVAILABLE 2BHK for rent in Bellandur, 32k, semi furnished, immediate possession, brokers welcome. 9900011122",
  extraction: extraction([], { classification: "LISTING", classificationConfidence: 0.98 }),
};

export const A5 = {
  text: "Client needs 3BHK villa in Anna Nagar Chennai, 1.5 Cr budget, 9840011223",
  extraction: extraction([
    candidate({
      propertyCategory: f("residential", "villa", 0.95, true),
      propertyType: f("villa", "villa"),
      serviceType: f("buy", "1.5 Cr budget", 0.88, true),
      bhk: { value: 3, bhkMax: null, confidence: 0.98, sourceSpan: "3BHK", isInferred: false },
      budgetMin: f(15000000, "1.5 Cr"),
      budgetMax: f(15000000, "1.5 Cr"),
      budgetPeriod: f("total", "1.5 Cr", 0.9, true),
      budgetKind: f("exact", "1.5 Cr budget"),
      localities: [{ rawText: "Anna Nagar", confidence: 0.96 }],
      cityMentioned: f("Chennai", "Chennai"),
      contactMobile: f("9840011223", "9840011223", 0.99),
    }),
  ]),
};

export const A6 = {
  text: "Requirements: 1) 2BHK rent Sarjapur 30k 2) office space 2000 sqft Koramangala lease 3) plot 30x40 Kanakapura Road purchase. 9611122233",
  extraction: extraction([
    candidate({
      propertyCategory: f("residential", "2BHK", 0.93, true),
      propertyType: f("apartment", "2BHK", 0.9, true),
      serviceType: f("rent", "rent"),
      bhk: { value: 2, bhkMax: null, confidence: 0.98, sourceSpan: "2BHK", isInferred: false },
      budgetMin: f(30000, "30k"),
      budgetMax: f(30000, "30k"),
      budgetPeriod: f("monthly", "30k", 0.9, true),
      budgetKind: f("exact", "30k"),
      localities: [{ rawText: "Sarjapur", confidence: 0.95 }],
      contactMobile: f("9611122233", "9611122233", 0.97),
    }),
    candidate({
      propertyCategory: f("commercial", "office space", 0.95, true),
      propertyType: f("office_space", "office space"),
      serviceType: f("lease", "lease"),
      areaSqft: f(2000, "2000 sqft"),
      localities: [{ rawText: "Koramangala", confidence: 0.96 }],
      contactMobile: f("9611122233", "9611122233", 0.97),
    }),
    candidate({
      propertyCategory: f("residential", "plot", 0.8, true),
      propertyType: f("plot", "plot"),
      serviceType: f("buy", "purchase"),
      unitSpec: f("30x40", "30x40"),
      localities: [{ rawText: "Kanakapura Road", confidence: 0.95 }],
      contactMobile: f("9611122233", "9611122233", 0.97),
    }),
  ]),
};

/** A.1 reworded by a different consultant — should hit the L3 fingerprint, not create a second record. */
export const A1_REWORDED = {
  text: "Reqd for family: 3bhk semi-furnished apartment, E-City Phase 1, rent 45 to 50 thousand, by 30th Sept. Call 9845012345",
  extraction: extraction([
    candidate({
      propertyCategory: f("residential", "apartment", 0.95, true),
      propertyType: f("apartment", "apartment"),
      serviceType: f("rent", "rent"),
      bhk: { value: 3, bhkMax: null, confidence: 0.98, sourceSpan: "3bhk", isInferred: false },
      furnishStatus: f("semi_furnished", "semi-furnished"),
      tenantType: f("family", "family"),
      budgetMin: f(45000, "45 to 50 thousand"),
      budgetMax: f(50000, "45 to 50 thousand"),
      budgetPeriod: f("monthly", "rent 45 to 50 thousand"),
      budgetKind: f("range", "45 to 50 thousand"),
      localities: [{ rawText: "Electronic City Phase 1", confidence: 0.95 }],
      requiredWithin: { kind: "date", date: "2026-09-30", confidence: 0.95, sourceSpan: "by 30th Sept" },
      contactMobile: f("9845012345", "Call 9845012345", 0.99),
    }),
  ]),
};
