import { beforeEach, describe, expect, it } from 'vitest';
import {
  CIVIC_DEFAULT_ON_LAYERS,
  DASHBOARD_PREFS_STORAGE_KEY,
  LAYER_SECTION_IDS,
  getDefaultActiveLayers,
  getDefaultLayerSectionExpanded,
  loadActiveLayers,
  loadLayerSectionExpanded,
  orderLayerSections,
} from '@/lib/layerPreferences';
import { CIVIC_ZOOM_HINT, civicZoomHint } from '@/lib/civicLayers';

describe('DATA LAYERS: civic first', () => {
  beforeEach(() => localStorage.clear());

  it('puts CIVIC & ELECTIONS first and open by default', () => {
    expect(LAYER_SECTION_IDS[0]).toBe('civic');
    expect(getDefaultLayerSectionExpanded().civic).toBe(true);
  });

  it('orders the panel sections civic first, keeping the rest in place', () => {
    const sections = ['aircraft', 'maritime', 'infrastructure', 'civic', 'overlays'].map((id) => ({ id }));
    expect(orderLayerSections(sections).map((s) => s.id)).toEqual(['civic', 'aircraft', 'maritime', 'infrastructure', 'overlays']);
  });

  it('defaults ALPR cameras and district lines ON for visitors', () => {
    const d = getDefaultActiveLayers();
    expect(d.civic_alpr).toBe(true);
    expect(d.civic_congressional).toBe(true);
    expect(d.civic_counties).toBe(true);
    // The expensive ones stay opt-in.
    expect(d.civic_projects).toBe(false);
    expect(d.twin_town).toBe(false);
  });

  it('brings a returning visitor with saved prefs onto the civic defaults once', () => {
    const saved = { ...getDefaultActiveLayers(), civic_alpr: false, civic_congressional: false, civic_counties: false };
    localStorage.setItem(
      DASHBOARD_PREFS_STORAGE_KEY,
      JSON.stringify({ version: 1, layers: saved, layerSectionsExpanded: { civic: false, overlays: true } }),
    );
    const layers = loadActiveLayers();
    for (const id of CIVIC_DEFAULT_ON_LAYERS) expect(layers[id]).toBe(true);
    expect(loadLayerSectionExpanded().civic).toBe(true);
  });

  it('respects a choice made after the migration', () => {
    const saved = { ...getDefaultActiveLayers(), civic_alpr: false };
    localStorage.setItem(DASHBOARD_PREFS_STORAGE_KEY, JSON.stringify({ version: 1, defaultsRev: 2, layers: saved }));
    expect(loadActiveLayers().civic_alpr).toBe(false);
  });
});

describe('civicZoomHint', () => {
  const world = { south: -60, west: -180, north: 75, east: 180 };
  const city = { south: 37.6, west: -122.6, north: 37.9, east: -122.2 };

  it('says "zoom in" when a civic layer is on and the view is too wide', () => {
    expect(civicZoomHint(world, { civic_alpr: true })).toBe(CIVIC_ZOOM_HINT);
    expect(civicZoomHint(null, { civic_counties: true })).toBe(CIVIC_ZOOM_HINT);
  });

  it('is silent zoomed in, or with every civic layer off', () => {
    expect(civicZoomHint(city, { civic_alpr: true })).toBeNull();
    expect(civicZoomHint(world, { civic_alpr: false, flights: true })).toBeNull();
  });
});
