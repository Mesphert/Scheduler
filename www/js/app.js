import { COMPETITIONS } from './config.js';
import { fetchAll } from './api.js';
import * as S from './store.js';
import * as N from './notify.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let settings = S.getSettings();
let items = S.getItems();
const cache = S.getCache();
const state = { tab: 'fixtures', fixtures: cache?.data || [], filter: 'all', loading: false, error: null, offline: false };

/* ---------- helpers ---------- */
const fmtTime = (ms) =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: !settings.hour24 });
const fmtDateTime = (ms) =>
  new Date(ms).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + fmtTime(ms);

function dayLabel(ms) {
  const d = new Date(ms).toDateString();
  if (d === new Date().toDateString()) return 'Today';
  if (d === new Date(Date.now() + 86400000).toDateString()) return 'Tomorrow';
  return new Date(ms).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' });
}

function fmtCd(ms) {
  let s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400); s %= 86400;
  const h = Math.floor(s / 3600); s %= 3600;
  const m = Math.floor(s / 60); s %= 60;
  const p = (n) => String(n).padStart(2, '0');
  return (d ? `${d}d ` : '') + `${p(h)}:${p(m)}:${p(s)}`;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2600);
}

const icons = {
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 17V11a6 6 0 1 1 12 0v6l2 2H4l2-2z"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>',
};

function applyTheme() {
  const t = settings.theme;
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

function setSetting(patch) {
  settings = { ...settings, ...patch };
  S.saveSettings(settings);
}

function pruneItems() {
  if (!settings.autoRemove) return;
  const keep = items.filter((i) => i.at > Date.now() - 3600000);
  if (keep.length !== items.length) { items = keep; S.saveItems(items); }
}

/* ---------- fixtures ---------- */
async function loadFixtures() {
  state.loading = true; state.error = null; render();
  try {
    const data = await fetchAll(settings.days);
    state.fixtures = data; state.offline = false;
    S.saveCache(data);
    await syncKickoffs(data);
  } catch {
    if (state.fixtures.length) state.offline = true;
    else state.error = 'Couldn’t load fixtures. Check your connection.';
  }
  state.loading = false; render();
}

// If ESPN moved a kick-off, move the reminder too
async function syncKickoffs(data) {
  let changed = false;
  for (const it of items) {
    if (it.type !== 'fixture') continue;
    const f = data.find((x) => x.id === it.eventId);
    if (f && f.state === 'pre' && f.at !== it.at) {
      it.at = f.at; changed = true;
      await N.cancel(it.nid);
      await N.schedule(it, settings.leadMin);
    }
  }
  if (changed) S.saveItems(items);
}

const isAdded = (id) => items.some((i) => i.eventId === id);

function fixtureCard(f) {
  const live = f.state === 'in', done = f.state === 'post';
  const canAdd = f.state === 'pre' && f.statusName === 'STATUS_SCHEDULED';
  const added = isAdded(f.id);
  let mid;
  if (live || done) {
    mid = `<div class="score ${live ? 'red' : ''}">${esc(f.home.score)} - ${esc(f.away.score)}</div>
           <div class="status ${live ? 'red' : ''}">${live ? 'LIVE ' + esc(f.clock) : esc(f.statusText)}</div>`;
  } else {
    mid = `<div class="ktime">${fmtTime(f.at)}</div>${canAdd ? '' : `<div class="status">${esc(f.statusText)}</div>`}`;
  }
  const foot = canAdd
    ? `<div class="foot"><span class="cd" data-at="${f.at}"></span>
         <button class="btn ${added ? 'added' : ''}" data-add="${f.id}">${added ? '✓ Added' : '+ Add'}</button></div>`
    : '';
  return `<article class="card fixture">
    <div class="comp">${esc(f.compName)}</div>
    <div class="match">
      <div class="team"><img class="logo" src="${esc(f.home.logo)}" alt=""><span>${esc(f.home.name)}</span></div>
      <div class="mid">${mid}</div>
      <div class="team"><img class="logo" src="${esc(f.away.logo)}" alt=""><span>${esc(f.away.name)}</span></div>
    </div>${foot}</article>`;
}

function renderFixtures() {
  const el = $('#tab-fixtures');
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const all = state.fixtures.filter((f) => settings.comps[f.comp] && f.at >= startToday.getTime());
  const present = COMPETITIONS.filter((c) => settings.comps[c.key] && all.some((f) => f.comp === c.key));
  if (state.filter !== 'all' && !present.some((c) => c.key === state.filter)) state.filter = 'all';
  const list = all.filter((f) => state.filter === 'all' || f.comp === state.filter).sort((a, b) => a.at - b.at);

  let html = '';
  if (present.length > 1) {
    html += `<div class="chips"><button class="chip ${state.filter === 'all' ? 'active' : ''}" data-filter="all">All</button>` +
      present.map((c) => `<button class="chip ${state.filter === c.key ? 'active' : ''}" data-filter="${c.key}">${esc(c.short)}</button>`).join('') + '</div>';
  }
  if (state.offline) html += '<p class="note">Offline — showing saved fixtures.</p>';
  if (state.loading && !list.length) html += '<p class="empty">Loading fixtures…</p>';
  else if (state.error) html += `<p class="empty">${esc(state.error)}</p>`;
  else if (!list.length) html += `<p class="empty">No fixtures in the next ${settings.days} days.</p>`;

  let lastDay = '';
  for (const f of list) {
    const k = new Date(f.at).toDateString();
    if (k !== lastDay) { html += `<h2 class="day">${esc(dayLabel(f.at))}</h2>`; lastDay = k; }
    html += fixtureCard(f);
  }
  el.innerHTML = html;
}

async function toggleFixture(id) {
  const existing = items.find((i) => i.eventId === id);
  if (existing) {
    await N.cancel(existing.nid);
    items = items.filter((i) => i !== existing);
    S.saveItems(items); render(); toast('Removed from schedule');
    return;
  }
  const f = state.fixtures.find((x) => x.id === id);
  if (!f) return;
  if (!(await N.ensurePermission())) return toast('Notification permission denied');
  const lead = settings.leadMin;
  if (f.at - lead * 60000 <= Date.now()) return toast(`Too close to kick-off for a ${N.leadText(lead)} reminder`);
  const n = Number(f.id);
  const item = {
    id: 'f-' + f.id, type: 'fixture', eventId: f.id,
    nid: Number.isInteger(n) && n > 0 && n < 1000000000 ? n : S.nextNid(),
    at: f.at, comp: f.comp, compName: f.compName,
    home: { name: f.home.name, logo: f.home.logo },
    away: { name: f.away.name, logo: f.away.logo },
  };
  try { await N.schedule(item, lead); } catch (e) { return toast('Failed: ' + e.message); }
  items.push(item); S.saveItems(items); render();
  toast(lead ? `Reminder set ${N.leadText(lead)} before` : 'Reminder set for kick-off');
}

/* ---------- schedule ---------- */
function itemCard(i) {
  const past = i.at <= Date.now();
  const lead = settings.leadMin;
  const left = i.type === 'fixture'
    ? `<div class="pair"><img class="logo sm" src="${esc(i.home.logo)}" alt=""><img class="logo sm" src="${esc(i.away.logo)}" alt=""></div>`
    : `<div class="bell">${icons.bell}</div>`;
  const title = i.type === 'fixture' ? `${esc(i.home.name)} vs ${esc(i.away.name)}` : esc(i.title);
  const sub = i.type === 'fixture' ? esc(i.compName) : 'Custom reminder';
  const note = past ? '' : `<span class="muted"> · ${lead ? N.leadText(lead) + ' before' : 'at start'}</span>`;
  return `<article class="card item ${past ? 'past' : ''}">
    ${left}
    <div class="info">
      <div class="title">${title}</div>
      <div class="sub">${sub}</div>
      <div class="when"><span class="blue">${fmtDateTime(i.at)}</span>${note}</div>
      <div><span class="cd" data-at="${i.at}" data-done="${i.type === 'fixture' ? 'Started' : 'Time reached'}"></span></div>
    </div>
    <button class="del" data-del="${i.id}" aria-label="Delete">✕</button></article>`;
}

function renderSchedule() {
  const sorted = [...items].sort((a, b) => a.at - b.at);
  const up = sorted.filter((i) => i.at > Date.now()), past = sorted.filter((i) => i.at <= Date.now());
  $('#schedList').innerHTML = sorted.length
    ? [...up, ...past].map(itemCard).join('')
    : '<p class="empty">Nothing scheduled yet.<br>Add fixtures from the Fixtures tab or create a custom reminder above.</p>';
}

async function addCustom() {
  const title = $('#cTitle').value.trim() || 'Reminder';
  const when = $('#cWhen').value;
  if (!when) return toast('Pick a date and time');
  const at = new Date(when).getTime();
  if (at <= Date.now()) return toast('Pick a time in the future');
  if (!(await N.ensurePermission())) return toast('Notification permission denied');
  const item = { id: '', type: 'custom', title, at, nid: S.nextNid() };
  item.id = 'c-' + item.nid;
  let ok;
  try { ok = await N.schedule(item, settings.leadMin); } catch (e) { return toast('Failed: ' + e.message); }
  if (!ok) return toast(`Too close for a ${N.leadText(settings.leadMin)} reminder`);
  items.push(item); S.saveItems(items);
  $('#cTitle').value = '';
  render(); toast('Reminder added');
}

/* ---------- settings ---------- */
const seg = (name, opts, cur) =>
  `<div class="seg">${opts.map(([v, l]) => `<button data-seg="${name}" data-val="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
const sw = (attr, checked) =>
  `<label class="switch"><input type="checkbox" ${attr} ${checked ? 'checked' : ''}><span></span></label>`;

function renderSettings() {
  const lead = settings.leadMin;
  const preview = N.content({ type: 'fixture', home: { name: 'Arsenal' }, away: { name: 'Chelsea' }, compName: 'Premier League' }, lead);
  const leadChips = [[0, 'At start'], [5, '5 min'], [10, '10 min'], [15, '15 min'], [30, '30 min'], [60, '1 hour']]
    .map(([v, l]) => `<button class="chip ${lead === v ? 'active' : ''}" data-lead="${v}">${l}</button>`).join('');

  $('#tab-settings').innerHTML = `
    <h2 class="group-title">Appearance</h2>
    <div class="group">
      <div class="row"><span>Theme</span>${seg('theme', [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']], settings.theme)}</div>
      <div class="row"><span>24-hour time</span>${sw('data-toggle="hour24"', settings.hour24)}</div>
    </div>

    <h2 class="group-title">Reminders</h2>
    <div class="group">
      <div class="row col">
        <span>Notify me before start</span>
        <div class="chips wrap">${leadChips}</div>
        <div class="inline"><input id="leadInput" class="field num" type="number" min="0" max="1440" inputmode="numeric" value="${lead}"><span class="muted">minutes (custom)</span></div>
        <div class="preview"><b>${esc(preview.title)}</b><br>${esc(preview.body)}</div>
      </div>
      <div id="exactRow"></div>
      <div class="row"><span>Auto-remove past items</span>${sw('data-toggle="autoRemove"', settings.autoRemove)}</div>
    </div>

    <h2 class="group-title">Fixtures</h2>
    <div class="group">
      <div class="row"><span>Days ahead</span>${seg('days', [[7, '7'], [14, '14'], [30, '30']], settings.days)}</div>
      ${COMPETITIONS.map((c) => `<div class="row"><span>${esc(c.name)}</span>${sw(`data-comp="${c.key}"`, settings.comps[c.key])}</div>`).join('')}
    </div>

    <h2 class="group-title">Other</h2>
    <div class="group">
      <div class="row"><span>Send test notification</span><button class="btn" data-action="test">Test</button></div>
      <div class="row"><span>Clear all scheduled</span><button class="btn danger" data-action="clear">Clear</button></div>
    </div>
    <p class="note center">Fixture data: ESPN public scoreboard</p>`;

  N.exactAlarmOk().then((ok) => {
    const r = $('#exactRow');
    if (ok === false && r) {
      r.innerHTML = `<div class="row"><span>Exact alarms are off<br><small class="muted">Reminders may arrive late</small></span><button class="btn" data-action="exact">Allow</button></div>`;
    }
  });
}

async function setLead(v) {
  const min = Math.max(0, Math.min(1440, Math.round(Number(v) || 0)));
  setSetting({ leadMin: min });
  if (items.length) {
    const n = await N.reschedule(items, min);
    toast(`Updated ${n} reminder${n === 1 ? '' : 's'}`);
  }
  render();
}

/* ---------- render / tick ---------- */
function render() {
  $('#pageTitle').textContent = { fixtures: 'Fixtures', schedule: 'Schedule', settings: 'Settings' }[state.tab];
  $('#refresh').style.visibility = state.tab === 'fixtures' ? 'visible' : 'hidden';
  document.querySelectorAll('.tab').forEach((t) => (t.hidden = t.id !== 'tab-' + state.tab));
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.tab));
  if (state.tab === 'fixtures') renderFixtures();
  else if (state.tab === 'schedule') renderSchedule();
  else renderSettings();
  tick();
}

function tick() {
  const now = Date.now();
  document.querySelectorAll('.cd').forEach((el) => {
    const left = Number(el.dataset.at) - now;
    if (left <= 0) { el.textContent = el.dataset.done || 'Started'; el.classList.remove('soon'); }
    else { el.textContent = 'In ' + fmtCd(left); el.classList.toggle('soon', left < 3600000); }
  });
}

/* ---------- events ---------- */
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-tab],[data-filter],[data-add],[data-del],[data-seg],[data-lead],[data-action],#refresh,#addCustom');
  if (!t) return;
  const d = t.dataset;

  if (d.tab) { state.tab = d.tab; pruneItems(); render(); }
  else if (d.filter) { state.filter = d.filter; render(); }
  else if (d.add) await toggleFixture(d.add);
  else if (d.del) {
    const it = items.find((i) => i.id === d.del);
    if (it) { await N.cancel(it.nid); items = items.filter((i) => i !== it); S.saveItems(items); render(); }
  }
  else if (d.seg) {
    if (d.seg === 'theme') { setSetting({ theme: d.val }); applyTheme(); render(); }
    if (d.seg === 'days') { setSetting({ days: Number(d.val) }); render(); loadFixtures(); }
  }
  else if (d.lead !== undefined) await setLead(d.lead);
  else if (d.action === 'test') {
    if (!(await N.ensurePermission())) return toast('Notification permission denied');
    await N.test(); toast('Test notification in 5 seconds — you can close the app');
  }
  else if (d.action === 'clear') {
    if (!items.length) return toast('Nothing to clear');
    if (!confirm('Remove all scheduled items?')) return;
    for (const i of items) await N.cancel(i.nid);
    items = []; S.saveItems(items); render(); toast('Cleared');
  }
  else if (d.action === 'exact') await N.openExactSettings();
  else if (t.id === 'refresh') loadFixtures();
  else if (t.id === 'addCustom') await addCustom();
});

document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.id === 'leadInput') return setLead(t.value);
  if (t.dataset.toggle) { setSetting({ [t.dataset.toggle]: t.checked }); if (t.dataset.toggle === 'autoRemove') pruneItems(); render(); }
  if (t.dataset.comp) { setSetting({ comps: { ...settings.comps, [t.dataset.comp]: t.checked } }); render(); }
});

// Hide broken club logos instead of showing a broken-image icon
document.addEventListener('error', (e) => { if (e.target.tagName === 'IMG') e.target.style.visibility = 'hidden'; }, true);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { pruneItems(); render(); } });

/* ---------- init ---------- */
applyTheme();
pruneItems();
render();
loadFixtures();
setInterval(tick, 1000);
