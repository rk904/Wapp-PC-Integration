import { DEFAULT_CONFIG, effectiveAutoPost } from "../config/qualificationConfig.js";
import { DEMO_DAY, DEMO_GROUPS, DEMO_MESSAGES } from "../demo/demoData.js";
import { DEMO_BENGALURU_LOCALITIES, DemoGeocoder } from "../demo/demoGeocoder.js";
import { PostedRequirementStore, suggestLocalities, type PostedRequirement } from "./postedRequirements.js";
import { resolve } from "node:path";
import { ClaudeExtractor } from "../extraction/claudeExtractor.js";
import { ExtractionError, ExtractionSchema, sanitizeExtraction, type ExtractionInput, type ExtractionResult, type Extractor } from "../extraction/schema.js";
import { GooglePlacesGeocoder } from "../geo/googlePlacesGeocoder.js";
import { LocalityResolver, type Geocoder } from "../geo/localityResolver.js";
import { parseWhatsAppExport } from "../ingest/whatsappExport.js";
import { parseWhatsAppWebRows, type WhatsAppWebRow } from "../ingest/whatsappWeb.js";
import { ingest } from "../pipeline/ingest.js";
import { processMessage, type PipelineDeps } from "../pipeline/processMessage.js";
import { MemoryRepository } from "../store/memoryRepository.js";
import type { CandidateOutcome, InboundMessage, MessageDecision, RequirementRecord } from "../types.js";
import { istDate } from "../util/indian.js";

/**
 * Read model and actions behind the WA-Intake console. Runs the real pipeline
 * over an in-memory repository: seeded with the synthetic demo day, plus any
 * WhatsApp exports attached through the console.
 */

/** Extracts with demo fixtures first, then Claude when a key is configured; otherwise reports "awaiting AI". */
class ConsoleExtractor implements Extractor {
  readonly model: string;
  readonly promptVersion: string;
  private readonly fixtures = new Map<string, ExtractionResult>();
  private readonly byMessage = new Map<string, ExtractionResult>();
  /** Extractions supplied with a test batch (e.g. read by Claude in this session), keyed by messageId. */
  sessionCount = 0;

  constructor(private readonly claude: ClaudeExtractor | null) {
    this.model = claude?.model ?? "demo-fixtures";
    this.promptVersion = claude?.promptVersion ?? "prompt-v1";
  }

  add(text: string, result: ExtractionResult) {
    this.fixtures.set(text, result);
  }

  addForMessage(messageId: string, result: ExtractionResult) {
    if (!this.byMessage.has(messageId)) this.sessionCount++;
    this.byMessage.set(messageId, result);
  }

  async extract(input: ExtractionInput): Promise<ExtractionResult> {
    const supplied = this.byMessage.get(input.messageId);
    if (supplied) return structuredClone(supplied);
    const fixture = this.fixtures.get(input.text);
    if (fixture) return structuredClone(fixture);
    if (this.claude) return this.claude.extract(input);
    throw new AwaitingAiError(input.messageId);
  }
}

export class AwaitingAiError extends Error {
  constructor(readonly messageId: string) {
    super("No ANTHROPIC_API_KEY configured; message is waiting for AI extraction.");
    this.name = "AwaitingAiError";
  }
}

export type Outcome = "live" | "review" | "sighting" | "rejected" | "awaiting_ai";

export interface StreamItem {
  messageId: string;
  groupId: string;
  groupName: string;
  sender: string;
  senderPhoneMasked: string | null;
  sentAt: string;
  text: string;
  media: string | null;
  isDemo: boolean;
  outcome: Outcome;
  outcomes: Array<{ kind: Outcome; label: string; reasonCodes?: string[]; reasonText?: string; stage?: string; requirementId?: string; score?: number | null }>;
}

export class ConsoleService {
  readonly repo = new MemoryRepository();
  private readonly extractor: ConsoleExtractor;
  private readonly deps: PipelineDeps;
  private readonly awaitingAi = new Set<string>();
  private readonly demoIds = new Set<string>();
  readonly mode: { ai: "claude" | "demo-fixtures"; geocoder: "google-places" | "demo"; model: string | null };
  readonly posted: PostedRequirementStore;
  private readonly geocoder: Geocoder;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    const claude = env.ANTHROPIC_API_KEY ? new ClaudeExtractor() : null;
    const geocoder: Geocoder = env.GOOGLE_MAPS_API_KEY ? new GooglePlacesGeocoder(env.GOOGLE_MAPS_API_KEY) : new DemoGeocoder();
    this.extractor = new ConsoleExtractor(claude);
    this.geocoder = geocoder;
    this.posted = new PostedRequirementStore(env.VERCEL ? null : resolve(env.WA_DATA_DIR ?? "data", "posted-requirements.json"));
    this.mode = { ai: claude ? "claude" : "demo-fixtures", geocoder: env.GOOGLE_MAPS_API_KEY ? "google-places" : "demo", model: claude?.model ?? null };
    this.repo.config = structuredClone(DEFAULT_CONFIG);
    for (const g of DEMO_GROUPS) this.repo.groups.set(g.groupId, g);
    for (const [alias, canonical] of [["ecity", "Electronic City"], ["e-city", "Electronic City"], ["kora", "Koramangala"], ["hsr", "HSR Layout"], ["sarjapur rd", "Sarjapur Road"], ["jp nagar", "JP Nagar"]] as const) {
      this.repo.aliases.set(alias, { alias, canonical });
    }
    this.deps = { repo: this.repo, extractor: this.extractor, resolver: new LocalityResolver(this.repo, geocoder), clock: () => new Date() };
  }

  async seedDemo(): Promise<void> {
    const groupNames = new Map(DEMO_GROUPS.map((g) => [g.groupId, g.displayName]));
    for (const [i, m] of DEMO_MESSAGES.entries()) {
      const sentAt = new Date(`${DEMO_DAY}T${m.at}:00+05:30`);
      const msg: InboundMessage = {
        messageId: `demo_${String(i + 1).padStart(3, "0")}`,
        groupId: m.group,
        groupName: groupNames.get(m.group)!,
        senderPhone: m.phone,
        senderDisplayName: m.from,
        sentAt: m.receivedLagHours ? new Date(sentAt.getTime() - m.receivedLagHours * 3_600_000) : sentAt,
        receivedAt: new Date(sentAt.getTime() + 4_000),
        text: m.text,
        hasMedia: !!m.media,
        mediaType: m.media ?? null,
        quotedMessageId: null,
        isForwarded: false,
        forwardScore: 0,
        isSystemNotice: !!m.system,
        rawPayload: { source: "demo" },
      };
      if (m.ext) this.extractor.add(m.text, m.ext);
      this.demoIds.add(msg.messageId);
      await this.ingestAndProcess(msg, new Date(sentAt.getTime() + 20_000));
    }
  }

  private async ingestAndProcess(msg: InboundMessage, processedAt?: Date): Promise<"processed" | "duplicate" | "awaiting_ai" | "skipped"> {
    if (!this.repo.groups.has(msg.groupId)) {
      this.repo.groups.set(msg.groupId, {
        groupId: msg.groupId,
        displayName: msg.groupName,
        isActive: true,
        trustTier: "medium",
        defaultCity: "bengaluru",
        expectedContent: "mixed",
        addedOn: new Date(),
        addedBy: "console-import",
      });
    }
    const queued: string[] = [];
    const res = await ingest(msg, this.repo, async (id) => void queued.push(id));
    if (!res.accepted) {
      // A re-attached export retries messages that were waiting for an AI key.
      if (res.reason !== "DUPLICATE_MESSAGE_ID") return "skipped";
      if (!this.awaitingAi.has(msg.messageId)) return "duplicate";
    }
    try {
      const deps = processedAt ? { ...this.deps, clock: () => processedAt } : this.deps;
      await processMessage(msg.messageId, deps);
      this.awaitingAi.delete(msg.messageId);
      return "processed";
    } catch (err) {
      if (err instanceof AwaitingAiError) {
        this.awaitingAi.add(msg.messageId);
        return "awaiting_ai";
      }
      if (err instanceof ExtractionError) throw err;
      throw err;
    }
  }

  async importExport(fileName: string, data: Uint8Array, groupName?: string) {
    const parsed = parseWhatsAppExport({ fileName, data }, { groupName, receivedAt: new Date() });
    const counts = { total: parsed.messages.length, processed: 0, duplicate: 0, awaitingAi: 0, skipped: 0 };
    for (const msg of parsed.messages) {
      const r = await this.ingestAndProcess(msg);
      if (r === "processed") counts.processed++;
      else if (r === "duplicate") counts.duplicate++;
      else if (r === "awaiting_ai") counts.awaitingAi++;
      else counts.skipped++;
    }
    return { groupName: parsed.groupName, dateOrder: parsed.dateOrder, skippedLines: parsed.skippedLines, ...counts };
  }

  /**
   * TEST PATH: messages read from a signed-in WhatsApp Web tab, optionally with an
   * extraction per message (schema-validated). Messages without one follow the
   * normal extractor chain (Claude if configured, otherwise "Awaiting AI").
   */
  async ingestWhatsAppWeb(rows: WhatsAppWebRow[], extractions: Record<string, unknown> = {}) {
    const parsed = parseWhatsAppWebRows(rows, { receivedAt: new Date() });
    const invalid: Array<{ messageId: string; error: string }> = [];
    for (const msg of parsed.messages) {
      const raw = extractions[msg.messageId];
      if (raw === undefined) continue;
      const check = ExtractionSchema.safeParse(raw);
      if (check.success) this.extractor.addForMessage(msg.messageId, sanitizeExtraction(check.data));
      else invalid.push({ messageId: msg.messageId, error: check.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
    }
    const counts = { total: parsed.messages.length, processed: 0, duplicate: 0, awaitingAi: 0, skipped: parsed.skipped.length };
    for (const msg of parsed.messages) {
      const r = await this.ingestAndProcess(msg);
      if (r === "processed") counts.processed++;
      else if (r === "duplicate") counts.duplicate++;
      else if (r === "awaiting_ai") counts.awaitingAi++;
      else counts.skipped++;
    }
    return { ...counts, invalidExtractions: invalid, skippedRows: parsed.skipped.slice(0, 5).map((s) => s.reason) };
  }

  // ---------------------------------------------------------------------------
  // Post Requirement screen
  // ---------------------------------------------------------------------------

  suggestLocalities(q: string) {
    return suggestLocalities(q, this.geocoder, DEMO_BENGALURU_LOCALITIES);
  }

  postRequirement(raw: unknown): PostedRequirement {
    return this.posted.create(raw);
  }

  // ---------------------------------------------------------------------------
  // Review actions (§17)
  // ---------------------------------------------------------------------------

  approve(requirementId: string): RequirementRecord {
    const r = this.mustRequirement(requirementId);
    if (r.status !== "pending_review") throw new ConsoleError(409, `Requirement is ${r.status}, not pending review`);
    r.status = "active";
    r.updatedAt = new Date();
    return structuredClone(r);
  }

  reject(requirementId: string): RequirementRecord {
    const r = this.mustRequirement(requirementId);
    if (r.status !== "pending_review" && r.status !== "active") throw new ConsoleError(409, `Requirement is ${r.status}`);
    r.status = "rejected_by_human";
    r.updatedAt = new Date();
    return structuredClone(r);
  }

  private mustRequirement(id: string): RequirementRecord {
    const r = this.repo.requirements.get(id);
    if (!r) throw new ConsoleError(404, `Requirement ${id} not found`);
    return r;
  }

  // ---------------------------------------------------------------------------
  // Read model
  // ---------------------------------------------------------------------------

  snapshot() {
    const raw = [...this.repo.raw.values()].sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
    const stream = raw.map((m) => this.streamItem(m));
    const count = (o: Outcome) => stream.filter((s) => s.outcomes.some((x) => x.kind === o)).length;

    const prefiltered = [...this.repo.rejections.values()].filter((r) => r.stage === "prefilter").length;
    // Reached the model: anything decided past the pre-filter, except exact (L1) cross-posts, which skip it.
    const reachedAi = [...this.repo.decisions.values()].filter((d) =>
      d.outcomes.some((o) => o.kind === "PASSED" || (o.kind === "SIGHTING" && o.layer !== "L1") || (o.kind === "FAILED" && o.rejection.stage !== "prefilter")),
    ).length;
    const requirements = [...this.repo.requirements.values()];
    const reasons = new Map<string, { code: string; stage: string; count: number; example: string }>();
    for (const r of this.repo.rejections.values()) {
      for (const code of r.reasonCodes) {
        const e = reasons.get(code) ?? { code, stage: r.stage, count: 0, example: r.reasonText };
        e.count++;
        reasons.set(code, e);
      }
    }

    const groups = [...this.repo.groups.values()].map((g) => {
      const items = stream.filter((s) => s.groupId === g.groupId);
      const hours = Array.from({ length: 24 }, (_, h) => {
        const inHour = items.filter((s) => Number(istHour(s.sentAt)) === h);
        return { hour: h, read: inHour.length, live: inHour.filter((s) => s.outcome === "live").length, review: inHour.filter((s) => s.outcome === "review").length, sighting: inHour.filter((s) => s.outcome === "sighting").length, rejected: inHour.filter((s) => s.outcome === "rejected").length };
      });
      const useful = items.filter((s) => s.outcome === "live" || s.outcome === "review" || s.outcome === "sighting").length;
      return {
        groupId: g.groupId,
        name: g.displayName,
        trustTier: g.trustTier,
        isDemo: g.addedBy === "demo",
        read: items.length,
        live: items.filter((s) => s.outcome === "live").length,
        review: items.filter((s) => s.outcome === "review").length,
        sighting: items.filter((s) => s.outcome === "sighting").length,
        rejected: items.filter((s) => s.outcome === "rejected").length,
        usefulRate: items.length ? Math.round((useful / items.length) * 100) : 0,
        hours,
      };
    });

    const auto = effectiveAutoPost(this.repo.config);
    return {
      generatedAt: new Date().toISOString(),
      day: raw[0] ? istDate(raw[0].sentAt) : istDate(new Date()),
      engine: {
        configVersion: this.repo.config.version,
        rampUp: this.repo.config.thresholds.rampUp.enabled,
        autoPostScore: auto.minScore,
        autoPostConfidence: auto.minConfidence,
        reviewScore: this.repo.config.thresholds.minReviewScore,
        promptVersion: this.extractor.promptVersion,
        ...this.mode,
        sessionExtractions: this.extractor.sessionCount,
      },
      containsDemoData: this.demoIds.size > 0,
      totals: {
        read: raw.length,
        prefiltered,
        reachedAi: Math.max(0, reachedAi),
        awaitingAi: this.awaitingAi.size,
        live: count("live"),
        review: count("review"),
        sighting: count("sighting"),
        rejected: count("rejected"),
        requirementsLive: requirements.filter((r) => r.status === "active").length,
        requirementsReview: requirements.filter((r) => r.status === "pending_review").length,
        unresolvedLocalities: this.repo.unresolved.length,
      },
      funnel: [
        { stage: "read", label: "Messages read", count: raw.length },
        { stage: "prefilter", label: "Passed pre-filter", count: raw.length - prefiltered },
        { stage: "ai", label: "Read by AI", count: Math.max(0, reachedAi) },
        { stage: "accepted", label: "Accepted", count: count("live") + count("review") },
        { stage: "live", label: "Live now", count: requirements.filter((r) => r.status === "active").length },
      ],
      reasons: [...reasons.values()].sort((a, b) => b.count - a.count),
      groups: groups.sort((a, b) => b.read - a.read),
      stream,
      requirements: requirements
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((r) => this.requirementView(r)),
      reviewQueue: requirements.filter((r) => r.status === "pending_review").sort((a, b) => a.qualityScore - b.qualityScore).map((r) => this.requirementView(r)),
      unresolvedLocalities: this.repo.unresolved.map((u) => ({ rawText: u.rawText, messageId: u.messageId })),
    };
  }

  private streamItem(m: InboundMessage): StreamItem {
    const decision = this.repo.decisions.get(m.messageId) ?? null;
    const outcomes = decision ? this.outcomeViews(decision) : this.awaitingAi.has(m.messageId) ? [{ kind: "awaiting_ai" as const, label: "Awaiting AI" }] : [];
    const precedence: Outcome[] = ["live", "review", "sighting", "awaiting_ai", "rejected"];
    const outcome = precedence.find((p) => outcomes.some((o) => o.kind === p)) ?? "rejected";
    return {
      messageId: m.messageId,
      groupId: m.groupId,
      groupName: m.groupName,
      sender: m.senderDisplayName ?? "Unknown sender",
      senderPhoneMasked: m.senderPhone ? `+${m.senderPhone.slice(0, 2)} ${m.senderPhone.slice(2, 7)} •••${m.senderPhone.slice(-2)}` : null,
      sentAt: m.sentAt.toISOString(),
      text: m.text,
      media: m.hasMedia ? m.mediaType : null,
      isDemo: this.demoIds.has(m.messageId),
      outcome,
      outcomes,
    };
  }

  private outcomeViews(d: MessageDecision): StreamItem["outcomes"] {
    return d.outcomes.map((o: CandidateOutcome) => {
      if (o.kind === "PASSED") {
        const current = this.repo.requirements.get(o.requirement.requirementId);
        const status = current?.status ?? o.status;
        const kind: Outcome = status === "active" ? "live" : status === "pending_review" ? "review" : "rejected";
        return { kind, label: kind === "live" ? "Live" : kind === "review" ? "Needs review" : "Rejected by desk", requirementId: o.requirement.requirementId, score: current?.qualityScore ?? o.requirement.qualityScore };
      }
      if (o.kind === "SIGHTING") return { kind: "sighting" as const, label: `Seen again (${o.layer})`, requirementId: o.requirementId };
      return { kind: "rejected" as const, label: "Rejected", reasonCodes: o.rejection.reasonCodes, reasonText: o.rejection.reasonText, stage: o.rejection.stage, score: o.rejection.qualityScore };
    });
  }

  private requirementView(r: RequirementRecord) {
    const contact = this.repo.contacts.get(r.requirementId);
    return {
      requirementId: r.requirementId,
      status: r.status,
      propertyCategory: r.propertyCategory,
      propertyType: r.propertyType,
      serviceType: r.serviceType,
      bhk: r.bhk,
      bhkMax: r.bhkMax,
      areaSqft: r.areaSqft,
      unitSpec: r.unitSpec,
      furnishStatus: r.furnishStatus,
      tenantType: r.tenantType,
      purpose: r.purpose,
      city: r.city,
      budgetBand: r.budgetBand,
      budgetMin: r.budgetMin,
      budgetMax: r.budgetMax,
      budgetPeriod: r.budgetPeriod,
      requiredWithin: r.requiredWithin,
      localities: r.localities,
      extraLocalities: r.extraLocalities,
      description: r.description,
      notes: r.notes,
      contactName: contact?.name ?? null,
      contactMasked: r.contactMasked,
      contactType: contact?.contactType ?? null,
      emailIsPlaceholder: contact?.emailIsPlaceholder ?? true,
      qualityScore: r.qualityScore,
      extractionConfidence: r.extractionConfidence,
      scoreBreakdown: r.scoreBreakdown,
      dataCompleteness: r.dataCompleteness,
      fieldProvenance: r.fieldProvenance,
      sightingCount: r.sightingCount,
      sightings: r.sightings.map((s) => ({ groupName: s.groupName, sentAt: s.sentAt.toISOString() })),
      groupName: r.sourceBlock.groupName,
      configVersion: r.sourceBlock.configVersion,
      createdAt: r.createdAt.toISOString(),
    };
  }
}

export class ConsoleError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function istHour(iso: string): string {
  return new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(11, 13);
}
