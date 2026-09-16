// Post Requirement screen. All user text is written with textContent only.

const $ = (id) => document.getElementById(id);
const BUDGET = { under_2cr: "< 2 Cr", "2_5cr": "2 – 5 Cr", "5cr_plus": "5 Cr +" };
const SERVICE = { buy: "Buy", rent: "Rent", lease: "Lease" };
const fmt = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });

const state = { service: "buy", budget: null, localities: [], suggestions: [], active: -1, busy: false };

function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}
function icon(id) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("aria-hidden", "true");
  const u = document.createElementNS("http://www.w3.org/2000/svg", "use");
  u.setAttribute("href", `#${id}`);
  s.append(u);
  return s;
}

// ---------------------------------------------------------------- defaults

function nowIstLocal() {
  // datetime-local value in IST regardless of the browser's zone
  const t = new Date(Date.now() + 330 * 60_000);
  return t.toISOString().slice(0, 19);
}
function localToIstIso(v) {
  return v ? `${v.length === 16 ? `${v}:00` : v}+05:30` : undefined;
}

function resetForm() {
  $("form").reset();
  $("postedAt").value = nowIstLocal();
  $("postedBy").value = "RK";
  state.service = "buy";
  state.budget = null;
  state.localities = [];
  setRadio("service", "buy");
  setRadio("budget", null);
  renderChosen();
  clearErrors();
  $("status").textContent = "";
  $("status").className = "pr-status";
  $("name").focus();
}

function setRadio(groupId, value) {
  for (const b of $(groupId).querySelectorAll('[role="radio"]')) b.setAttribute("aria-checked", String(b.dataset.value === value));
  if (groupId === "service") $("summary-service").textContent = SERVICE[value] ?? "Buy";
}

for (const groupId of ["service", "budget"]) {
  $(groupId).addEventListener("click", (e) => {
    const b = e.target.closest('[role="radio"]');
    if (!b) return;
    state[groupId] = b.dataset.value;
    setRadio(groupId, b.dataset.value);
    if (groupId === "budget") setError("budgetBand", "");
  });
  $(groupId).addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
    const items = [...$(groupId).querySelectorAll('[role="radio"]')];
    const i = items.findIndex((b) => b.getAttribute("aria-checked") === "true");
    const next = items[(i + (e.key === "ArrowRight" ? 1 : -1) + items.length) % items.length];
    next.click();
    next.focus();
  });
}

// ---------------------------------------------------------------- localities

let debounce;
$("loc-input").addEventListener("input", (e) => {
  clearTimeout(debounce);
  const q = e.target.value;
  debounce = setTimeout(() => suggest(q), 180);
});
$("loc-input").addEventListener("keydown", (e) => {
  const n = state.suggestions.length;
  if (e.key === "ArrowDown" && n) { e.preventDefault(); state.active = (state.active + 1) % n; renderSuggest(); }
  else if (e.key === "ArrowUp" && n) { e.preventDefault(); state.active = (state.active - 1 + n) % n; renderSuggest(); }
  else if (e.key === "Enter") { e.preventDefault(); if (state.active >= 0) choose(state.suggestions[state.active]); else if (n === 1) choose(state.suggestions[0]); }
  else if (e.key === "Escape") closeSuggest();
});
$("loc-input").addEventListener("blur", () => setTimeout(closeSuggest, 150));

async function suggest(q) {
  if (q.trim().length < 2) return closeSuggest();
  if (state.localities.length >= 4) {
    $("loc-hint").textContent = "Four locations is the maximum. Remove one to add another.";
    $("loc-hint").className = "pr-hint warn";
    return;
  }
  const res = await fetch(`/api/localities?q=${encodeURIComponent(q)}`);
  const list = res.ok ? await res.json() : [];
  state.suggestions = list.filter((s) => !state.localities.some((l) => l.placeId === s.placeId));
  state.active = state.suggestions.length ? 0 : -1;
  renderSuggest(q);
}

function renderSuggest(q) {
  const ul = $("loc-list");
  ul.hidden = false;
  $("loc-input").setAttribute("aria-expanded", "true");
  if (!state.suggestions.length) {
    ul.replaceChildren(h("li", { class: "pr-none", role: "option", "aria-selected": "false" }, `No Bengaluru locality matches “${q ?? ""}”.`));
    return;
  }
  ul.replaceChildren(
    ...state.suggestions.map((s, i) =>
      h("li", { role: "option", "aria-selected": String(i === state.active), onmousedown: (e) => { e.preventDefault(); choose(s); } }, icon("i-pin"), s.name, h("small", null, s.area)),
    ),
  );
}
function closeSuggest() {
  $("loc-list").hidden = true;
  $("loc-input").setAttribute("aria-expanded", "false");
  state.suggestions = [];
  state.active = -1;
}
function choose(s) {
  if (state.localities.length >= 4 || state.localities.some((l) => l.placeId === s.placeId)) return;
  state.localities.push({ name: s.name, placeId: s.placeId, lat: s.lat, lng: s.lng });
  $("loc-input").value = "";
  closeSuggest();
  setError("localities", "");
  renderChosen();
  $("loc-input").focus();
}
function removeLocality(i) {
  state.localities.splice(i, 1);
  renderChosen();
}
function renderChosen() {
  $("loc-chosen").replaceChildren(
    ...state.localities.map((l, i) =>
      h("span", { class: "chip", "aria-pressed": "true" }, h("span", { class: "order" }, i + 1), l.name, h("button", { type: "button", class: "x", "aria-label": `Remove ${l.name}`, onclick: () => removeLocality(i) }, icon("i-close"))),
    ),
  );
  const n = state.localities.length;
  $("loc-hint").className = "pr-hint";
  $("loc-hint").textContent = n === 0 ? "Pick from the list so each location carries a map pin." : n < 4 ? `${n} of 4 chosen. Add another or continue.` : "Four locations chosen (maximum).";
  $("loc-input").disabled = n >= 4;
  $("loc-input").placeholder = n >= 4 ? "Maximum reached" : "Type a locality, e.g. Singasandra";
  renderMap();
}

/** Simple pin map: an SVG plotted on Bengaluru's bounding box; no external tiles needed. */
function renderMap() {
  const box = $("map");
  const pts = state.localities;
  if (!pts.length) return box.replaceChildren();
  const W = 800, H = 240;
  const lat0 = 12.7, lat1 = 13.3, lng0 = 77.3, lng1 = 77.95;
  const x = (lng) => ((lng - lng0) / (lng1 - lng0)) * W;
  const y = (lat) => ((lat1 - lat) / (lat1 - lat0)) * H;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `Pins: ${pts.map((p) => p.name).join(", ")}`);
  const ns = (t, a) => { const e = document.createElementNS("http://www.w3.org/2000/svg", t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); return e; };
  for (let i = 1; i < 6; i++) svg.append(ns("line", { x1: (W / 6) * i, y1: 0, x2: (W / 6) * i, y2: H, stroke: "#dfe7e4", "stroke-width": 1 }));
  for (let i = 1; i < 4; i++) svg.append(ns("line", { x1: 0, y1: (H / 4) * i, x2: W, y2: (H / 4) * i, stroke: "#dfe7e4", "stroke-width": 1 }));
  const c = ns("circle", { cx: x(77.5946), cy: y(12.9716), r: 4, fill: "#cfd5d3" });
  svg.append(c, ns("text", { x: x(77.5946) + 7, y: y(12.9716) + 4, class: "pin-label", fill: "#676d73", "font-size": 11 }));
  svg.lastChild.textContent = "Bengaluru";
  pts.forEach((p, i) => {
    const px = Math.min(W - 8, Math.max(8, x(p.lng))), py = Math.min(H - 8, Math.max(8, y(p.lat)));
    svg.append(ns("circle", { cx: px, cy: py, r: 9, class: "pin" }));
    const n = ns("text", { x: px, y: py + 4, "text-anchor": "middle", fill: "#fff", "font-size": 11, "font-weight": 700 });
    n.textContent = String(i + 1);
    const t = ns("text", { x: px + 13, y: py + 4, class: "pin-label" });
    t.textContent = p.name;
    svg.append(n, t);
  });
  box.replaceChildren(svg, h("span", { class: "map-note" }, "Positions from locality pins · not to scale"));
}

// ---------------------------------------------------------------- submit

function setError(field, msg) {
  const el = document.querySelector(`[data-error="${field}"]`);
  if (el) el.textContent = msg;
  const input = $(field);
  if (input) input.setAttribute("aria-invalid", String(!!msg));
}
function clearErrors() {
  for (const el of document.querySelectorAll(".pr-error")) el.textContent = "";
  for (const el of document.querySelectorAll("[aria-invalid]")) el.removeAttribute("aria-invalid");
}

function validate() {
  clearErrors();
  const errors = {};
  if ($("name").value.trim().length < 2) errors.name = "Enter the customer's name.";
  const digits = $("whatsapp").value.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
  if (!/^[6-9]\d{9}$/.test(digits)) errors.whatsapp = "Enter a 10-digit Indian mobile starting 6–9.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($("email").value.trim())) errors.email = "Enter a valid email address.";
  if (!state.budget) errors.budgetBand = "Choose a budget band.";
  if (!state.localities.length) errors.localities = "Pick at least one Bengaluru location.";
  for (const [f, m] of Object.entries(errors)) setError(f, m);
  const first = Object.keys(errors)[0];
  if (first) ($(first) ?? $(first === "budgetBand" ? "budget" : "loc-input")).focus?.();
  return { ok: !first, digits };
}

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (state.busy) return;
  const { ok, digits } = validate();
  const status = $("status");
  if (!ok) { status.className = "pr-status error"; status.textContent = "Fix the highlighted fields to post."; return; }
  state.busy = true;
  $("submit").disabled = true;
  status.className = "pr-status";
  status.textContent = "Posting…";
  try {
    const body = {
      name: $("name").value.trim(),
      whatsapp: `+91${digits}`,
      email: $("email").value.trim(),
      propertyCategory: "residential",
      propertyType: "villa",
      serviceType: state.service,
      localities: state.localities,
      budgetBand: state.budget,
      postedAt: localToIstIso($("postedAt").value),
      postedBy: $("postedBy").value.trim() || "RK",
      notes: $("notes").value.trim(),
    };
    const res = await fetch("/api/posted", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const r = await res.json();
    if (!res.ok) {
      for (const i of r.issues ?? []) setError(i.field.split(".")[0], i.message);
      throw new Error(r.error ?? `Failed (${res.status})`);
    }
    status.className = "pr-status ok";
    status.textContent = `Posted ${r.name}'s requirement · ${r.localities.map((l) => l.name).join(", ")} · ${r.budgetLabel}.`;
    await loadRecent(r.id);
    const keepBy = $("postedBy").value;
    $("form").reset();
    state.budget = null; state.localities = []; state.service = "buy";
    setRadio("service", "buy"); setRadio("budget", null); renderChosen();
    $("postedAt").value = nowIstLocal();
    $("postedBy").value = keepBy;
    $("name").focus();
  } catch (err) {
    status.className = "pr-status error";
    status.textContent = err.message;
  } finally {
    state.busy = false;
    $("submit").disabled = false;
  }
});

$("reset-btn").addEventListener("click", resetForm);

// ---------------------------------------------------------------- recent list

async function loadRecent(highlightId) {
  const res = await fetch("/api/posted", { cache: "no-store" });
  const list = res.ok ? await res.json() : [];
  $("recent-count").textContent = list.length ? `· ${list.length}` : "";
  if (!list.length) return $("recent").replaceChildren(h("li", { class: "pr-empty" }, "Nothing posted yet. The first requirement you post appears here."));
  $("recent").replaceChildren(
    ...list.map((r) =>
      h(
        "li",
        { class: `pr-item${r.id === highlightId ? " new" : ""}` },
        h("div", { class: "pr-item-head" }, h("b", null, r.name), h("span", { class: `stamp stamp-${r.status === "open" ? "live" : "rejected"}` }, r.status === "open" ? "Open" : r.status === "closed" ? "Closed" : "Lost")),
        h("div", { class: "pr-item-line" }, `${SERVICE[r.serviceType]} · Villa · `, h("span", { class: "num" }, BUDGET[r.budgetBand] ?? r.budgetLabel)),
        h("div", { class: "pr-item-line" }, r.localities.map((l, i) => `${i + 1}. ${l.name}`).join("  ")),
        h("div", { class: "pr-item-line num" }, `${r.whatsapp.replace(/^\+91/, "+91 ")} · ${r.email}`),
        h("div", { class: "pr-item-meta" }, h("span", null, fmt.format(new Date(r.postedAt))), h("span", null, `by ${r.postedBy}`)),
      ),
    ),
  );
}

$("postedAt").value = nowIstLocal();
loadRecent();
$("name").focus();
