import type { GeoResult, Geocoder } from "../geo/localityResolver.js";
import type { City } from "../types.js";

/**
 * DEMO ONLY. Offline stand-in for Google Places so the console runs without a
 * Maps key. Coordinates are approximate public locations, good enough to draw
 * a map pin — never write them into production locality_master.
 */
const BLR = ["bengaluru", "bangalore urban"];
const P = (placeId: string, name: string, lat: number, lng: number, types: string[], cityCandidates = BLR, cityName = "Bengaluru"): GeoResult => ({
  placeId,
  name,
  lat,
  lng,
  types,
  cityCandidates,
  cityName,
});
const SUB1 = ["sublocality_level_1", "sublocality", "political"];
const SUB2 = ["sublocality_level_2", "sublocality", "political"];
const HOOD = ["neighborhood", "political"];

const PLACES: Record<string, GeoResult> = {
  koramangala: P("demo_kora", "Koramangala", 12.9352, 77.6245, SUB1),
  "hsr layout": P("demo_hsr", "HSR Layout", 12.9116, 77.6474, SUB1),
  "electronic city phase 1": P("demo_ecity1", "Electronic City Phase 1", 12.8452, 77.6602, SUB2),
  "electronic city": P("demo_ecity", "Electronic City", 12.8399, 77.677, SUB1),
  whitefield: P("demo_wfd", "Whitefield", 12.9698, 77.75, SUB1),
  brookefield: P("demo_brk", "Brookefield", 12.9667, 77.7167, SUB2),
  bellandur: P("demo_bel", "Bellandur", 12.9304, 77.6784, SUB1),
  "sarjapur road": P("demo_sjr_rd", "Sarjapur Road", 12.901, 77.687, ["route"]),
  indiranagar: P("demo_indi", "Indiranagar", 12.9784, 77.6408, SUB1),
  "jayanagar 4th block": P("demo_jay4", "Jayanagar 4th Block", 12.925, 77.5838, SUB2),
  "jp nagar": P("demo_jpn", "JP Nagar", 12.9063, 77.5857, SUB1),
  hebbal: P("demo_hebbal", "Hebbal", 13.0358, 77.597, SUB1),
  marathahalli: P("demo_mth", "Marathahalli", 12.9569, 77.7011, SUB1),
  "kudlu gate": P("demo_kudlu", "Kudlu Gate", 12.8895, 77.639, HOOD),
  singasandra: P("demo_singa", "Singasandra", 12.885, 77.644, HOOD),
  yelahanka: P("demo_yel", "Yelahanka", 13.1007, 77.5963, SUB1),
  "hosur road": P("demo_hosur_rd", "Hosur Road", 12.889, 77.64, ["route"]),
  attibele: P("demo_attibele", "Attibele", 12.779, 77.77, ["locality", "political"]),
  "kanakapura road": P("demo_kan_rd", "Kanakapura Road", 12.87, 77.56, ["route"]),
  hosur: P("demo_hosur", "Hosur", 12.7409, 77.8253, ["locality", "political"], ["hosur", "krishnagiri"], "Hosur"),
  "rs puram": P("demo_rspuram", "R.S. Puram", 11.0089, 76.95, SUB1, ["coimbatore"], "Coimbatore"),
  "anna nagar": P("demo_annanagar", "Anna Nagar", 13.085, 80.2101, SUB1, ["chennai"], "Chennai"),
  kakkanad: P("demo_kakkanad", "Kakkanad", 10.0159, 76.3419, SUB1, ["kochi", "ernakulam"], "Kochi"),
};

/** Bengaluru entries of the offline table, for the Post Requirement locality picker. */
export const DEMO_BENGALURU_LOCALITIES = Object.values(PLACES)
  .filter((p) => p.cityName === "Bengaluru")
  .map((p) => ({ name: p.name, placeId: p.placeId, lat: p.lat, lng: p.lng, area: "Bengaluru" }))
  .sort((a, b) => a.name.localeCompare(b.name));

export class DemoGeocoder implements Geocoder {
  async search(query: string, _bias: City | null): Promise<GeoResult | null> {
    return PLACES[query.split(",")[0]!.trim().toLowerCase()] ?? null;
  }
}
