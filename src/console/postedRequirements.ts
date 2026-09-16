import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import type { Geocoder } from "../geo/localityResolver.js";
import { serviceCityFor } from "../geo/localityResolver.js";
import { normalizeIndianMobile } from "../util/indian.js";

/**
 * Requirements posted by hand through the Post Requirement screen (§ "Post Requirement UI").
 * Kept apart from WhatsApp-derived requirements: these carry consent and an email.
 */

export const BUDGET_BANDS = [
  { key: "under_2cr", label: "< 2 Cr", min: null, max: 20_000_000 },
  { key: "2_5cr", label: "2 – 5 Cr", min: 20_000_000, max: 50_000_000 },
  { key: "5cr_plus", label: "5 Cr +", min: 50_000_000, max: null },
] as const;

export const LocalityInput = z.object({
  name: z.string().min(1).max(120),
  placeId: z.string().min(1).max(200),
  lat: z.number(),
  lng: z.number(),
});

export const PostRequirementInput = z.object({
  name: z.string().trim().min(2, "Name needs at least 2 characters").max(80),
  whatsapp: z.string().trim().min(10, "WhatsApp number is required"),
  email: z.string().trim().email("Enter a valid email"),
  propertyCategory: z.literal("residential").default("residential"),
  propertyType: z.literal("villa").default("villa"),
  serviceType: z.enum(["buy", "rent", "lease"]).default("buy"),
  localities: z.array(LocalityInput).min(1, "Pick at least one location").max(4, "Up to 4 locations"),
  budgetBand: z.enum(["under_2cr", "2_5cr", "5cr_plus"]),
  postedAt: z.string().datetime({ offset: true }).optional(),
  postedBy: z.string().trim().min(1).max(60).default("RK"),
  notes: z.string().trim().max(1000).optional().default(""),
});

export type PostRequirementInputT = z.input<typeof PostRequirementInput>;

export interface PostedRequirement {
  id: string;
  name: string;
  whatsapp: string; // +91XXXXXXXXXX
  email: string;
  propertyCategory: "residential";
  propertyType: "villa";
  serviceType: "buy" | "rent" | "lease";
  city: "bengaluru";
  localities: Array<{ name: string; placeId: string; lat: number; lng: number }>;
  budgetBand: (typeof BUDGET_BANDS)[number]["key"];
  budgetLabel: string;
  budgetMin: number | null;
  budgetMax: number | null;
  postedAt: string; // ISO with offset
  postedBy: string;
  notes: string;
  status: "open" | "closed" | "lost";
  source: "post_requirement_ui";
  createdAt: string;
  updatedAt: string;
}

export class ValidationError extends Error {
  constructor(readonly issues: Array<{ field: string; message: string }>) {
    super(issues.map((i) => `${i.field}: ${i.message}`).join("; "));
    this.name = "ValidationError";
  }
}

/** File-backed store (JSON). On Vercel the file system is ephemeral; see README. */
export class PostedRequirementStore {
  private items = new Map<string, PostedRequirement>();

  constructor(private readonly file: string | null) {
    if (file) {
      try {
        const arr = JSON.parse(readFileSync(file, "utf8")) as PostedRequirement[];
        for (const r of arr) this.items.set(r.id, r);
      } catch {
        /* first run */
      }
    }
  }

  list(): PostedRequirement[] {
    return [...this.items.values()].sort((a, b) => b.postedAt.localeCompare(a.postedAt));
  }

  get(id: string) {
    return this.items.get(id) ?? null;
  }

  create(raw: unknown, now = new Date()): PostedRequirement {
    const parsed = PostRequirementInput.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => ({ field: i.path.join(".") || "form", message: i.message })));
    }
    const d = parsed.data;
    const whatsapp = normalizeIndianMobile(d.whatsapp);
    if (!whatsapp) throw new ValidationError([{ field: "whatsapp", message: "Enter a valid 10-digit Indian mobile (starts 6–9)" }]);
    const band = BUDGET_BANDS.find((b) => b.key === d.budgetBand)!;
    const postedAt = d.postedAt ?? isoIst(now);
    const id = `req_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const rec: PostedRequirement = {
      id,
      name: d.name,
      whatsapp,
      email: d.email.toLowerCase(),
      propertyCategory: "residential",
      propertyType: "villa",
      serviceType: d.serviceType,
      city: "bengaluru",
      localities: d.localities,
      budgetBand: band.key,
      budgetLabel: band.label,
      budgetMin: band.min,
      budgetMax: band.max,
      postedAt,
      postedBy: d.postedBy,
      notes: d.notes,
      status: "open",
      source: "post_requirement_ui",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    this.items.set(id, rec);
    this.persist();
    return rec;
  }

  setStatus(id: string, status: PostedRequirement["status"]) {
    const r = this.items.get(id);
    if (!r) return null;
    r.status = status;
    r.updatedAt = new Date().toISOString();
    this.persist();
    return r;
  }

  private persist() {
    if (!this.file) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(this.file, JSON.stringify(this.list(), null, 2));
    } catch (err) {
      console.warn("Could not persist posted requirements:", (err as Error).message);
    }
  }
}

/** ISO timestamp in IST (+05:30), e.g. 2026-09-16T10:42:07+05:30 */
export function isoIst(d: Date): string {
  const t = new Date(d.getTime() + 330 * 60_000);
  return `${t.toISOString().slice(0, 19)}+05:30`;
}

export interface LocalitySuggestion {
  name: string;
  placeId: string;
  lat: number;
  lng: number;
  area: string;
}

/** Bengaluru-only locality suggestions: Google Places when configured, else the offline table. */
export async function suggestLocalities(q: string, geocoder: Geocoder, offline: Array<{ name: string; placeId: string; lat: number; lng: number; area: string }>): Promise<LocalitySuggestion[]> {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return [];
  const local = offline.filter((p) => p.name.toLowerCase().includes(needle)).slice(0, 6);
  if (local.length >= 3) return local;
  try {
    const hit = await geocoder.search(`${q}, Bengaluru`, "bengaluru");
    if (hit && serviceCityFor(hit) === "bengaluru" && !local.some((l) => l.placeId === hit.placeId)) {
      local.push({ name: hit.name, placeId: hit.placeId, lat: hit.lat, lng: hit.lng, area: hit.cityName || "Bengaluru" });
    }
  } catch {
    /* offline */
  }
  return local;
}
