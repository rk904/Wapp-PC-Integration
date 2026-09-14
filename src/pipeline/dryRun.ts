import type { QualificationConfig } from "../config/qualificationConfig.js";
import type { CandidateOutcome, MessageDecision } from "../types.js";
import { processMessage, type PipelineDeps } from "./processMessage.js";

export interface Flip {
  messageId: string;
  groupName: string;
  text: string;
  before: string;
  after: string;
}

export interface DryRunReport {
  draftVersion: string;
  activeVersion: string;
  evaluated: number;
  before: OutcomeCounts;
  after: OutcomeCounts;
  flips: Flip[];
}

interface OutcomeCounts {
  active: number;
  pendingReview: number;
  sightings: number;
  failed: number;
  failedByReason: Record<string, number>;
}

/**
 * Tuning dry-run (§17): replays recent archived messages against a draft config and
 * reports what would change — without writing anything and without new model calls.
 */
export async function dryRun(deps: PipelineDeps, draft: QualificationConfig, opts: { limit?: number } = {}): Promise<DryRunReport> {
  const active = await deps.repo.getActiveConfig();
  const messages = await deps.repo.listRawMessages({ limit: opts.limit ?? 500 });
  const before = emptyCounts();
  const after = emptyCounts();
  const flips: Flip[] = [];

  for (const msg of messages) {
    const stored = await deps.repo.getDecision(msg.messageId);
    const beforeDecision =
      stored && stored.configVersion === active.version
        ? stored
        : (await processMessage(msg.messageId, deps, { config: active, dryRun: true, allowExtractionCalls: false })).decision;
    const afterDecision = (await processMessage(msg.messageId, deps, { config: draft, dryRun: true, allowExtractionCalls: false })).decision;

    tally(before, beforeDecision);
    tally(after, afterDecision);
    const b = summarize(beforeDecision);
    const a = summarize(afterDecision);
    if (a !== b) flips.push({ messageId: msg.messageId, groupName: msg.groupName, text: msg.text, before: b, after: a });
  }

  return { draftVersion: draft.version, activeVersion: active.version, evaluated: messages.length, before, after, flips };
}

function emptyCounts(): OutcomeCounts {
  return { active: 0, pendingReview: 0, sightings: 0, failed: 0, failedByReason: {} };
}

function tally(c: OutcomeCounts, d: MessageDecision) {
  for (const o of d.outcomes) {
    if (o.kind === "PASSED") o.status === "active" ? c.active++ : c.pendingReview++;
    else if (o.kind === "SIGHTING") c.sightings++;
    else {
      c.failed++;
      for (const code of o.rejection.reasonCodes) c.failedByReason[code] = (c.failedByReason[code] ?? 0) + 1;
    }
  }
}

export function summarizeOutcome(o: CandidateOutcome): string {
  if (o.kind === "PASSED") return `PASSED:${o.status}`;
  if (o.kind === "SIGHTING") return "SIGHTING";
  return `FAILED:${o.rejection.reasonCodes.join("+")}`;
}

function summarize(d: MessageDecision): string {
  return d.outcomes.map(summarizeOutcome).join(" | ");
}
