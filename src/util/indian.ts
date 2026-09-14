/**
 * Deterministic helpers for Indian phone numbers, rupee amounts and IST dates.
 * The model normalises values (§10.2); these functions validate and cross-check
 * them so that a hallucinated number never reaches a hard gate unverified.
 */

/** Valid Indian mobile: 10 digits starting 6–9 (§12.1 G8). Returns "+91XXXXXXXXXX" or null. */
export function normalizeIndianMobile(input: string | null | undefined): string | null {
  if (!input) return null;
  // "080 2345 6789" / "0422-2345678": an STD code written as its own group is a landline, not 0 + mobile.
  if (/^\s*0\d{2,4}[\s-]\d/.test(input) && !/^\s*0[6-9]\d{4}[\s-]?\d{5}\s*$/.test(input)) return null;
  let digits = input.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length !== 10 || !/^[6-9]/.test(digits)) return null;
  return `+91${digits}`;
}

/** Finds Indian mobile numbers written in free text: "98450 12345", "+91-98450-12345", "09845012345". */
export function findIndianMobiles(text: string): string[] {
  const found: string[] = [];
  const re = /(?:\+?91[\s-]?|0)?[6-9](?:[\s-]?\d){9}(?!\d)/g;
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    if (start > 0 && /\d/.test(text[start - 1] ?? "")) continue;
    const n = normalizeIndianMobile(m[0]);
    if (n && !found.includes(n)) found.push(n);
  }
  return found;
}

/** Masked display for consultant-facing views, e.g. "+91 98450 •••45". */
export function maskMobile(e164: string): string {
  const d = e164.replace(/^\+91/, "");
  return `+91 ${d.slice(0, 5)} •••${d.slice(8)}`;
}

const UNIT_MULTIPLIERS: Array<[RegExp, number]> = [
  [/^(?:crores?|crs?)$/i, 10_000_000],
  [/^(?:lakhs?|lacs?|lks?|l)$/i, 100_000],
  [/^(?:thousands?|k|saavira|savira|sāvira|hazaar|hazar|hajar|aayiram|ayiram)$/i, 1_000],
];

/**
 * Parses a single rupee amount: "45k", "45 thousand", "₹45,000", "45000/-", "1.2 Cr", "80L", "80 lakhs".
 * Returns null if the string holds no parseable amount.
 */
export function parseIndianAmount(input: string): number | null {
  const s = input.replace(/₹|rs\.?|inr/gi, " ").replace(/\/-/g, " ").trim();
  const m = s.match(/(\d{1,3}(?:,\d{2,3})+|\d+(?:\.\d+)?)\s*([a-z]+)?/i);
  if (!m || !m[1]) return null;
  const value = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;
  const unit = m[2];
  if (unit) {
    for (const [re, mult] of UNIT_MULTIPLIERS) if (re.test(unit)) return Math.round(value * mult);
  }
  return value;
}

/** True when a model-reported amount agrees with what the cited source span parses to (±1%). */
export function amountMatchesSpan(value: number, span: string | null): boolean {
  if (!span) return false;
  const parts = span.split(/\s*(?:-|–|to)\s*/i);
  const candidates: number[] = [];
  for (const p of parts) {
    const n = parseIndianAmount(p);
    if (n !== null) candidates.push(n);
  }
  // "45-50k": the unit on the upper bound applies to the lower bound too.
  const last = parts[parts.length - 1] ?? "";
  const unitMatch = last.match(/\d\s*([a-z]+)\s*$/i);
  if (parts.length > 1 && unitMatch) {
    const withUnit = parseIndianAmount(`${parts[0]} ${unitMatch[1]}`);
    if (withUnit !== null) candidates.push(withUnit);
  }
  return candidates.some((c) => Math.abs(c - value) <= Math.max(1, value * 0.01));
}

const IST_OFFSET_MIN = 330;

/** Calendar date in IST as YYYY-MM-DD. */
export function istDate(d: Date): string {
  const shifted = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  return shifted.toISOString().slice(0, 10);
}

export function addDaysIst(d: Date, days: number): string {
  return istDate(new Date(d.getTime() + days * 86_400_000));
}

/** Last calendar day of the IST month containing `d`. */
export function istMonthEnd(d: Date): string {
  const [y, m] = istDate(d).split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)); // day 0 of next month
  return last.toISOString().slice(0, 10);
}
