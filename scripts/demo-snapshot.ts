import { ConsoleService } from "../src/console/consoleService.js";
const s = new ConsoleService({});
await s.seedDemo();
const snap = s.snapshot();
console.log(JSON.stringify({ totals: snap.totals, funnel: snap.funnel, reasons: snap.reasons.map(r => `${r.code}:${r.count}`), groups: snap.groups.map(g => `${g.name} read=${g.read} live=${g.live} review=${g.review} sight=${g.sighting} rej=${g.rejected} useful=${g.usefulRate}%`) }, null, 1));
for (const i of snap.stream.slice().reverse()) console.log(i.sentAt.slice(11,16), i.outcome.padEnd(9), i.outcomes.map(o => o.reasonCodes?.join("+") ?? (o.score != null ? `${o.label} ${o.score}` : o.label)).join(" | "), "::", (i.text || `[${i.media}]`).slice(0, 50));
