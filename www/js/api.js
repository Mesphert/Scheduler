import { COMPETITIONS } from './config.js';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const ymd = (d) =>
  `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;

function parse(ev, comp) {
  const c = ev.competitions?.[0];
  const home = c?.competitors?.find((x) => x.homeAway === 'home');
  const away = c?.competitors?.find((x) => x.homeAway === 'away');
  if (!home || !away) return null;
  const team = (x) => ({
    name: x.team?.shortDisplayName || x.team?.displayName || 'TBD',
    logo: x.team?.logo || x.team?.logos?.[0]?.href || '',
    score: x.score ?? '',
  });
  const st = ev.status?.type || c.status?.type || {};
  return {
    id: String(ev.id),
    at: new Date(ev.date).getTime(),
    comp: comp.key,
    compShort: comp.short,
    compName: comp.name,
    home: team(home),
    away: team(away),
    state: st.state,                 // pre | in | post
    statusName: st.name,             // STATUS_SCHEDULED, STATUS_POSTPONED...
    statusText: st.shortDetail || st.description || '',
    clock: ev.status?.displayClock || '',
  };
}

async function fetchCompetition(comp, days) {
  const start = new Date(Date.now() - 86400000);
  const end = new Date(Date.now() + days * 86400000);
  const url = `${BASE}/${comp.key}/scoreboard?dates=${ymd(start)}-${ymd(end)}&limit=300`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const json = await res.json();
  return (json.events || []).map((e) => parse(e, comp)).filter(Boolean);
}

// Returns fixtures from every competition that answered. Throws only if ALL failed.
export async function fetchAll(days) {
  const results = await Promise.allSettled(COMPETITIONS.map((c) => fetchCompetition(c, days)));
  if (results.every((r) => r.status === 'rejected')) throw new Error('offline');
  const seen = new Set();
  const out = [];
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const f of r.value) if (!seen.has(f.id)) { seen.add(f.id); out.push(f); }
  }
  return out;
}
