import { DEFAULT_CONFIG, type QualificationConfig } from "../src/config/qualificationConfig.js";
import {
  sanitizeExtraction,
  type ExtractionInput,
  type ExtractionResult,
  type Extractor,
  type RequirementCandidate,
} from "../src/extraction/schema.js";
import { LocalityResolver, type GeoResult, type Geocoder } from "../src/geo/localityResolver.js";
import { ingest } from "../src/pipeline/ingest.js";
import { processMessage, type PipelineDeps } from "../src/pipeline/processMessage.js";
import { MemoryRepository } from "../src/store/memoryRepository.js";
import type { City, GroupConfig, InboundMessage } from "../src/types.js";

// ---------------------------------------------------------------------------
// Candidate builder — every field null unless given (mirrors "never invent").
// ---------------------------------------------------------------------------

type F<T> = { value: T | null; confidence: number; sourceSpan: string | null; isInferred: boolean };
const nul = <T>(): F<T> => ({ value: null, confidence: 0, sourceSpan: null, isInferred: false });
export const f = <T>(value: T, sourceSpan: string | null = null, confidence = 0.97, isInferred = false): F<T> => ({ value, confidence, sourceSpan, isInferred });

export function candidate(overrides: Partial<RequirementCandidate> = {}): RequirementCandidate {
  return {
    propertyCategory: nul(),
    propertyType: nul(),
    serviceType: nul(),
    bhk: { value: null, bhkMax: null, confidence: 0, sourceSpan: null, isInferred: false },
    areaSqft: nul(),
    unitSpec: nul(),
    furnishStatus: nul(),
    tenantType: nul(),
    purpose: nul(),
    budgetMin: nul(),
    budgetMax: nul(),
    budgetPeriod: nul(),
    budgetKind: nul(),
    localities: [],
    cityMentioned: nul(),
    requiredWithin: { kind: null, date: null, confidence: 0, sourceSpan: null },
    contactName: nul(),
    contactMobile: nul(),
    additionalServices: [],
    clarity: "clear",
    notes: "",
    ...overrides,
  };
}

export function extraction(requirements: RequirementCandidate[], overrides: Partial<ExtractionResult> = {}): ExtractionResult {
  return sanitizeExtraction({
    classification: "REQUIREMENT",
    classificationConfidence: 0.97,
    language: "en",
    requirements,
    listingPortion: null,
    ...overrides,
  });
}

/** Returns canned model output keyed by exact message text; counts calls. */
export class StubExtractor implements Extractor {
  readonly model = "stub-model";
  readonly promptVersion = "prompt-test";
  calls = 0;
  private readonly table = new Map<string, ExtractionResult>();

  on(text: string, result: ExtractionResult): this {
    this.table.set(text, result);
    return this;
  }

  async extract(input: ExtractionInput): Promise<ExtractionResult> {
    this.calls++;
    const r = this.table.get(input.text);
    if (!r) throw new Error(`StubExtractor has no fixture for: ${input.text}`);
    return structuredClone(r);
  }
}

// ---------------------------------------------------------------------------
// Fake geocoder. Coordinates are approximate and exist only as test fixtures.
// ---------------------------------------------------------------------------

const PLACES: Record<string, GeoResult> = {
  "electronic city phase 1": geo("p_ecity1", "Electronic City Phase 1", 12.8452, 77.6602, ["bengaluru", "bangalore urban"], "Bengaluru", ["sublocality_level_2", "sublocality", "political"]),
  "electronic city": geo("p_ecity", "Electronic City", 12.8399, 77.677, ["bengaluru", "bangalore urban"], "Bengaluru", ["sublocality_level_1", "sublocality", "political"]),
  koramangala: geo("p_kora", "Koramangala", 12.9352, 77.6245, ["bengaluru", "bangalore urban"], "Bengaluru", ["sublocality_level_1", "sublocality", "political"]),
  "hsr layout": geo("p_hsr", "HSR Layout", 12.9116, 77.6474, ["bengaluru", "bangalore urban"], "Bengaluru", ["sublocality_level_1", "sublocality", "political"]),
  sarjapur: geo("p_sarjapur", "Sarjapur", 12.86, 77.786, ["bengaluru", "bangalore urban"], "Bengaluru", ["locality", "political"]),
  "kanakapura road": geo("p_kanakapura_rd", "Kanakapura Road", 12.87, 77.56, ["bengaluru", "bangalore urban"], "Bengaluru", ["route"]),
  "anna nagar": geo("p_annanagar_chn", "Anna Nagar", 13.085, 80.2101, ["chennai", "chennai district"], "Chennai", ["sublocality_level_1", "sublocality", "political"]),
};

function geo(placeId: string, name: string, lat: number, lng: number, cityCandidates: string[], cityName: string, types: string[]): GeoResult {
  return { placeId, name, lat, lng, cityCandidates, cityName, types };
}

export class FakeGeocoder implements Geocoder {
  calls = 0;
  async search(query: string, _bias: City | null): Promise<GeoResult | null> {
    this.calls++;
    const place = query.split(",")[0]!.trim().toLowerCase();
    return PLACES[place] ?? null;
  }
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

export const SENT_AT = new Date("2026-09-14T10:00:00+05:30");

export function group(overrides: Partial<GroupConfig> = {}): GroupConfig {
  return {
    groupId: "grp_a",
    displayName: "Bangalore Realtors Network A",
    isActive: true,
    trustTier: "medium",
    defaultCity: "bengaluru",
    expectedContent: "mixed",
    addedOn: new Date("2026-09-01T00:00:00Z"),
    addedBy: "rk",
    ...overrides,
  };
}

let seq = 0;
export function message(text: string, overrides: Partial<InboundMessage> = {}): InboundMessage {
  seq++;
  const sentAt = overrides.sentAt ?? SENT_AT;
  return {
    messageId: `msg_${seq}`,
    groupId: "grp_a",
    groupName: "Bangalore Realtors Network A",
    senderPhone: "919900112233",
    senderDisplayName: "Ravi Realtor",
    sentAt,
    receivedAt: new Date(sentAt.getTime() + 5_000),
    text,
    hasMedia: false,
    mediaType: null,
    quotedMessageId: null,
    isForwarded: false,
    forwardScore: 0,
    isSystemNotice: false,
    ...overrides,
  };
}

export interface Harness extends PipelineDeps {
  repo: MemoryRepository;
  extractor: StubExtractor;
  geocoder: FakeGeocoder;
  /** Ingests and processes one message; returns its decision. */
  send(msg: InboundMessage): Promise<Awaited<ReturnType<typeof processMessage>>["decision"]>;
}

export function harness(opts: { config?: Partial<QualificationConfig>; groups?: GroupConfig[] } = {}): Harness {
  const repo = new MemoryRepository();
  repo.config = { ...structuredClone(DEFAULT_CONFIG), ...opts.config };
  for (const g of opts.groups ?? [group(), group({ groupId: "grp_b", displayName: "Group B" }), group({ groupId: "grp_c", displayName: "Group C" }), group({ groupId: "grp_d", displayName: "Group D" })]) {
    repo.groups.set(g.groupId, g);
  }
  repo.aliases.set("ecity phase 1", { alias: "ecity phase 1", canonical: "Electronic City Phase 1" });
  const extractor = new StubExtractor();
  const geocoder = new FakeGeocoder();
  const resolver = new LocalityResolver(repo, geocoder);
  const deps: Harness = {
    repo,
    extractor,
    geocoder,
    resolver,
    clock: () => new Date("2026-09-14T10:01:00+05:30"),
    async send(msg) {
      const queue: string[] = [];
      await ingest(msg, repo, async (id) => void queue.push(id));
      if (queue.length === 0) throw new Error(`message ${msg.messageId} was not accepted by ingest`);
      return (await processMessage(queue[0]!, deps)).decision;
    },
  };
  return deps;
}

/** Steady-state thresholds (ramp-up off). */
export function steadyState(config: QualificationConfig = DEFAULT_CONFIG): QualificationConfig {
  const c = structuredClone(config);
  c.thresholds.rampUp.enabled = false;
  c.version = `${config.version}-steady`;
  return c;
}
