/**
 * Place-name geocoding for the FIND / LOCATE box. GET only.
 *
 *   /api/place-search?q=<text>&limit=<1-8>
 *
 * Asks OpenStreetMap Nominatim server-side, following its usage policy
 * (https://operations.osmfoundation.org/policies/nominatim/):
 *  - an identifying User-Agent (never the visitor's browser),
 *  - at most ONE upstream request per second across the whole process,
 *  - answers cached, so the same place typed by many visitors costs one call,
 *  - a 429/503 from upstream backs the route off for everyone.
 * Only `q` and `limit` are honoured; the upstream URL is otherwise constant.
 *
 * NOMINATIM_BASE (runtime env, never NEXT_PUBLIC_) re-points it at a mirror.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  placeQueryKey,
  resolvePlaceQuery,
  shapeNominatimResults,
  type PlaceResult,
} from '@/lib/placeSearch';

const PLACE_SEARCH_USER_AGENT = 'AitherShadowBroker/1.0 (+https://aitherium.com)';
const UPSTREAM_MIN_INTERVAL_MS = 1000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;
const UPSTREAM_TIMEOUT_MS = 8000;
const UPSTREAM_COOLDOWN_MS = 60 * 1000;

type CacheEntry = { results: PlaceResult[]; storedAt: number };
const cache = new Map<string, CacheEntry>();
let lastUpstreamAt = 0;
let gate: Promise<void> = Promise.resolve();
let blockedUntil = 0;

function nominatimBase(): string {
  return (process.env.NOMINATIM_BASE || 'https://nominatim.openstreetmap.org').replace(/\/+$/, '');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wait for this request's upstream slot: one per UPSTREAM_MIN_INTERVAL_MS, in arrival order. */
function takeUpstreamSlot(): Promise<void> {
  const turn = gate.then(async () => {
    const wait = lastUpstreamAt + UPSTREAM_MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastUpstreamAt = Date.now();
  });
  gate = turn.catch(() => undefined);
  return turn;
}

function remember(key: string, results: PlaceResult[]): void {
  cache.delete(key);
  cache.set(key, { results, storedAt: Date.now() });
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

function answer(results: PlaceResult[], source: 'hit' | 'miss'): NextResponse {
  return NextResponse.json(
    { results },
    { status: 200, headers: { 'Cache-Control': 'public, max-age=300', 'X-Place-Cache': source } },
  );
}

function fail(status: number, error: string, message: string, headers: Record<string, string> = {}): NextResponse {
  return NextResponse.json({ error, message }, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

export async function GET(req: NextRequest) {
  const resolved = resolvePlaceQuery(req.nextUrl.searchParams);
  if (!resolved.ok) return fail(resolved.status, resolved.error, resolved.message);
  const { query } = resolved;
  const key = placeQueryKey(query);

  const cached = cache.get(key);
  if (cached && Date.now() - cached.storedAt < CACHE_TTL_MS) return answer(cached.results, 'hit');

  if (Date.now() < blockedUntil) {
    return fail(503, 'upstream_cooling_down', 'Place search is resting after an upstream refusal; try again shortly.', {
      'Retry-After': '60',
    });
  }

  const params = new URLSearchParams({
    q: query.q,
    format: 'jsonv2',
    limit: String(query.limit),
    addressdetails: '0',
  });
  const upstreamUrl = `${nominatimBase()}/search?${params.toString()}`;

  await takeUpstreamSlot();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await fetch(upstreamUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': PLACE_SEARCH_USER_AGENT,
        'Accept-Language': 'en',
      },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) {
      if (res.status === 429 || res.status === 503) blockedUntil = Date.now() + UPSTREAM_COOLDOWN_MS;
      return fail(502, 'upstream_error', `Place search upstream answered ${res.status}.`);
    }
    let raw: unknown;
    try {
      raw = await res.json();
    } catch {
      return fail(502, 'upstream_bad_json', 'Place search upstream sent an unreadable answer.');
    }
    const results = shapeNominatimResults(raw);
    remember(key, results);
    return answer(results, 'miss');
  } catch (err) {
    const aborted = (err as Error)?.name === 'AbortError';
    return fail(
      aborted ? 504 : 502,
      aborted ? 'upstream_timeout' : 'upstream_unreachable',
      'Place search is unavailable right now.',
    );
  } finally {
    clearTimeout(timer);
  }
}
