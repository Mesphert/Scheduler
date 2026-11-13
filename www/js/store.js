import { COMPETITIONS } from './config.js';

const get = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const set = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

const DEFAULTS = {
  theme: 'system',      // system | light | dark
  leadMin: 5,           // minutes before the event
  days: 14,             // fixture window
  hour24: false,
  autoRemove: true,     // drop items 1h after they start
  comps: Object.fromEntries(COMPETITIONS.map((c) => [c.key, true])),
};

export function getSettings() {
  const s = get('settings', {});
  return { ...DEFAULTS, ...s, comps: { ...DEFAULTS.comps, ...(s.comps || {}) } };
}
export const saveSettings = (s) => set('settings', s);

export const getItems = () => get('items', []);
export const saveItems = (i) => set('items', i);

export const getCache = () => get('fixturesCache', null);
export const saveCache = (data) => set('fixturesCache', { t: Date.now(), data });

// IDs for custom reminders live above ESPN event ids (32-bit safe)
export function nextNid() {
  const n = (get('nid', 0) % 900000000) + 1;
  set('nid', n);
  return 1000000000 + n;
}
