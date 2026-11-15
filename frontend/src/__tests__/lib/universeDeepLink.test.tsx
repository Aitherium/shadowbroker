import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import UniverseTravel from '@/components/UniverseTravel';
import { ZOOM_MAX, ZOOM_MIN } from '@/lib/mapZoom';
import { UNIVERSE_URL, parseDeepLink, universeUrl } from '@/lib/universeDeepLink';

describe('parseDeepLink (LAND)', () => {
  it('reads a full valid link', () => {
    expect(parseDeepLink('?lat=52.3676&lng=4.9041&zoom=11&world=restedmind')).toEqual({
      lat: 52.3676,
      lng: 4.9041,
      zoom: 11,
      world: 'restedmind',
    });
  });

  it('accepts the range edges', () => {
    expect(parseDeepLink('lat=-90&lng=180')).toEqual({ lat: -90, lng: 180 });
    expect(parseDeepLink(`lat=0&lng=0&zoom=${ZOOM_MIN}`).zoom).toBe(ZOOM_MIN);
    expect(parseDeepLink(`lat=0&lng=0&zoom=${ZOOM_MAX}`).zoom).toBe(ZOOM_MAX);
  });

  it('ignores out-of-range, non-numeric and half points (never clamps)', () => {
    expect(parseDeepLink('lat=91&lng=4')).toEqual({});
    expect(parseDeepLink('lat=52&lng=-181')).toEqual({});
    expect(parseDeepLink('lat=52')).toEqual({});
    expect(parseDeepLink('lat=abc&lng=4')).toEqual({});
    expect(parseDeepLink('lat=1e1&lng=4')).toEqual({});
    expect(parseDeepLink('lat=Infinity&lng=4')).toEqual({});
    expect(parseDeepLink('lat=&lng=')).toEqual({});
  });

  it('ignores a bad zoom but keeps the point', () => {
    expect(parseDeepLink(`lat=1&lng=2&zoom=${ZOOM_MAX + 1}`)).toEqual({ lat: 1, lng: 2 });
    expect(parseDeepLink('lat=1&lng=2&zoom=-3')).toEqual({ lat: 1, lng: 2 });
    expect(parseDeepLink('lat=1&lng=2&zoom=x')).toEqual({ lat: 1, lng: 2 });
    // a zoom without a point means nothing
    expect(parseDeepLink('zoom=11')).toEqual({});
  });

  it('keeps only a short slug as the world label', () => {
    expect(parseDeepLink('world=restedmind').world).toBe('restedmind');
    expect(parseDeepLink('world=<script>').world).toBeUndefined();
    expect(parseDeepLink(`world=${'a'.repeat(81)}`).world).toBeUndefined();
    expect(parseDeepLink('world=a%20b').world).toBeUndefined();
  });

  it('tolerates empty input', () => {
    expect(parseDeepLink('')).toEqual({});
    expect(parseDeepLink(null)).toEqual({});
    expect(parseDeepLink(new URLSearchParams('lat=1&lng=2'))).toEqual({ lat: 1, lng: 2 });
  });
});

describe('universeUrl (TAKE OFF)', () => {
  it('focuses the world when there is one', () => {
    expect(universeUrl({ world: 'restedmind', lat: 1, lng: 2 })).toBe(`${UNIVERSE_URL}?focus=restedmind`);
  });
  it('else focuses the landed point', () => {
    expect(universeUrl({ lat: 52.36761234, lng: 4.9 })).toBe(`${UNIVERSE_URL}?focus=52.3676%2C4.9`);
  });
  it('else opens the universe plainly', () => {
    expect(universeUrl({})).toBe(UNIVERSE_URL);
    expect(UNIVERSE_URL).toBe('https://aitherium.com/explore');
  });
});

describe('<UniverseTravel />', () => {
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('shows the world chip and links back to it', async () => {
    window.history.replaceState(null, '', '/?lat=52.37&lng=4.9&zoom=11&world=restedmind');
    render(<UniverseTravel />);
    expect((await screen.findByTestId('world-chip')).textContent).toBe('restedmind');
    expect(screen.getByTestId('universe-button').getAttribute('href')).toBe(`${UNIVERSE_URL}?focus=restedmind`);
  });

  it('no chip without a world; the button still opens the universe', () => {
    render(<UniverseTravel />);
    expect(screen.queryByTestId('world-chip')).toBeNull();
    expect(screen.getByTestId('universe-button').getAttribute('href')).toBe(UNIVERSE_URL);
  });
});
