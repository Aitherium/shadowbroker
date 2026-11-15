'use client';

/**
 * Inline hint under CIVIC & ELECTIONS: a civic layer is on but the map is too
 * far out to load any area, so nothing would draw. Offers the two ways in —
 * the visitor's own location, or a demo city — instead of silent nothing.
 */

import React, { useEffect, useState } from 'react';
import { MapPin, LocateFixed } from 'lucide-react';
import { getVisibleViewBounds, type LiveDataBounds } from '@/lib/liveDataViewport';
import { VISIBLE_VIEW_EVENT } from '@/components/map/hooks/useViewportBounds';
import { CIVIC_DEMO_CITY, CIVIC_FOCUS_ZOOM, civicZoomHint } from '@/lib/civicLayers';

export interface CivicZoomHintProps {
  activeLayers: Partial<Record<string, unknown>>;
  onFlyTo?: (lat: number, lng: number, zoom?: number) => void;
}

function useVisibleBounds(): LiveDataBounds | null {
  const [bounds, setBounds] = useState<LiveDataBounds | null>(() => getVisibleViewBounds());
  useEffect(() => {
    const sync = () => setBounds(getVisibleViewBounds());
    sync();
    window.addEventListener(VISIBLE_VIEW_EVENT, sync);
    return () => window.removeEventListener(VISIBLE_VIEW_EVENT, sync);
  }, []);
  return bounds;
}

export default function CivicZoomHint({ activeLayers, onFlyTo }: CivicZoomHintProps) {
  const bounds = useVisibleBounds();
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const hint = civicZoomHint(bounds, activeLayers);
  if (!hint || !onFlyTo) return null;

  const goDemoCity = () => onFlyTo(CIVIC_DEMO_CITY.lat, CIVIC_DEMO_CITY.lng, CIVIC_FOCUS_ZOOM);
  const goNearMe = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocateError('Location unavailable in this browser.');
      return;
    }
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onFlyTo(pos.coords.latitude, pos.coords.longitude, CIVIC_FOCUS_ZOOM);
      },
      () => {
        setLocating(false);
        setLocateError('Location was not shared. Try a city instead.');
      },
      { maximumAge: 10 * 60 * 1000, timeout: 10000 },
    );
  };

  return (
    <div
      data-testid="civic-zoom-hint"
      className="mb-2 border border-violet-700/40 bg-violet-950/20 px-2 py-1.5 text-[10px] font-mono leading-snug text-violet-300"
    >
      <div>{hint}</div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            goNearMe();
          }}
          disabled={locating}
          className="flex items-center gap-1 border border-violet-600/50 px-1.5 py-0.5 text-violet-200 hover:bg-violet-900/40 disabled:opacity-50"
        >
          <LocateFixed size={10} /> {locating ? 'LOCATING…' : 'SHOW NEAR ME'}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            goDemoCity();
          }}
          className="flex items-center gap-1 border border-violet-600/50 px-1.5 py-0.5 text-violet-200 hover:bg-violet-900/40"
        >
          <MapPin size={10} /> GO TO {CIVIC_DEMO_CITY.label.toUpperCase()}
        </button>
      </div>
      {locateError && <div className="mt-1 text-amber-400">{locateError}</div>}
    </div>
  );
}
