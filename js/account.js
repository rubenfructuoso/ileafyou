/* i leaf you: Konto, Sync, Einstellungen und App-Start. Lädt nach app.js.
   Ohne Datenbank auf dem Server (api/auth.php meldet configured:false) läuft die App wie bisher nur auf dem Gerät.
   Mit Datenbank ist die Anmeldung Pflicht; die Daten liegen dann zusätzlich auf dem Server und gleichen sich ab. */

const account = { configured: false, email: null, offline: false };
// Sync-Stand dieses Geräts, in IndexedDB unter 'sync': rev = zuletzt bekannte Server-Version, dirty = ungesicherte Änderungen
let sync = { rev: 0, dirty: false, force: false, email: null };
let syncTimer = null, syncRun = null, changeN = 0, srvInfo = null, started = false, lastSent = null;

/* ---------- Server ---------- */
async function api(path, body){
  let r;
  try {
    r = await fetch('api/' + path, body === undefined ? { credentials: 'same-origin', cache: 'no-store' }
      : { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-ILY': '1' }, body: JSON.stringify(body) });
  } catch(e) { const err = new Error('net'); err.status = 0; throw err; }
  let j = {}; try { j = await r.json(); } catch(e) {}
  if (!r.ok){ const err = new Error(j.error || 'server'); err.status = r.status; err.data = j; throw err; }
  return j;
}
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('net'), { status: 0 })), ms))]);
function errText(e){
  const k = 'err_' + (e && e.message);
  return I18N.de[k] ? tr(k) : e && e.status === 0 ? tr('err_net') : tr('err_server');
}

/* ---------- Fotos: im Server-Zustand nur Verweise, die Bilder einzeln ---------- */
const hashOf = new Map();   // data-URL → SHA-256
async function sha(s){
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
async function photoRef(d, photos){
  if (!d || !d.startsWith('data:')) return d;
  let h = hashOf.get(d); if (!h){ h = await sha(d); hashOf.set(d, h); }
  photos.set(h, d); return 'ily-photo:' + h;
}
async function pack(){
  const s = JSON.parse(JSON.stringify(state)), photos = new Map();
  for (const p of s.plants){ p.photo = await photoRef(p.photo, photos); for (const l of p.log || []) if (l.img) l.img = await photoRef(l.img, photos); }
  return { s, photos };
}
async function unpack(s){
  const known = new Map(), refs = new Set();
  for (const p of state.plants){ for (const d of [p.photo, ...(p.log || []).map(l => l.img)]) if (d && d.startsWith('data:')){ let h = hashOf.get(d); if (!h){ h = await sha(d); hashOf.set(d, h); } known.set(h, d); } }
  const isRef = v => typeof v === 'string' && v.startsWith('ily-photo:');
  for (const p of s.plants){ if (isRef(p.photo)) refs.add(p.photo.slice(10)); for (const l of p.log || []) if (isRef(l.img)) refs.add(l.img.slice(10)); }
  for (const h of refs) if (!known.has(h)){ const r = await api('sync.php?a=photo&h=' + h).catch(e => { if (e.status === 404) return null; throw e; }); if (r){ known.set(h, r.data); hashOf.set(r.data, h); } }
  const res = v => isRef(v) ? known.get(v.slice(10)) || null : v;
  for (const p of s.plants){ p.photo = res(p.photo); for (const l of p.log || []) if (l.img !== undefined){ l.img = res(l.img); if (!l.img) delete l.img; } }
  return s;
}

/* ---------- Zusammenführen, wenn zwei Geräte gleichzeitig geändert haben ---------- */
function merge(loc, rem){
  const out = { ...rem, ...loc };
  const deleted = [...(rem.deleted || []), ...(loc.deleted || [])].filter((d, i, a) => a.findIndex(x => x.id === d.id) === i).slice(-300);
  const gone = new Set(deleted.map(d => d.id)), plants = new Map();
  for (const p of rem.plants || []) plants.set(p.id, p);
  for (const p of loc.plants || []){
    const r = plants.get(p.id);
    if (!r){ plants.set(p.id, p); continue; }
    const log = new Map([...(r.log || []), ...(p.log || [])].map(l => [l.id, l]));
    plants.set(p.id, { ...r, ...p, log: [...log.values()].sort((a, b) => a.date.localeCompare(b.date)) });
  }
  out.plants = [...plants.values()].filter(p => !gone.has(p.id));
  out.deleted = deleted;
  const sites = new Map([...(rem.sites || []), ...(loc.sites || [])].map(s => [s.id, s]));
  out.sites = [...sites.values()];
  const gl = loc.game || {}, gr = rem.game || {};
  out.game = { ...(gr.lastCheck > gl.lastCheck ? gr : gl), badges: [...new Set([...(gl.badges || []), ...(gr.badges || [])])], best: Math.max(gl.best || 0, gr.best || 0) };
  return out;
}

/* ---------- Sync ---------- */
async function loadSync(){ try { sync = { ...sync, ...((await idbGet('sync')) || {}) }; } catch(e) {} }
function saveSync(){ if (!useLS) idbPut({ rev: sync.rev, dirty: sync.dirty, force: sync.force, email: sync.email }, 'sync').catch(() => {}); }
function onSave(){
  if (!account.email) return;
  changeN++; sync.dirty = true; saveSync();
  clearTimeout(syncTimer); syncTimer = setTimeout(() => syncNow().catch(() => {}), 1500);
}
// Nach Import, Zurücksetzen oder Beispielgarten: Server-Stand ersetzen statt zusammenführen
function replaced(){ if (account.email){ sync.force = true; onSave(); } }
function syncNow(){
  if (!account.email) return Promise.resolve();
  if (syncRun) return syncRun.then(() => syncNow());
  syncRun = (async () => {
    try { await pull(); if (sync.dirty) await push(); account.offline = false; }
    catch(e){ if (e.status === 401){ account.email = null; showAuth(); } else account.offline = e.status === 0; throw e; }
    finally { syncRun = null; if ($('#setDlg').open) renderSettings(); }
  })();
  return syncRun;
}
async function pull(){
  const r = await api('sync.php?a=get');
  if (r.rev === sync.rev || sync.force) return false;
  if (!r.state){ sync.rev = r.rev; sync.dirty = true; return false; }   // Konto noch leer: lokale Daten hochladen
  lastSent = JSON.stringify(r.state);
  const remote = await unpack(r.state);
  state = sync.dirty ? merge(state, remote) : remote;
  sync.rev = r.rev; normalize(); saveLocal(); saveSync();
  if (started){ applyStatic(); refresh(); }
  return true;
}
async function push(tries = 0){
  const n = changeN, { s, photos } = await pack(), js = JSON.stringify(s);
  if (js === lastSent && !sync.force){ sync.dirty = changeN !== n; saveSync(); return; }   // nichts geändert
  const { missing } = await api('sync.php?a=need', { hashes: [...photos.keys()] });
  for (const h of missing) await api('sync.php?a=photo', { hash: h, data: photos.get(h) });
  try {
    const r = await api('sync.php?a=put', { base: sync.rev, state: s, force: sync.force || undefined });
    sync.rev = r.rev; sync.force = false; sync.dirty = changeN !== n; lastSent = js; saveSync();
  } catch(e){
    if (e.status !== 409 || tries > 2) throw e;
    state = merge(state, await unpack(e.data.state)); sync.rev = e.data.rev; normalize(); saveLocal();
    if (started) refresh();
    return push(tries + 1);
  }
}
// Nach der Anmeldung: Daten dieses Geräts mit dem Konto verbinden
async function attach(email){
  const fresh = sync.email !== email;
  if (fresh && sync.email){ state = { lang: state.lang, plants: [] }; normalize(); }   // anderes Konto war angemeldet
  if (fresh){ sync = { rev: 0, dirty: state.plants.length > 0, force: false, email }; saveSync(); }
  account.email = email;
  await syncNow();
  pushRefresh();
}

/* ---------- Erinnerungen (Web Push, Versand durch api/cron.php) ---------- */
let pushSub = null, pushBusy = false;
const pushOK = () => BUILD === 'pwa' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
function pushHour(){ try { const h = localStorage.getItem('ileafyou.pushHour'); return h === null ? 18 : +h; } catch(e) { return 18; } }
function setPushHour(h){ try { localStorage.setItem('ileafyou.pushHour', String(h)); } catch(e) {} }
const hourText = h => new Date(2000, 0, 1, h).toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' });
const keyBytes = k => Uint8Array.from(atob(k.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - k.length % 4) % 4)), c => c.charCodeAt(0));
async function pushCurrent(){
  if (!pushOK()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return pushSub = reg ? await reg.pushManager.getSubscription() : null;
}
const pushSave = sub => api('push.php?a=subscribe', { sub: sub.toJSON(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone, hour: pushHour() });
// Beim Start: bestehendes Abo dem Server erneut melden (Zeitzone, Konto nach Neuanmeldung)
async function pushRefresh(){ try { if (Notification.permission === 'granted' && await pushCurrent()) await pushSave(pushSub); } catch(e) {} }
async function pushOn(){
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('push_denied');
  const reg = await navigator.serviceWorker.ready, { key } = await api('push.php?a=key'), opts = { userVisibleOnly: true, applicationServerKey: keyBytes(key) };
  let sub = await reg.pushManager.getSubscription();
  try { sub = sub || await reg.pushManager.subscribe(opts); }
  catch(e){ if (sub) await sub.unsubscribe(); sub = await reg.pushManager.subscribe(opts); }   // anderer Server-Schlüssel: neu abonnieren
  try { await pushSave(sub); } catch(e){
    if (e.status !== 400) throw e;
    await sub.unsubscribe(); sub = await reg.pushManager.subscribe(opts); await pushSave(sub);
  }
  pushSub = sub;
}
async function pushOff(){
  const sub = pushSub || await pushCurrent(); if (!sub) return;
  await api('push.php?a=unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe().catch(() => {}); pushSub = null;
}
function pushHtml(){
  let h = `<h3 class="seth">${tr('set_push')}</h3><p class="setp">${tr('push_p')}</p>`;
  if (!pushOK()) return h + `<p class="hint">${tr(isIOS() && !isStandalone() ? 'push_ios' : 'push_unsupported')}</p>`;
  if (Notification.permission === 'denied') return h + `<p class="hint">${tr('push_denied')}</p>`;
  const sel = `<label class="langsel"><span>${tr('push_time')}</span><select id="pushHour">${Array.from({ length: 17 }, (_, i) => i + 6).map(x => `<option value="${x}" ${x === pushHour() ? 'selected' : ''}>${hourText(x)}</option>`).join('')}</select></label>`;
  return h + (pushSub
    ? `<p class="setp"><span class="pill ok">${tr('push_is_on')}</span></p>${sel}<div class="setrow"><button type="button" class="setbtn" data-action="pushtest">${tr('push_test')}</button><button type="button" class="setbtn" data-action="pushoff">${tr('push_off_btn')}</button></div>`
    : `${sel}<div class="setrow"><button type="button" class="setbtn" data-action="pushon">${tr('push_on_btn')}</button></div>`);
}
document.addEventListener('change', async e => {
  if (e.target.id !== 'pushHour') return;
  setPushHour(+e.target.value);
  if (pushSub) try { await pushSave(pushSub); toast(tr('push_enabled', { time: hourText(pushHour()) })); } catch(err) { toast(errText(err)); }
});

/* ---------- Anmeldung ---------- */
let authMode = 'login', resetToken = new URLSearchParams(location.search).get('reset');
if (resetToken){ authMode = 'reset'; history.replaceState(null, '', location.pathname); }
function showAuth(msg){
  document.body.classList.add('authing');
  [...document.querySelectorAll('dialog[open]')].forEach(d => d.close());
  const f = (id, type, key, ac) => `<label for="${id}">${tr(key)}</label><input id="${id}" type="${type}" autocomplete="${ac}" ${type === 'email' ? 'inputmode="email" autocapitalize="off"' : ''} required>`;
  const H = {
    login: [tr('auth_welcome'), tr('auth_p'), f('aEmail', 'email', 'auth_email', 'username') + f('aPw', 'password', 'auth_pw', 'current-password'), tr('auth_login'),
      `<button type="button" class="linkbtn" data-auth="forgot">${tr('auth_forgot')}</button><button type="button" class="linkbtn" data-auth="register">${tr('auth_new')}</button>`],
    register: [tr('auth_register'), tr('auth_p'), f('aEmail', 'email', 'auth_email', 'username') + f('aPw', 'password', 'auth_pw', 'new-password') + `<div class="hint">${tr('auth_pw_hint')}</div>`, tr('auth_register'),
      `<button type="button" class="linkbtn" data-auth="login">${tr('auth_have')}</button>`],
    forgot: [tr('auth_forgot'), tr('auth_forgot_p'), f('aEmail', 'email', 'auth_email', 'username'), tr('auth_send'),
      `<button type="button" class="linkbtn" data-auth="login">${tr('auth_back')}</button>`],
    reset: [tr('auth_reset_h'), tr('auth_pw_hint'), f('aPw', 'password', 'pw_new', 'new-password'), tr('auth_reset_btn'),
      `<button type="button" class="linkbtn" data-auth="login">${tr('auth_back')}</button>`]
  }[authMode];
  $('#app').innerHTML = `<section class="auth"><h2>${H[0]}</h2><p>${H[1]}</p><form id="authForm" novalidate>${H[2]}<div class="authmsg" role="alert">${msg ? esc(msg) : ''}</div><button class="primary" type="submit">${H[3]}</button></form><div class="authlinks">${H[4]}</div>
    <label class="langsel authlang"><span>${tr('lang')}</span>${langSelect()}</label></section>`;
}
function langSelect(){ return `<select id="langSel">${LANGS.map(l => `<option value="${l}" ${l === lang() ? 'selected' : ''}>${I18N[l].langName}</option>`).join('')}</select>`; }
document.addEventListener('click', e => { const b = e.target.closest('[data-auth]'); if (b){ authMode = b.dataset.auth; showAuth(); } });
document.addEventListener('submit', async e => {
  if (e.target.id !== 'authForm') return;
  e.preventDefault();
  const btn = e.target.querySelector('.primary'), msg = e.target.querySelector('.authmsg');
  const email = ($('#aEmail') || {}).value?.trim(), password = ($('#aPw') || {}).value;
  btn.disabled = true; msg.textContent = '';
  try {
    if (authMode === 'forgot'){ await api('auth.php?a=forgot', { email, lang: lang() }); authMode = 'login'; showAuth(tr('auth_sent')); return; }
    const r = authMode === 'reset' ? await api('auth.php?a=reset', { token: resetToken, password })
      : await api('auth.php?a=' + authMode, { email, password, lang: lang() });
    resetToken = null;
    await attach(r.email).catch(() => {});
    document.body.classList.remove('authing');
    startApp(); toast(tr('auth_hello'));
  } catch(err){ msg.textContent = errText(err); }
  finally { btn.disabled = false; }
});
async function logout(force){
  if (sync.dirty && !force){
    try { await syncNow(); } catch(e) {}
    if (sync.dirty) return ask(tr('logout_unsynced'), tr('logout_anyway'), () => logout(true));
  }
  await pushOff().catch(() => {});   // nächste Person auf diesem Gerät bekommt keine fremden Erinnerungen
  await api('auth.php?a=logout', {}).catch(() => {});
  state = { lang: state.lang, plants: [] }; normalize(); saveLocal();
  sync = { rev: 0, dirty: false, force: false, email: null }; saveSync();
  account.email = null; srvInfo = null; authMode = 'login'; showAuth();
}

/* ---------- Darstellung (pro Gerät) ---------- */
function getTheme(){ try { return localStorage.getItem('ileafyou.theme') || ''; } catch(e) { return ''; } }
function setTheme(t){ try { t ? localStorage.setItem('ileafyou.theme', t) : localStorage.removeItem('ileafyou.theme'); } catch(e) {} ilyTheme(t); }

/* ---------- Einstellungen ---------- */
async function openSettings(){ renderSettings(); $('#setDlg').showModal(); if (account.email && pushOK()){ await pushCurrent().catch(() => {}); renderSettings(); } }
function renderSettings(){
  const th = getTheme(), btn = (act, key, cls) => `<button type="button" class="setbtn ${cls || ''}" data-action="${act}">${tr(key)}</button>`;
  let h = `<div class="sheethead"><h2>${tr('set_h')}</h2><button class="x" data-action="close" aria-label="${tr('close')}">×</button></div>`;
  if (account.email){
    h += `<h3 class="seth">${tr('set_account')}</h3><p class="setp">${tr('set_as', { email: `<b>${esc(account.email)}</b>` })}<br><span class="hint">${tr(account.offline || sync.dirty ? 'sync_wait' : 'sync_ok')}</span></p>
      <div class="setrow">${btn('pwform', 'pw_change')}${btn('logout', 'logout')}</div><div id="pwBox"></div>`;
  }
  if (account.email) h += pushHtml();
  h += `<h3 class="seth">${tr('set_theme')}</h3><div class="seg">${[['', 'th_auto'], ['light', 'th_light'], ['dark', 'th_dark']].map(([v, k]) => `<button type="button" data-theme-set="${v}" class="${th === v ? 'on' : ''}" aria-pressed="${th === v}">${tr(k)}</button>`).join('')}</div><p class="hint">${tr('th_hint')}</p>`;
  h += `<h3 class="seth">${tr('lang')}</h3>${langSelect()}`;
  h += `<h3 class="seth">${tr('set_garden')}</h3><div class="setrow">${btn('sites', 'set_sites')}${btn('vac', 'foot_vac')}${btn('demo', 'foot_demo')}</div>`;
  h += `<h3 class="seth">${tr('set_data')}</h3><div class="setrow">${btn('export', 'foot_export')}${btn('import', 'foot_import')}${btn('reset', 'foot_reset', 'danger')}</div>`;
  if (account.email){
    h += `<div class="setrow">${btn('accdel', 'acc_del', 'danger')}</div><div id="delBox"></div>`;
    h += `<h3 class="seth">${tr('set_server')}</h3>${serverHtml()}`;
  }
  $('#settings').innerHTML = h;
}
function serverHtml(){
  if (!srvInfo) return `<button type="button" class="setbtn" data-action="server">${tr('srv_show')}</button>`;
  if (srvInfo.error) return `<p class="hint">${esc(srvInfo.error)}</p>`;
  const S = srvInfo, p = S.php, row = (k, v) => `<tr><th>${tr(k)}</th><td>${esc(v)}</td></tr>`;
  const status = p.status === 'ok' ? tr('srv_ok') : p.status === 'update' ? tr('srv_update', { min: p.min }) : tr('srv_eol', { v: p.version.split('.').slice(0, 2).join('.'), min: p.min });
  return `<div class="srv"><p><b>PHP ${esc(p.version)}</b> <span class="pill ${p.status === 'ok' ? 'ok' : 'bad'}">${esc(status)}</span></p>
    <p class="hint">${tr('srv_stand', { date: esc(p.stand), why: esc(p.grund) })}</p>
    <table class="kv">${row('srv_sapi', S.sapi)}${row('srv_os', S.os)}${row('srv_web', S.webserver)}${row('srv_db', S.db)}${row('srv_app', S.app)}</table>
    <table class="kv">${Object.entries(S.ini).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>
    <p>${Object.entries(S.ext).map(([k, ok]) => `<span class="pill ${ok ? 'ok' : 'bad'}">${esc(k)}${ok ? '' : ' ' + tr('srv_missing')}</span>`).join(' ')}</p></div>`;
}
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-theme-set]');
  if (t){ setTheme(t.dataset.themeSet); renderSettings(); return; }
  const b = e.target.closest('#settings [data-action]'); if (!b) return;
  const a = b.dataset.action;
  if (a === 'logout') logout();
  else if (a === 'pushon' || a === 'pushoff' || a === 'pushtest'){
    if (pushBusy) return; pushBusy = true; b.disabled = true;
    try {
      if (a === 'pushon'){ await pushOn(); toast(tr('push_enabled', { time: hourText(pushHour()) })); }
      else if (a === 'pushoff'){ await pushOff(); toast(tr('push_disabled')); }
      else { await api('push.php?a=test', { endpoint: pushSub.endpoint }); toast(tr('push_sent')); }
    } catch(err){ toast(errText(err)); }
    finally { pushBusy = false; renderSettings(); }
  }
  else if (a === 'server'){ srvInfo = await api('server.php').catch(err => ({ error: errText(err) })); renderSettings(); }
  else if (a === 'pwform'){
    $('#pwBox').innerHTML = `<form id="pwForm" class="setform"><label for="pwOld">${tr('pw_old')}</label><input id="pwOld" type="password" autocomplete="current-password" required><label for="pwNew">${tr('pw_new')}</label><input id="pwNew" type="password" autocomplete="new-password" required><div class="hint">${tr('auth_pw_hint')}</div><div class="authmsg" role="alert"></div><button class="primary" type="submit">${tr('pw_change')}</button></form>`;
    $('#pwOld').focus();
  }
  else if (a === 'accdel'){
    $('#delBox').innerHTML = `<form id="delForm" class="setform"><p>${tr('acc_del_p')}</p><label for="delPw">${tr('auth_pw')}</label><input id="delPw" type="password" autocomplete="current-password" required><div class="authmsg" role="alert"></div><button class="primary danger" type="submit">${tr('acc_del_btn')}</button></form>`;
    $('#delPw').focus();
  }
});
document.addEventListener('submit', async e => {
  const f = e.target; if (f.id !== 'pwForm' && f.id !== 'delForm') return;
  e.preventDefault();
  const msg = f.querySelector('.authmsg'), btn = f.querySelector('.primary'); btn.disabled = true; msg.textContent = '';
  try {
    if (f.id === 'pwForm'){ await api('auth.php?a=password', { old: $('#pwOld').value, password: $('#pwNew').value }); renderSettings(); toast(tr('pw_saved')); }
    else {
      await api('auth.php?a=delete', { password: $('#delPw').value });
      $('#setDlg').close(); state = { lang: state.lang, plants: [] }; normalize(); saveLocal();
      sync = { rev: 0, dirty: false, force: false, email: null }; saveSync();
      account.email = null; authMode = 'register'; showAuth(tr('acc_deleted'));
    }
  } catch(err){ msg.textContent = errText(err); btn.disabled = false; }
});

/* ---------- Start ---------- */
function startApp(){
  document.body.classList.remove('authing');
  applyStatic(); dailyCheck(); render(); checkLevel() || checkBadges(); loadWeather();
  if (started) return;
  started = true;
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) return;
    if (account.email) await syncNow().catch(() => {});
    if (!document.body.classList.contains('authing')){ dailyCheck(); render(); checkLevel(); loadWeather(); }
  });
  window.addEventListener('online', () => { if (account.email) syncNow().catch(() => {}); });
}
async function boot(){
  await load(); await loadSync(); applyStatic();
  if (BUILD === 'pwa'){
    try {
      const s = await withTimeout(api('auth.php?a=status'), 6000);
      account.configured = s.configured; account.email = s.user ? s.user.email : null;
    } catch(e) {
      // Offline: wer schon angemeldet war, arbeitet auf dem Gerät weiter
      account.offline = true; account.configured = !!sync.email; account.email = sync.email;
    }
    if (account.configured && !account.email) return showAuth();
    if (account.email && !account.offline) await withTimeout(attach(account.email), 15000).catch(() => {});
  }
  startApp();
}
boot();
