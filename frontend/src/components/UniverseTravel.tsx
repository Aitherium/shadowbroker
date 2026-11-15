'use client';

/**
 * The header's travel controls: a small chip naming the world this map was LANDED on
 * (from `?world=`), and a "Universe" link that TAKES OFF back to BeadSpace focused on
 * that world (or on the landed point). Lives in the top-left header, above the
 * DATA LAYERS panel (which starts at y=96), so it never covers it.
 */

import { useEffect, useState } from 'react';
import { currentDeepLink, universeUrl, type DeepLink } from '@/lib/universeDeepLink';

export default function UniverseTravel() {
  // Read after mount: the server render has no URL, and a mismatch would warn.
  const [link, setLink] = useState<DeepLink>({});
  useEffect(() => setLink(currentDeepLink()), []);
  return (
    <div className="pointer-events-auto flex items-center gap-2 ml-1 md:ml-2" data-testid="universe-travel">
      {link.world ? (
        <span
          className="max-w-[10rem] truncate rounded-full border border-cyan-700/60 bg-cyan-950/50 px-2 py-0.5 text-[10px] font-mono tracking-wider text-cyan-300"
          title={`Landed from the universe: ${link.world}`}
          data-testid="world-chip"
        >
          {link.world}
        </span>
      ) : null}
      <a
        href={universeUrl(link)}
        className="rounded border border-cyan-800/60 bg-cyan-950/40 px-2 py-0.5 text-[10px] font-mono font-bold tracking-[0.2em] text-cyan-400 hover:border-cyan-500/60 hover:text-cyan-200 transition-colors"
        title={link.world ? `Take off: back to ${link.world} in the universe` : 'Open the universe (BeadSpace)'}
        data-testid="universe-button"
      >
        UNIVERSE
      </a>
    </div>
  );
}
