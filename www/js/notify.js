const LN = window.Capacitor?.Plugins?.LocalNotifications;
export const isNative = window.Capacitor?.isNativePlatform?.() ?? false;
const timers = new Map(); // browser fallback only

export function leadText(min) {
  if (min <= 0) return '';
  const h = Math.floor(min / 60), m = min % 60, parts = [];
  if (h) parts.push(`${h} hour${h > 1 ? 's' : ''}`);
  if (m) parts.push(`${m} minute${m > 1 ? 's' : ''}`);
  return parts.join(' ');
}

export function content(item, lead) {
  const t = leadText(lead);
  if (item.type === 'fixture') {
    return {
      title: `⚽ ${item.home.name} vs ${item.away.name}`,
      body: (t ? `Kicks off in ${t}` : 'Kick-off now') + ` · ${item.compName}`,
    };
  }
  return { title: item.title, body: t ? `Starts in ${t}` : 'Starting now' };
}

export async function ensurePermission() {
  if (isNative) {
    let p = await LN.checkPermissions();
    if (p.display !== 'granted') p = await LN.requestPermissions();
    return p.display === 'granted';
  }
  if (!('Notification' in window)) return false;
  if (Notification.permission !== 'granted') await Notification.requestPermission();
  return Notification.permission === 'granted';
}

export async function cancel(nid) {
  if (isNative) { try { await LN.cancel({ notifications: [{ id: nid }] }); } catch {} }
  else { clearTimeout(timers.get(nid)); timers.delete(nid); }
}

// Returns false if the reminder time has already passed
export async function schedule(item, lead) {
  const fireAt = item.at - lead * 60000;
  if (fireAt <= Date.now()) return false;
  const { title, body } = content(item, lead);
  if (isNative) {
    await LN.schedule({
      notifications: [{
        id: item.nid, title, body,
        smallIcon: 'ic_stat_icon',
        largeIcon: 'ic_large_logo',
        schedule: { at: new Date(fireAt), allowWhileIdle: true },
      }],
    });
  } else {
    clearTimeout(timers.get(item.nid));
    timers.set(item.nid, setTimeout(() => { try { new Notification(title, { body }); } catch {} }, fireAt - Date.now()));
  }
  return true;
}

// Re-create every reminder with a new lead time. Returns how many are active.
export async function reschedule(items, lead) {
  let n = 0;
  for (const it of items) {
    await cancel(it.nid);
    if (await schedule(it, lead)) n++;
  }
  return n;
}

export async function test() {
  const at = Date.now() + 5000;
  const n = { id: 2000000000, title: 'Scheduler', body: 'Test notification — it works 🎉' };
  if (isNative) {
    await LN.schedule({ notifications: [{ ...n, smallIcon: 'ic_stat_icon', largeIcon: 'ic_large_logo', schedule: { at: new Date(at), allowWhileIdle: true } }] });
  } else {
    setTimeout(() => { try { new Notification(n.title, { body: n.body }); } catch {} }, 5000);
  }
}

export async function exactAlarmOk() {
  if (!isNative || !LN?.checkExactNotificationSetting) return null;
  try { return (await LN.checkExactNotificationSetting()).exact_alarm === 'granted'; } catch { return null; }
}
export async function openExactSettings() {
  try { await LN.changeExactNotificationSetting(); } catch {}
}
