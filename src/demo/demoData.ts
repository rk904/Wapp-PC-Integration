import { sanitizeExtraction, type ExtractionResult, type RequirementCandidate } from "../extraction/schema.js";
import type { GroupConfig, InboundMessage } from "../types.js";

/**
 * DEMO DATA — synthetic. Every group name, person, phone number and message
 * below is invented to exercise the pipeline and the console before real
 * WhatsApp exports are attached. Each requirement message carries the
 * extraction a correct model run would return, so the REAL rules engine,
 * dedupe and persistence decide every outcome shown.
 */

export const DEMO_DAY = "2026-09-14"; // IST

export const DEMO_GROUPS: GroupConfig[] = [
  group("demo_grp_a", "Bangalore Realtors Network A", "high", "mixed"),
  group("demo_grp_b", "South Bengaluru Property Hub", "high", "requirements"),
  group("demo_grp_c", "Whitefield Brokers Circle", "medium", "mixed"),
  group("demo_grp_d", "HSR–Sarjapur Rentals", "medium", "requirements"),
  group("demo_grp_e", "Bangalore Property Deals 24x7", "low", "listings"),
];

function group(groupId: string, displayName: string, trustTier: GroupConfig["trustTier"], expectedContent: GroupConfig["expectedContent"]): GroupConfig {
  return { groupId, displayName, isActive: true, trustTier, defaultCity: "bengaluru", expectedContent, addedOn: new Date("2026-09-01T09:00:00+05:30"), addedBy: "demo" };
}

// ---------------------------------------------------------------------------
// Tiny extraction DSL
// ---------------------------------------------------------------------------

type Field<T> = { value: T | null; confidence: number; sourceSpan: string | null; isInferred: boolean };
const none = <T>(): Field<T> => ({ value: null, confidence: 0, sourceSpan: null, isInferred: false });
const x = <T>(value: T, span: string, confidence = 0.96): Field<T> => ({ value, confidence, sourceSpan: span, isInferred: false });
const inf = <T>(value: T, span: string, confidence = 0.9): Field<T> => ({ value, confidence, sourceSpan: span, isInferred: true });

interface Spec {
  category?: Field<RequirementCandidate["propertyCategory"]["value"]>;
  type?: Field<RequirementCandidate["propertyType"]["value"]>;
  service?: Field<RequirementCandidate["serviceType"]["value"]>;
  bhk?: [number, string, number?];
  area?: [number, string];
  unit?: [string, string];
  furnish?: [NonNullable<RequirementCandidate["furnishStatus"]["value"]>, string];
  tenant?: [NonNullable<RequirementCandidate["tenantType"]["value"]>, string];
  purpose?: [string, string];
  budget?: { min: number | null; max: number | null; span: string; kind: NonNullable<RequirementCandidate["budgetKind"]["value"]>; period: "monthly" | "total" };
  vague?: string;
  localities: string[];
  city?: string;
  when?: { kind: NonNullable<RequirementCandidate["requiredWithin"]["kind"]>; span: string; date?: string };
  name?: string;
  mobile?: string;
  clarity?: "clear" | "ambiguous";
  conf?: number;
  notes?: string;
}

function cand(s: Spec): RequirementCandidate {
  const c = s.conf ?? 0.96;
  return {
    propertyCategory: s.category ?? none(),
    propertyType: s.type ?? none(),
    serviceType: s.service ?? none(),
    bhk: s.bhk ? { value: s.bhk[0], bhkMax: s.bhk[2] ?? null, confidence: c, sourceSpan: s.bhk[1], isInferred: false } : { value: null, bhkMax: null, confidence: 0, sourceSpan: null, isInferred: false },
    areaSqft: s.area ? x(s.area[0], s.area[1], c) : none(),
    unitSpec: s.unit ? x(s.unit[0], s.unit[1], c) : none(),
    furnishStatus: s.furnish ? x(s.furnish[0], s.furnish[1], c) : none(),
    tenantType: s.tenant ? x(s.tenant[0], s.tenant[1], c) : none(),
    purpose: s.purpose ? x(s.purpose[0], s.purpose[1], c) : none(),
    budgetMin: s.budget?.min != null ? x(s.budget.min, s.budget.span, c) : none(),
    budgetMax: s.budget?.max != null ? x(s.budget.max, s.budget.span, c) : none(),
    budgetPeriod: s.budget ? inf(s.budget.period, s.budget.span, c) : none(),
    budgetKind: s.budget ? x(s.budget.kind, s.budget.span, c) : s.vague ? x("vague" as const, s.vague, c) : none(),
    localities: s.localities.map((rawText) => ({ rawText, confidence: c })),
    cityMentioned: s.city ? x(s.city, s.city, c) : none(),
    requiredWithin: s.when ? { kind: s.when.kind, date: s.when.date ?? null, confidence: c, sourceSpan: s.when.span } : { kind: null, date: null, confidence: 0, sourceSpan: null },
    contactName: s.name ? x(s.name, s.name, c) : none(),
    contactMobile: s.mobile ? x(s.mobile, s.mobile, 0.99) : none(),
    additionalServices: [],
    clarity: s.clarity ?? "clear",
    notes: s.notes ?? "",
  };
}

const ext = (requirements: RequirementCandidate[], over: Partial<ExtractionResult> = {}): ExtractionResult =>
  sanitizeExtraction({ classification: "REQUIREMENT", classificationConfidence: 0.96, language: "en", requirements, listingPortion: null, ...over });

const RES = inf("residential" as const, "BHK", 0.94);
const APT = (span: string) => x("apartment" as const, span);
const APT_I = (span: string) => inf("apartment" as const, span, 0.9);
const RENT = (span: string) => x("rent" as const, span);
const BUY = (span: string) => x("buy" as const, span);
const monthly = (min: number, max: number, span: string, kind: "exact" | "range" | "upper_limit" = min === max ? "exact" : "range") => ({ min: kind === "upper_limit" ? null : min, max, span, kind, period: "monthly" as const });
const total = (min: number | null, max: number | null, span: string, kind: "exact" | "range" | "upper_limit" | "lower_limit") => ({ min, max, span, kind, period: "total" as const });

// ---------------------------------------------------------------------------
// The day's messages (IST times). `ext` present ⇒ the message reaches the model.
// ---------------------------------------------------------------------------

export interface DemoMessage {
  at: string; // HH:MM IST
  group: string; // groupId
  from: string; // display name
  phone: string | null; // 91XXXXXXXXXX
  text: string;
  media?: InboundMessage["mediaType"];
  system?: boolean;
  receivedLagHours?: number;
  ext?: ExtractionResult;
}

const A1 = "Urgent requirement 3 BHK semi furnished flat in Electronic City Phase 1, family, budget 45-50k, need by month end. Contact 98450 12345";

export const DEMO_MESSAGES: DemoMessage[] = [
  { at: "07:02", group: "demo_grp_a", from: "Manjunath S", phone: "919845100001", text: "Good morning all 🙏🙏" },
  { at: "07:15", group: "demo_grp_e", from: "Deals Admin", phone: "919900200002", text: "", media: "image" },
  { at: "07:31", group: "demo_grp_b", from: "Kavya Homes", phone: "919980300003", text: "Need 2bhk rent koramangala 35k", ext: ext([cand({ category: RES, type: APT_I("2bhk"), service: RENT("rent"), bhk: [2, "2bhk"], budget: monthly(35000, 35000, "35k"), localities: ["koramangala"] })]) },
  { at: "07:48", group: "demo_grp_c", from: "Prakash R", phone: "919886400004", text: "AVAILABLE 3BHK for rent in Brookefield, 48k, semi furnished, gated community, immediate. Brokers welcome 9886400004", ext: ext([], { classification: "LISTING", classificationConfidence: 0.98 }) },
  { at: "08:05", group: "demo_grp_b", from: "Ravi Realtor", phone: "919900112233", text: A1, ext: ext([cand({ category: inf("residential", "flat", 0.95), type: APT("flat"), service: inf("rent", "budget 45-50k", 0.9), bhk: [3, "3 BHK"], furnish: ["semi_furnished", "semi furnished"], tenant: ["family", "family"], budget: monthly(45000, 50000, "45-50k"), localities: ["Electronic City Phase 1"], when: { kind: "this_month", span: "need by month end" }, mobile: "98450 12345" })]) },
  { at: "08:09", group: "demo_grp_a", from: "Ravi Realtor", phone: "919900112233", text: A1 },
  { at: "08:12", group: "demo_grp_d", from: "Ravi Realtor", phone: "919900112233", text: A1 },
  { at: "08:14", group: "demo_grp_c", from: "Ravi Realtor", phone: "919900112233", text: A1 },
  { at: "08:30", group: "demo_grp_e", from: "Loan Expert Arun", phone: "919845500005", text: "Home loans at 8.1% from top banks, quick sanction, doorstep service. Call 9845500005", ext: ext([], { classification: "SERVICE_OFFER", classificationConfidence: 0.97 }) },
  { at: "08:44", group: "demo_grp_d", from: "Sneha Properties", phone: "919731600006", text: "Looking for good 3bhk in HSR layout for a client, budget friendly, pls share options", ext: ext([cand({ category: RES, type: APT_I("3bhk"), bhk: [3, "3bhk"], vague: "budget friendly", localities: ["HSR layout"] })]) },
  { at: "09:02", group: "demo_grp_a", from: "Suresh Kumar", phone: null, text: "Suresh Kumar added Deepa (+91 98450 77777)", system: true },
  { at: "09:10", group: "demo_grp_b", from: "Anil Estates", phone: "919845700007", text: "Warehouse required 15000 sft Hosur road near Attibele, lease, rent upto 3.5L pm, 30ft height, from Nov 1st. Call 9845700007", ext: ext([cand({ category: inf("industrial", "Warehouse", 0.95), type: x("warehouse", "Warehouse"), service: x("lease", "lease"), area: [15000, "15000 sft"], unit: ["30ft height", "30ft height"], budget: monthly(350000, 350000, "upto 3.5L", "upper_limit"), localities: ["Hosur road", "Attibele"], when: { kind: "date", span: "from Nov 1st", date: "2026-11-01" }, mobile: "9845700007" })]) },
  { at: "09:25", group: "demo_grp_c", from: "Farah Realty", phone: "919900800008", text: "Want to buy 2 or 3 bhk ready flat in Whitefield / Brookefield / ITPL, 1-1.4 Cr, investor, loan approved. 9900800008", ext: ext([cand({ category: RES, type: APT("flat"), service: BUY("buy"), bhk: [2, "2 or 3 bhk", 3], purpose: ["investment", "investor"], budget: total(10_000_000, 14_000_000, "1-1.4 Cr", "range"), localities: ["Whitefield", "Brookefield", "ITPL"], mobile: "9900800008" })]) },
  { at: "09:40", group: "demo_grp_e", from: "Deals Admin", phone: "919900200002", text: "🔥🔥 Plots in Devanahalli from 25L only!! BMRDA approved, bank loan available, site visit free 🔥🔥", ext: ext([], { classification: "LISTING", classificationConfidence: 0.95 }) },
  { at: "09:55", group: "demo_grp_a", from: "Latha M", phone: "919731900009", text: "2bhk mane beku baadige ge Jayanagar 4th block alli, 25 saavira varege, family, next month inda. Ph 9731900009", ext: ext([cand({ category: RES, type: APT_I("2bhk"), service: RENT("baadige"), bhk: [2, "2bhk"], tenant: ["family", "family"], budget: monthly(25000, 25000, "25 saavira varege", "upper_limit"), localities: ["Jayanagar 4th block"], when: { kind: "next_month", span: "next month inda" }, mobile: "9731900009" })], { language: "mixed" }) },
  { at: "10:12", group: "demo_grp_b", from: "Harish BK", phone: "919980010010", text: "Client needs 3BHK villa in Anna Nagar Chennai, 1.5 Cr budget, 9980010010", ext: ext([cand({ category: RES, type: x("villa", "villa"), service: inf("buy", "1.5 Cr budget", 0.88), bhk: [3, "3BHK"], budget: total(15_000_000, 15_000_000, "1.5 Cr", "exact"), localities: ["Anna Nagar"], city: "Chennai", mobile: "9980010010" })]) },
  { at: "10:20", group: "demo_grp_d", from: "Meera N", phone: "919845011011", text: "thank you sir", },
  { at: "10:34", group: "demo_grp_d", from: "Rohit Rentals", phone: "919886012012", text: "Requirement: 1BHK fully furnished near Bellandur for working professional, 22-25k, immediate. 9886012012", ext: ext([cand({ category: RES, type: APT_I("1BHK"), service: inf("rent", "22-25k", 0.9), bhk: [1, "1BHK"], furnish: ["furnished", "fully furnished"], tenant: ["single", "working professional"], budget: monthly(22000, 25000, "22-25k"), localities: ["Bellandur"], when: { kind: "immediate", span: "immediate" }, mobile: "9886012012" })]) },
  { at: "10:51", group: "demo_grp_c", from: "Vinay Homes", phone: "919900013013", text: "Requirements: 1) 2BHK rent Marathahalli 30k 2) office space 2000 sqft Indiranagar lease 1.8L pm 3) plot 30x40 Kanakapura Road purchase. 9900013013", ext: ext([
    cand({ category: RES, type: APT_I("2BHK"), service: RENT("rent"), bhk: [2, "2BHK"], budget: monthly(30000, 30000, "30k"), localities: ["Marathahalli"], mobile: "9900013013" }),
    cand({ category: inf("commercial", "office space", 0.95), type: x("office_space", "office space"), service: x("lease", "lease"), area: [2000, "2000 sqft"], budget: monthly(180000, 180000, "1.8L pm"), localities: ["Indiranagar"], mobile: "9900013013" }),
    cand({ category: inf("residential", "plot", 0.8), type: x("plot", "plot"), service: BUY("purchase"), unit: ["30x40", "30x40"], localities: ["Kanakapura Road"], mobile: "9900013013" }),
  ]) },
  { at: "11:05", group: "demo_grp_a", from: "Deepa", phone: "919845077777", text: "", media: "audio" },
  { at: "11:18", group: "demo_grp_b", from: "Naveen P", phone: "919731014014", text: "Need 3bhk independent house for rent in JP Nagar, 55-65k, family with pets, by 15th Oct. 9731014014", ext: ext([cand({ category: inf("residential", "independent house", 0.95), type: x("independent_house", "independent house"), service: RENT("rent"), bhk: [3, "3bhk"], tenant: ["family", "family with pets"], budget: monthly(55000, 65000, "55-65k"), localities: ["JP Nagar"], when: { kind: "date", span: "by 15th Oct", date: "2026-10-15" }, mobile: "9731014014", notes: "Has pets" })]) },
  { at: "11:40", group: "demo_grp_e", from: "Packers King", phone: "919886015015", text: "Best packers and movers in Bangalore, 20% off this week only. WhatsApp 9886015015", ext: ext([], { classification: "SERVICE_OFFER", classificationConfidence: 0.98 }) },
  { at: "12:02", group: "demo_grp_d", from: "Sneha Properties", phone: "919731600006", text: "Reqd 2BHK semi furnished Sarjapur Road, bachelors ok, 28k max, this month. 9731600006", ext: ext([cand({ category: RES, type: APT_I("2BHK"), service: inf("rent", "28k max", 0.88), bhk: [2, "2BHK"], furnish: ["semi_furnished", "semi furnished"], tenant: ["bachelors", "bachelors ok"], budget: monthly(28000, 28000, "28k max", "upper_limit"), localities: ["Sarjapur Road"], when: { kind: "this_month", span: "this month" }, mobile: "9731600006" })]) },
  { at: "12:20", group: "demo_grp_a", from: "Manjunath S", phone: "919845100001", text: "Congratulations Suresh sir on closing the Whitefield villa deal 🎉🎉", ext: ext([], { classification: "CHATTER", classificationConfidence: 0.97 }) },
  { at: "12:45", group: "demo_grp_c", from: "Prakash R", phone: "919886400004", text: "anyone has something good in south bangalore? decent budget", ext: ext([cand({ vague: "decent budget", localities: ["south bangalore"], clarity: "ambiguous", conf: 0.5 })]) },
  { at: "13:10", group: "demo_grp_b", from: "Kavya Homes", phone: "919980300003", text: "Looking to buy 3BHK in Hebbal or Yelahanka for NRI client, 1.2-1.5 Cr, ready to move, within 2 months. Contact Kavya 9980300003", ext: ext([cand({ category: RES, type: APT_I("3BHK"), service: BUY("buy"), bhk: [3, "3BHK"], purpose: ["NRI client", "NRI client"], budget: total(12_000_000, 15_000_000, "1.2-1.5 Cr", "range"), localities: ["Hebbal", "Yelahanka"], when: { kind: "soon", span: "within 2 months" }, name: "Kavya", mobile: "9980300003" })]) },
  { at: "13:32", group: "demo_grp_e", from: "Deals Admin", phone: "919900200002", text: "", media: "video" },
  { at: "13:50", group: "demo_grp_d", from: "Rohit Rentals", phone: "919886012012", text: "Need 2 BHK semi-furnished flat for rent near Kudlu Gate / Singasandra, family, 30-34k, 1st Oct. 9886012012", ext: ext([cand({ category: RES, type: APT("flat"), service: RENT("rent"), bhk: [2, "2 BHK"], furnish: ["semi_furnished", "semi-furnished"], tenant: ["family", "family"], budget: monthly(30000, 34000, "30-34k"), localities: ["Kudlu Gate", "Singasandra"], when: { kind: "date", span: "1st Oct", date: "2026-10-01" }, mobile: "9886012012" })]) },
  { at: "14:15", group: "demo_grp_a", from: "Harish BK", phone: "919980010010", text: "Client from Kochi needs 2bhk in Kakkanad, 25k rent", ext: ext([cand({ category: RES, type: APT_I("2bhk"), service: RENT("rent"), bhk: [2, "2bhk"], budget: monthly(25000, 25000, "25k"), localities: ["Kakkanad"], city: "Kochi" })]) },
  { at: "14:40", group: "demo_grp_c", from: "Farah Realty", phone: "919900800008", text: "Need PG for girls near Whitefield ITPL, sharing ok, 12k, immediate. 9900800008", ext: ext([cand({ category: RES, type: x("pg_coliving", "PG"), service: inf("rent", "12k", 0.88), tenant: ["bachelors", "girls"], budget: monthly(12000, 12000, "12k"), localities: ["Whitefield"], when: { kind: "immediate", span: "immediate" }, mobile: "9900800008" })]) },
  { at: "15:05", group: "demo_grp_b", from: "Anil Estates", phone: "919845700007", text: "Shop space needed Koramangala 5th block main road, 400-600 sqft, rent up to 90k, for pharmacy. 9845700007", ext: ext([cand({ category: inf("commercial", "Shop", 0.95), type: x("shop", "Shop space"), service: RENT("rent"), area: [600, "400-600 sqft"], purpose: ["own business", "for pharmacy"], budget: monthly(90000, 90000, "up to 90k", "upper_limit"), localities: ["Koramangala"], mobile: "9845700007" })]) },
  { at: "15:30", group: "demo_grp_d", from: "Meera N", phone: "919845011011", text: "Need 2bhk koramangala rent 35k urgent", ext: ext([cand({ category: RES, type: APT_I("2bhk"), service: RENT("rent"), bhk: [2, "2bhk"], budget: monthly(35000, 35000, "35k"), localities: ["koramangala"], when: { kind: "immediate", span: "urgent" } })]) },
  { at: "16:02", group: "demo_grp_a", from: "Latha M", phone: "919731900009", text: "Requirement 3bhk Indiranagar rent 80k-1L fully furnished expat family, by 20th Oct, 9731900009", ext: ext([cand({ category: RES, type: APT_I("3bhk"), service: RENT("rent"), bhk: [3, "3bhk"], furnish: ["furnished", "fully furnished"], tenant: ["family", "expat family"], budget: monthly(80000, 100000, "80k-1L"), localities: ["Indiranagar"], when: { kind: "date", span: "by 20th Oct", date: "2026-10-20" }, mobile: "9731900009" })]) },
  { at: "16:25", group: "demo_grp_e", from: "Deals Admin", phone: "919900200002", text: "Good evening friends 🙏" },
  { at: "16:48", group: "demo_grp_c", from: "Vinay Homes", phone: "919900013013", text: "Need 4bhk villa Whitefield rent 1.5L", ext: ext([cand({ category: RES, type: x("villa", "villa"), service: RENT("rent"), bhk: [4, "4bhk"], budget: monthly(150000, 150000, "1.5L"), localities: ["Whitefield"] })]) },
  { at: "17:15", group: "demo_grp_b", from: "Naveen P", phone: "919731014014", text: "2bhk required HSR sector 2 for rent 40k semi furnished family 9731014014 old post pls ignore if closed", receivedLagHours: 80, ext: ext([cand({ category: RES, type: APT_I("2bhk"), service: RENT("rent"), bhk: [2, "2bhk"], furnish: ["semi_furnished", "semi furnished"], tenant: ["family", "family"], budget: monthly(40000, 40000, "40k"), localities: ["HSR Layout"], mobile: "9731014014" })]) },
  { at: "17:40", group: "demo_grp_d", from: "Sneha Properties", phone: "919731600006", text: "Hosur town 2bhk rent 15-18k family near SIPCOT, immediate, 9731600006", ext: ext([cand({ category: RES, type: APT_I("2bhk"), service: RENT("rent"), bhk: [2, "2bhk"], tenant: ["family", "family"], budget: monthly(15000, 18000, "15-18k"), localities: ["Hosur"], city: "Hosur", when: { kind: "immediate", span: "immediate" }, mobile: "9731600006" })]) },
  { at: "18:05", group: "demo_grp_a", from: "Suresh Kumar", phone: "919845020020", text: "ok done" },
  { at: "18:30", group: "demo_grp_c", from: "Prakash R", phone: "919886400004", text: "Commercial building for sale in RS Puram Coimbatore, 3.5 Cr, good rental yield. 9886400004", ext: ext([], { classification: "LISTING", classificationConfidence: 0.96 }) },
  { at: "19:10", group: "demo_grp_b", from: "Kavya Homes", phone: "919980300003", text: "Need 1RK or studio in Koramangala for student, 15k max, immediate, 9980300003", ext: ext([cand({ category: RES, type: APT_I("1RK"), service: inf("rent", "15k max", 0.88), bhk: [0.5, "1RK"], tenant: ["bachelors", "student"], budget: monthly(15000, 15000, "15k max", "upper_limit"), localities: ["Koramangala"], when: { kind: "immediate", span: "immediate" }, mobile: "9980300003" })]) },
  { at: "19:45", group: "demo_grp_e", from: "Deals Admin", phone: "919900200002", text: "", media: "image" },
  { at: "20:20", group: "demo_grp_d", from: "Rohit Rentals", phone: "919886012012", text: "Hiring: field sales executive for real estate, 2 yrs exp, Bellandur office. DM", ext: ext([], { classification: "JOB_POST", classificationConfidence: 0.97 }) },
  { at: "21:02", group: "demo_grp_a", from: "Anil Estates", phone: "919845700007", text: "Reqd 3bhk semi furnished Brookefield rent 45k family, 1st week Oct, 9845700007", ext: ext([cand({ category: RES, type: APT_I("3bhk"), service: RENT("rent"), bhk: [3, "3bhk"], furnish: ["semi_furnished", "semi furnished"], tenant: ["family", "family"], budget: monthly(45000, 45000, "45k"), localities: ["Brookefield"], when: { kind: "date", span: "1st week Oct", date: "2026-10-07" }, mobile: "9845700007" })]) },
];
