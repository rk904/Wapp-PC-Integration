import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { PROMPT_VERSION, SYSTEM_PROMPT } from "./prompts/v1.js";
import {
  ExtractionError,
  ExtractionSchema,
  sanitizeExtraction,
  type ExtractionInput,
  type ExtractionResult,
  type Extractor,
} from "./schema.js";

export interface ClaudeExtractorOptions {
  /** Defaults to env WA_EXTRACTION_MODEL, else claude-opus-5. */
  model?: string;
  /** Defaults to env WA_EXTRACTION_EFFORT, else "medium". */
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  client?: Anthropic;
  /** Schema-invalid responses are retried this many times before EXTRACTION_FAILED (§10.2: once). */
  schemaRetries?: number;
}

/**
 * Stage 3 — classification and extraction with Claude (§10).
 *
 * - Structured outputs guarantee the response matches ExtractionSchema.
 * - The system prompt is a frozen, versioned prefix cached for 1 hour, so
 *   steady-state calls pay cache-read rates for it.
 * - Server-side refusal fallbacks are enabled ("default").
 * - Transport retries (429 / 5xx / network) are handled by the SDK (maxRetries).
 */
export class ClaudeExtractor implements Extractor {
  readonly model: string;
  readonly promptVersion = PROMPT_VERSION;
  private readonly effort: NonNullable<ClaudeExtractorOptions["effort"]>;
  private readonly client: Anthropic;
  private readonly schemaRetries: number;

  constructor(opts: ClaudeExtractorOptions = {}) {
    this.model = opts.model ?? process.env.WA_EXTRACTION_MODEL ?? "claude-opus-5";
    this.effort = opts.effort ?? (process.env.WA_EXTRACTION_EFFORT as ClaudeExtractorOptions["effort"]) ?? "medium";
    this.client = opts.client ?? new Anthropic({ maxRetries: 3, timeout: 120_000 });
    this.schemaRetries = opts.schemaRetries ?? 1;
  }

  async extract(input: ExtractionInput): Promise<ExtractionResult> {
    let lastProblem = "unknown";
    for (let attempt = 0; attempt <= this.schemaRetries; attempt++) {
      const response = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: this.effort, format: betaZodOutputFormat(ExtractionSchema) },
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral", ttl: "1h" } }],
        messages: [{ role: "user", content: renderUserTurn(input) }],
      });

      if (response.stop_reason === "refusal") {
        lastProblem = `model refused (${response.stop_details?.category ?? "no category"})`;
        break; // fallbacks already ran server-side; retrying the same request will not help
      }
      if (response.stop_reason === "max_tokens") {
        lastProblem = "response truncated at max_tokens";
        continue;
      }
      if (response.parsed_output) return sanitizeExtraction(response.parsed_output);
      lastProblem = "response did not validate against the extraction schema";
    }
    throw new ExtractionError("EXTRACTION_FAILED", `Extraction failed for ${input.messageId}: ${lastProblem}.`);
  }
}

/** Per-message context lives in the user turn so the system prompt stays a stable cache prefix. */
function renderUserTurn(input: ExtractionInput): string {
  return [
    `Group: ${input.groupName}`,
    `Group default city: ${input.groupDefaultCity}`,
    `Group usually carries: ${input.groupExpectedContent}`,
    `Posted on (IST): ${input.sentAtIst}`,
    "",
    "Message:",
    "<<<",
    input.text,
    ">>>",
  ].join("\n");
}
