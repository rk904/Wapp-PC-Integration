import type { City, GeoPrecision, LocalityGranularity, ResolvedLocality } from "../types.js";

/** One geocoder hit, provider-neutral. */
export interface GeoResult {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  /** Locality / district names from the address components, lowercased. */
  cityCandidates: string[];
  cityName: string;
  types: string[];
}

export interface Geocoder {
  search(query: string, cityBias: City | null): Promise<GeoResult | null>;
}

/** locality_aliases document (§11.1). */
export interface LocalityAlias {
  alias: string; // normalised
  canonical: string; // e.g. "Electronic City"
  city?: City;
}

/** locality_master document (§11.1) — the geocode cache. */
export interface LocalityMasterEntry {
  key: string; // `${cityBias ?? "any"}:${normalisedCanonical}`
  resolvedName: string;
  placeId: string;
  lat: number;
  lng: number;
  city: City | null;
  cityName: string;
  geoPrecision: GeoPrecision;
  granularity: LocalityGranularity;
  hitCount: number;
}

export interface LocalityStore {
  getAlias(normalized: string): Promise<LocalityAlias | null>;
  getMaster(key: string): Promise<LocalityMasterEntry | null>;
  putMaster(entry: LocalityMasterEntry): Promise<void>;
  incrementHit(key: string): Promise<void>;
  /** Queues an unresolved string for the ops alias worklist (§11.1 step 4, §21). */
  recordUnresolved(rawText: string, messageId: string, cityBias: City | null): Promise<void>;
}

export const SERVICE_AREA_NAMES: Record<City, string[]> = {
  bengaluru: ["bengaluru", "bangalore", "bengaluru urban", "bangalore urban", "bengaluru rural", "bangalore rural", "bangalore division"],
  hosur: ["hosur", "krishnagiri"],
  coimbatore: ["coimbatore"],
};

const CITY_DISPLAY: Record<City, string> = { bengaluru: "Bengaluru", hosur: "Hosur", coimbatore: "Coimbatore" };

const CITY_WORDS: Record<string, City> = {
  bangalore: "bengaluru", bengaluru: "bengaluru", blr: "bengaluru", "b lore": "bengaluru", "b'lore": "bengaluru",
  hosur: "hosur", coimbatore: "coimbatore", kovai: "coimbatore", cbe: "coimbatore",
};

export function normalizeLocality(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[.,;:!?()"'`]/g, " ")
    .replace(/\b(near|nearby|around|close to|opp|opposite|behind|next to|in|at)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Maps a city phrase from the message ("Bangalore") to a serviced city; null if unknown or not serviced. */
export function cityFromText(text: string | null): City | null {
  if (!text) return null;
  return CITY_WORDS[normalizeLocality(text)] ?? null;
}

export function serviceCityFor(result: Pick<GeoResult, "cityCandidates">): City | null {
  for (const [city, names] of Object.entries(SERVICE_AREA_NAMES) as Array<[City, string[]]>) {
    if (result.cityCandidates.some((c) => names.includes(c))) return city;
  }
  return null;
}

const MICRO_TYPES = ["neighborhood", "sublocality_level_2", "sublocality_level_3", "premise", "subpremise", "establishment", "point_of_interest", "street_address"];
const LOCALITY_TYPES = ["sublocality_level_1", "sublocality", "route", "postal_code", "colloquial_area"];

export function classifyGranularity(types: string[]): { granularity: LocalityGranularity; geoPrecision: GeoPrecision } {
  if (types.some((t) => MICRO_TYPES.includes(t))) return { granularity: "micro", geoPrecision: "exact" };
  if (types.some((t) => LOCALITY_TYPES.includes(t))) return { granularity: "locality", geoPrecision: "exact" };
  if (types.includes("locality")) return { granularity: "locality", geoPrecision: "approximate" };
  return { granularity: "city", geoPrecision: "city_centroid" };
}

export interface ResolveOutcome {
  resolved: ResolvedLocality[];
  unresolved: string[];
}

/** Stage 4 — locality resolution: alias → cache → geocoder → unresolved (§11). */
export class LocalityResolver {
  constructor(
    private readonly store: LocalityStore,
    private readonly geocoder: Geocoder,
  ) {}

  async resolveAll(
    rawLocalities: string[],
    ctx: { messageId: string; cityMentioned: string | null; groupDefaultCity: City },
  ): Promise<ResolveOutcome> {
    const resolved: ResolvedLocality[] = [];
    const unresolved: string[] = [];
    const seen = new Set<string>();
    for (const raw of rawLocalities) {
      const hit = await this.resolveOne(raw, ctx);
      if (!hit) {
        unresolved.push(raw);
        continue;
      }
      if (seen.has(hit.placeId)) continue;
      seen.add(hit.placeId);
      resolved.push(hit);
    }
    return { resolved, unresolved };
  }

  private async resolveOne(
    raw: string,
    ctx: { messageId: string; cityMentioned: string | null; groupDefaultCity: City },
  ): Promise<ResolvedLocality | null> {
    const normalized = normalizeLocality(raw);
    if (!normalized) return null;

    const alias = await this.store.getAlias(normalized);
    const canonical = alias?.canonical ?? raw.trim();
    const mentionedServiceCity = cityFromText(ctx.cityMentioned);
    // A non-serviced city named in the message ("Chennai") must not be overridden by the group default.
    const bias: City | null = alias?.city ?? (ctx.cityMentioned ? mentionedServiceCity : ctx.groupDefaultCity);
    const key = `${bias ?? "any"}:${normalizeLocality(canonical)}`;

    const cached = await this.store.getMaster(key);
    if (cached) {
      await this.store.incrementHit(key);
      return fromMaster(cached, raw);
    }

    const cityHint = bias ? CITY_DISPLAY[bias] : (ctx.cityMentioned ?? "");
    const query = cityHint ? `${canonical}, ${cityHint}` : canonical;
    const result = await this.geocoder.search(query, bias);
    if (!result) {
      await this.store.recordUnresolved(raw, ctx.messageId, bias);
      return null;
    }

    const { granularity, geoPrecision } = classifyGranularity(result.types);
    const entry: LocalityMasterEntry = {
      key,
      resolvedName: result.name,
      placeId: result.placeId,
      lat: result.lat,
      lng: result.lng,
      city: serviceCityFor(result),
      cityName: result.cityName,
      geoPrecision,
      granularity,
      hitCount: 1,
    };
    await this.store.putMaster(entry);
    return fromMaster(entry, raw);
  }
}

function fromMaster(e: LocalityMasterEntry, raw: string): ResolvedLocality {
  return {
    name: e.resolvedName,
    rawText: raw,
    placeId: e.placeId,
    lat: e.lat,
    lng: e.lng,
    city: e.city,
    cityName: e.cityName,
    geoPrecision: e.geoPrecision,
    granularity: e.granularity,
  };
}
