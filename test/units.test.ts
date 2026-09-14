import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config/qualificationConfig.js";
import { budgetBandFor } from "../src/pipeline/mapRequirement.js";
import { prefilter } from "../src/pipeline/prefilter.js";
import { MemoryRepository } from "../src/store/memoryRepository.js";
import { amountMatchesSpan, findIndianMobiles, istMonthEnd, normalizeIndianMobile, parseIndianAmount } from "../src/util/indian.js";
import { trigramSimilarity } from "../src/util/text.js";
import { message } from "./helpers.js";

describe("Indian number helpers", () => {
  it.each([
    ["45k", 45000],
    ["45 thousand", 45000],
    ["₹45,000", 45000],
    ["45000/-", 45000],
    ["1.2 Cr", 12_000_000],
    ["80L", 8_000_000],
    ["80 lakhs", 8_000_000],
    ["2,50,000", 250000],
    ["25 saavira", 25000],
  ])("parses %s", (input, expected) => expect(parseIndianAmount(input)).toBe(expected));

  it("cross-checks ranges where the unit is written once", () => {
    expect(amountMatchesSpan(45000, "45-50k")).toBe(true);
    expect(amountMatchesSpan(50000, "45-50k")).toBe(true);
    expect(amountMatchesSpan(450000, "45-50k")).toBe(false);
  });

  it("validates and finds mobiles", () => {
    expect(normalizeIndianMobile("98450 12345")).toBe("+919845012345");
    expect(normalizeIndianMobile("+91-98450-12345")).toBe("+919845012345");
    expect(normalizeIndianMobile("09845012345")).toBe("+919845012345");
    expect(normalizeIndianMobile("5845012345")).toBeNull(); // must start 6–9
    expect(normalizeIndianMobile("080 2345 6789")).toBeNull(); // landline
    expect(findIndianMobiles("call 98450 12345 or +91 99000 11122, budget 45000")).toEqual(["+919845012345", "+919900011122"]);
  });

  it("month end in IST", () => {
    expect(istMonthEnd(new Date("2026-09-30T20:00:00Z"))).toBe("2026-10-31"); // already 1 Oct in IST
    expect(istMonthEnd(new Date("2026-02-10T10:00:00+05:30"))).toBe("2026-02-28");
  });

  it("budget bands: midpoint of a range, inclusive upper bounds", () => {
    expect(budgetBandFor(DEFAULT_CONFIG, "monthly", 45000, 50000)).toBe("45K-60K");
    expect(budgetBandFor(DEFAULT_CONFIG, "monthly", 15000, 15000)).toBe("<=15K");
    expect(budgetBandFor(DEFAULT_CONFIG, "monthly", 30000, null)).toBe("15K-30K");
    expect(budgetBandFor(DEFAULT_CONFIG, "monthly", 150000, 150000)).toBe("1L+");
    expect(budgetBandFor(DEFAULT_CONFIG, "total", 10_000_000, 14_000_000)).toBe("1Cr-1.5Cr");
  });

  it("trigram similarity flags near-duplicates only", () => {
    expect(trigramSimilarity("Need 2bhk rent koramangala 35k urgent", "Need 2bhk rent Koramangala 35k urgent!!")).toBeGreaterThan(0.85);
    expect(trigramSimilarity("Need 2bhk rent koramangala 35k", "Need 3bhk rent HSR 50k")).toBeLessThan(0.85);
  });
});

describe("Stage 2 pre-filter", () => {
  const repo = new MemoryRepository();
  const run = (text: string, over = {}) => prefilter(message(text, over), DEFAULT_CONFIG, repo);

  it.each([
    ["ok", "TOO_SHORT"],
    ["Good morning all 🙏🙏", "CHATTER"],
    ["Thank you sir, have a nice day", "CHATTER"],
    ["Happy Ganesh Chaturthi to all members and families", "NO_RE_SIGNAL"],
  ])("%s → %s", async (text, code) => {
    const r = await run(text);
    expect(r.kind === "reject" && r.reasonCode).toBe(code);
  });

  it("media without caption → MEDIA_ONLY", async () => {
    const r = await run("", { hasMedia: true, mediaType: "image" });
    expect(r.kind === "reject" && r.reasonCode).toBe("MEDIA_ONLY");
  });

  it("system notices flagged by the adapter", async () => {
    const r = await run("Suresh added Ramesh to the group", { isSystemNotice: true });
    expect(r.kind === "reject" && r.reasonCode).toBe("SYSTEM_NOTICE");
  });

  it("blocked senders", async () => {
    repo.blocked.add("918888888888");
    const r = await run("Need 2bhk rent koramangala 35k", { senderPhone: "918888888888" });
    expect(r.kind === "reject" && r.reasonCode).toBe("BLOCKED_SENDER");
  });

  it.each(["Need 2bhk rent koramangala 35k", "2bhk mane beku baadige ge Jayanagar", "Warehouse required 15000 sft Hosur road", "flat chahiye whitefield mein 30 hazaar"])(
    "keeps real-estate messages as candidates: %s",
    async (text) => expect((await run(text)).kind).toBe("candidate"),
  );
});
