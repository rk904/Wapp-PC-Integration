# WA-Intake — WhatsApp Requirement Intake Engine

Reads Property Care's real-estate WhatsApp groups, decides by explicit rules which messages are genuine property requirements, extracts them into the Post Requirement form shape, geocodes the localities and writes them to Firestore. Every rejected message is kept with a reason code.

Built against *WhatsApp Requirement Intake Engine — PRD v1.0* (12 Sep 2026). Deviations and open decisions: [DECISIONS.md](DECISIONS.md).

## Run the console

```bash
npm install
npm run console
```

Open http://localhost:4400. The console starts with a **synthetic demo day** (43 invented messages across 5 invented groups), decided by the real engine. To read real groups, click **Attach WhatsApp export** and attach a chat exported from WhatsApp (group → ⋮ → More → Export chat → Without media; `.txt` or `.zip`). Re-attaching the same export never creates duplicates.

| Environment variable | Effect |
|---|---|
| `ANTHROPIC_API_KEY` | Enables Claude extraction for attached exports. Without it, messages that pass the pre-filter wait as "Awaiting AI". |
| `WA_EXTRACTION_MODEL` | Model id, default `claude-opus-5` (see cost note in DECISIONS.md). |
| `WA_EXTRACTION_EFFORT` | `low` / `medium` (default) / `high`. |
| `GOOGLE_MAPS_API_KEY` | Uses Google Places for localities. Without it, an offline demo table covers ~20 Bengaluru localities. |
| `WA_CONSOLE_DEMO=0` | Start without the demo day. |
| `PORT` | Console port, default 4400. |

The console keeps data in memory; restarting it clears attached exports. Firestore wiring for the console is the next step (`src/store/firestoreRepository.ts` is ready).

## Test

```bash
npm test          # 43 tests: PRD Appendix A examples, §24 acceptance criteria, pre-filter, parsers, export adapter
npm run typecheck
```

## Layout

```
src/
  types.ts                     InboundMessage, requirement / rejection records, reason codes
  config/qualificationConfig.ts  versioned gates, weights, thresholds, bands (qualification_config)
  ingest/whatsappExport.ts     adapter for WhatsApp "Export chat" files
  pipeline/
    ingest.ts                  stage 1: validate, archive idempotently, publish
    prefilter.ts               stage 2: deterministic pre-filter (no model cost)
    processMessage.ts          stages 2–7 orchestrator, dedupe L1–L3, decision builder
    qualify.ts                 stage 5: hard gates G1–G11, 100-point score, thresholds
    mapRequirement.ts          §15 field mapping, budget bands, fingerprint
    dryRun.ts                  replay archive against a draft config, flip list, no writes
  extraction/
    schema.ts                  extraction contract (zod, structured outputs)
    prompts/v1.ts              versioned extraction prompt (cached prefix)
    claudeExtractor.ts         Claude call: structured outputs, prompt caching, refusal fallbacks
  geo/                         alias → cache → Google Places resolver, service-area check
  store/                       Repository interface, MemoryRepository, FirestoreRepository
  console/consoleService.ts    read model + actions behind the console
  demo/                        synthetic demo day and offline geocoder (demo only)
dashboard/
  server.ts                    plain Node http server for the console
  public/                      console UI (HTML/CSS/JS, Property Care visual language)
firestore/                     security rules (§19.3) and composite indexes (§16.4)
```

## Verification status

- Engine: 43 automated tests pass. Claude and Google Places have **not** been called against the live APIs from this repository yet (no keys configured); run `npm run console` with keys and attach a real export to measure extraction accuracy (§3.2 target ≥ 92%).
- Firestore repository and security rules typecheck but are **not yet verified against the emulator** (Java was unavailable). Required before go-live: rules tests proving consultants cannot read `pending_review` requirements or unassigned contacts (§24).
- Not built yet: the always-on WhatsApp bridge (§7.3), Cloud Run / Pub/Sub deployment, n8n alerts and daily digest, the criteria tuning screen, rejection overturn action.
