# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated (the stack question was answered with a feature request instead): plain HTML, CSS and JavaScript with no build step, served by a small Node server inside this repository (`wa-intake`). Chosen so the console runs with the engine today and can be ported into the existing Ionic admin app later. Deploy target not decided.

## Users

- **RK (Radhakrishnan Kalimuthu), founder.** Opens the console once or twice a day to confirm nothing was missed: how many WhatsApp group messages were read, how many became live requirements, how many were rejected and why, and which groups are worth staying in. Changes qualifying criteria without a developer.
- **Requirement desk / ops (Leela).** Works the console several times a day: clears the pending-review queue (approve, edit, reject), audits rejections and overturns wrong ones, and keeps the locality alias worklist short.
- Consultants and Growth Partners never see this console; they consume the resulting requirements inside the Property Care app.

## Product Purpose

WA-Intake reads every message in Property Care's monitored Bengaluru real-estate WhatsApp groups (200–300 a day), decides by explicit rules whether each is a genuine property requirement, extracts it into the exact shape of the Post Requirement form, geocodes the localities, and writes it to Firestore. Every rejected message is kept with a machine-readable reason. Success: 200+ qualified requirements a month, under 60 seconds from group post to live requirement, false-pass rate at or under 3%, and manual data entry under 10 minutes a day.

## Positioning

Turns the noise of fragmented realtor WhatsApp groups into Property Care's system of record: one requirement posted in five groups becomes one record with five sightings, every decision is explainable (reason codes, score breakdown, the exact words each field came from), and the pass/fail decision is made by deterministic, versioned rules, never by the model.

## Operating Context

- Ingestion today: an exported WhatsApp chat (.txt or .zip from "Export chat") attached in the console. Planned: an always-on read-only bridge on a secondary Property Care number.
- Pipeline stages: ingest → deterministic pre-filter → Claude classification and extraction → locality resolution (alias table, geocode cache, Google Places) → qualification (11 hard gates + 100-point score) → three-layer dedupe → Firestore write.
- Outcomes per message: accepted and live (`active`), accepted but held for human review (`pending_review`), sighting of an existing requirement, or rejected (`FAILED` with reason codes).
- Ramp-up rule: for the first four weeks nearly everything goes through human review.
- Daily 9:00 AM IST digest to RK; weekly review of pass rate by group, false-pass/false-fail audit, unresolved localities.

## Capabilities and Constraints

- Serviced cities: Bengaluru, Hosur, Coimbatore. Requirements only in v1 (listings are archived for v2). No outbound WhatsApp messages, ever.
- Contacts harvested from groups are personal data under India's DPDP Act 2023: purpose-limited, never pushed to GoHighLevel campaigns, masked for consultants until assigned, erasable on request.
- Terminology: requirement, sighting, reason code, quality score, extraction confidence, pending review, overturn, alias table, config version.
- Undecided: buy/sale budget bands (Q2), review-queue owner (Q4), auto-notify consultants (Q5), requirement shelf life (Q7).

## Brand Commitments

- Property Care visual language as shipped on propertycare.co.in and the Post Requirement form, binding per RK ("use same for controls, colour codes and everything"): primary green `#05524A`, yellow `#FBDB00` (buttons render `#FFD700`), pale yellow breadcrumb bar `#FFFACD`, white cards, pill chips (selected = filled green, unselected = outlined), yellow pill primary buttons, red-orange reset/danger `#FF5C41`, left icon rail, system UI font stack (Bootstrap), Roboto available.
- Use the real Property Care logo (`../Logo High Resolution.png`, `../LOGO Brand colour.jpeg`); never an AI-redrawn variant.
- Brand lines: "REAL ESTATE. REIMAGINED." / "One Platform. Endless Opportunities."

## Evidence on Hand

- PRD: `../WhatsApp Requirement Intake Engine — PRD v1.0.docx`; business context: `../Chatgpt Property_Care_Master_Business_Handoff_Sep_2026.docx`.
- Post Requirement UI screenshots: `../Reqmt ui screenshot.docx`.
- No real WhatsApp group messages are in the repository yet. Any sample messages, groups, counts or charts shown before real exports are attached are synthetic and must be labelled as demo data. Do not invent metrics, accuracy figures or customer names.

## Product Principles

1. Nothing is silently discarded: every message has a visible outcome and a reason a human can argue with.
2. Show the evidence, not just the verdict: original message beside extracted fields, with provenance (extracted, inferred, defaulted).
3. The founder changes rules, not code: criteria, thresholds and aliases are configuration with dry-run before commit.
4. The desk's time is the scarce resource: short queues, one-click decisions, the riskiest records first.
5. Privacy by default: contact numbers masked unless the task needs them.
