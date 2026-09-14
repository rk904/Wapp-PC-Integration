import { describe, expect, it } from "vitest";
import type { CandidateOutcome, RequirementRecord } from "../src/types.js";
import { A1, A1_REWORDED, A2, A3, A4, A5, A6 } from "./fixtures/appendixA.js";
import { harness, message, steadyState } from "./helpers.js";

const passed = (o: CandidateOutcome | undefined): RequirementRecord => {
  if (o?.kind !== "PASSED") throw new Error(`expected PASSED, got ${JSON.stringify(o)}`);
  return o.requirement;
};
const failed = (o: CandidateOutcome | undefined) => {
  if (o?.kind !== "FAILED") throw new Error(`expected FAILED, got ${JSON.stringify(o)}`);
  return o.rejection;
};

describe("PRD Appendix A worked examples", () => {
  it("A.1 clean pass → auto-posted even under ramp-up thresholds", async () => {
    const h = harness();
    h.extractor.on(A1.text, A1.extraction);
    const d = await h.send(message(A1.text));

    const r = passed(d.outcomes[0]);
    expect(r.status).toBe("active");
    expect(r.qualityScore).toBeGreaterThanOrEqual(85);
    expect(r.extractionConfidence).toBeGreaterThanOrEqual(0.92);
    expect(r).toMatchObject({
      propertyCategory: "residential",
      propertyType: "apartment",
      serviceType: "rent",
      bhk: 3,
      furnishStatus: "semi_furnished",
      tenantType: "family",
      budgetBand: "45K-60K",
      budgetMin: 45000,
      budgetMax: 50000,
      city: "bengaluru",
      requiredWithin: "2026-09-30",
      source: "whatsapp_group",
      contactMasked: "+91 98450 •••45",
    });
    expect(r.localities[0]).toMatchObject({ name: "Electronic City Phase 1", placeId: "p_ecity1", geoPrecision: "exact" });
    expect(r.localities[0]!.lat).toBeCloseTo(12.8452, 3);
    expect(h.repo.contacts.get(r.requirementId)).toMatchObject({ mobile: "+919845012345", emailIsPlaceholder: true, marketingOptIn: false });
    expect(r.fieldProvenance.propertyCategory!.provenance).toBe("inferred");
    expect(r.fieldProvenance.furnishStatus!.provenance).toBe("extracted");
  });

  it("A.2 pass with defaults → pending review", async () => {
    const h = harness();
    h.extractor.on(A2.text, A2.extraction);
    const d = await h.send(message(A2.text));

    const r = passed(d.outcomes[0]);
    expect(r.status).toBe("pending_review");
    expect(r.qualityScore).toBeGreaterThanOrEqual(50);
    expect(r.qualityScore).toBeLessThan(70);
    expect(r.furnishStatus).toBe("unfurnished");
    expect(r.fieldProvenance.furnishStatus!.provenance).toBe("defaulted");
    expect(r.requiredWithin).toBe("2026-10-14");
    expect(r.fieldProvenance.requiredWithin!.provenance).toBe("defaulted");
    expect(r.dataCompleteness).toBe(60);
    const contact = h.repo.contacts.get(r.requirementId)!;
    expect(contact.mobile).toBe("+919900112233"); // sender number
    expect(contact.name).toBe("Ravi Realtor");
    expect(contact.email).toMatch(/^wa-[0-9a-f]{12}@leads\.propertycare\.co\.in$/);
  });

  it("A.3 fails on budget; the reason sentence quotes the vague phrase", async () => {
    const h = harness();
    h.extractor.on(A3.text, A3.extraction);
    const d = await h.send(message(A3.text));

    const rej = failed(d.outcomes[0]);
    expect(rej.reasonCodes).toContain("BUDGET_MISSING");
    expect(rej.reasonText).toContain("'budget friendly' is not specific enough");
    expect(rej.extractedPartial).toMatchObject({ bhk: 3, localities: ["HSR layout"] });
  });

  it("A.4 listing → IS_PROPERTY_LISTING at classification stage", async () => {
    const h = harness();
    h.extractor.on(A4.text, A4.extraction);
    const rej = failed((await h.send(message(A4.text))).outcomes[0]);
    expect(rej.reasonCodes).toEqual(["IS_PROPERTY_LISTING"]);
    expect(rej.stage).toBe("classification");
  });

  it("A.5 Chennai → OUT_OF_SERVICE_AREA, retained as intelligence", async () => {
    const h = harness();
    h.extractor.on(A5.text, A5.extraction);
    const rej = failed((await h.send(message(A5.text))).outcomes[0]);
    expect(rej.reasonCodes).toEqual(["OUT_OF_SERVICE_AREA"]);
    expect(rej.stage).toBe("geocode");
    expect(rej.reasonText).toContain("Chennai");
    expect(h.repo.rejections.has(rej.rejectionId)).toBe(true);
  });

  it("A.6 multi-requirement message splits into three candidates", async () => {
    const h = harness();
    h.extractor.on(A6.text, A6.extraction);
    const d = await h.send(message(A6.text));

    expect(d.outcomes).toHaveLength(3);
    const first = passed(d.outcomes[0]);
    expect(first.sourceBlock.splitIndex).toBe(0);
    expect(first.localities[0]!.name).toBe("Sarjapur");

    // Office: area satisfies G6 in place of BHK (change C4) — but no budget is stated, so G7 fails.
    const office = failed(d.outcomes[1]);
    expect(office.reasonCodes).toEqual(["BUDGET_MISSING"]);
    expect(office.rejectionId).toBe(`${d.messageId}_1`);

    const plot = failed(d.outcomes[2]);
    expect(plot.reasonCodes).toEqual(["BUDGET_MISSING"]);
  });

  it("A.7 cross-posted to four groups → one requirement with four sightings, one model call", async () => {
    const h = harness();
    h.extractor.on(A1.text, A1.extraction);
    const groups = ["grp_a", "grp_b", "grp_c", "grp_d"];
    const decisions = [];
    for (const [i, g] of groups.entries()) {
      const sentAt = new Date(new Date("2026-09-14T10:00:00+05:30").getTime() + i * 3 * 60_000);
      decisions.push(await h.send(message(A1.text, { groupId: g, groupName: g, sentAt, senderPhone: `91990011223${i}` })));
    }

    expect(h.repo.requirements.size).toBe(1);
    const req = [...h.repo.requirements.values()][0]!;
    expect(req.sightingCount).toBe(4);
    expect(new Set(req.sightings.map((s) => s.groupId))).toEqual(new Set(groups));
    expect(h.extractor.calls).toBe(1);
    expect(decisions.slice(1).every((d) => d.outcomes[0]?.kind === "SIGHTING")).toBe(true);
  });

  it("L3: the same requirement reworded by another poster becomes a sighting", async () => {
    const h = harness();
    h.extractor.on(A1.text, A1.extraction).on(A1_REWORDED.text, A1_REWORDED.extraction);
    h.repo.aliases.set("e-city phase 1", { alias: "e-city phase 1", canonical: "Electronic City Phase 1" });
    await h.send(message(A1.text));
    const d = await h.send(message(A1_REWORDED.text, { groupId: "grp_b", groupName: "Group B" }));

    expect(d.outcomes[0]).toMatchObject({ kind: "SIGHTING", layer: "L3" });
    expect(h.repo.requirements.size).toBe(1);
    expect([...h.repo.requirements.values()][0]!.sightingCount).toBe(2);
  });

  it("steady-state thresholds auto-post A.1 and still hold A.2 for review", async () => {
    const h = harness({ config: steadyState() });
    h.extractor.on(A1.text, A1.extraction).on(A2.text, A2.extraction);
    expect(passed((await h.send(message(A1.text))).outcomes[0]).status).toBe("active");
    expect(passed((await h.send(message(A2.text))).outcomes[0]).status).toBe("pending_review");
  });
});
