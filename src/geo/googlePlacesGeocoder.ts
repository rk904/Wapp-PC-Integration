import type { City } from "../types.js";
import type { GeoResult, Geocoder } from "./localityResolver.js";

/** Rough bounding boxes used only to bias Places search (§11.1 step 3). */
const CITY_BOUNDS: Record<City, { low: { latitude: number; longitude: number }; high: { latitude: number; longitude: number } }> = {
  bengaluru: { low: { latitude: 12.7, longitude: 77.3 }, high: { latitude: 13.3, longitude: 77.95 } },
  hosur: { low: { latitude: 12.65, longitude: 77.72 }, high: { latitude: 12.83, longitude: 77.92 } },
  coimbatore: { low: { latitude: 10.85, longitude: 76.8 }, high: { latitude: 11.2, longitude: 77.15 } },
};

interface PlacesTextSearchResponse {
  places?: Array<{
    id: string;
    displayName?: { text: string };
    location?: { latitude: number; longitude: number };
    types?: string[];
    addressComponents?: Array<{ longText: string; shortText: string; types: string[] }>;
  }>;
}

/**
 * Google Places API (New) Text Search. Called only on a locality_master cache miss,
 * which keeps steady-state Maps cost near zero (§18).
 */
export class GooglePlacesGeocoder implements Geocoder {
  constructor(
    private readonly apiKey: string = process.env.GOOGLE_MAPS_API_KEY ?? "",
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    if (!this.apiKey) throw new Error("GOOGLE_MAPS_API_KEY is not set");
  }

  async search(query: string, cityBias: City | null): Promise<GeoResult | null> {
    const body: Record<string, unknown> = { textQuery: query, regionCode: "IN", languageCode: "en", pageSize: 1 };
    if (cityBias) body.locationBias = { rectangle: CITY_BOUNDS[cityBias] };

    const res = await this.fetchImpl("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
        "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.types,places.addressComponents",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Places API ${res.status}: ${await res.text()}`);

    const data = (await res.json()) as PlacesTextSearchResponse;
    const place = data.places?.[0];
    if (!place?.location) return null;

    const components = place.addressComponents ?? [];
    const pick = (type: string) => components.find((c) => c.types.includes(type))?.longText;
    const cityName = pick("locality") ?? pick("administrative_area_level_3") ?? pick("administrative_area_level_2") ?? "";
    const cityCandidates = components
      .filter((c) => c.types.some((t) => t === "locality" || t.startsWith("administrative_area_level_")))
      .map((c) => c.longText.toLowerCase());

    return {
      placeId: place.id,
      name: place.displayName?.text ?? query,
      lat: place.location.latitude,
      lng: place.location.longitude,
      cityCandidates,
      cityName,
      types: place.types ?? [],
    };
  }
}
