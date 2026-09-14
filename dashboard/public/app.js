// WA-Intake console — WhatsApp → Post Requirement mirror.
// All message text is untrusted: it is only ever written with textContent.

const REASONS = {
  TOO_SHORT: "Too short",
  MEDIA_ONLY: "Media, no text",
  CHATTER: "Greeting or chatter",
  SYSTEM_NOTICE: "Group notice",
  BLOCKED_SENDER: "Blocked sender",
  NO_RE_SIGNAL: "Not real estate",
  DUPLICATE_EXACT: "Exact repeat",
  NOT_A_REQUIREMENT: "Not a requirement",
  IS_PROPERTY_LISTING: "Property listing",
  SPAM_PROMO: "Service advert",
  EXTRACTION_FAILED: "AI could not read it",
  LOW_CONFIDENCE: "Unclear message",
  LANGUAGE_UNSUPPORTED: "Language not supported",
  CATEGORY_UNRESOLVED: "Category unclear",
  TYPE_UNRESOLVED: "Property type unclear",
  SERVICE_TYPE_UNRESOLVED: "Rent, lease or buy unclear",
  LOCALITY_UNRESOLVED: "Locality not found",
  OUT_OF_SERVICE_AREA: "Outside service cities",
  CONFIG_MISSING: "No BHK or area",
  BUDGET_MISSING: "No budget",
  NO_CONTACT: "No contact number",
  INVALID_PHONE: "Invalid contact number",
  STALE_MESSAGE: "Older than 72 hours",
  DUPLICATE: "Duplicate of a rejected one",
  BELOW_QUALITY_THRESHOLD: "Quality score too low",
  INTERNAL_SENDER: "Property Care staff",
};

const OUTCOMES = {
  live: { label: "Live", icon: "i-live" },
  review: { label: "Needs review", icon: "i-review" },
  sighting: { label: "Seen again", icon: "i-layers" },
  rejected: { label: "Rejected", icon: "i-rejected" },
  awaiting_ai: { label: "Awaiting AI", icon: "i-review" },
};

const STAGES = [
  { key: "prefilter", label: "Pre-filter", covers: ["prefilter"] },
  { key: "ai", label: "AI read", covers: ["classification", "extraction"] },
  { key: "geocode", label: "Locality", covers: ["geocode"] },
  { key: "rules", label: "Rules", covers: ["qualification"] },
  { key: "dedupe", label: "Dedupe", covers: ["dedupe"] },
];

const SIGNALS = [
  ["budgetSpecificity", "Budget specificity", 15],
  ["localitySpecificity", "Locality specificity", 15],
  ["configurationClarity", "BHK / area clarity", 10],
  ["contactQuality", "Contact quality", 10],
  ["timelineStated", "Timeline stated", 10],
  ["furnishingStated", "Furnishing stated", 5],
  ["tenantTypeOrPurposeStated", "Tenant type or purpose", 5],
  ["messageClarity", "Message clarity", 10],
  ["reputation", "Group and sender trust", 10],
  ["mandatoryCompleteness", "Fields from the message", 10],
];

const LABELS = {
  residential: "Residential", commercial: "Commercial", industrial: "Industrial", agricultural: "Agricultural",
  apartment: "Apartment", villa: "Villa", plot: "Plot", pg_coliving: "PG/Co-Living", independent_house: "Independent House", farm_house: "Farm House",
  office_space: "Office Space", shop: "Shop", showroom: "Showroom", commercial_space: "Commercial Space", commercial_building: "Commercial Building", commercial_plot: "Commercial Plot",
  warehouse: "Warehouse", factory: "Factory", industrial_shed: "Industrial Shed", industrial_land: "Industrial Land", agricultural_land: "Agricultural Land", managed_farmland: "Managed Farmland",
  rent: "Rent", lease: "Lease", buy: "Buy",
  unfurnished: "Unfurnished", semi_furnished: "Semi-furnished", furnished: "Furnished",
  single: "Single", family: "Family", bachelors: "Bachelors",
  bengaluru: "Bengaluru", hosur: "Hosur", coimbatore: "Coimbatore",
};

const timeFmt = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true });
const dayFmt = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long" });
const dateFmt = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
const inr = new Intl.NumberFormat("en-IN");

const state = {
  snap: null,
  filter: { outcome: "all", reason: null, group: null, q: "" },
  selected: null,
  candidate: 0,
  showAllReasons: false,
  panel: null, // "engine"
  busy: false,
};

const $ = (id) => document.getElementById(id);
const narrow = window.matchMedia("(max-width: 960px)");

// ---------------------------------------------------------------- tiny DOM helper

function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

function icon(id, cls) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  if (cls) svg.setAttribute("class", cls);
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#${id}`);
  svg.append(use);
  return svg;
}

function stamp(kind, extra) {
  const o = OUTCOMES[kind] ?? OUTCOMES.rejected;
  return h("span", { class: `stamp stamp-${kind}${extra ? ` ${extra}` : ""}` }, icon(o.icon), o.label);
}

const label = (v) => (v == null ? "—" : LABELS[v] ?? String(v).replace(/_/g, " "));

function money(n, period) {
  if (n == null) return null;
  let s;
  if (n >= 10_000_000) s = `₹${trim(n / 10_000_000)} Cr`;
  else if (n >= 100_000) s = `₹${trim(n / 100_000)} L`;
  else s = `₹${inr.format(n)}`;
  return period === "monthly" ? `${s} / month` : s;
}
const trim = (x) => (Math.round(x * 100) / 100).toString();

// ---------------------------------------------------------------- data

async function load({ keepScroll = true } = {}) {
  const btn = $("refresh");
  btn.classList.add("spinning");
  try {
    const res = await fetch("/api/snapshot", { cache: "no-store" });
    if (!res.ok) throw new Error(`Snapshot failed (${res.status})`);
    const prev = state.snap;
    state.snap = await res.json();
    if (!state.selected) state.selected = defaultSelection();
    render({ prev, keepScroll });
  } catch (err) {
    renderLoadError(err);
  } finally {
    btn.classList.remove("spinning");
  }
}

function defaultSelection() {
  const fromHash = new URLSearchParams(location.hash.slice(1)).get("m");
  const s = state.snap;
  if (fromHash && s.stream.some((m) => m.messageId === fromHash)) return fromHash;
  const firstReview = s.reviewQueue[0];
  if (firstReview) {
    const msg = s.stream.find((m) => m.outcomes.some((o) => o.requirementId === firstReview.requirementId && o.kind === "review"));
    if (msg) return msg.messageId;
  }
  return s.stream[0]?.messageId ?? null;
}

const reqById = (id) => state.snap.requirements.find((r) => r.requirementId === id);

function visibleMessages() {
  const { outcome, reason, group, q } = state.filter;
  const needle = q.trim().toLowerCase();
  return state.snap.stream
    .filter((m) => {
      if (group && m.groupId !== group) return false;
      if (outcome !== "all" && !m.outcomes.some((o) => o.kind === outcome)) return false;
      if (reason && !m.outcomes.some((o) => o.reasonCodes?.includes(reason))) return false;
      if (needle) {
        const locs = m.outcomes.flatMap((o) => (o.requirementId ? (reqById(o.requirementId)?.localities ?? []).map((l) => l.name) : []));
        const hay = [m.text, m.sender, m.groupName, ...locs].join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    })
    .slice()
    .reverse(); // chat order: oldest first
}

// ---------------------------------------------------------------- render

function render({ prev } = {}) {
  const s = state.snap;
  $("topbar-sub").textContent = `${s.totals.read} messages read from ${s.groups.length} groups · ${s.totals.requirementsReview} requirements to review in ${s.totals.review} messages`;
  $("crumb-day").textContent = s.day ? dayFmt.format(new Date(`${s.day}T12:00:00+05:30`)) : "Today";
  renderEngineLine();
  renderRail();
  renderFunnel(prev);
  renderOutcomeChips();
  renderReasonChips();
  renderGroupsPanel();
  renderChat();
  renderDetail();
}

function renderEngineLine() {
  const e = state.snap.engine;
  const line = $("engine-line");
  line.replaceChildren(
    state.snap.containsDemoData ? h("span", { class: "tag tag-demo", title: "Synthetic messages used to exercise the engine until real exports are attached" }, "Demo data · synthetic") : null,
    h("span", { class: "tag tag-quiet" }, `${e.configVersion}${e.rampUp ? " · ramp-up" : ""}`),
    h("span", { class: "tag tag-quiet" }, e.ai === "claude" ? `AI: ${e.model}` : "AI: demo fixtures"),
    e.sessionExtractions ? h("span", { class: "tag tag-demo", title: "WhatsApp Web messages categorised by Claude in this test session, not by the API" }, `Live WhatsApp test · ${e.sessionExtractions} AI reads`) : null,
  );
}

function renderRail() {
  const current = state.panel === "engine" ? "engine" : state.filter.outcome === "all" && !state.filter.reason ? "all" : state.filter.outcome;
  for (const btn of document.querySelectorAll(".rail-btn")) {
    btn.setAttribute("aria-current", String(btn.dataset.rail === current));
  }
  const badge = document.querySelector('[data-count="review"]');
  badge.textContent = state.snap.totals.requirementsReview || "";
  badge.parentElement.title = `Review queue · ${state.snap.totals.requirementsReview} requirements`;
}

function renderFunnel(prev) {
  const ol = $("funnel");
  const stages = state.snap.funnel;
  ol.replaceChildren(
    ...stages.flatMap((st, i) => {
      const before = prev?.funnel.find((p) => p.stage === st.stage)?.count;
      const bumped = before !== undefined && before !== st.count;
      const item = h(
        "li",
        null,
        h("div", { class: `stage${st.stage === "live" ? " is-live" : ""}${bumped ? " bump" : ""}` }, h("span", { class: "stage-count" }, st.count), h("span", { class: "stage-label" }, st.label)),
      );
      if (i === stages.length - 1) return [item];
      const next = stages[i + 1];
      const rate = st.count ? Math.round((next.count / st.count) * 100) : 0;
      return [item, h("li", { "aria-hidden": "true" }, h("div", { class: "stage-arrow" }, icon("i-chevron"), h("span", { class: "stage-rate" }, `${rate}%`)))];
    }),
  );
}

function renderOutcomeChips() {
  const t = state.snap.totals;
  const chips = [
    ["all", "All", t.read],
    ["live", "Live", t.live],
    ["review", "Needs review", t.review],
    ["sighting", "Seen again", t.sighting],
    ["rejected", "Rejected", t.rejected],
  ];
  if (t.awaitingAi) chips.push(["awaiting_ai", "Awaiting AI", t.awaitingAi]);
  $("outcome-chips").replaceChildren(
    ...chips.map(([key, text, count]) =>
      h(
        "button",
        { class: "chip", "aria-pressed": String(state.filter.outcome === key && !state.filter.reason), onclick: () => setFilter({ outcome: key, reason: null }) },
        key === "all" ? null : h("span", { class: `dot dot-${key}` }),
        text,
        h("span", { class: "count" }, count),
      ),
    ),
  );
}

function renderReasonChips() {
  const reasons = state.snap.reasons;
  const limit = window.matchMedia("(min-width: 1181px)").matches ? 4 : 6; // one row beside the groups panel
  const shown = state.showAllReasons ? reasons : reasons.slice(0, limit);
  const row = $("reason-chips");
  row.replaceChildren(
    h("span", { class: "chip-row-label" }, "Why rejected"),
    ...shown.map((r) =>
      h(
        "button",
        {
          class: "chip chip-sm",
          "aria-pressed": String(state.filter.reason === r.code),
          title: r.code,
          onclick: () => setFilter(state.filter.reason === r.code ? { reason: null, outcome: "all" } : { reason: r.code, outcome: "rejected" }),
        },
        REASONS[r.code] ?? r.code,
        h("span", { class: "count" }, r.count),
      ),
    ),
    reasons.length > limit
      ? h("button", { class: "chip-link", onclick: () => { state.showAllReasons = !state.showAllReasons; renderReasonChips(); } }, state.showAllReasons ? "Show fewer" : `+${reasons.length - limit} more`)
      : null,
  );
}

function renderGroupsPanel() {
  const groups = state.snap.groups.slice().sort((a, b) => b.usefulRate - a.usefulRate || b.read - a.read);
  $("groups-panel").replaceChildren(
    h("h2", null, "Groups", h("span", null, "useful = live, review or seen again")),
    h(
      "ul",
      { class: "group-list" },
      ...groups.map((g) =>
        h(
          "li",
          null,
          h(
            "button",
            {
              class: "group-item",
              "aria-pressed": String(state.filter.group === g.groupId),
              "aria-label": `${g.name}: ${g.usefulRate}% useful of ${g.read} messages`,
              title: `${g.name}
${g.read} read · ${g.live} live · ${g.review} review · ${g.sighting} seen again · ${g.rejected} rejected`,
              onclick: () => setFilter({ group: state.filter.group === g.groupId ? null : g.groupId }),
            },
            h("span", { class: "group-name" }, g.name),
            h("span", { class: "group-bar", "aria-hidden": "true" }, h("i", { style: `width:${g.usefulRate}%` })),
            h("span", { class: "group-meta" }, `${g.usefulRate}% · ${g.read}`),
          ),
        ),
      ),
    ),
  );
}

function renderChat() {
  const list = $("chat-list");
  const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  const items = narrow.matches ? visibleMessages().reverse() : visibleMessages(); // phones: newest first
  if (items.length === 0) {
    list.replaceChildren(
      h("div", { class: "empty" }, icon("i-search"), h("h3", null, "No messages match"), h("p", null, "Clear a filter above, or attach another WhatsApp export to read more groups."),
        h("button", { class: "btn-outline", onclick: () => { state.filter = { outcome: "all", reason: null, group: null, q: "" }; $("search").value = ""; render(); } }, "Clear filters")),
    );
    return;
  }
  const showDemoMark = state.snap.containsDemoData && state.snap.stream.some((m) => !m.isDemo);
  let lastDay = "";
  const nodes = [];
  for (const m of items) {
    const day = dayFmt.format(new Date(m.sentAt));
    if (day !== lastDay) {
      nodes.push(h("div", { class: "day-sep" }, h("span", null, day)));
      lastDay = day;
    }
    nodes.push(m.text === "" && !m.media ? systemNote(m) : bubble(m, showDemoMark));
  }
  const first = list.children.length === 0 || list.querySelector(".skeleton");
  list.replaceChildren(...nodes);
  const sel = list.querySelector('[aria-current="true"]');
  const listScrolls = list.scrollHeight > list.clientHeight + 1; // false on phones, where the page scrolls
  if (first && listScrolls) {
    if (sel) list.scrollTop = sel.offsetTop - list.clientHeight / 2 + sel.offsetHeight / 2;
    else list.scrollTop = list.scrollHeight;
  } else if (atBottom && listScrolls) {
    list.scrollTop = list.scrollHeight;
  }
}

function systemNote(m) {
  return h("button", { class: "system-note", "aria-current": String(state.selected === m.messageId), onclick: () => select(m.messageId), dataset: { id: m.messageId } }, `${timeFmt.format(new Date(m.sentAt))} · Group notice`);
}

function bubble(m, showDemoMark) {
  const primary = m.outcomes.find((o) => o.kind === m.outcome) ?? m.outcomes[0];
  const kinds = [...new Set(m.outcomes.map((o) => o.kind))];
  let foot = null;
  if (m.outcome === "rejected") {
    const codes = [...new Set(m.outcomes.flatMap((o) => o.reasonCodes ?? []))];
    foot = h("span", { class: "bubble-reason" }, codes.map((c) => REASONS[c] ?? c).join(" · "));
  } else if (m.outcome === "sighting") {
    const req = reqById(primary.requirementId);
    foot = h("span", { class: "bubble-note" }, req ? `Already captured from ${req.groupName}` : "Already captured");
  } else if (primary?.score != null) {
    const extra = m.outcomes.length > 1 ? ` · ${m.outcomes.length} requirements` : "";
    foot = h("span", { class: "bubble-note" }, `Score ${primary.score}${extra}`);
  } else if (m.outcome === "awaiting_ai") {
    foot = h("span", { class: "bubble-note" }, "Passed pre-filter · waiting for AI key");
  }
  const dim = m.outcome === "rejected" && m.outcomes.every((o) => o.stage === "prefilter");
  const mediaIcon = { image: "i-image", audio: "i-mic", video: "i-video", sticker: "i-image", document: "i-file" }[m.media] ?? "i-file";
  const mediaText = { image: "Photo, no caption", audio: "Voice note", video: "Video, no caption", sticker: "Sticker", document: "Document" }[m.media] ?? "Attachment";

  return h(
    "button",
    { class: `bubble${dim ? " is-dim" : ""}`, "aria-current": String(state.selected === m.messageId), dataset: { id: m.messageId }, onclick: () => select(m.messageId) },
    h(
      "span",
      { class: "bubble-head" },
      h("span", { class: "bubble-sender" }, m.sender),
      state.filter.group ? null : h("span", { class: "bubble-group" }, m.groupName),
      ...kinds.slice(0, 2).map((k) => stamp(k)),
    ),
    m.media ? h("span", { class: "bubble-media" }, icon(mediaIcon), mediaText) : h("span", { class: "bubble-text" }, m.text),
    h("span", { class: "bubble-foot" }, foot, showDemoMark && m.isDemo ? h("span", { class: "bubble-demo" }, "Demo") : null, h("time", { class: "bubble-time", datetime: m.sentAt }, timeFmt.format(new Date(m.sentAt)))),
  );
}

// ---------------------------------------------------------------- detail

function renderDetail() {
  const pane = $("detail");
  if (state.panel === "engine") return pane.replaceChildren(...engineView());
  const m = state.snap.stream.find((x) => x.messageId === state.selected);
  if (!m) {
    pane.replaceChildren(
      h("div"),
      h("div", { class: "empty" }, icon("i-chat"), h("h3", null, "Select a message"), h("p", null, "Pick any WhatsApp message on the left to see what WA-Intake read from it, and why it went live, waits for review or was rejected.")),
      h("div"),
    );
    return;
  }

  const outcomes = m.outcomes;
  if (state.candidate >= outcomes.length) state.candidate = 0;
  const current = outcomes[state.candidate];
  const req = current?.requirementId ? reqById(current.requirementId) : null;

  const visible = visibleMessages();
  const idx = visible.findIndex((x) => x.messageId === m.messageId);

  const head = h(
    "div",
    { class: "detail-head" },
    h("button", { class: "icon-btn detail-back", "aria-label": "Back to messages", onclick: closeDetailMobile }, icon("i-back")),
    h("div", { class: "detail-who" }, h("h2", null, m.sender), h("p", null, `${m.groupName} · ${timeFmt.format(new Date(m.sentAt))}, ${dateFmt.format(new Date(m.sentAt))}${m.senderPhoneMasked ? ` · ${m.senderPhoneMasked}` : ""}`)),
    h(
      "div",
      { class: "detail-nav" },
      h("button", { class: "icon-btn", "aria-label": "Previous message (K)", title: "Previous (K)", disabled: idx <= 0 || null, onclick: () => step(-1) }, icon("i-up")),
      h("button", { class: "icon-btn", "aria-label": "Next message (J)", title: "Next (J)", disabled: idx === -1 || idx >= visible.length - 1 || null, onclick: () => step(1) }, icon("i-down")),
    ),
  );

  const body = h("div", { class: "detail-body" });
  // Desktop: the chat bubble itself carries the highlights. Phones: the list is off-screen, so quote it.
  if (narrow.matches || !m.text) body.append(quoteBlock(m, req));
  if (outcomes.length > 1) {
    body.append(
      h(
        "div",
        { class: "tabs", role: "tablist", "aria-label": "Requirements in this message" },
        ...outcomes.map((o, i) =>
          h("button", { class: "chip chip-sm", role: "tab", "aria-selected": String(i === state.candidate), "aria-pressed": String(i === state.candidate), onclick: () => { state.candidate = i; renderDetail(); } }, h("span", { class: `dot dot-${o.kind}` }), `Requirement ${i + 1}`, h("span", { class: "count" }, OUTCOMES[o.kind].label)),
        ),
      ),
    );
  }

  let actions = h("div", { class: "actionbar" });
  if (!current) {
    body.append(h("div", { class: "note" }, icon("i-info"), "This message has not been processed yet."));
  } else if (current.kind === "live" || current.kind === "review" || (current.kind === "rejected" && req)) {
    body.append(requirementCard(req, current), scorePanel(req));
    actions = actionBar(req);
  } else if (current.kind === "sighting") {
    body.append(sightingCard(current));
  } else if (current.kind === "awaiting_ai") {
    body.append(waitingCard());
  } else {
    body.append(rejectionCard(current));
  }
  pane.replaceChildren(head, body, actions);
  paintSelectedBubble(m, req);
  wireProvenanceHover(pane);
}

function spansFor(m, req) {
  const spans = [];
  if (req) {
    for (const [field, p] of Object.entries(req.fieldProvenance ?? {})) {
      if (!p?.sourceSpan || p.provenance === "defaulted") continue;
      for (const part of field === "localities" ? p.sourceSpan.split(", ") : [p.sourceSpan]) spans.push({ text: part, field, provenance: p.provenance });
    }
  }
  return spans;
}

function quoteBlock(m, req) {
  const box = h("div", { class: "quote" });
  if (m.media) {
    box.append(h("span", { class: "bubble-media" }, icon("i-image"), "No text: this message was only a photo, voice note or file."));
  } else if (!m.text) {
    box.append(h("span", { class: "bubble-media" }, icon("i-info"), "WhatsApp group notice (someone joined, left or changed settings)."));
  } else {
    box.append(...highlight(m.text, spansFor(m, req)));
  }
  return h("div", null, h("div", { class: "quote-label" }, h("span", null, "Original WhatsApp message"), req ? h("span", { class: "legend" }, "Underlined words became fields") : null), box);
}

/** Lights the source words inside the selected chat bubble; restores plain text on the rest. */
function paintSelectedBubble(m, req) {
  for (const el of document.querySelectorAll("#chat-list .bubble-text.has-marks")) {
    const id = el.closest("[data-id]")?.dataset.id;
    if (id === m.messageId) continue;
    const msg = state.snap.stream.find((x) => x.messageId === id);
    el.textContent = msg?.text ?? el.textContent;
    el.classList.remove("has-marks");
  }
  const target = document.querySelector(`#chat-list [data-id="${CSS.escape(m.messageId)}"] .bubble-text`);
  if (!target || !m.text) return;
  target.replaceChildren(...highlight(m.text, spansFor(m, req)));
  target.classList.add("has-marks");
}

function highlight(text, spans) {
  const lower = text.toLowerCase();
  const marks = [];
  for (const s of spans.sort((a, b) => b.text.length - a.text.length)) {
    const needle = s.text.toLowerCase().trim();
    if (needle.length < 2) continue;
    let from = 0;
    let at;
    while ((at = lower.indexOf(needle, from)) !== -1) {
      const end = at + needle.length;
      const clash = marks.find((mk) => at < mk.end && end > mk.start);
      if (clash) { if (!clash.fields.includes(s.field)) clash.fields.push(s.field); }
      else marks.push({ start: at, end, fields: [s.field], provenance: s.provenance });
      from = end;
    }
  }
  marks.sort((a, b) => a.start - b.start);
  const out = [];
  let pos = 0;
  for (const mk of marks) {
    if (mk.start > pos) out.push(document.createTextNode(text.slice(pos, mk.start)));
    out.push(h("mark", { class: mk.provenance === "inferred" ? "src inferred" : "src", dataset: { fields: mk.fields.join(" ") } }, text.slice(mk.start, mk.end)));
    pos = mk.end;
  }
  if (pos < text.length) out.push(document.createTextNode(text.slice(pos)));
  return out;
}

function prov(req, field) {
  const p = req.fieldProvenance?.[field];
  if (!p) return null;
  const text = { extracted: "From message", inferred: "Inferred", defaulted: "Default" }[p.provenance];
  return h("span", { class: `prov prov-${p.provenance}`, title: p.sourceSpan ? `“${p.sourceSpan}”` : p.provenance === "defaulted" ? "Not in the message — filled with the form default" : "" }, text);
}

function row(req, name, field, ...value) {
  const p = req?.fieldProvenance?.[field];
  return h("div", { dataset: p?.sourceSpan ? { span: field } : {} }, h("dt", null, name), h("dd", null, ...value, req && field ? prov(req, field) : null));
}

function requirementCard(req, current) {
  const statusKind = req.status === "active" ? "live" : req.status === "pending_review" ? "review" : "rejected";
  const titles = { live: "Live requirement", review: "Captured — waiting for review", rejected: "Taken down by the desk" };
  const catInferred = req.fieldProvenance?.propertyCategory?.provenance === "inferred";
  const typeInferred = req.fieldProvenance?.propertyType?.provenance === "inferred";

  const config = req.bhk != null
    ? `${req.bhk === 0.5 ? "1 RK" : req.bhk}${req.bhkMax && req.bhkMax !== req.bhk ? `–${req.bhkMax}` : ""} BHK`
    : req.areaSqft != null ? `${inr.format(req.areaSqft)} sq ft${req.unitSpec ? ` · ${req.unitSpec}` : ""}` : req.unitSpec ?? "Not needed for this type";

  const budgetRaw = req.budgetMin != null && req.budgetMax != null && req.budgetMin !== req.budgetMax
    ? `${money(req.budgetMin)} – ${money(req.budgetMax, req.budgetPeriod)}`
    : req.budgetMax != null && req.budgetMin == null ? `Up to ${money(req.budgetMax, req.budgetPeriod)}`
    : req.budgetMin != null && req.budgetMax == null ? `From ${money(req.budgetMin, req.budgetPeriod)}`
    : money(req.budgetMax ?? req.budgetMin, req.budgetPeriod);

  const fields = h(
    "dl",
    { class: "fields" },
    row(req, "City", "city", h("span", { class: "value" }, label(req.city))),
    row(req, req.bhk != null ? "BHK" : "Size", req.bhk != null ? "bhk" : "areaSqft", h("span", { class: "value" }, config)),
    row(req, "Budget", "budgetBand", h("span", { class: "value num" }, req.budgetBand), h("span", { class: "span-quote num" }, budgetRaw)),
    req.propertyCategory === "residential" ? row(req, "Furnish status", "furnishStatus", h("span", { class: "value" }, label(req.furnishStatus))) : null,
    row(req, "Tenant type", "tenantType", h("span", { class: `value${req.tenantType ? "" : " muted"}` }, req.tenantType ? label(req.tenantType) : req.purpose ? `Purpose: ${req.purpose}` : "Not stated")),
    row(req, "Required within", "requiredWithin", h("span", { class: "value num" }, dateFmt.format(new Date(`${req.requiredWithin}T12:00:00+05:30`)))),
    row(
      req,
      "Localities",
      "localities",
      h(
        "span",
        { class: "loc-list" },
        ...req.localities.map((l) => h("span", { class: "loc" }, icon("i-pin"), h("span", { class: "value" }, l.name), h("span", { class: "loc-coords" }, `${l.lat.toFixed(4)}, ${l.lng.toFixed(4)} · ${l.geoPrecision.replace("_", " ")}`))),
        req.extraLocalities.length ? h("span", { class: "loc-extra" }, `Also mentioned, not mapped: ${req.extraLocalities.join(", ")}`) : null,
      ),
    ),
    row(req, "Contact", "contactMobile", h("span", { class: "value num" }, req.contactMasked), h("span", { class: "span-quote" }, `${req.contactName ?? "WhatsApp Contact"} · Realtor (WhatsApp)`)),
    req.notes ? row(null, "Notes", null, h("span", { class: "value" }, req.notes)) : null,
    row(
      null,
      "Seen in",
      null,
      h("ul", { class: "sightings" }, ...req.sightings.map((s) => h("li", null, h("time", null, timeFmt.format(new Date(s.sentAt))), h("span", null, s.groupName)))),
    ),
  );

  return h(
    "article",
    { class: "req-card" },
    h("header", { class: `req-card-head${statusKind === "review" ? " is-review" : ""}` }, h("h3", null, titles[statusKind]), stamp(statusKind)),
    h(
      "div",
      { class: "req-card-body" },
      h(
        "div",
        { class: "pill-set" },
        h("span", { class: `pill-filled${catInferred ? " inferred" : ""}`, title: catInferred ? "Inferred" : "From message" }, label(req.propertyCategory)),
        h("span", { class: `pill-filled${typeInferred ? " inferred" : ""}`, title: typeInferred ? "Inferred" : "From message" }, label(req.propertyType)),
        h("span", { class: "pill-filled" }, label(req.serviceType)),
      ),
      fields,
      h("div", { class: "legend" }, h("span", { class: "prov prov-extracted" }, "From message"), h("span", { class: "prov prov-inferred" }, "Inferred"), h("span", { class: "prov prov-defaulted" }, "Default"), narrow.matches ? "Tap a field to see the words it came from." : "Hover a field to light up its words in the message on the left."),
      req.emailIsPlaceholder ? h("div", { class: "note" }, icon("i-info"), "Contact came from a WhatsApp group, not a form: it is only used to answer this requirement and is never added to marketing lists.") : null,
    ),
  );
}

function scorePanel(req) {
  const e = state.snap.engine;
  let copy;
  if (req.status === "active") copy = h("p", { class: "score-copy" }, "Cleared every rule and the auto-publish bar.");
  else if (req.status === "pending_review")
    copy = h("p", { class: "score-copy" }, "Goes live automatically at ", h("b", { class: "num" }, `${e.autoPostScore}+`), ` with ${Math.round(e.autoPostConfidence * 100)}% reading confidence${e.rampUp ? " (ramp-up bar)" : ""}. This one reads at `, h("b", { class: "num" }, `${Math.round(req.extractionConfidence * 100)}%`), ".");
  else copy = h("p", { class: "score-copy" }, "Taken down by the desk.");

  return h(
    "section",
    { class: "score", "aria-label": "Quality score" },
    h("div", { class: "score-number" }, req.qualityScore, h("small", null, " / 100")),
    copy,
    h(
      "div",
      { class: "breakdown" },
      ...SIGNALS.flatMap(([key, name, max]) => {
        const v = req.scoreBreakdown?.[key] ?? 0;
        return [h("span", null, name), h("span", { class: "breakdown-bar" }, h("i", { class: v ? "" : "zero", style: `width:${Math.min(100, (v / max) * 100)}%` })), h("span", { class: "breakdown-pts" }, `${trim(v)} / ${max}`)];
      }),
    ),
  );
}

function actionBar(req) {
  const bar = h("div", { class: "actionbar" });
  if (req.status === "pending_review") {
    bar.append(
      h("p", { class: "actionbar-msg" }, "Consultants cannot see this yet."),
      h("span", { class: "spacer" }),
      h("button", { class: "btn-text-danger", onclick: (ev) => act(req.requirementId, "reject", ev.currentTarget) }, "Reject"),
      h("button", { class: "btn-primary", onclick: (ev) => act(req.requirementId, "approve", ev.currentTarget) }, icon("i-live"), "Approve and publish"),
    );
  } else if (req.status === "active") {
    bar.append(h("p", { class: "actionbar-msg" }, h("b", null, "Live."), " Visible to matching consultants, contact masked until assigned."), h("span", { class: "spacer" }), h("button", { class: "btn-text-danger", onclick: (ev) => act(req.requirementId, "reject", ev.currentTarget) }, "Take down"));
  } else {
    bar.append(h("p", { class: "actionbar-msg" }, "Rejected by the desk. It will not be shown to consultants."));
  }
  return bar;
}

function rejectionCard(o) {
  const stageIdx = STAGES.findIndex((st) => st.covers.includes(o.stage));
  const track = h(
    "div",
    { class: "track", "aria-label": `Stopped at ${STAGES[stageIdx]?.label ?? o.stage}` },
    ...STAGES.flatMap((st, i) => {
      const cls = i < stageIdx ? "done" : i === stageIdx ? "failed" : "";
      const node = h("span", { class: `track-step ${cls}` }, icon(i < stageIdx ? "i-live" : i === stageIdx ? "i-rejected" : "i-review"), st.label);
      return i === STAGES.length - 1 ? [node] : [node, h("span", { class: "track-sep", "aria-hidden": "true" }, icon("i-chevron"))];
    }),
  );
  return h(
    "article",
    { class: "req-card" },
    h("header", { class: "req-card-head is-failed" }, h("h3", null, "Not captured"), stamp("rejected")),
    h(
      "div",
      { class: "req-card-body" },
      track,
      h("div", { class: "reason-list" }, h("div", { class: "pill-set" }, ...(o.reasonCodes ?? []).map((c) => h("span", { class: "code-chip", title: c }, REASONS[c] ?? c))), h("p", { class: "reason-sentence" }, o.reasonText)),
      o.score != null ? h("p", { class: "score-copy" }, "Quality score ", h("b", { class: "num" }, `${o.score} / 100`), `, below the review bar of ${state.snap.engine.reviewScore}.`) : null,
      h("div", { class: "note" }, icon("i-info"), "Kept in the rejection log with its reason. If this was a real requirement, note the reason code — frequent wrong rejections are how the rules get tuned."),
    ),
  );
}

function sightingCard(o) {
  const req = reqById(o.requirementId);
  const original = state.snap.stream.find((m) => m.outcomes.some((x) => x.requirementId === o.requirementId && x.kind !== "sighting"));
  return h(
    "article",
    { class: "req-card" },
    h("header", { class: "req-card-head is-sighting" }, h("h3", null, "Already captured — counted as another sighting"), stamp("sighting")),
    h(
      "div",
      { class: "req-card-body" },
      h("p", { class: "reason-sentence" }, req ? `The same requirement was already captured from ${req.groupName}. Instead of a duplicate, this post was added to its sightings — it has now been seen ${req.sightingCount} times, a useful urgency signal.` : "The same requirement was already captured."),
      req ? h("ul", { class: "sightings" }, ...req.sightings.map((s) => h("li", null, h("time", null, timeFmt.format(new Date(s.sentAt))), h("span", null, s.groupName)))) : null,
      original ? h("div", null, h("button", { class: "btn-outline", onclick: () => select(original.messageId) }, "Open the captured requirement")) : null,
    ),
  );
}

function waitingCard() {
  return h(
    "article",
    { class: "req-card" },
    h("header", { class: "req-card-head is-waiting" }, h("h3", null, "Passed the pre-filter — waiting for AI"), stamp("awaiting_ai")),
    h("div", { class: "req-card-body" }, h("p", { class: "reason-sentence" }, "This message looks like real estate, but no Claude API key is configured, so it has not been read yet. Add ANTHROPIC_API_KEY to the console's environment, restart it, and attach the same export again: waiting messages are read then, and nothing else is duplicated.")),
  );
}

function engineView() {
  const e = state.snap.engine;
  const t = state.snap.totals;
  return [
    h("div", { class: "detail-head" }, h("button", { class: "icon-btn detail-back", "aria-label": "Back", onclick: () => { state.panel = null; closeDetailMobile(); render(); } }, icon("i-back")), h("div", { class: "detail-who" }, h("h2", null, "Engine settings"), h("p", null, "Read-only here; editing criteria arrives with the tuning screen."))),
    h(
      "div",
      { class: "detail-body" },
      h(
        "dl",
        { class: "fields" },
        row(null, "Criteria version", null, h("span", { class: "value num" }, e.configVersion)),
        row(null, "Publish automatically", null, h("span", { class: "value num" }, `Score ${e.autoPostScore}+ and ${Math.round(e.autoPostConfidence * 100)}% reading confidence`), e.rampUp ? h("span", { class: "span-quote" }, "Ramp-up bar for the first four weeks") : null),
        row(null, "Hold for review", null, h("span", { class: "value num" }, `Score ${e.reviewScore}–${e.autoPostScore - 1}, or lower confidence`)),
        row(null, "Reject", null, h("span", { class: "value num" }, `Any hard rule fails, or score below ${e.reviewScore}`)),
        row(null, "AI extraction", null, h("span", { class: "value" }, e.ai === "claude" ? e.model : "Demo fixtures (no ANTHROPIC_API_KEY)"), h("span", { class: "span-quote" }, e.promptVersion)),
        row(null, "Locality lookup", null, h("span", { class: "value" }, e.geocoder === "google-places" ? "Google Places + cache" : "Offline demo table (no GOOGLE_MAPS_API_KEY)")),
        row(null, "Unmapped localities", null, h("span", { class: "value num" }, t.unresolvedLocalities), h("span", { class: "span-quote" }, state.snap.unresolvedLocalities.map((u) => u.rawText).join(", ") || "None")),
      ),
    ),
    h("div", { class: "actionbar" }),
  ];
}

function wireProvenanceHover(root) {
  const marks = [...document.querySelectorAll("#chat-list .has-marks mark.src, #detail mark.src")];
  for (const rowEl of root.querySelectorAll(".fields > div[data-span]")) {
    const field = rowEl.dataset.span;
    const on = () => marks.forEach((mk) => mk.dataset.fields.split(" ").includes(field) && mk.classList.add("hot"));
    const off = () => marks.forEach((mk) => mk.classList.remove("hot"));
    rowEl.addEventListener("mouseenter", on);
    rowEl.addEventListener("mouseleave", off);
    rowEl.tabIndex = 0;
    rowEl.addEventListener("focus", on);
    rowEl.addEventListener("blur", off);
  }
}

// ---------------------------------------------------------------- actions

function setFilter(patch) {
  state.panel = null;
  Object.assign(state.filter, patch);
  const visible = visibleMessages();
  if (!visible.some((m) => m.messageId === state.selected)) {
    state.selected = visible[visible.length - 1]?.messageId ?? null;
    state.candidate = 0;
  }
  render();
}

function select(id) {
  state.panel = null;
  if (state.selected !== id) state.candidate = 0;
  state.selected = id;
  history.replaceState(null, "", `#m=${encodeURIComponent(id)}`);
  for (const el of document.querySelectorAll("#chat-list [data-id]")) el.setAttribute("aria-current", String(el.dataset.id === id));
  renderDetail();
  renderRail();
  document.getElementById("app").classList.add("show-detail");
}

function step(delta) {
  const visible = visibleMessages();
  const i = visible.findIndex((m) => m.messageId === state.selected);
  const next = visible[Math.max(0, Math.min(visible.length - 1, i + delta))];
  if (!next) return;
  select(next.messageId);
  document.querySelector(`#chat-list [data-id="${CSS.escape(next.messageId)}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function closeDetailMobile() {
  document.getElementById("app").classList.remove("show-detail");
}

async function act(requirementId, action, button) {
  if (state.busy) return;
  state.busy = true;
  const bar = button.closest(".actionbar");
  bar.querySelectorAll("button").forEach((b) => (b.disabled = true));
  const original = button.textContent;
  button.lastChild.textContent = action === "approve" ? "Publishing…" : "Rejecting…";
  try {
    const res = await fetch(`/api/requirements/${encodeURIComponent(requirementId)}/${action}`, { method: "POST" });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? `Failed (${res.status})`);
    await load();
    const s = document.querySelector(".req-card-head .stamp");
    s?.classList.add("flip");
    document.querySelector(`#chat-list [data-id="${CSS.escape(state.selected)}"] .stamp`)?.classList.add("flip");
  } catch (err) {
    bar.querySelectorAll("button").forEach((b) => (b.disabled = false));
    button.lastChild.textContent = original;
    const msg = bar.querySelector(".actionbar-msg");
    if (msg) { msg.textContent = `Could not ${action}: ${err.message}. Try again.`; msg.style.color = "var(--danger-ink)"; }
  } finally {
    state.busy = false;
  }
}

async function upload(file) {
  const status = $("attach-status");
  $("attach").hidden = false;
  $("attach-toggle").setAttribute("aria-expanded", "true");
  if (!/\.(txt|zip)$/i.test(file.name)) {
    status.className = "attach-status error";
    status.textContent = `“${file.name}” is not a WhatsApp export. Attach the .txt or .zip from Export chat.`;
    return;
  }
  status.className = "attach-status";
  status.textContent = `Reading ${file.name}…`;
  try {
    const res = await fetch("/api/import", {
      method: "POST",
      headers: { "x-file-name": encodeURIComponent(file.name), "x-group-name": encodeURIComponent($("attach-group").value.trim()), "content-type": "application/octet-stream" },
      body: file,
    });
    const r = await res.json();
    if (!res.ok) throw new Error(r.error ?? `Import failed (${res.status})`);
    const parts = [`${r.processed} decided`];
    if (r.duplicate) parts.push(`${r.duplicate} already here`);
    if (r.awaitingAi) parts.push(`${r.awaitingAi} waiting for the AI key`);
    status.className = r.total ? "attach-status ok" : "attach-status error";
    status.textContent = r.total ? `Read ${r.total} messages from “${r.groupName}”: ${parts.join(", ")}.` : `No messages found in ${file.name}. Is it a WhatsApp chat export?`;
    $("attach-file").value = "";
    await load();
  } catch (err) {
    status.className = "attach-status error";
    status.textContent = `${err.message}`;
  }
}

function renderLoadError(err) {
  const msg = `The console could not load pipeline data: ${err.message}. Check that the WA-Intake server is running, then refresh.`;
  $("topbar-sub").textContent = "Not connected";
  $("chat-list").replaceChildren(h("div", { class: "empty" }, icon("i-info"), h("h3", null, "Not connected"), h("p", null, msg), h("button", { class: "btn-outline", onclick: () => load() }, "Try again")));
}

// ---------------------------------------------------------------- wiring

function boot() {
  $("chat-list").replaceChildren(h("div", { class: "skeleton", "aria-label": "Loading messages" }, h("i"), h("i"), h("i"), h("i")));
  $("refresh").addEventListener("click", () => load());
  $("search").addEventListener("input", (e) => { state.filter.q = e.target.value; renderChat(); });
  $("attach-toggle").addEventListener("click", () => {
    const panel = $("attach");
    panel.hidden = !panel.hidden;
    $("attach-toggle").setAttribute("aria-expanded", String(!panel.hidden));
  });
  $("attach-file").addEventListener("change", (e) => e.target.files[0] && upload(e.target.files[0]));

  const drop = $("attach-drop");
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));

  let depth = 0;
  const overlay = $("drop-overlay");
  window.addEventListener("dragenter", (e) => { if ([...(e.dataTransfer?.types ?? [])].includes("Files")) { depth++; overlay.hidden = false; } });
  window.addEventListener("dragleave", () => { depth = Math.max(0, depth - 1); if (!depth) overlay.hidden = true; });
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => {
    e.preventDefault();
    depth = 0;
    overlay.hidden = true;
    drop.classList.remove("over");
    const file = e.dataTransfer?.files?.[0];
    if (file) upload(file);
  });

  for (const btn of document.querySelectorAll(".rail-btn")) {
    btn.addEventListener("click", () => {
      const r = btn.dataset.rail;
      if (r === "engine") { state.panel = "engine"; render(); document.getElementById("app").classList.add("show-detail"); return; }
      if (r === "groups") { const g = $("groups-panel"); g.scrollIntoView({ block: "nearest" }); g.querySelector("button")?.focus(); return; }
      setFilter({ outcome: r, reason: null });
    });
  }

  window.addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea, select") || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "j") step(1);
    else if (e.key === "k") step(-1);
    else if (e.key === "Escape") closeDetailMobile();
    else if (e.key === "/") { e.preventDefault(); $("search").focus(); }
  });

  narrow.addEventListener("change", () => state.snap && render());
  load();
  setInterval(() => { if (!document.hidden && !state.busy) load(); }, 30_000);
}

boot();
