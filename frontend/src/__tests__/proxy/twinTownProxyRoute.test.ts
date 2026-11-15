import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { resolveCivicProxyRequest } from '@/lib/civicDirectory';

type RouteModule = typeof import('@/app/api/civic-proxy/[...path]/route');

async function freshRoute(): Promise<RouteModule> {
  vi.resetModules();
  return import('@/app/api/civic-proxy/[...path]/route');
}

function call(mod: RouteModule, path: string[], query = '', headers: Record<string, string> = {}) {
  const req = new NextRequest(`http://localhost/api/civic-proxy/${path.join('/')}${query ? `?${query}` : ''}`, {
    headers,
  });
  return mod.GET(req, { params: Promise.resolve({ path }) });
}

describe('civic proxy: twin town', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    process.env.CIVIC_API_BASE = 'https://civic.test/api/civic';
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.CIVIC_API_BASE;
  });

  it('allow-lists /town and forwards only the area params', () => {
    const r = resolveCivicProxyRequest(
      ['town'],
      new URLSearchParams('lat=39.1&lng=-84.5&radius_km=14&format=geojson&evil=1'),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.route.upstreamPath).toBe('/layers/town');
    expect(r.route.query).toBe('lat=39.1&lng=-84.5&radius_km=14&format=geojson');
    expect(resolveCivicProxyRequest(['town'], new URLSearchParams('format=geojson')).ok).toBe(false);
    expect(resolveCivicProxyRequest(['town', 'x'], new URLSearchParams('lat=1&lng=1')).ok).toBe(false);
  });

  it('passes 202 warming through uncached, then caches the real answer', async () => {
    const mod = await freshRoute();
    const q = 'state=OH&county=061&format=geojson';
    fetchMock.mockResolvedValueOnce(
      new Response('{"status":"warming"}', { status: 202, headers: { 'retry-after': '10' } }),
    );
    const warming = await call(mod, ['town'], q);
    expect(warming.status).toBe(202);
    expect(warming.headers.get('Cache-Control')).toBe('no-store');
    expect(warming.headers.get('Retry-After')).toBe('10');
    expect(fetchMock.mock.calls[0][0]).toBe(`https://civic.test/api/civic/layers/town?${q}`);

    fetchMock.mockResolvedValueOnce(new Response('{"type":"FeatureCollection","features":[]}', { status: 200 }));
    const ready = await call(mod, ['town'], q);
    expect(ready.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const again = await call(mod, ['town'], q);
    expect(again.headers.get('X-Civic-Cache')).toBe('fresh');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  const sentHeaders = (i = 0) => new Headers((fetchMock.mock.calls[i][1] as RequestInit).headers);
  const ok = () => new Response('{"type":"FeatureCollection","features":[]}', { status: 200 });

  it('never forwards CF-Connecting-IP or X-Forwarded-For (Cloudflare 403s a client-sent CF-Connecting-IP)', async () => {
    const mod = await freshRoute();
    fetchMock.mockImplementation(async () => ok());
    const cases: Array<Record<string, string>> = [
      { 'cf-connecting-ip': '203.0.113.7', 'cf-ray': '8f1c2d3e4a5b6c7d-IAD' },
      { 'cf-connecting-ip': '203.0.113.7' },
      { 'x-forwarded-for': '198.51.100.9' },
    ];
    for (const [i, h] of cases.entries()) {
      // Distinct areas so nothing is served from the proxy cache.
      await call(mod, ['town'], `lat=${30 + i}&lng=-84.5&radius_km=14&format=geojson`, h);
      expect(sentHeaders(i).get('CF-Connecting-IP')).toBeNull();
      expect(sentHeaders(i).get('X-Forwarded-For')).toBeNull();
    }
    expect(fetchMock).toHaveBeenCalledTimes(cases.length);
  });

  it("a 429 is the proxy's quota: it passes through, then the route cools down for everyone", async () => {
    const mod = await freshRoute();
    fetchMock.mockResolvedValueOnce(new Response('{"detail":"quota"}', { status: 429, headers: { 'retry-after': '3600' } }));
    const limited = await call(mod, ['town'], 'lat=40&lng=-84.5&radius_km=14&format=geojson');
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBe('3600');
    const other = await call(mod, ['town'], 'lat=41&lng=-84.5&radius_km=14&format=geojson');
    expect(other.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('passes a 503 Retry-After through', async () => {
    const mod = await freshRoute();
    fetchMock.mockResolvedValueOnce(new Response('{"detail":"busy"}', { status: 503, headers: { 'retry-after': '20' } }));
    const res = await call(mod, ['town'], 'lat=42&lng=-84.5&radius_km=14&format=geojson');
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('20');
  });
});
