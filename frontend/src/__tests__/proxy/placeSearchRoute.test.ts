import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { resolvePlaceQuery, shapeNominatimResults } from '@/lib/placeSearch';

type RouteModule = typeof import('@/app/api/place-search/route');

async function freshRoute(): Promise<RouteModule> {
  vi.resetModules();
  return import('@/app/api/place-search/route');
}

function call(mod: RouteModule, query: string) {
  return mod.GET(new NextRequest(`http://localhost/api/place-search?${query}`));
}

const SF = [
  { lat: '37.7792588', lon: '-122.4193286', display_name: 'San Francisco, California, United States', category: 'boundary', type: 'administrative', place_rank: 16 },
];

function ok(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('place search route', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    delete process.env.NOMINATIM_BASE;
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('forwards only q and limit, identifies itself, shapes and caches the answer', async () => {
    const mod = await freshRoute();
    fetchMock.mockResolvedValue(ok(SF));
    const first = await call(mod, 'q=San%20Francisco&limit=3&format=xml&email=x%40y&polygon_geojson=1');
    expect(first.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    const u = new URL(String(url));
    expect(u.origin + u.pathname).toBe('https://nominatim.openstreetmap.org/search');
    expect([...u.searchParams.keys()].sort()).toEqual(['addressdetails', 'format', 'limit', 'q']);
    expect(u.searchParams.get('q')).toBe('San Francisco');
    expect(u.searchParams.get('format')).toBe('jsonv2');
    expect(u.searchParams.get('limit')).toBe('3');
    expect((init.headers as Record<string, string>)['User-Agent']).toBe('AitherShadowBroker/1.0 (+https://aitherium.com)');
    const body = await first.json();
    expect(body.results[0]).toMatchObject({ label: 'San Francisco, California, United States', lat: 37.7792588, lng: -122.4193286, placeRank: 16 });

    const second = await call(mod, 'q=san%20francisco&limit=3');
    expect(second.headers.get('X-Place-Cache')).toBe('hit');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses a too-short query or bad limit without touching the upstream', async () => {
    const mod = await freshRoute();
    const short = await call(mod, 'q=ab');
    expect(short.status).toBe(400);
    expect((await short.json()).error).toBe('query_too_short');
    expect((await call(mod, 'q=Paris&limit=-1')).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('turns an upstream error into a clean JSON 502 and backs off after a 429', async () => {
    const mod = await freshRoute();
    fetchMock.mockResolvedValueOnce(new Response('<html>Too many</html>', { status: 429 }));
    const res = await call(mod, 'q=Berlin');
    expect(res.status).toBe(502);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toMatchObject({ error: 'upstream_error' });
    const cooled = await call(mod, 'q=Hamburg');
    expect(cooled.status).toBe(503);
    expect((await cooled.json()).error).toBe('upstream_cooling_down');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('turns a network failure into upstream_unreachable', async () => {
    const mod = await freshRoute();
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    const res = await call(mod, 'q=Tokyo');
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('upstream_unreachable');
  });

  it('spaces upstream requests at least one second apart', async () => {
    vi.useFakeTimers();
    const mod = await freshRoute();
    fetchMock.mockImplementation(async () => ok(SF));
    const a = call(mod, 'q=Oakland');
    const b = call(mod, 'q=Fresno');
    await vi.advanceTimersByTimeAsync(10);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(600);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((await a).status).toBe(200);
    expect((await b).status).toBe(200);
  });
});

describe('place search helpers', () => {
  it('strips control characters and caps limit', () => {
    const r = resolvePlaceQuery(new URLSearchParams({ q: ' New\u0000 York ', limit: '50' }));
    expect(r).toEqual({ ok: true, query: { q: 'New York', limit: 8 } });
  });

  it('drops malformed upstream rows', () => {
    expect(
      shapeNominatimResults([
        { lat: 'x', lon: '1', display_name: 'bad' },
        { lat: '95', lon: '1', display_name: 'out of range' },
        { lat: '1', lon: '2' },
        { lat: '1', lon: '2', display_name: 'Ok' },
      ]),
    ).toEqual([{ label: 'Ok', lat: 1, lng: 2, kind: '', placeRank: null }]);
    expect(shapeNominatimResults({ error: 'nope' })).toEqual([]);
  });
});
