# WA-Intake — build decisions and PRD deviations

Decisions taken while implementing PRD v1.0 that Deepak, Suraj or RK should confirm. Each is isolated in code so reversing it is a small change.

## Confirmed by RK (14 Sep 2026)

- **D0 — Repo.** Standalone TypeScript repository (`wa-intake`); the existing Ionic/Firebase app is not in this workspace. Schema changes C1–C8 still need merging into the main app.
- **D1 — LLM.** Claude via the Anthropic API (PRD Q6). Default model `claude-opus-5`, effort `medium`, configurable with `WA_EXTRACTION_MODEL` / `WA_EXTRACTION_EFFORT`. Server-side refusal fallbacks (`fallbacks: "default"`) are on.
- **D2 — Ingestion today.** Attach a WhatsApp "Export chat" file in the console (compliant manual path from §7.3). The always-on read-only bridge is not built yet.

## Needs confirmation

| # | Decision | Why | Where |
|---|----------|-----|-------|
| D3 | Added commercial/industrial/agricultural property types (`office_space`, `shop`, `showroom`, `warehouse`, `factory`, `agricultural_land`, …). | §15.1 lists only residential types, but Appendix A.6 passes an office requirement, so G3 would otherwise reject every commercial requirement. Values must match the real app's dropdowns. | `src/config/qualificationConfig.ts` `propertyTypes` |
| D4 | `pg_coliving` and `farm_house` pass G6 without a BHK. | A PG requirement has no BHK; strict G6 would reject all of them. | `configByType` |
| D5 | **A.6 office candidate is rejected, not passed.** It states no budget, so G7 fails — the same rule the PRD applies to the plot candidate. | Applying G7 consistently. If commercial leases without a budget should pass, G7 needs a per-category exception. | `test/appendixA.test.ts` |
| D6 | A.6 plot ("plot 30x40 Kanakapura Road purchase") is classified residential, not agricultural. | A 30x40 site is a residential plot in Bengaluru usage. | prompt `prompts/v1.ts` |
| D7 | Rejections list **every** failing gate, not only the first (A.3 carries `SERVICE_TYPE_UNRESOLVED` and `BUDGET_MISSING`). | A rejection "can be argued with" only if all reasons are visible. | `qualify.ts runGates` |
| D8 | `extractionConfidence` averages only fields the message evidenced. | Otherwise a missing budget fails both G7 and G11 for the same cause. | `qualify.ts reconcile` |
| D9 | Lump-sum amounts (`budgetPeriod: total`, including residential lease deposits) use the buy/sale bands; monthly figures use rental bands. | Rental bands cannot express a ₹20L lease deposit. Buy bands themselves are still PRD Q2. | `mapRequirement.ts budgetBandFor` |
| D10 | An exact cross-post (L1 hash) of a message that produced a requirement becomes a **sighting**; an exact repeat of a rejected message is `DUPLICATE_EXACT`. | Satisfies both §9 (no LLM cost for duplicates) and A.7 (four groups → four sightings). | `prefilter.ts`, `processMessage.ts` |
| D11 | A sighting counts as "ends in requirements" for the §24 one-collection rule. | The message is recorded on the requirement's `sightings[]`. | acceptance test |
| D12 | G9 freshness = `receivedAt − sentAt`, not "now − sentAt". | Makes replays deterministic (§18 idempotency). For chat exports `receivedAt` is the import time, so old exports are correctly STALE. | `qualify.ts` G9 |
| D13 | Contact details are written to `requirements/{id}/private/contact`; the main document carries `contactMasked`. | Firestore rules cannot hide individual fields, so masking-until-assigned (§19.3) needs a sub-document. **New schema change (C9)** for the Ionic app. | `firestoreRepository.ts`, `firestore.rules` |
| D14 | New reason code `INTERNAL_SENDER` for staff numbers (§8.3). | Appendix C has no code for this skip. | `types.ts` |
| D15 | Extraction results are cached per (message, prompt version, model). | Replays and dry-runs over the archive cost nothing and are deterministic. | `wa_extractions` |

## Cost note (for RK)

At 300 messages/day with ~50% removed by the pre-filter, ≈4,500 model calls/month. With a cached ~5k-token system prompt, rough per-call cost: Opus 5 ≈ $0.025 (≈ ₹10,000/month), Sonnet 5 ≈ $0.011 (≈ ₹4,500/month), Haiku 4.5 ≈ $0.005 (≈ ₹2,000/month). The PRD budget is ₹4,000/month. The model is one environment variable; measure extraction accuracy on real messages before choosing.

## Known risks carried forward

- WhatsApp now hides many participants' phone numbers in groups (LIDs). Exports show saved-contact names instead of numbers. When neither the message body nor the sender gives a valid number, G8 rejects the message.
- Anthropic API calls leave GCP `asia-south1`; PRD §18 data residency needs RK's sign-off for that.
- The prompt's few-shot examples are illustrative. Replace them with 12–20 real, anonymised messages before go-live (Appendix D).
