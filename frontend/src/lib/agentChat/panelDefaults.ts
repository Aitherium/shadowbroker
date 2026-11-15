/**
 * Where the AGENT CHAT panel starts on a wide screen.
 *
 * It used to open on every load as a 420x580 float that covered DATA LAYERS,
 * so visitors saw only the AIRCRAFT/MARITIME rows and never found the civic
 * layers. It now starts CLOSED (PANELS -> AGENT CHAT, or any "ask the map"
 * prompt, opens it), and when it does open it lands between the two docks,
 * never over the left dock where DATA LAYERS lives.
 */
import { DEFAULT_DOCK_WIDTHS, FREE_AREA_MARGINS, type Rect, type Viewport } from '@/lib/panelLayout';

export const AGENT_CHAT_DEFAULT_CLOSED = true;
export const AGENT_CHAT_WIDTH = 420;
export const AGENT_CHAT_HEIGHT = 580;

/** Default float rect: right of the left dock, left of the right dock where it fits. */
export function agentChatDefaultRect(
  vp: Viewport,
  leftDockWidth: number = DEFAULT_DOCK_WIDTHS.left,
  rightDockWidth: number = DEFAULT_DOCK_WIDTHS.right,
): Rect {
  const gap = FREE_AREA_MARGINS.gap;
  const minX = leftDockWidth + gap;
  const w = Math.max(240, Math.min(AGENT_CHAT_WIDTH, vp.width - minX - gap));
  const preferredX = vp.width - rightDockWidth - gap - w;
  const x = Math.max(minX, preferredX);
  const top = FREE_AREA_MARGINS.top;
  const h = Math.max(200, Math.min(AGENT_CHAT_HEIGHT, vp.height - top - FREE_AREA_MARGINS.bottom));
  const y = Math.max(top, vp.height - FREE_AREA_MARGINS.bottom - h);
  return { x, y, w, h };
}
