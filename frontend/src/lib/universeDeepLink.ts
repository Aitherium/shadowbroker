/**
 * Universe deep links: travel between BeadSpace (the universe explorer) and this map.
 *
 *   LAND     https://shadowbroker.aitherium.com/?lat=52.37&lng=4.90&zoom=11&world=restedmind
 *            opens the map on that point, with the world's name as a small chip.
 *   TAKE OFF the "Universe" button goes back to BeadSpace focused on the world
 *            (https://aitherium.com/explore?focus=<world>) or, with no world, on the
 *            point the map was opened at (focus=<lat>,<lng>).
 *
 * Every value is validated; a bad one is IGNORED (never clamped into a confident wrong
 * place): lat in [-90, 90], lng in [-180, 180], both required together, zoom in
 * [ZOOM_MIN, ZOOM_MAX], world a short slug.
 */

import { ZOOM_MAX, ZOOM_MIN } from './mapZoom';

export const UNIVERSE_URL = 'https://aitherium.com/explore';
export const WORLD_MAX_CHARS = 80;
const WORLD_RE = /^[A-Za-z0-9._:@#-]{1,80}$/;
const NUM_RE = /^-?\d+(\.\d+)?$/;

export interface DeepLink {
  /** Present only as a valid pair. */
  lat?: number;
  lng?: number;
  /** Present only when valid AND a point is present. */
  zoom?: number;
  /** The world slug (BeadSpace body), shown as a chip. */
  world?: string;
}

function num(raw: string | null, lo: number, hi: number): number | undefined {
  if (raw === null) return undefined;
  const s = raw.trim();
  if (!NUM_RE.test(s)) return undefined;
  const v = Number(s);
  return Number.isFinite(v) && v >= lo && v <= hi ? v : undefined;
}

/** Parse `?lat=&lng=&zoom=&world=` from a search string (or URLSearchParams). */
export function parseDeepLink(search: string | URLSearchParams | null | undefined): DeepLink {
  const q = search instanceof URLSearchParams ? search : new URLSearchParams(search ?? '');
  const out: DeepLink = {};
  const lat = num(q.get('lat'), -90, 90);
  const lng = num(q.get('lng'), -180, 180);
  if (lat !== undefined && lng !== undefined) {
    out.lat = lat;
    out.lng = lng;
    const zoom = num(q.get('zoom'), ZOOM_MIN, ZOOM_MAX);
    if (zoom !== undefined) out.zoom = zoom;
  }
  const world = (q.get('world') ?? '').trim();
  if (WORLD_RE.test(world)) out.world = world;
  return out;
}

/** The BeadSpace link that TAKES OFF from here: `?focus=<world>` or `?focus=<lat>,<lng>`. */
export function universeUrl(link: DeepLink = {}): string {
  let focus = '';
  if (link.world && WORLD_RE.test(link.world)) focus = link.world;
  else if (link.lat !== undefined && link.lng !== undefined) {
    focus = `${Number(link.lat.toFixed(4))},${Number(link.lng.toFixed(4))}`;
  }
  return focus ? `${UNIVERSE_URL}?focus=${encodeURIComponent(focus)}` : UNIVERSE_URL;
}

/** The deep link of the page this code runs on (empty on the server). */
export function currentDeepLink(): DeepLink {
  if (typeof window === 'undefined') return {};
  return parseDeepLink(window.location.search);
}
