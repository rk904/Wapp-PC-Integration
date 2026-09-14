---
name: WA-Intake Console
description: Property Care's WhatsApp requirement intake desk, drawn in the shipped propertycare.co.in visual language.
colors:
  green: "#05524a"
  green-tint: "#e6efee"
  green-wash: "#f2f7f6"
  yellow: "#ffd700"
  yellow-700: "#e6c200"
  on-yellow: "#000000"
  cream: "#fffacd"
  danger: "#ff5c41"
  danger-ink: "#b53a24"
  danger-tint: "#fff0ed"
  teal-ink: "#0a6f82"
  teal-tint: "#e5f3f6"
  amber-ink: "#7a5f00"
  amber-tint: "#fff5bf"
  waiting-grey: "#eceeef"
  ink: "#212529"
  ink-2: "#464c52"
  ink-3: "#676d73"
  line: "#e2e6e5"
  line-strong: "#cfd5d3"
  ground: "#f5f7f6"
  surface: "#ffffff"
  chat-ground: "#eef3f1"
typography:
  metric-lg:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1
    fontFeature: "tnum"
  metric:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif"
    fontSize: "1.625rem"
    fontWeight: 700
    lineHeight: 1.15
    fontFeature: "tnum"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif"
    fontSize: "1.1875rem"
    fontWeight: 700
    lineHeight: 1.25
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.5
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.5
  caption:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
  micro:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: "0.01em"
rounded:
  tail: "4px"
  xs: "6px"
  sm: "8px"
  card: "12px"
  pill: "25px"
  circle: "50%"
spacing:
  2xs: "4px"
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  gutter: "24px"
  rail: "72px"
components:
  button-primary:
    backgroundColor: "{colors.yellow}"
    textColor: "{colors.on-yellow}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.yellow-700}"
  button-primary-disabled:
    backgroundColor: "#efe7b0"
    textColor: "rgba(0, 0, 0, 0.45)"
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.green}"
    rounded: "{rounded.pill}"
    padding: "0 18px"
    height: "40px"
  button-outline-hover:
    backgroundColor: "{colors.green-wash}"
  button-text-danger:
    backgroundColor: "transparent"
    textColor: "{colors.danger-ink}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "40px"
  button-text-danger-hover:
    backgroundColor: "{colors.danger-tint}"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.green}"
    rounded: "{rounded.circle}"
    size: "44px"
  icon-button-hover:
    backgroundColor: "{colors.green-wash}"
  search-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 18px"
    height: "44px"
  text-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "40px"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "34px"
  chip-selected:
    backgroundColor: "{colors.green}"
    textColor: "{colors.surface}"
  chip-sm:
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "30px"
  pill-filled:
    backgroundColor: "{colors.green}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "32px"
  pill-filled-inferred:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.teal-ink}"
  rail-button:
    backgroundColor: "transparent"
    textColor: "{colors.green}"
    rounded: "{rounded.card}"
    size: "44px"
  rail-button-active:
    backgroundColor: "{colors.green}"
    textColor: "{colors.surface}"
  rail-count:
    backgroundColor: "{colors.yellow}"
    textColor: "{colors.on-yellow}"
    typography: "{typography.micro}"
    height: "18px"
  breadcrumb-bar:
    backgroundColor: "{colors.cream}"
    textColor: "{colors.ink}"
    padding: "8px 24px"
    height: "40px"
  ribbon-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "16px 20px 14px"
  chat-pane:
    backgroundColor: "{colors.chat-ground}"
    rounded: "{rounded.card}"
    padding: "8px 14px 18px"
  detail-pane:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
  bubble:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    padding: "9px 12px 8px"
  stamp-live:
    backgroundColor: "{colors.green}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    padding: "0 9px"
    height: "22px"
  stamp-review:
    backgroundColor: "{colors.yellow}"
    textColor: "{colors.on-yellow}"
  stamp-sighting:
    backgroundColor: "{colors.teal-tint}"
    textColor: "{colors.teal-ink}"
  stamp-rejected:
    backgroundColor: "{colors.danger-tint}"
    textColor: "{colors.danger-ink}"
  stamp-awaiting:
    backgroundColor: "{colors.waiting-grey}"
    textColor: "{colors.ink-2}"
  prov-extracted:
    backgroundColor: "{colors.green-tint}"
    textColor: "{colors.green}"
    typography: "{typography.micro}"
    padding: "0 7px"
    height: "20px"
  prov-inferred:
    backgroundColor: "{colors.teal-tint}"
    textColor: "{colors.teal-ink}"
  prov-defaulted:
    backgroundColor: "{colors.amber-tint}"
    textColor: "{colors.amber-ink}"
  requirement-head-live:
    backgroundColor: "{colors.green}"
    textColor: "{colors.surface}"
    padding: "11px 20px"
  requirement-head-review:
    backgroundColor: "{colors.cream}"
    textColor: "{colors.ink}"
  requirement-head-sighting:
    backgroundColor: "{colors.teal-tint}"
    textColor: "{colors.teal-ink}"
  requirement-head-waiting:
    backgroundColor: "{colors.waiting-grey}"
    textColor: "{colors.ink}"
  group-item-selected:
    backgroundColor: "{colors.green}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "5px 8px"
  score-panel:
    backgroundColor: "{colors.green-wash}"
    rounded: "{rounded.card}"
    padding: "14px 16px"
  note:
    backgroundColor: "{colors.cream}"
    textColor: "{colors.ink}"
    padding: "12px 14px"
  actionbar:
    backgroundColor: "{colors.surface}"
    padding: "12px 18px"
---

# Design System: WA-Intake Console

## Overview

**Creative North Star: "The Property Care Back Office"**

This is Property Care's own shipped app turned inward: the same white cards on a faint green-grey ground, the same deep green for anything chosen, the same yellow pill for the one thing to do next, the same pale yellow breadcrumb bar. Nothing here is a new identity. A desk worker who uses the Post Requirement form should feel the console is the back room of the same building.

The world is dense and operational, not editorial. Hierarchy is carried by weight and colour inside a single system sans, not by a display face; the largest type on screen is a count, not a headline. Surfaces are flat and bordered, with one soft resting shadow for the summary card and lifts reserved for things you can pick up (a hovered message, the primary pill). Colour is semantic before it is decorative: every outcome, every provenance, every warning has a fixed hue and a tint to sit on.

The signature texture is WhatsApp's own: a green-grey chat ground, white message bubbles with a squared top-left "tail" corner, rounded outcome stamps. The Property Care chrome frames it; the chat material fills it.

**Key Characteristics:**
- Brand-bound palette: Property Care green, action yellow, breadcrumb cream, red-orange danger.
- One system sans stack, sentence case, hierarchy by weight (400/500/600/700) and tabular numerals.
- Pills for every control and status; 12px cards for containers; a 4px tail corner on anything that quotes a message.
- Flat, bordered panels; shadows only on the summary card, the primary pill, and hovered or selected bubbles.
- Fixed outcome colour code: green Live, yellow Needs review, teal Seen again, red-orange Rejected, grey Waiting.
- Line-drawn inline SVG icons (24px grid, 1.8 stroke, round caps).

## Colors

A green-and-yellow brand palette over cool, faintly green neutrals, with a small set of ink/tint pairs that carry meaning.

### Primary
- **Property Care Green** (`green`): the brand colour and the colour of choice. Filled on the active rail item, pressed filter chips, the selected group row, filled requirement pills, the Live stamp and the live requirement header band. Also the title colour in the top bar, sender names in bubbles, the breadcrumb's current step, icon strokes, focus outlines and data bars.
- **Green Tint** (`green-tint`): quiet green field behind the city code in the rail and the "From message" provenance tag.
- **Green Wash** (`green-wash`): hover field for every transparent green control (rail buttons, icon buttons, outline buttons, group rows), the score panel ground and the drag-over state of the attach area.

### Secondary
- **Action Yellow** (`yellow`): the primary pill button fill, the Needs review stamp, the rail's review counter, the fill of a selected group's bar, and the "hot" highlight on a message phrase when its field is hovered. Text on it is always black (`on-yellow`, 14.97:1).
- **Pressed Yellow** (`yellow-700`): hover and expanded state of the primary pill; also the review dot in filter chips.
- **Breadcrumb Cream** (`cream`): the full-width breadcrumb bar under the top bar, the review requirement header band, the hover row in the field ledger, and informational notes.

### Tertiary (semantic pairs)
- **Brand Red-Orange** (`danger`): the rejected dot only. It is a signal swatch, never text (3.06:1 on white).
- **Danger Ink / Danger Tint** (`danger-ink` on `danger-tint`, 5.27:1): Rejected stamp, rejection reason text, reason-code chips, the Reject and Take down text buttons and their hover field, error status lines.
- **Teal Ink / Teal Tint** (`teal-ink` on `teal-tint`, 5.12:1): the Seen again (sighting) outcome and the "Inferred" provenance: inferred tags, inferred pill outline, inferred phrase underline.
- **Amber Ink / Amber Tint** (`amber-ink` on `amber-tint`, 5.50:1): the "Default" provenance, the demo-data tag and label, extra-locality notes and note icons.
- **Waiting Grey** (`waiting-grey`): the Waiting for AI stamp and header band.

### Neutral
- **Ink** (`ink`): primary text.
- **Ink 2** (`ink-2`): secondary text, section titles, field-group labels, breadcrumb separators.
- **Ink 3** (`ink-3`): tertiary text: timestamps, captions, field labels, placeholders, meta (5.23:1 on white, 4.67:1 on chat ground).
- **Line** (`line`): 1px hairlines between regions, ledger rows and panel borders.
- **Line Strong** (`line-strong`): input and chip outlines, the dashed attach border, funnel arrows, scrollbar thumbs.
- **Ground** (`ground`): the page behind everything.
- **Surface** (`surface`): cards, top bar, rail, bubbles, detail pane.
- **Chat Ground** (`chat-ground`): the message pane and the quoted-message block, the WhatsApp-like field bubbles sit on.

### Named Rules
**The Green Means Chosen Rule.** A filled green shape always means selected, active or live. Unselected controls are outlined or transparent with green ink; they turn solid green only when pressed or current.

**The Yellow Is a Signal Rule.** Action Yellow fills small shapes only: a pill button, a stamp, a counter, a highlight. Large yellow fields use Breadcrumb Cream instead.

**The Fixed Outcome Code Rule.** Live is green, Needs review is yellow, Seen again is teal, Rejected is red-orange, Waiting is grey, everywhere: stamps, chip dots, header bands. Provenance reuses the same inks: extracted green, inferred teal, defaulted amber.

## Typography

**Display Font:** none (the system sans below carries every role)
**Body Font:** -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif
**Label/Mono Font:** same stack; numerals use `font-variant-numeric: tabular-nums`

**Character:** Property Care's Bootstrap system stack, bound by the brand. It reads as a native tool rather than a branded page, which suits a desk that is used all day.

### Hierarchy
- **Metric Large** (700, 2rem, 1): the quality score number in the requirement card.
- **Metric** (700, 1.625rem, 1.15, tabular): funnel stage counts. Steps down to 1.375rem at 960px and 1.25rem at 560px.
- **Headline** (700, 1.1875rem, 1.25, green): the console title in the top bar; 1.0625rem on phones.
- **Title** (700, 1rem): the sender name heading the detail pane, empty-state headings. Requirement header bands use 600 at 0.9375rem.
- **Body** (400, 0.9375rem, 1.5): base text, quoted messages (1.55), reason sentences.
- **Body Small** (400–600, 0.875rem, 1.45): bubble message text (clamped to 5 lines until selected), field values (500), buttons (600), search input.
- **Label** (600, 0.8125rem): chip text (500), field-group labels, stage labels (400), section titles (700), group names.
- **Caption** (400–600, 0.75rem): timestamps, bubble footers, day separators (600), tags (600), legends.
- **Micro** (700, 0.6875rem, 0.01em): provenance tags, stamps (0.71875rem), rail counter, funnel conversion rates (600).

### Named Rules
**The One Family Rule.** One system sans, no second face. Hierarchy comes from weight and size steps between 0.6875rem and 2rem.

**The Tabular Numbers Rule.** Every count, time, score, percentage and coordinate sets `tabular-nums` so columns of numbers stay still as they update.

**The Sentence Case Rule.** Labels, buttons, stamps and headings are sentence case with at most 0.02em tracking. The only capitals are the literal city code (BLR).

## Layout

A full-viewport application grid: a 72px icon rail on the left, then a stack of top bar (min 68px), breadcrumb bar (min 40px), collapsible attach region, summary ribbon, and a mirror split that fills the remaining height. The mirror is two independently scrolling panes, the chat at 42fr (min 340px) and the detail at 58fr, 16px apart.

Gutters are 24px on desktop and 16px below 960px. Inside cards, padding runs 14–22px; component gaps step through 4, 6, 8, 10, 12, 16 and 18px, with 8px as the most common chip and control gap. The rhythm is dense but not tight: rows in the field ledger sit at 9px vertical padding with a hairline between them.

The summary ribbon is a two-column grid inside one card: the funnel and filter chips (flexible) beside a 300–380px group-quality panel separated by a 1px line.

Responsive behaviour:
- **≤1180px:** the group panel drops below the funnel and lays its rows out in auto-fill 260px columns; the top bar subtitle hides; the attach area wraps to two columns.
- **≤960px:** the rail hides and the logo moves into the top bar; search wraps to a full-width row; the page scrolls as one column; the detail pane becomes a full-screen sheet with a back button, entering with a fade and a scale from 0.985.
- **≤560px:** the funnel becomes a three-column grid with arrows and rates hidden; reason chips scroll horizontally under a right-edge fade mask; the primary pill shortens to "Attach"; the refresh button and action-bar message hide.

## Elevation & Depth

Hybrid, mostly flat. The page ground, rail, top bar and breadcrumb bar are flat colour fields divided by 1px lines. The chat and detail panes are bordered (1px `line`), not shadowed. Only three things rest above the ground: the summary ribbon card (soft two-layer ambient shadow), the primary yellow pill (a small dark drop), and message bubbles (a 1.5px contact shadow, the WhatsApp paper feel). Depth increases on interaction: bubbles lift on hover, and the selected bubble adds a green border and a 3px green halo. All shadow colour is tinted toward the brand green-black (rgba 16, 40, 36), except on the yellow pill, which uses neutral black.

### Shadow Vocabulary
- **Card rest** (`box-shadow: 0 2px 4px rgba(16, 40, 36, 0.06), 0 8px 24px rgba(16, 40, 36, 0.06)`): the summary ribbon card.
- **Pop** (`box-shadow: 0 6px 16px rgba(16, 40, 36, 0.12)`): hovered and selected bubbles.
- **Bubble contact** (`box-shadow: 0 1px 1.5px rgba(16, 40, 36, 0.12)`): resting message bubble; day separators use `0 1px 2px rgba(16, 40, 36, 0.08)`.
- **Primary pill** (`box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1)`, hover `0 4px 10px rgba(0, 0, 0, 0.12)`): the yellow button only.
- **Focus halo** (`box-shadow: 0 0 0 3px rgba(5, 82, 74, 0.12)`): focused search and text fields, selected bubble.

### Named Rules
**The Border Before Shadow Rule.** Panels and regions separate with 1px lines. A resting shadow is allowed on the one summary card and on bubbles; everything else lifts only in response to hover, selection or focus.

## Shapes

Two shapes do almost all the work: the pill (25px, effectively fully round at 30–44px control heights) for every button, chip, input, stamp, tag and filled value, and the 12px rounded rectangle for every container: ribbon card, chat pane, detail pane, attach drop area, score panel, bubble, rail button. Small tags use half their height as radius (22px tall at 11px, 20px at 10px).

Message material carries a signature asymmetric corner: bubbles and the quoted-message block round three corners at 12px and square the top-left to 4px, the WhatsApp tail. Secondary rounding is 8px (group rows, day separators, system notes), 6px (logo, city code, focus outline, ledger row hover) and 3–4px on data bars. Icon buttons are circles. The attach area alone uses a 1.5px dashed border.

## Components

### Buttons
Confident and few: one yellow pill per region, everything else in green ink.
- **Shape:** full pill (25px); 44px tall in the top bar and action bar, 40px below 960px.
- **Primary:** Action Yellow with black 600 text, 20px side padding, optional leading 20px icon at 8px gap, primary pill shadow. Used for "Attach WhatsApp export" and "Approve and publish".
- **Hover / Focus / Active:** hover to Pressed Yellow with a larger shadow (180ms); press nudges down 1px (120ms); expanded state holds Pressed Yellow; disabled fades to a pale yellow with 45% black text and no shadow. Focus uses the global 2px green outline at 2px offset.
- **Outline:** white with a 1px green border and green 600 text, 40px tall; hover fills Green Wash. Used for "Choose file", "Clear filters", "Try again", "Open the captured requirement".
- **Text danger:** transparent, Danger Ink 600 text, 40px tall; hover fills Danger Tint. Used for Reject and Take down, always to the left of the primary pill.
- **Icon button:** 44px circle (36px in the detail nav), green icon, Green Wash hover; the refresh icon spins at 700ms while loading.

### Chips
- **Style:** 34px outlined pill, white with a 1px Line Strong border, ink 500 text at 0.8125rem, an optional 8px outcome dot and a bold tabular count. Small variant is 30px at 0.78125rem (reason filters, requirement tabs).
- **State:** hover turns the border green; pressed fills solid green with white text and rings the dot in white. A text-link chip ("+12 more") is borderless green 600 with an underline on hover.

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** Surface for the ribbon and detail pane; Chat Ground for the message pane; Green Wash for the score panel; Cream for notes.
- **Shadow Strategy:** only the ribbon card rests on a shadow (Card rest); panes are bordered. See Elevation & Depth.
- **Border:** 1px `line` on panes; 1.5px dashed `line-strong` on the attach area (green on drag-over).
- **Internal Padding:** 14–22px; detail body 18px 20px 24px with 18px between blocks.

### Inputs / Fields
- **Style:** white pill with a 1px Line Strong border. Search is 44px tall with a leading icon, max 560px wide; form fields are 40px with a 600 label above and an unweighted "optional" hint.
- **Focus:** border turns green and gains the 3px green focus halo (180ms).
- **Error / Status:** status lines below at 0.8125rem, Danger Ink 600 for errors, green 600 for success.

### Navigation
- **Rail:** 72px white column with a right hairline; the real Property Care logo at 40px, a green-tint city code tag, then 44px icon buttons with 12px corners, 6px apart. Hover fills Green Wash; the current section fills solid green with a white icon (no transition). A yellow counter badge (18px, black 700 micro text) sits on the review item and hides when empty. Settings is pinned to the bottom.
- **Top bar:** white, 68px, title in green headline weight with an ink-3 subtitle, search centred-right, then icon button and primary pill.
- **Breadcrumb bar:** full-width Cream strip, "Home - Intake - Today" with hyphen separators and the current step in green 600; quiet status tags (demo data in amber ink with a yellow border, engine version on translucent white) pushed to the right.
- **Mobile:** rail removed; logo at 34px leads the top bar; search takes its own row.

### Outcome Stamp (signature)
A 22px pill with a 13px stroke icon (2.4 stroke) and a 700 micro label: Live (green/white), Needs review (yellow/black), Seen again (teal tint/teal ink), Rejected (danger tint/danger ink), Waiting (grey/ink 2). When a message's outcome changes it plays a 520ms stamp flip (scale 0.7 and a -6° tilt, overshoot to 1.12, settle). Colour changes ease over 300ms.

### Message Bubble (signature)
White on Chat Ground, full width to 96%, 4px/12px tail corners, bubble contact shadow, 1.5px transparent border. Header: sender in green 700 label, group in ink-3 caption, stamp right-aligned. Text at body-small clamps to five lines. Footer: score or reason (reason in Danger Ink 600) and a right-aligned tabular time. Media-only messages show an italic ink-3 line with a media icon. Hover adds the Pop shadow; selected adds a green border, the green focus halo and unclamps the text. Dimmed (non-requirement) bubbles sit on #fbfcfb with ink-2 text. Day separators are centred white caption pills; group notices are centred grey-blue system notes.

### Requirement Card (signature)
The Post Requirement form mirrored. A full-bleed header band states the outcome in words with the stamp at the right: green band for Live, Cream band with a pale yellow hairline for Needs review, teal tint for Seen again, a deeper danger tint for Rejected, grey for Waiting. Below it: filled green pills for chosen form options (inferred ones become white with a 1.5px teal inset outline), then a two-column field ledger (label column 34%, min 120px) with hairline rows. Each value carries a provenance tag (From message green, Inferred teal, Default amber). Hovering or focusing a row fills it Cream, turns the value green and lights the source words in the message: those words are dotted-underlined in green (teal if inferred) and switch to a yellow highlight while hot.

### Score Panel and Data Bars
A Green Wash 12px panel with the score as Metric Large green numerals over a small "/ 100" in ink-3, a sentence of explanation, and a breakdown grid of 8px rounded bars (green fill on a pale green track) with right-aligned tabular points. Group quality rows use the same bar language at 6px; a selected group row turns solid green and its bar fill turns yellow.

### Funnel Ribbon
Horizontal stages of Metric counts over ink-2 labels, joined by pale chevrons with a micro conversion rate beneath each. The live stage count is green; a count that changes on refresh bumps up 4px from 40% opacity over 420ms.

### Action Bar
A white sticky footer to the detail pane with a top hairline, 12px 18px padding: an explanatory ink-2 message on the left ("Consultants cannot see this yet."), then Reject as a text danger button and the yellow primary pill on the right. Failures rewrite the message in Danger Ink.

### Loading and Empty
Skeleton bubbles are 12px blocks with a 1.2s linear shimmer between #e6ecea and #f2f6f4. Empty and error states centre a 36px green icon, a 1rem ink heading, a 42ch ink-2 sentence and an outline button.

### Motion
One easing curve, `cubic-bezier(0.16, 1, 0.3, 1)` (fast out, long settle), across the system. Durations: 120ms press, 160ms bubble and row hover, 180ms control colour and focus, 220ms mobile detail sheet, 300ms stamp and count colour, 420ms count bump, 520ms stamp flip. Under `prefers-reduced-motion` every animation and transition collapses to 1ms.

## Do's and Don'ts

### Do:
- **Do** use Property Care Green (`#05524a`) as the fill for anything selected, current or live, and as the ink for unselected controls.
- **Do** give each region at most one Action Yellow (`#ffd700`) pill with black text, and pair a destructive choice with it as a Danger Ink text button to its left.
- **Do** put every control, chip, stamp and tag in a pill (25px) and every container in a 12px rectangle; square the top-left corner to 4px on anything that shows a WhatsApp message.
- **Do** keep outcome colours fixed: green Live, yellow Needs review, teal Seen again, red-orange Rejected, grey Waiting.
- **Do** show provenance beside extracted values with the three tags: From message (green tint), Inferred (teal tint), Default (amber tint).
- **Do** set counts, times, scores and percentages in tabular numerals.
- **Do** separate panels with 1px `#e2e6e5` lines and reserve shadows for the summary card, bubbles and the primary pill.
- **Do** use the real Property Care logo files, and label any synthetic data with the amber "Demo data · synthetic" tag.
- **Do** draw icons as inline 24px-grid line SVGs at 1.8 stroke with round caps, inheriting `currentColor`.
- **Do** honour `prefers-reduced-motion` by collapsing all motion.

### Don't:
- **Don't** fill large areas with Action Yellow; use Breadcrumb Cream (`#fffacd`) for yellow bands and notes.
- **Don't** use Brand Red-Orange (`#ff5c41`) for text; it fails contrast on white. Use Danger Ink (`#b53a24`).
- **Don't** introduce a second typeface or a web display font; the brand binds the system sans stack.
- **Don't** uppercase or letter-space labels, buttons or stamps.
- **Don't** redraw, recolour or restyle the Property Care logo.
- **Don't** use icon fonts, emoji or text glyphs as icons.
- **Don't** add hard offset shadows or ungreened neutral-grey shadows outside the yellow pill.
- **Don't** use the teal, amber or danger ink/tint pairs as category or decorative colours; they are reserved for outcome, provenance and caution meanings.
