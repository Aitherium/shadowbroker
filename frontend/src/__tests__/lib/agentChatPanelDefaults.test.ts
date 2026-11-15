import { describe, expect, it } from 'vitest';
import {
  AGENT_CHAT_DEFAULT_CLOSED,
  agentChatDefaultRect,
} from '@/lib/agentChat/panelDefaults';
import {
  DEFAULT_DOCK_WIDTHS,
  bringToFront,
  createDefaultLayout,
  definePanel,
  patchPanel,
  resolvePanelState,
} from '@/lib/panelLayout';
import { AGENT_CHAT_PANEL_ID } from '@/lib/agentChat/prompt';

const chat = definePanel({
  id: AGENT_CHAT_PANEL_ID,
  title: 'AGENT CHAT',
  defaultDock: null,
  defaultClosed: AGENT_CHAT_DEFAULT_CLOSED,
  defaultRect: (vp) => agentChatDefaultRect(vp),
});

describe('agent chat default state', () => {
  it('starts closed so it never covers DATA LAYERS on load', () => {
    expect(AGENT_CHAT_DEFAULT_CLOSED).toBe(true);
    expect(resolvePanelState(createDefaultLayout(), chat).closed).toBe(true);
  });

  it('opens from the PANELS menu / a prompt, and stays open once opened', () => {
    const opened = bringToFront(patchPanel(createDefaultLayout(), chat.id, { closed: false, minimized: false }), chat.id);
    expect(resolvePanelState(opened, chat).closed).toBe(false);
  });

  it('other panels still start open', () => {
    const layers = definePanel({ id: 'data-layers', title: 'DATA LAYERS', defaultDock: 'left' });
    expect(resolvePanelState(createDefaultLayout(), layers).closed).toBe(false);
  });

  it.each([
    [1280, 876],
    [1024, 768],
    [1920, 1080],
    [900, 700],
  ])('its default float rect clears the left dock at %ix%i', (width, height) => {
    const r = agentChatDefaultRect({ width, height });
    expect(r.x).toBeGreaterThanOrEqual(DEFAULT_DOCK_WIDTHS.left);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.y + r.h).toBeLessThanOrEqual(height);
  });
});
