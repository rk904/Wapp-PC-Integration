import { describe, expect, it } from "vitest";
import { dryRun } from "../src/pipeline/dryRun.js";
import { ingest } from "../src/pipeline/ingest.js";
import { processMessage } from "../src/pipeline/processMessage.js";
import { A1, A2, A3, A4, A5, A6 } from "./fixtures/appendixA.js";
import { candidate, extraction, f, harness, message } from "./helpers.js";

/** PRD §24 acceptance criteria that can be verified without GCP. */
describe("§24 acceptance criteria", () => {
  it("every message ends in exactly one of requirements / rejections — never both, never lost", async () => {
    const h = harness();
    const fixtures = [A1, A2, A3, A4, A5, A6];
    for (const fx of fixtures) h.extractor.on(fx.text, fx.extraction);
    const texts = [...fixtures.map((x) => x.text), "Good morning all 🙏", "ok", "Happy Diwali to all members and families"];

    for (const t of texts) {
      const d = await h.send(message(t));
      for (const [i, o] of d.outcomes.entries()) {
        const split = d.outcomes.length > 1 ? i : null;
        const rejId = split === null ? d.messageId : `${d.messageId}_${split}`;
        const inRejections = h.repo.rejections.has(rejId);
        const inRequirements = o.kind === "PASSED" ? h.repo.requirements.has(o.requirement.requirementId) : o.kind === "SIGHTING";
        expect(inRejections !== inRequirements).toBe(true);
      }
      expect(d.outcomes.length).toBeGreaterThan(0);
    }
    for (const r of h.repo.rejections.values()) {
      expect(r.reasonCodes.length).toBeGreaterThan(0);
      expect(r.reasonText).toMatch(/^(Rejected|Skipped)/);
    }
    for (const r of h.repo.requirements.values()) {
      expect(r.localities.length).toBeGreaterThan(0);
      expect(Number.isFinite(r.localities[0]!.lat)).toBe(true);
    }
  });

  it("ingest and processing are idempotent on messageId", async () => {
    const h = harness();
    h.extractor.on(A1.text, A1.extraction);
    const msg = message(A1.text);
    const published: string[] = [];
    expect((await ingest(msg, h.repo, async (id) => void published.push(id))).accepted).toBe(true);
    expect(await ingest(msg, h.repo, async (id) => void published.push(id))).toMatchObject({ accepted: false, reason: "DUPLICATE_MESSAGE_ID" });
    expect(published).toHaveLength(1);

    await processMessage(msg.messageId, h);
    const again = await processMessage(msg.messageId, h);
    expect(again.reused).toBe(true);
    expect(h.repo.requirements.size).toBe(1);
    expect(h.extractor.calls).toBe(1);
  });

  it("paused and unregistered groups are not ingested", async () => {
    const h = harness();
    h.repo.groups.get("grp_b")!.isActive = false;
    const noop = async () => {};
    expect(await ingest(message("Need 2bhk", { groupId: "grp_b" }), h.repo, noop)).toMatchObject({ reason: "GROUP_PAUSED" });
    expect(await ingest(message("Need 2bhk", { groupId: "grp_zzz" }), h.repo, noop)).toMatchObject({ reason: "GROUP_NOT_REGISTERED" });
  });

  it("changing a threshold in qualification_config changes the next outcome with no deploy", async () => {
    const h = harness();
    h.extractor.on(A2.text, A2.extraction);
    const first = await h.send(message(A2.text));
    expect(first.outcomes[0]).toMatchObject({ kind: "PASSED", status: "pending_review" });

    h.repo.config = { ...h.repo.config, version: "criteria-v2", thresholds: { ...h.repo.config.thresholds, minReviewScore: 70 } };
    const second = await h.send(message(A2.text, { groupId: "grp_b", senderPhone: "919812300000", sentAt: new Date("2026-09-25T10:00:00+05:30") }));
    const o = second.outcomes[0]!;
    expect(o.kind === "FAILED" && o.rejection.reasonCodes).toEqual(["BELOW_QUALITY_THRESHOLD"]);
    expect(o.kind === "FAILED" && o.rejection.configVersion).toBe("criteria-v2");
  });

  it("dry-run over archived messages reports the flip list without writing anything", async () => {
    const h = harness();
    for (const fx of [A1, A2, A3, A4, A5]) h.extractor.on(fx.text, fx.extraction);
    for (const fx of [A1, A2, A3, A4, A5]) await h.send(message(fx.text));

    const snapshot = JSON.stringify([...h.repo.requirements.entries(), ...h.repo.rejections.entries(), ...h.repo.decisions.entries()]);
    const callsBefore = h.extractor.calls;
    const draft = { ...structuredClone(h.repo.config), version: "criteria-draft" };
    draft.thresholds.rampUp.enabled = false;
    draft.thresholds.minReviewScore = 65;

    const report = await dryRun(h, draft);
    expect(report.evaluated).toBe(5);
    expect(report.flips.map((x) => [x.before, x.after])).toEqual([["PASSED:pending_review", "FAILED:BELOW_QUALITY_THRESHOLD"]]);
    expect(JSON.stringify([...h.repo.requirements.entries(), ...h.repo.rejections.entries(), ...h.repo.decisions.entries()])).toBe(snapshot);
    expect(h.extractor.calls).toBe(callsBefore);
  });

  it("stale messages fail G9; invalid contact numbers fail G8; low confidence fails G11", async () => {
    const h = harness();
    h.extractor.on(A1.text, A1.extraction);
    const sentAt = new Date("2026-09-10T10:00:00+05:30");
    const stale = await h.send(message(A1.text, { sentAt, receivedAt: new Date(sentAt.getTime() + 80 * 3_600_000) }));
    expect(stale.outcomes[0]!.kind === "FAILED" && stale.outcomes[0]!.rejection.reasonCodes).toEqual(["STALE_MESSAGE"]);

    const noContactText = "Need 2bhk rent koramangala 35k family immediately";
    h.extractor.on(noContactText, A2.extraction);
    const noContact = await h.send(message(noContactText, { senderPhone: "4412345678" }));
    expect(noContact.outcomes[0]!.kind === "FAILED" && noContact.outcomes[0]!.rejection.reasonCodes).toEqual(["INVALID_PHONE"]);

    const vagueText = "2 or 3 bhk somewhere south side around 40ish";
    h.extractor.on(
      vagueText,
      extraction([
        candidate({
          propertyCategory: f("residential", "bhk", 0.5, true),
          propertyType: f("apartment", "bhk", 0.45, true),
          serviceType: f("rent", "40ish", 0.4, true),
          bhk: { value: 2, bhkMax: 3, confidence: 0.6, sourceSpan: "2 or 3 bhk", isInferred: false },
          budgetMin: f(40000, "40ish", 0.4),
          budgetMax: f(40000, "40ish", 0.4),
          budgetKind: f("exact", "40ish", 0.4),
          localities: [{ rawText: "koramangala", confidence: 0.3 }],
          clarity: "ambiguous",
        }),
      ]),
    );
    const low = await h.send(message(vagueText));
    expect(low.outcomes[0]!.kind === "FAILED" && low.outcomes[0]!.rejection.reasonCodes).toContain("LOW_CONFIDENCE");
  });
});
