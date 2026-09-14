---
version: 1
slug: "dashboard-public-index-html"
primary_target: "dashboard/public/index.html"
related_targets: []
---

# WA-Intake console

Scope: the WA-Intake operations console (`dashboard/public`). Visitor mode: Operate.

Audience and task: RK checks the day (read, accepted, rejected, why, which groups); Leela clears pending review and audits rejections several times a day. Attach a WhatsApp chat export to feed messages in.

Content and constraints: real pipeline output from `/api/snapshot`; demo data must stay labelled synthetic; contact numbers masked; Property Care visual language from propertycare.co.in is binding (green #05524A, yellow pill buttons, #FFFACD breadcrumb bar, pill chips, left icon rail, system sans).

Chosen structure: WhatsApp → Form Mirror (locked on the decision page, code-led).

Unresolved: Firestore data source wiring; overturn action on rejections; config tuning screen.

## Direction contract

THESIS: The console shows the transformation itself — a WhatsApp message on the left becoming a Post Requirement card on the right — instead of the category's KPI-card grid with charts.

OWN-WORLD: Property Care's shipped app: white surfaces on a faint grey ground, green #05524A for selection and filled chips, yellow #FFD700 pill for the one primary action, #FFFACD breadcrumb bar, outlined pill chips, left icon rail, system sans. Outcome stamps: green Live, yellow Review, teal Seen again, red-orange Rejected.

STORY: RK sees the day's funnel in one ribbon; either user filters the chat by outcome or group, selects a message, reads what WA-Intake extracted and why (provenance, score, reason), and approves or rejects.

FIRST VIEWPORT: Top bar + breadcrumb; funnel ribbon with outcome filter chips across the top; left 42% chat pane of message bubbles with outcome stamps; right 58% the selected message's Post Requirement card with provenance marks and a sticky Approve / Reject bar; Attach export as the yellow pill in the top bar.

FORM: Mirror split, position 4 of 7 on the ordered list; seed key ccf8af32.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
