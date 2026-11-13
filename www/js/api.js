// SportAPI (sportapi.ai) — GET /api/fixtures/date/{YYYY-MM-DD} with X-Api-Key header
const BASE = 'https://sportapi.ai/api';
const TTL_NEAR = 2 * 60 * 1000;        // today / yesterday: 2 min
const TTL_FAR = 6 * 60 * 60 * 1000;    // future days: 6 h

export class ApiError extends Error {
  constructor(code, msg) { super(msg); this.code = code; }
}

const dstr = (d) => d.toISOString().slice(0, 10);

// Map a SportAPI fixture to one of our four competitions (or null to ignore it)
function matchComp(f) {
  const n = (f.league_name || '').trim();
  const eng = f.league_geo === 'GB-ENG' || /england/i.test(f.league_zone || '');
  if (f.league_id === 24 || (eng && /^premier league$/i.test(n))) return ['eng.1', 'EPL', 'Premier League'];
  if (f.league_id === 18 || /^uefa champions league$/i.test(n)) return ['uefa.champions', 'UCL', 'Champions League'];
  if (/^(english )?fa cup$/i.test(n)) return ['eng.fa', 'FA Cup', 'FA Cup'];
  if (/carabao/i.test(n) || /^(english )?(efl|league) cup$/i.test(n)) return ['eng.league_cup', 'Carabao Cup', 'Carabao Cup'];
  return null;
}

// "espn-359.png" -> ESPN's public club-logo CDN
function logoUrl(file) {
  const m = /^espn-(\d+)\.png$/.exec(file || '');
  return m ? `https://a.espncdn.com/i/teamlogos/soccer/500/${m[1]}.png` : '';
}

function parse(f) {
  const c = matchComp(f);
  if (!c) return null;
  const st = f.status || 'Scheduled';
  const state = st === 'LIVE' ? 'in' : ['FT', 'AET', 'PENS'].includes(st) ? 'post' : 'pre';
  let statusText = { Scheduled: '', FT: 'FT', AET: 'AET', PENS: 'Pens', Postponed: 'Postponed', Cancelled: 'Cancelled', Suspended: 'Suspended' }[st] ?? st;
  if (st === 'PENS' && f.penalty_home != null) statusText = `Pens ${f.penalty_home}-${f.penalty_away}`;
  return {
    id: String(f.id),
    at: new Date(f.kickoff_utc).getTime(),
    comp: c[0], compShort: c[1], compName: c[2],
    home: { name: f.home_short || f.home_team || 'TBD', logo: logoUrl(f.home_logo), score: f.home_score ?? '' },
    away: { name: f.away_short || f.away_team || 'TBD', logo: logoUrl(f.away_logo), score: f.away_score ?? '' },
    state,
    statusName: st === 'Scheduled' ? 'STATUS_SCHEDULED' : st.toUpperCase(),
    statusText,
    clock: f.minute || '',
  };
}

const cacheGet = (d) => { try { return JSON.parse(localStorage.getItem('dc:' + d)); } catch { return null; } };
const cacheSet = (d, data) => { try { localStorage.setItem('dc:' + d, JSON.stringify({ t: Date.now(), data })); } catch {} };

async function fetchDate(date, key, near, force) {
  const c = cacheGet(date);
  if (c && !(force && near) && Date.now() - c.t < (near ? TTL_NEAR : TTL_FAR)) return c.data;
  const res = await fetch(`${BASE}/fixtures/date/${date}`, { headers: { 'X-Api-Key': key } });
  if (res.status === 401) throw new ApiError('auth', 'Invalid API key. Check it in Settings.');
  if (res.status === 429) throw new ApiError('limit', 'Daily API request limit reached. Try again after 00:00 UTC.');
  if (!res.ok) throw new ApiError('http', 'Server error ' + res.status);
  const json = await res.json();
  const data = (json.data || []).map(parse).filter(Boolean);
  cacheSet(date, data);
  return data;
}

// One request per day (yesterday .. +days), cached per day to save quota
export async function fetchAll(days, key, { force = false } = {}) {
  if (!key) throw new ApiError('nokey', 'Add your SportAPI key in Settings to load fixtures.');
  const dates = [];
  for (let i = -1; i <= days; i++) dates.push(dstr(new Date(Date.now() + i * 86400000)));
  const today = dstr(new Date());
  const out = [];
  let ok = 0, firstErr = null;
  for (let i = 0; i < dates.length; i += 5) {
    const batch = dates.slice(i, i + 5);
    const res = await Promise.allSettled(batch.map((d) => fetchDate(d, key, d <= today, force)));
    res.forEach((r) => {
      if (r.status === 'fulfilled') { ok++; out.push(...r.value); }
      else if (!firstErr) firstErr = r.reason;
    });
    if (firstErr && firstErr.code && firstErr.code !== 'http') break; // auth / limit: stop early
  }
  if (!ok) throw firstErr || new Error('failed');
  const seen = new Set();
  return out.filter((f) => !seen.has(f.id) && seen.add(f.id));
}
