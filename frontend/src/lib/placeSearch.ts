/**
 * Place-name search for the FIND / LOCATE box.
 *
 * The browser asks `/api/place-search?q=` on this app; that server route asks
 * OpenStreetMap Nominatim with a real User-Agent, at most once a second, and
 * caches answers (Nominatim usage policy:
 * https://operations.osmfoundation.org/policies/nominatim/). The browser never
 * calls Nominatim directly.
 */

export const PLACE_SEARCH_PATH = '/api/place-search';
export const PLACE_QUERY_MIN = 3;
export const PLACE_QUERY_MAX = 120;
export const PLACE_LIMIT_DEFAULT = 5;
export const PLACE_LIMIT_MAX = 8;
/** Typing pause before a place lookup goes out. */
export const PLACE_SEARCH_DEBOUNCE_MS = 450;

export type PlaceResult = {
  label: string;
  lat: number;
  lng: number;
  /** OSM category/type, e.g. "place/city", "boundary/administrative". */
  kind: string;
  /** Nominatim place_rank: 4 country, 16 city, 30 building. */
  placeRank: number | null;
};

export type PlaceQuery = { q: string; limit: number };

export type PlaceQueryResult =
  | { ok: true; query: PlaceQuery }
  | { ok: false; status: number; error: string; message: string };

const CONTROL_CHARS = new RegExp('[\\u0000-\\u001f\\u007f]', 'g');

/**
 * Validate the only two parameters the route honours. Everything else in the
 * query string is ignored, so the upstream URL is built from constants and
 * these two values only.
 */
export function resolvePlaceQuery(params: URLSearchParams): PlaceQueryResult {
  const q = (params.get('q') ?? '').replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();
  if (q.length < PLACE_QUERY_MIN) {
    return { ok: false, status: 400, error: 'query_too_short', message: `q needs at least ${PLACE_QUERY_MIN} characters` };
  }
  if (q.length > PLACE_QUERY_MAX) {
    return { ok: false, status: 400, error: 'query_too_long', message: `q is limited to ${PLACE_QUERY_MAX} characters` };
  }
  const rawLimit = params.get('limit');
  let limit = PLACE_LIMIT_DEFAULT;
  if (rawLimit !== null) {
    const n = Number(rawLimit);
    if (!Number.isInteger(n) || n < 1) {
      return { ok: false, status: 400, error: 'bad_limit', message: `limit must be 1-${PLACE_LIMIT_MAX}` };
    }
    limit = Math.min(n, PLACE_LIMIT_MAX);
  }
  return { ok: true, query: { q, limit } };
}

/** Cache key: case and spacing do not make a different place. */
export function placeQueryKey(query: PlaceQuery): string {
  return `${query.q.toLowerCase()}|${query.limit}`;
}

/** Shape Nominatim jsonv2 rows into PlaceResults, dropping anything malformed. */
export function shapeNominatimResults(raw: unknown): PlaceResult[] {
  if (!Array.isArray(raw)) return [];
  const out: PlaceResult[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const lat = Number(r.lat);
    const lng = Number(r.lon);
    const label = typeof r.display_name === 'string' ? r.display_name.slice(0, 200) : '';
    if (!label || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
    const cls = typeof r.category === 'string' ? r.category : typeof r.class === 'string' ? r.class : '';
    const type = typeof r.type === 'string' ? r.type : '';
    const rank = Number(r.place_rank);
    out.push({
      label,
      lat,
      lng,
      kind: [cls, type].filter(Boolean).join('/'),
      placeRank: r.place_rank !== undefined && Number.isFinite(rank) ? rank : null,
    });
  }
  return out;
}

/** Browser side: ask this app's route. Throws on a non-OK answer. */
export async function searchPlaces(
  q: string,
  signal?: AbortSignal,
  limit = PLACE_LIMIT_DEFAULT,
): Promise<PlaceResult[]> {
  const params = new URLSearchParams({ q, limit: String(limit) });
  const res = await fetch(`${PLACE_SEARCH_PATH}?${params.toString()}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`place search ${res.status}`);
  const body = (await res.json()) as { results?: unknown };
  return Array.isArray(body.results) ? (body.results as PlaceResult[]) : [];
}
