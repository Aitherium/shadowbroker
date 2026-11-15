import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import FindLocateBar, { coordinateSearchResult } from '@/components/FindLocateBar';
import { CIVIC_FOCUS_ZOOM } from '@/lib/civicLayers';

vi.mock('@/hooks/useDataStore', () => ({
  // An SDR named after the city: it used to be the ONLY hit for "San Francisco".
  useDataKeys: () => ({
    kiwisdr: [{ name: 'San Francisco SDR', location: 'San Francisco', lat: 37.7, lon: -122.4, users: 0, users_max: 4 }],
  }),
}));

vi.mock('@/i18n', () => ({
  useTranslation: () => ({ t: () => 'Search coordinates, place, or callsign...' }),
}));

describe('coordinateSearchResult', () => {
  it('parses decimal lat, lng with and without a space, and negatives', () => {
    expect(coordinateSearchResult('37.77, -122.42')).toMatchObject({ lat: 37.77, lng: -122.42, entityType: 'coordinates' });
    expect(coordinateSearchResult('37.77,-122.42')).toMatchObject({ lat: 37.77, lng: -122.42 });
    expect(coordinateSearchResult('-33.87 151.21')).toMatchObject({ lat: -33.87, lng: 151.21 });
    expect(coordinateSearchResult('  -12.5 , -45 ')).toMatchObject({ lat: -12.5, lng: -45 });
  });

  it('rejects out-of-range and non-coordinate text', () => {
    expect(coordinateSearchResult('91, 0')).toBeNull();
    expect(coordinateSearchResult('0, -181')).toBeNull();
    expect(coordinateSearchResult('San Francisco')).toBeNull();
    expect(coordinateSearchResult('37.77')).toBeNull();
    expect(coordinateSearchResult('')).toBeNull();
  });
});

describe('FindLocateBar coordinates and places', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('flies to typed coordinates at the civic zoom without asking the geocoder', async () => {
    const onLocate = vi.fn();
    const onLocatePlace = vi.fn();
    render(<FindLocateBar onLocate={onLocate} onLocatePlace={onLocatePlace} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '37.77, -122.42' } });
    fireEvent.click(await screen.findByText('37.7700, -122.4200'));
    expect(onLocatePlace).toHaveBeenCalledWith(37.77, -122.42, CIVIC_FOCUS_ZOOM);
    expect(onLocate).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the geocoded place above asset matches and flies there', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [{ label: 'San Francisco, California, United States', lat: 37.7793, lng: -122.4193, kind: 'place/city', placeRank: 16 }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const onLocatePlace = vi.fn();
    render(<FindLocateBar onLocate={vi.fn()} onLocatePlace={onLocatePlace} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'San Francisco' } });

    const place = await screen.findByText('San Francisco', undefined, { timeout: 3000 });
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/place-search?q=San+Francisco&limit=5');
    // The place row comes before the SDR asset row.
    const rows = screen.getAllByRole('button').map((b) => b.textContent ?? '');
    const placeRow = rows.findIndex((t) => t.includes('PLACE'));
    const sdrRow = rows.findIndex((t) => t.includes('SDR'));
    expect(placeRow).toBeGreaterThanOrEqual(0);
    expect(sdrRow).toBeGreaterThan(placeRow);

    fireEvent.click(place);
    expect(onLocatePlace).toHaveBeenCalledWith(37.7793, -122.4193, CIVIC_FOCUS_ZOOM);
  });
});
