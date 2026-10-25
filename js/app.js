/* i leaf you: App-Logik. Texte nur über tr(), nie hart codiert. */
const KEY = 'ileafyou.v1', OLD_KEYS = ['blattwerk.v1'];
const BUILD = document.body.dataset.build || 'pwa';
let installEvt = null; // gemerktes beforeinstallprompt-Ereignis
let state = { plants: [] };
let pendingIcon = 'generic', roomFilter = null, editingId = null, pendingPhoto = null, detailId = null, undoFn = null, toastTimer = null;

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);

/* ---------- Sprache ---------- */
const LANGS = ['de', 'en', 'es', 'fr'];
function detectLang(){ const n = (navigator.language || 'de').slice(0, 2).toLowerCase(); return LANGS.includes(n) ? n : 'en'; }
const lang = () => LANGS.includes(state.lang) ? state.lang : detectLang();
const L = () => I18N[lang()];
function tr(key, vars){
  let s = L()[key] ?? I18N.de[key] ?? key;
  const q = L().q;
  return String(s).replace(/\{(\w+)\}/g, (m, k) => k === 'q1' ? q[0] : k === 'q2' ? q[1] : (vars && k in vars ? vars[k] : m));
}
const loc = () => L().locale;
const lvName = k => L().lv[k];
function applyStatic(){
  document.documentElement.lang = lang();
  $('#logoMark').innerHTML = plantSvg(7, 'mark'); $('#gearBtn').innerHTML = pix('gear');
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = tr(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = tr(el.dataset.i18nPh); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', tr(el.dataset.i18nAria)); });
}

const TYPE_COLORS = { water: 'var(--water)', feed: 'var(--feed)', repot: 'var(--moss)', note: 'var(--muted)', check: 'var(--line)', photo: 'var(--trieb)' };
const typeLabel = type => tr('type_' + type);
const LEVELS = [0, 50, 150, 300, 500, 800, 1200, 1800];

/* ---------- Bildmarke: Pixel-Topfpflanze mit Herz, 8 Wachstumsstufen (16×16) ---------- */
const PLANTS = [
  ["................", "................", "................", "................", "................", "................", "................", "................", "..EEEEEEEEEEEEE.", "..EnnnnnTnnnnnE.", "..EEEEEEEEEEEEE.", "...EnnDDnDDnnE..", "...EnnDDDDDnnE..", "....EnnDDDnnE...", "....EnnnDnnnE...", ".....EEEEEEE...."],
  ["................", "................", "................", "................", "................", "................", ".....TTT.TTT....", "......TTMTT.....", "..EEEEEEEEEEEEE.", "..EnnnnnnnnnnnE.", "..EEEEEEEEEEEEE.", "...EnnDDnDDnnE..", "...EnnDDDDDnnE..", "....EnnDDDnnE...", "....EnnnDnnnE...", ".....EEEEEEE...."],
  ["................", "................", "................", ".......TTT......", "........M.......", "...TTT..M..TTT..", "....TTTTMTTTT...", "........M.......", "..EEEEEEEEEEEEE.", "..EnnnnnnnnnnnE.", "..EEEEEEEEEEEEE.", "...EnnDDnDDnnE..", "...EnnDDDDDnnE..", "....EnnDDDnnE...", "....EnnnDnnnE...", ".....EEEEEEE...."],
  ["................", ".......TTT......", "......TTLTT.....", "..TTT...M...TTT.", ".TTLTT..M..TTLTT", "..TTTTTTMTTTTTT.", "........M.......", "........M.......", "..EEEEEEEEEEEEE.", "..EnnnnnnnnnnnE.", "..EEEEEEEEEEEEE.", "...EnnDDnDDnnE..", "...EnnDDDDDnnE..", "....EnnDDDnnE...", "....EnnnDnnnE...", ".....EEEEEEE...."],
  [".......TTT......", "......TTLTT.....", "..TTT...M...TTT.", ".TTLTT..M..TTLTT", "..TTTTTTMTTTTTT.", ".TTT....M....TTT", ".TTLTTTTMTTTTLTT", "..TTTTTTMTTTTTT.", "..EEEEEEEEEEEEE.", "..EnnnnnnnnnnnE.", "..EEEEEEEEEEEEE.", "...EnnDDnDDnnE..", "...EnnDDDDDnnE..", "....EnnDDDnnE...", "....EnnnDnnnE...", ".....EEEEEEE...."],
  [".......DDD......", "........M.......", "..TTT...M...TTT.", ".TTLTT..M..TTLTT", "..TTTTTTMTTTTTT.", ".TTT....M....TTT", ".TTLTTTTMTTTTLTT", "..TTTTTTMTTTTTT.", "..EEEEEEEEEEEEE.", "..EnnnnnnnnnnnE.", "..EEEEEEEEEEEEE.", "...EnnDDnDDnnE..", "...EnnDDDDDnnE..", "....EnnDDDnnE...", "....EnnnDnnnE...", ".....EEEEEEE...."],
  ["....TTT...TTT...", "...TTLTT.TTLTT..", "..TTTMTTMTTMTTT.", ".TTLTTT.M.TTTLTT", ".TTTTMTTMTTMTTTT", "..TTTTT.M.TTTTT.", ".TTLTTTTMTTTTLTT", "..TTMTTTMTTTMTT.", "..EEEEEEEEEEEEE.", "..EnnnnnnnnnnnE.", "..EEEEEEEEEEEEE.", "...EnnDDnDDnnE..", "...EnnDDDDDnnE..", "....EnnDDDnnE...", "....EnnnDnnnE...", ".....EEEEEEE...."],
  ["...TT..YDY..TT..", "..TLTTDYHYDTTLT.", "..TTTMTYDYTMTTT.", ".TTLTTT.M.TTTLTT", ".TTTTMTTMTTMTTTT", "..TTTTT.M.TTTTT.", ".TTLTTTTMTTTTLTT", "..TTMTTTMTTTMTT.", "..EEEEEEEEEEEEE.", "..EnnnnnnnnnnnE.", "..EEEEEEEEEEEEE.", "...EnnDDnDDnnE..", "...EnnDDDDDnnE..", "....EnnDDDnnE...", "....EnnnDnnnE...", ".....EEEEEEE...."]
];
const KINDS = {
  generic: ["................", "................", ".......TT.......", "......TLLT......", "..TT...MM...TT..", ".TLTT..MM..TTLT.", "..TTTT.MM.TTTT..", "....TTTMMTTT....", "..TTT..MM..TTT..", "...TTTTMMTTTT...", ".......MM.......", "..EEEEEEEEEEEE..", "..EbbbbbbbbbbE..", "...EnnnnnnnnE...", "...EnnnnnnnnE...", "....EEEEEEEE...."],
  monstera: ["................", "...MMMM..MMMM...", "..MTTMMMMMMTTM..", ".MT.TTMMMMTT.TM.", ".MTT.TMMMMT.TTM.", ".MTTTTMMMMTTTTM.", "..MT.TMMMMT.TM..", "...MMM.MM.MMM...", ".......MM.......", ".......MM.......", ".......MM.......", "..EEEEEEEEEEEE..", "..EbbbbbbbbbbE..", "...EnnnnnnnnE...", "...EnnnnnnnnE...", "....EEEEEEEE...."],
  herb: ["................", "................", ".....TTTTTT.....", "...TTLTTTTLTT...", "..TTTTTMMTTTTT..", "..TLTTTMMTTTLT..", "...TTTMMMMTTT...", "....TTTMMTTT....", ".....TTMMTT.....", ".......MM.......", ".......MM.......", "..EEEEEEEEEEEE..", "..EbbbbbbbbbbE..", "...EnnnnnnnnE...", "...EnnnnnnnnE...", "....EEEEEEEE...."],
  lemon: ["................", ".....MMMMMM.....", "...MMTTTTTTMM...", "..MTTYTTTTTTTM..", "..MTYYTTTTYTTM..", "..MTTTTTTYYTTM..", "...MTTYTTTTTM...", "....MMMMMMMM....", ".......nn.......", ".......nn.......", ".......nn.......", "..EEEEEEEEEEEE..", "..EbbbbbbbbbbE..", "...EnnnnnnnnE...", "...EnnnnnnnnE...", "....EEEEEEEE...."],
  orchid: ["................", "...PP....PP.....", "..PpHP..PpHP....", "...PP.MM.PP.....", "......M....PP...", ".....M....PpHP..", ".....M.....PP...", "......M...M.....", "..TT...M.M...TT.", ".TTTT..MMM..TTTT", "..TTTTTMMTTTTT..", "..EEEEEEEEEEEE..", "..EbbbbbbbbbbE..", "...EnnnnnnnnE...", "...EnnnnnnnnE...", "....EEEEEEEE...."],
  pothos: ["................", "................", "................", "................", "................", ".....TT..TT.....", "....TLTTTTLT....", "...TTTMTTMTTT...", "..TTMTTTTTTMTT..", ".TTT.TTTTTT.TTT.", ".TT..........TT.", "TTEEEEEEEEEEEETT", "T.EbbbbbbbbbbE.T", "TT.EnnnnnnnnE.TT", ".T.EnnnnnnnnE.T.", "....EEEEEEEE...."],
  aloe: ["................", ".......T........", "...T...TT...T...", "...TT..TT..TT...", "....TT.TT.TT....", ".T..TTLTTLTT..T.", ".TT.TTLTTLTT.TT.", "..TTTTLTTLTTTT..", "...TTTTTTTTTT...", "....TTMTTMTT....", "...MMMMMMMMMM...", "..EEEEEEEEEEEE..", "..EbbbbbbbbbbE..", "...EnnnnnnnnE...", "...EnnnnnnnnE...", "....EEEEEEEE...."],
  cactus: [".......PP.......", "......MTTM......", "......MTTM......", "..MM..MTTM......", "..MT..MTTM..MM..", "..MT..MTTM..TM..", "..MTMMMTTM..TM..", "...MMMMTTMMMMM..", "......MTTMMM....", "......MTTM......", "......MTTM......", "..EEEEEEEEEEEE..", "..EbbbbbbbbbbE..", "...EnnnnnnnnE...", "...EnnnnnnnnE...", "....EEEEEEEE...."]
};
const KIND_KEYS = Object.keys(KINDS);
const EMOJI_KIND = { '🌿': 'monstera', '🌱': 'herb', '🍋': 'lemon', '🌷': 'orchid', '🍃': 'pothos', '🌵': 'cactus' };
const plantSvg = (i, cls) => pixGrid(PLANTS[Math.max(0, Math.min(7, i))], cls);

/* ---------- Pixel-Icons für das Spiel (16×16, eigene Entwürfe im 16-Bit-Stil) ---------- */
const PIXPAL = {"P": "#E58FB6", "p": "#B5547F", "E": "#3B2A20", "M": "#2F5A35", "T": "#9BD25B", "L": "#CFE3B8", "K": "#F2F4EC", "H": "#FFFFFF", "W": "#2F7CB0", "w": "#7FC0E8", "D": "#E0A43A", "d": "#A8741C", "b": "#8B5E3C", "n": "#5A3A24", "R": "#D2462E", "O": "#F08A2E", "Y": "#FFD84A", "G": "#9AA096", "g": "#5E645A"};
const PIX = {
  gear: ["................", ".......EE.......", "...EE.EGGE.EE...", "..EGGEGGGGEGGE..", "..EGGGGGGGGGGE..", "...EGGGEEGGGE...", ".EEGGGE..EGGGEE.", "EGGGGE....EGGGGE", "EGGGGE....EGGGGE", ".EEGGGE..EGGGEE.", "...EGGGEEGGGE...", "..EGGGGGGGGGGE..", "..EGGEGGGGEGGE..", "...EE.EGGE.EE...", ".......EE.......", "................"],
  p1: ["................", "...TTT....TTT...", "..TLLTT..TTLLT..", "..TTTTTTTTTTTT..", "...TTTTMMTTTT...", ".....TTMMTT.....", ".......MM.......", ".......MM.......", "nnnnnnnnnnnnnnnn", "bbbbbbbKKbbbbbbb", "bbbbbbKbbKbbbbbb", "bbbbbKbbbbKbbbbb", "bbbbKbbKKbbKbbbb", "bbbbbbKbbKbbbbbb", "bbbbbbbbbbbbbbbb", "................"],
  p5: ["................", ".......EE.......", "......ERRE......", ".....ERRRRE.....", "....ERRRRRRE....", "...ERRRRRRRRE...", "..ERRRRRRRRRRE..", ".EEEEEEEEEEEEEE.", "..EKKKKKKKKKKE..", "..EKwwwKKnnnKE..", "..EKwTwKKnnnKE..", "..EKTTTKKnnnKE..", "..EKbbbKKnnDKE..", "..EKKKKKKnnnKE..", "..EEEEEEEEEEEE..", "................"],
  p15: ["................", ".....MMMMMM.....", "...MMTTTTTTMM...", "..MTTLLTTTTTTM..", ".MTTLTTTTTMTTTM.", ".MTTTTTTMMTTTTM.", ".MMTTTMTTTTTTMM.", "..MMTTTTTTLTMM..", "...MMMTTTTMMM...", ".....MMnnMM.....", ".......nn.......", ".......nn.......", "......nnnn......", ".....nn..nn.....", "MMTTMMTTMMTTMMTT", "................"],
  w25: ["................", "................", ".........EEEE...", "Ew......E....E..", ".EwE..EEEEEEE.E.", "..EWEEWWWWWWWE.E", "...EWWWwwWWWWE.E", "....EWWwWWWWWEE.", "w...EWWWWWWWWE..", "....EWWWWWWWWE..", ".w..EWWWWWWWWE..", "....EWWWWWWWWE..", "w...EEEEEEEEEE..", "................", "................", "................"],
  f10: ["................", "......EEEE......", "......EKKE......", "......EKKE......", "......EKKE......", ".....EKKKKE.....", "....EKKKKKKE....", "...EKKKKKKKKE...", "...EDDDDDDDDE...", "..EDDYDDDDDDDE..", "..EDDDDDDTTDDE..", ".EDDDDDTTTDDDDE.", ".EDDDDTTDDDDDDE.", ".EddddddddddddE.", "..EEEEEEEEEEEE..", "................"],
  r1: ["................", "..........EE....", ".........EGGE...", "........EGGE....", ".......EGGE.....", "......EnnE......", ".....EnnE.......", "..EEEEEEEEEEEE..", "..EddddddddddE..", "..EEEEEEEEEEEE..", "...EbbbbbbbbE...", "...EbbbbbbbbE...", "...EbbbbbbbbE...", "....EbbbbbbE....", "....EEEEEEEE....", "................"],
  n5: ["................", "....EEEEE.......", "...EwwwwwE......", "..EwHHwwwwE.....", "..EwHwwwwwE.....", "..EwwwwwwwE.....", "..EwwwwTwwE.....", "..EwwwwwwwE.....", "...EwwwwwE......", "....EEEEEdd.....", "..........ddd...", "...........ddd..", "............ddd.", ".............dd.", "................", "................"],
  ph3: ["................", "................", "....EEEE........", "...EggggE.......", ".EEEEEEEEEEEEEE.", ".EGGGGGGGGGGDGE.", ".EGGGEEEEEGGGGE.", ".EGGEwwwwwEGGGE.", ".EGEwwHwwwwEGGE.", ".EGEwHwwwwwEGGE.", ".EGEwwwwwwwEGGE.", ".EGGEwwwwwEGGGE.", ".EGGGEEEEEGGGGE.", ".EEEEEEEEEEEEEE.", "................", "................"],
  flame: ["................", ".......R........", "......RR........", "......RRR.......", ".....RRORR..R...", "....RROORR.RR...", "....RROOORRRR...", "...RROOYOORRR...", "...ROOYYYOORR...", "..RROYYYYYORR...", "..ROOYYYYYOOR...", "..ROYYYHHYYOR...", "..RROYYYYYORR...", "...RROOOOORR....", "....RRRRRRR.....", "................"],
  s30: ["................", "...EEEEEEEEEE...", ".EEEYYYYYYYDEEE.", "E..EYHYYYYYDE..E", "E..EYHYYYYYDE..E", ".E.EYYYYYYYDE.E.", "..EEYYYYYYYDEE..", "....EYYYYYDE....", ".....EYYYDE.....", "......EDDE......", "......EDDE......", ".....EDDDDE.....", "....EEEEEEEE....", "....EnnnnnnE....", "....EEEEEEEE....", "................"],
  medal: ["................", "..WWW.....RRR...", "...WWW...RRR....", "....WWW.RRR.....", ".....WWWRR......", "......EEEE......", "....EEDDDDEE....", "...EDDYYYYDDE...", "...EDYYYYYEDE...", "..EDYYYYYEYDDE..", "..EDYEYYEYYDDE..", "..EDYYEEYYYDDE..", "...EDYYYYYYDE...", "...EDDDDDDDDE...", "....EEDDDDEE....", "......EEEE......"]
};
const pix = (name, cls) => PIX[name] ? pixGrid(PIX[name], cls) : '';
function pixGrid(g, cls){
  let r = '';
  g.forEach((row, y) => { for (let x = 0; x < 16;){ const c = row[x]; if (c === '.'){ x++; continue; } let x2 = x; while (x2 < 16 && row[x2] === c) x2++; r += `<rect x="${x}" y="${y}" width="${x2-x}" height="1" fill="${PIXPAL[c]}"/>`; x = x2; } });
  return `<svg class="pix ${cls || ''}" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`;
}

/* ---------- Datum & Spielstand ---------- */
const levelOf = xp => LEVELS.reduce((i, v, k) => xp >= v ? k : i, 0);
const dkey = d => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`; };
const fromKey = k => { const [y,m,d] = k.split('-').map(Number); return new Date(y, m-1, d); };
const day0 = d => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const fmtDay = (d, opts) => new Date(d).toLocaleDateString(loc(), opts);
function game(){
  if (!state.game){ const y = new Date(); y.setDate(y.getDate()-1); state.game = { xp: 0, level: 0, streak: 0, lastCheck: dkey(y), dayDone: null }; }
  return state.game;
}
function openTasks(){ return state.plants.reduce((n, p) => n + ['water','feed'].filter(t => { const d = due(p, t); return d !== null && d <= 0; }).length, 0); }
function dueOn(p, t, day){
  const every = t === 'water' ? +p.waterEvery : +p.feedEvery; if (!every) return null;
  const end = day0(day); if (day0(p.created) > end) return null;
  const prior = p.log.filter(l => l.type === t && day0(l.date) <= end).map(l => l.date).sort().pop();
  let d = every - Math.round((end - day0(prior || p.created)) / 864e5);
  const chk = p.log.filter(l => l.type === 'check' && l.for === t && day0(l.date) <= end && (!prior || l.date >= prior)).sort((a,b) => b.date.localeCompare(a.date))[0];
  if (chk) d = Math.max(d, chk.days - Math.round((end - day0(chk.date)) / 864e5));
  return d;
}
const due = (p, t) => dueOn(p, t, new Date());
function dailyCheck(){
  const g = game(), today = day0(new Date()), cur = fromKey(g.lastCheck);
  cur.setDate(cur.getDate() + 1);
  let pen = 0, n = 0;
  while (cur < today){
    const onVac = g.vacation && dkey(cur) <= g.vacation.until;
    if (!onVac && n++ < 60){
      const over = state.plants.reduce((s, p) => s + ['water','feed'].filter(t => { const d = dueOn(p, t, cur); return d !== null && d < 0; }).length, 0);
      if (over){ pen += over * 5; g.streak = 0; } else if (state.plants.length) g.streak++;
      g.best = Math.max(g.best || 0, g.streak);
    }
    g.lastCheck = dkey(cur); cur.setDate(cur.getDate() + 1);
  }
  if (g.vacation && g.vacation.until < dkey(today)) delete g.vacation;
  if (pen){ g.xp = Math.max(0, g.xp - pen); toast(tr('penalty', { n: pen })); }
  save();
}
function checkLevel(quiet){
  const g = game(), lv = levelOf(g.xp); if (lv === g.level) return false;
  const up = lv > g.level; g.level = lv; save();
  if (!quiet) celebrate(up ? 'up' : 'down');
  return !quiet;
}

/* ---------- Texte zu Fälligkeiten ---------- */
function dueText(d){
  if (d > 1) return tr('inDays', { n: d });
  if (d === 1) return tr('tomorrowL');
  if (d === 0) return tr('todayL');
  return -d === 1 ? tr('overdue1') : tr('overdueN', { n: -d });
}
const whenText = n => n === 1 ? tr('tomorrowL') : tr('inDays', { n });
const verb = t => tr(t);
const verbL = t => tr(t + 'L');

/* ---------- Speichern & Laden ---------- */
// IndexedDB statt localStorage: kein 5-MB-Limit, Platz für das Foto-Tagebuch.
// Ohne IndexedDB (selten) bleibt localStorage. Alte localStorage-Daten werden beim ersten Start übernommen.
let useLS = false, dbP = null;
function idb(){
  return dbP ||= new Promise((res, rej) => {
    if (!window.indexedDB) return rej(new Error('no idb'));
    const r = indexedDB.open('ileafyou', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
const idbGet = (k = KEY) => idb().then(db => new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }));
const idbPut = (v, k = KEY) => idb().then(db => new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = t.onabort = () => rej(t.error); }));
function lsGet(){
  try { let r = localStorage.getItem(KEY); if (!r) for (const k of OLD_KEYS){ r = localStorage.getItem(k); if (r) break; } return r; } catch(e) { return null; }
}
async function load(){
  let r = null, fromLS = false;
  try { r = await idbGet(); } catch(e) { useLS = true; }
  if (!r){ r = lsGet(); fromLS = !!r; }
  try { if (r) state = JSON.parse(r); } catch(e) {}
  normalize();
  if (fromLS && !useLS) idbPut(JSON.stringify(state)).then(() => { try { [KEY, ...OLD_KEYS].forEach(k => localStorage.removeItem(k)); } catch(e) {} }).catch(() => { useLS = true; });
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}
// Datenmodell auf den aktuellen Stand bringen (beim Laden und beim Import)
function normalize(){
  if (!state || typeof state !== 'object') state = { plants: [] };
  if (!Array.isArray(state.plants)) state.plants = [];
  state.plants.forEach(p => { if (!p.icon){ p.icon = EMOJI_KIND[p.emoji] || (p.emoji === '🪴' && /aloe/i.test(p.species || '') ? 'aloe' : 'generic'); } delete p.emoji; });
  migrateSites(); game();
}
function migrateSites(){
  if (!Array.isArray(state.sites) || !state.sites.length) state.sites = [{ id: 'home', name: tr('defaultSite') }];
  state.plants.forEach(p => { if (!state.sites.some(s => s.id === p.siteId)) p.siteId = state.sites[0].id; });
  if (state.site && !state.sites.some(s => s.id === state.site)) state.site = null;
}
// Speichert auf dem Gerät und meldet die Änderung an den Sync (js/account.js)
function save(){ saveLocal(); if (typeof onSave === 'function') onSave(); }
function saveLocal(){
  const s = JSON.stringify(state);
  if (!useLS) return void idbPut(s).catch(() => toast(tr('saveFail')));
  try { localStorage.setItem(KEY, s); } catch(e) { toast(tr('saveFail')); }
}

/* ---------- Datensicherung: Export und Import als JSON ---------- */
function exportData(){
  const data = JSON.stringify({ app: 'ileafyou', v: 1, exported: new Date().toISOString(), state });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  a.download = `ileafyou-${dkey(new Date())}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  toast(tr('exp_done'));
}
$('#importIn').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  let next;
  try { const d = JSON.parse(await f.text()); next = d && d.app === 'ileafyou' ? d.state : d; } catch(err) {}
  if (!next || !Array.isArray(next.plants)) return toast(tr('imp_bad'));
  const apply = () => { const keepLang = state.lang; state = next; if (!state.lang) state.lang = keepLang; normalize(); save(); replaced(); applyStatic(); render(); toast(tr('imp_done')); };
  if (!state.plants.length) apply(); else ask(tr('imp_ask'), tr('imp_btn'), apply);
});
const siteName = id => (state.sites.find(s => s.id === id) || {}).name || '';
const inView = p => !state.site || p.siteId === state.site;
const siteTag = p => !state.site && state.sites.length > 1 ? `, ${esc(siteName(p.siteId))}` : '';
const thumb = (p, cls) => p.photo ? `<img class="${cls}" src="${p.photo}" alt="">` : `<div class="${cls} pixbox" aria-hidden="true">${pixGrid(KINDS[p.icon] || KINDS.generic)}</div>`;
const getP = id => state.plants.find(p => p.id === id);

/* ---------- Level, Feiern, Regeln ---------- */
function lvlHtml(){
  const g = game(), lv = levelOf(g.xp), nxt = LEVELS[lv+1];
  const pct = nxt !== undefined ? Math.max(3, (g.xp - LEVELS[lv]) / (nxt - LEVELS[lv]) * 100) : 100;
  return `<button class="lvl" data-action="rules"><span class="em">${plantSvg(lv)}</span><span class="col"><span class="lk">${tr('levelN', { n: lv+1 })}</span><span class="ln">${lvName(lv)}</span><span class="xpbar"><i style="width:${pct}%"></i></span><span class="lk">${nxt !== undefined ? tr('xpTo', { xp: g.xp, next: nxt, name: lvName(lv+1) }) : tr('xpMax', { xp: g.xp })}</span></span><span class="streak">${pix('flame')}${g.streak}<small>${g.streak === 1 ? tr('streak1') : tr('streakN')}</small></span></button>`;
}
function openCel(html, cls){
  $('#cel').className = 'celebrate ' + (cls || '');
  $('#cel').innerHTML = html;
  const dlg = $('#celDlg'); if (dlg.open) dlg.close(); dlg.showModal();
}
function celebrate(kind, extra){
  const g = game(), lv = levelOf(g.xp), nxt = LEVELS[lv+1];
  let big, h, txt, cls = '';
  if (kind === 'up'){ big = plantSvg(lv); h = tr('cel_up', { name: lvName(lv) }); txt = nxt !== undefined ? tr('cel_upTxt', { name: lvName(lv+1), xp: nxt }) : tr('cel_max'); }
  else if (kind === 'down'){ big = plantSvg(lv); cls = 'down'; h = tr('cel_down', { name: lvName(lv) }); txt = tr('cel_downTxt'); }
  else if (kind === 'badge'){ const [n, d] = L().b[extra.id]; big = pix(extra.e); h = tr('cel_badge', { name: n }); txt = tr('cel_badgeTxt', { d }); }
  else if (kind === 'day'){ big = pix('medal'); h = tr('cel_day'); txt = tr('cel_dayTxt'); }
  else { big = plantSvg(lv); h = tr('rules_h'); txt = `${tr('rules_txt')}<br><br><span class="rlist">${LEVELS.map((xp, k) => `<span>${plantSvg(k)} ${tr('rules_lvl', { name: lvName(k), xp })}</span>`).join('')}</span>`; }
  openCel(`<div class="big">${big}</div><h2>${h}</h2><p>${txt}</p><button class="primary" data-action="close">${tr('btn_continue')}</button>`, cls);
}

/* ---------- Hauptansicht ---------- */
function render(){
  $('#date').textContent = fmtDay(new Date(), { weekday:'long', day:'numeric', month:'long' });
  const plants = state.plants;
  if (!plants.length){
    $('#app').innerHTML = `<section class="empty"><h2>${tr('empty_h')}</h2><p>${tr('empty_p')}</p><button class="btn" data-action="new">${tr('empty_btn')}</button><div style="margin-top:10px"><button class="linkbtn" data-action="demo">${tr('empty_demo')}</button></div></section>${footHtml()}`;
    return;
  }
  const vis = plants.filter(inView);
  const all = vis.flatMap(p => ['water','feed'].map(t => ({ p, t, d: due(p, t) }))).filter(x => x.d !== null);
  const tasks = all.filter(x => x.d <= 0).sort((a,b) => a.d - b.d);
  let today;
  if (tasks.length){
    today = tasks.map(({p,t,d}) => `
      <div class="task">
        ${thumb(p,'thumb')}
        <button class="t" data-action="open" data-id="${p.id}"><div class="n">${esc(p.name)}</div><div class="s ${d < 0 ? 'late' : ''}">${verb(t)} ${dueText(d)}${siteTag(p)}</div></button>
        <button class="later" data-action="later" data-type="${t}" data-id="${p.id}">${tr('later')}</button>
        <button class="do ${t === 'feed' ? 'feed' : ''}" data-action="log" data-type="${t}" data-id="${p.id}">${typeLabel(t)}</button>
      </div>`).join('');
  } else {
    const next = all.sort((a,b) => a.d - b.d)[0];
    today = `<div class="calm">${tr('allDone')}${next ? tr('nextUp', { name: esc(next.p.name), verb: verbL(next.t), when: dueText(next.d) }) : ''}</div>`;
  }
  const sorted = [...vis].sort((a,b) => (due(a,'water') ?? 999) - (due(b,'water') ?? 999));
  const roomOf = p => (p.location || '').split(',')[0].trim() || tr('noRoom');
  const rooms = [...new Set(vis.map(roomOf))];
  if (roomFilter && !rooms.includes(roomFilter)) roomFilter = null;
  const chips = rooms.length > 1 ? `<div class="chips"><button class="chip ${roomFilter ? '' : 'on'}" data-action="room" data-room="">${tr('all')}</button>${rooms.map(r => `<button class="chip ${roomFilter === r ? 'on' : ''}" data-action="room" data-room="${esc(r)}">${esc(r)}</button>`).join('')}</div>` : '';
  const g0 = game(), vac = g0.vacation && g0.vacation.until >= dkey(new Date()) ? `<div class="vac"><span>${tr('vacBanner', { date: fmtDay(fromKey(g0.vacation.until), { weekday:'short', day:'numeric', month:'short' }) })}</span><button data-action="vac">${tr('change')}</button></div>` : '';
  const shown = sorted.filter(p => !roomFilter || roomOf(p) === roomFilter);
  const card = p => {
    const d = due(p, 'water');
    let g = '';
    if (d !== null){
      const frac = Math.max(0, Math.min(1, d / +p.waterEvery));
      g = `<div class="gauge ${d <= 0 ? 'dry' : ''}"><i style="width:${d <= 0 ? 100 : Math.max(6, frac*100)}%"></i></div><div class="gl">${verb('water')} ${dueText(d)}</div>`;
    }
    return `<button class="card" data-action="open" data-id="${p.id}">${thumb(p,'ph')}<div class="b"><div class="n">${esc(p.name)}</div><div class="sp">${esc(p.species || p.location || '\u00a0')}</div>${g}</div></button>`;
  };
  const grouped = !state.site && state.sites.length > 1;
  const cards = !vis.length ? `<div class="calm">${tr('noPlantsHere')}</div>`
    : grouped ? state.sites.map(s => { const ps = shown.filter(p => p.siteId === s.id); return ps.length ? `<div class="sitegroup"><h3>${esc(s.name)}</h3><div class="grid">${ps.map(card).join('')}</div></div>` : ''; }).join('')
    : `<div class="grid">${shown.map(card).join('')}</div>`;
  $('#app').innerHTML = `${lvlHtml()}${sitesBar()}${vac}<section><h2>${tr('h_today')}</h2><div class="today">${today}</div></section><section><h2>${tr('h_next')}</h2>${weekHtml()}</section><section><h2>${tr('h_plants')}</h2>${chips}${cards}</section><section><h2>${tr('h_badges')}</h2>${badgesHtml()}</section>${footHtml()}`;
}
// Ferienmodus, Daten, Sprache usw. liegen in den Einstellungen (Zahnrad oben rechts)
function footHtml(){
  return canInstall() ? `<div class="foot"><button data-action="install">${tr('foot_install')}</button></div>` : '';
}

/* ---------- Detailansicht ---------- */
function renderDetail(){
  const p = getP(detailId); if (!p){ $('#detailDlg').close(); return; }
  const dw = due(p,'water'), df = due(p,'feed');
  const fmt = iso => { const d = new Date(iso); return d.toLocaleDateString(loc(),{ day:'numeric', month:'short', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined }) + ', ' + d.toLocaleTimeString(loc(),{ hour:'2-digit', minute:'2-digit' }); };
  const rhythm = (dd, every) => dd === null ? tr('noReminder') : `${tr('every', { n: every })}, ${dd < 0 ? `<span class="late">${dueText(dd)}</span>` : tr('nextWhen', { when: dueText(dd) })}`;
  const noteOf = l => l.type === 'check' && l.for ? tr('check_' + l.for, { when: whenText(l.days) }) : l.note;
  const log = [...p.log].sort((a,b) => b.date.localeCompare(a.date));
  $('#detail').innerHTML = `
    <div class="sheethead"><h2>${esc(p.name)}</h2><button class="x" data-action="close" aria-label="${tr('close')}">×</button></div>
    ${thumb(p,'hero')}
    <dl class="facts">
      ${p.species ? `<dt>${tr('d_species')}</dt><dd>${esc(p.species)}</dd>` : ''}
      ${state.sites.length > 1 ? `<dt>${tr('d_site')}</dt><dd>${esc(siteName(p.siteId))}</dd>` : ''}${p.location ? `<dt>${tr('d_place')}</dt><dd>${esc(p.location)}</dd>` : ''}
      <dt>${verb('water')}</dt><dd>${rhythm(dw, p.waterEvery)}</dd>
      <dt>${verb('feed')}</dt><dd>${rhythm(df, p.feedEvery)}</dd>
    </dl>
    ${p.notes ? `<div class="notes">${esc(p.notes)}</div>` : ''}
    <button class="linkbtn" data-action="edit" data-id="${p.id}">${tr('edit')}</button>
    <div class="actions">
      <button class="act water" data-action="log" data-type="water" data-id="${p.id}">${typeLabel('water')}<small>${tr('logNow')}</small></button>
      <button class="act feed" data-action="log" data-type="feed" data-id="${p.id}">${typeLabel('feed')}<small>${tr('logNow')}</small></button>
      <button class="act" data-action="log" data-type="repot" data-id="${p.id}">${typeLabel('repot')}<small>${tr('logNow')}</small></button>
      <label class="act" for="diaryIn">${typeLabel('photo')}<small>${tr('photoSub')}</small></label>
    </div>
    <div class="noteadd"><input id="noteIn" placeholder="${esc(tr('notePh'))}"><button data-action="note" data-id="${p.id}">${tr('noteBtn')}</button></div>
    <section><h2>${tr('h_log')}</h2>
      ${log.length ? `<ul class="log">${log.map(l => { const note = noteOf(l); return `<li><span class="dot" style="background:${TYPE_COLORS[l.type]}"></span><div><div class="n">${typeLabel(l.type)}</div>${note ? `<div>${esc(note)}</div>` : ''}${l.img ? `<img class="lphoto" src="${l.img}" alt="${esc(tr('photoOf', { date: fmt(l.date) }))}">${p.photo === l.img ? `<div class="s">${tr('coverNow')}</div>` : `<button class="linkbtn" data-action="cover" data-id="${p.id}" data-lid="${l.id}">${tr('coverSet')}</button>`}` : ''}<div class="when">${fmt(l.date)}</div></div></li>`; }).join('')}</ul>` : `<div class="calm">${tr('noEntries')}</div>`}
    </section>`;
}

/* ---------- Abzeichen ---------- */
const cnt = t => state.plants.reduce((n, p) => n + p.log.filter(l => l.type === t).length, 0);
const bestStreak = () => Math.max(game().best || 0, game().streak);
const BADGES = [
  { id:'p1',  e:'p1', v:() => state.plants.length, goal:1 },
  { id:'p5',  e:'p5', v:() => state.plants.length, goal:5 },
  { id:'p15', e:'p15', v:() => state.plants.length, goal:15 },
  { id:'w25', e:'w25', v:() => cnt('water'), goal:25 },
  { id:'f10', e:'f10', v:() => cnt('feed'), goal:10 },
  { id:'r1',  e:'r1', v:() => cnt('repot'), goal:1 },
  { id:'n5',  e:'n5', v:() => cnt('note'), goal:5 },
  { id:'ph3', e:'ph3', v:() => state.plants.filter(p => p.photo).length, goal:3 },
  { id:'s7',  e:'flame', v:bestStreak, goal:7 },
  { id:'s30', e:'s30', v:bestStreak, goal:30 }
];
function checkBadges(quiet){
  const g = game(); g.badges = g.badges || [];
  const fresh = BADGES.filter(b => b.v() >= b.goal && !g.badges.includes(b.id));
  if (!fresh.length) return false;
  fresh.forEach(b => g.badges.push(b.id)); save(); render();
  if (quiet) return false;
  celebrate('badge', fresh[0]); return true;
}
function badgesHtml(){
  const got = game().badges || [];
  return `<div class="badges">${BADGES.map(b => { const on = got.includes(b.id), v = Math.min(b.v(), b.goal), [n, d] = L().b[b.id];
    return `<div class="badge ${on ? '' : 'locked'}"><div class="be">${pix(b.e)}</div><div class="bn">${n}</div><div class="bp">${d}${on ? '' : `<br>${tr('of', { v, goal: b.goal })}`}</div></div>`; }).join('')}</div>`;
}

/* ---------- Woche & Tag ---------- */
function dayItems(i){
  return state.plants.filter(inView).flatMap(p => ['water','feed'].map(t => ({ p, t, d: due(p, t) })))
    .filter(x => x.d !== null && (i === 0 ? x.d <= 0 : x.d === i));
}
const dayDate = i => { const d = new Date(); d.setDate(d.getDate() + i); return d; };
function weekHtml(){
  return `<div class="week">${[0,1,2,3,4,5,6].map(i => { const dt = dayDate(i), items = dayItems(i);
    return `<button class="wd ${i === 0 ? 'now' : ''}" data-action="day" data-i="${i}"><b>${i === 0 ? tr('today') : fmtDay(dt, { weekday:'short' })}</b><span class="num">${dt.getDate()}</span><span class="dots">${items.map(x => `<i class="${x.t === 'feed' ? 'f' : ''}"></i>`).join('')}</span></button>`; }).join('')}</div><div class="hint">${tr('weekHint')}</div>`;
}
function showDay(i){
  const items = dayItems(i), dt = dayDate(i);
  const h = i === 0 ? tr('today') : i === 1 ? tr('tomorrow') : fmtDay(dt, { weekday:'long', day:'numeric', month:'long' });
  const list = items.length ? `<div class="today" style="text-align:left;margin-top:16px">${items.map(({p,t,d}) => `<div class="task">${thumb(p,'thumb')}<div class="t"><div class="n">${esc(p.name)}</div><div class="s ${d < 0 ? 'late' : ''}">${verb(t)}${d < 0 ? ', ' + dueText(d) : ''}${siteTag(p)}</div></div></div>`).join('')}</div>` : `<p>${tr('nothing')}</p>`;
  openCel(`<h2>${h}</h2>${list}<button class="primary" data-action="close">${tr('close')}</button>`);
}

/* ---------- Später, Ferien, Orte ---------- */
function snoozeSheet(id, t){
  const p = getP(id); if (!p) return;
  openCel(`<h2>${tr('snz_h_' + t, { name: esc(p.name) })}</h2><p>${tr('snz_p_' + t)}</p><div class="snz">${[1,2,3].map(n => `<button class="act" data-action="snz" data-id="${id}" data-type="${t}" data-n="${n}">${n === 1 ? tr('tomorrow') : tr('inDaysCap', { n })}</button>`).join('')}</div><button class="ghost" data-action="close" style="color:var(--muted)">${tr('cancel')}</button>`);
}
function vacSheet(){
  const g = game(), on = g.vacation && g.vacation.until >= dkey(new Date());
  const def = on ? g.vacation.until : dkey(dayDate(7));
  openCel(`<h2>${tr('foot_vac')}</h2><p>${tr('vac_p')}</p><label for="vacIn" style="text-align:left">${tr('vac_back')}</label><input type="date" id="vacIn" value="${def}" min="${dkey(new Date())}"><button class="primary" data-action="vacon">${on ? tr('vac_change') : tr('vac_start')}</button>${on ? `<button class="ghost" data-action="vacoff">${tr('vac_end')}</button>` : `<button class="ghost" data-action="close" style="color:var(--muted)">${tr('cancel')}</button>`}`);
}
function sitesBar(){
  const s = state.sites;
  return `<div class="sites">${s.length > 1 ? `<button class="chip ${state.site ? '' : 'on'}" data-action="site" data-sid="">${tr('allSites')}</button>` : ''}${s.map(x => `<button class="chip ${state.site === x.id || s.length === 1 ? 'on' : ''}" data-action="site" data-sid="${x.id}">${esc(x.name)}</button>`).join('')}<button class="chip" data-action="sites">${tr('addSite')}</button></div>`;
}
function siteSheet(){
  openCel(`<h2>${tr('sites_h')}</h2><p>${tr('sites_p')}</p><div class="siteman">${state.sites.map(s => { const n = state.plants.filter(p => p.siteId === s.id).length; return `<div class="siterow"><input class="sitename" data-sid="${s.id}" value="${esc(s.name)}" aria-label="${esc(tr('nameOf', { name: s.name }))}"><button class="del" data-action="sitedel" data-sid="${s.id}" ${n || state.sites.length === 1 ? 'disabled' : ''}>${tr('del')}</button></div>`; }).join('')}<label for="newSite">${tr('newSite')}</label><div class="siterow" style="margin-top:0"><input id="newSite" placeholder="${esc(tr('newSitePh'))}"><button data-action="siteadd">${tr('add')}</button></div></div><button class="primary" data-action="close">${tr('done')}</button>`);
}
$('#cel').addEventListener('change', e => {
  if (!e.target.classList.contains('sitename')) return;
  const s = state.sites.find(x => x.id === e.target.dataset.sid), v = e.target.value.trim();
  if (!s) return; if (!v){ e.target.value = s.name; return; }
  s.name = v; save(); render();
});

/* ---------- Beispielgarten ---------- */
function loadDemo(){
  const D = L().demo, now = new Date();
  const ago = (d, h = 9) => { const x = new Date(now); x.setDate(x.getDate() - d); x.setHours(h, 15, 0, 0); return x.toISOString(); };
  // [Art, Symbol, giessen alle, zuletzt vor, düngen alle, zuletzt vor, Ort]
  const spec = [
    ['Monstera deliciosa', 'monstera', 7, 8, 30, 12, 'home'],
    ['Ocimum basilicum', 'herb', 2, 2, 14, 15, 'home'],
    ['Citrus limon', 'lemon', 4, 3, 14, 13, 'home'],
    ['Phalaenopsis', 'orchid', 10, 6, 21, 7, 'home'],
    ['Epipremnum aureum', 'pothos', 6, 4, 0, 0, 'office'],
    ['Aloe barbadensis', 'aloe', 14, 5, 60, 20, 'studio'],
    ['Echinocactus grusonii', 'cactus', 21, 10, 0, 0, 'studio']
  ];
  const plants = spec.map(([species, icon, w, wl, f, fl, siteId], i) => {
    const log = [];
    for (let d = wl; d <= 45; d += w) log.push({ id: uid(), type: 'water', date: ago(d, 8 + d % 5), note: '', xp: 10 });
    if (f) for (let d = fl; d <= 45; d += f) log.push({ id: uid(), type: 'feed', date: ago(d, 18), note: '', xp: 10 });
    return { id: uid(), name: D.plants[i], species, location: D.places[i], icon, siteId, waterEvery: w, feedEvery: f, notes: '', photo: null, created: ago(50), log };
  });
  plants[0].notes = D.notes[0];
  plants[0].log.push({ id: uid(), type: 'repot', date: ago(30, 16), note: '', xp: 5 }, { id: uid(), type: 'note', date: ago(3, 20), note: D.notes[1], xp: 2 });
  plants[3].log.push({ id: uid(), type: 'note', date: ago(9, 19), note: D.notes[2], xp: 2 });
  plants[1].log.push({ id: uid(), type: 'note', date: ago(1, 12), note: D.notes[3], xp: 2 });
  const y = new Date(); y.setDate(y.getDate() - 1);
  state = {
    lang: state.lang, plants, site: null,
    sites: [{ id: 'home', name: D.sites[0] }, { id: 'office', name: D.sites[1] }, { id: 'studio', name: D.sites[2] }],
    game: { xp: 265, level: levelOf(265), streak: 4, best: 9, lastCheck: dkey(y), dayDone: null, badges: [] }
  };
  roomFilter = null;
  checkBadges(true); save(); replaced(); render(); window.scrollTo(0, 0); toast(tr('demo_loaded'));
}

/* ---------- Pflege eintragen ---------- */
function logAction(id, type, note, extra){
  const p = getP(id); if (!p) return;
  const g = game(), today = dkey(new Date()), openBefore = openTasks();
  const already = p.log.some(l => l.type === type && l.xp > 0 && dkey(l.date) === today);
  let pts = 0, why = '';
  if (type === 'water' || type === 'feed'){
    const d = due(p, type);
    if (d === null) pts = 3; else if (d < 0){ pts = 5; why = 'why_late'; } else if (d <= 1){ pts = 10; why = 'why_ontime'; } else { pts = 2; why = 'why_early'; }
  } else pts = type === 'repot' ? 5 : type === 'photo' ? 3 : 2;
  if (already){ pts = 0; why = ''; }
  const entry = { id: uid(), type, date: new Date().toISOString(), note: note || '', xp: pts, ...(extra || {}) };
  p.log.push(entry);
  let bonus = 0;
  if (openBefore > 0 && openTasks() === 0 && g.dayDone !== today){ bonus = 15; g.dayDone = today; entry.xp += bonus; entry.bonus = true; }
  g.xp += entry.xp; save(); refresh();
  toast(`${p.name}: ${typeLabel(type)}${pts ? ` +${pts}${why ? ' (' + tr(why) + ')' : ''}` : ''}`, () => {
    p.log = p.log.filter(l => l.id !== entry.id); g.xp = Math.max(0, g.xp - entry.xp); if (entry.bonus) g.dayDone = null;
    checkLevel(true); save(); refresh();
  });
  if (!checkLevel() && !checkBadges() && bonus) celebrate('day');
}
function refresh(){ render(); if ($('#detailDlg').open) renderDetail(); }

function toast(msg, undo){
  $('#toastMsg').textContent = msg; undoFn = undo || null; $('#toastUndo').hidden = !undo;
  $('#toast').classList.add('show'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 4500);
}
$('#toastUndo').addEventListener('click', () => { if (undoFn) undoFn(); undoFn = null; $('#toast').classList.remove('show'); });

/* ---------- Formular ---------- */
function setPhoto(src){
  const b = $('#photoBox'); pendingPhoto = src;
  $('#identifyBtn').hidden = !src || BUILD !== 'pwa'; $('#idResults').innerHTML = '';
  b.style.backgroundImage = src ? `url("${src}")` : ''; b.classList.toggle('has', !!src);
  b.textContent = src ? tr('photo_change') : tr('photo_take');
}
function openForm(id){
  editingId = id || null; const p = id ? getP(id) : null;
  $('#formTitle').textContent = p ? tr('form_edit') : tr('form_new');
  $('#fName').value = p?.name || ''; $('#fSpecies').value = p?.species || ''; $('#fLoc').value = p?.location || '';
  $('#fSite').innerHTML = state.sites.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  $('#fSite').value = p?.siteId || state.site || state.sites[0].id;
  $('#fWater').value = p ? p.waterEvery : 7; $('#fFeed').value = p ? p.feedEvery : 30; $('#fNotes').value = p?.notes || '';
  pendingIcon = p?.icon || 'generic'; renderIconPick();
  setPhoto(p?.photo || null); $('#formDelete').hidden = !p;
  $('#careSug').innerHTML = ''; $('#careHint').hidden = true;
  if ($('#detailDlg').open) $('#detailDlg').close();
  $('#formDlg').showModal();
}
function renderIconPick(){
  $('#iconPick').innerHTML = KIND_KEYS.map(k => `<button type="button" class="ik ${k === pendingIcon ? 'on' : ''}" data-icon="${k}" aria-pressed="${k === pendingIcon}" aria-label="${esc(L().kinds[k])}" title="${esc(L().kinds[k])}">${pixGrid(KINDS[k])}</button>`).join('');
}
$('#iconPick').addEventListener('click', e => { const b = e.target.closest('[data-icon]'); if (!b) return; pendingIcon = b.dataset.icon; renderIconPick(); });
function shrink(file){
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => { const img = new Image(); img.onload = () => {
      const s = Math.min(1, 640 / Math.max(img.width, img.height)); const c = document.createElement('canvas');
      c.width = Math.round(img.width*s); c.height = Math.round(img.height*s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', .72));
    }; img.onerror = rej; img.src = r.result; };
    r.onerror = rej; r.readAsDataURL(file);
  });
}
$('#photoIn').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try { setPhoto(await shrink(f)); } catch { toast(tr('badImage')); }
  e.target.value = '';
});
$('#diaryIn').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f || !detailId) return;
  try { const img = await shrink(f); const p = getP(detailId); if (p && !p.photo) p.photo = img; logAction(detailId, 'photo', '', { img }); }
  catch { toast(tr('badImage')); }
});
$('#form').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('#fName').value.trim(); if (!name){ $('#fName').focus(); return; }
  const data = { name, species: $('#fSpecies').value.trim(), location: $('#fLoc').value.trim(), siteId: $('#fSite').value,
    waterEvery: Math.max(0, parseInt($('#fWater').value) || 0), feedEvery: Math.max(0, parseInt($('#fFeed').value) || 0),
    notes: $('#fNotes').value.trim(), photo: pendingPhoto, icon: pendingIcon };
  if (editingId) Object.assign(getP(editingId), data);
  else state.plants.push({ id: uid(), created: new Date().toISOString(), log: [], ...data });
  save(); $('#formDlg').close(); render(); toast(editingId ? tr('saved') : tr('added', { name })); checkBadges();
});
$('#formDelete').addEventListener('click', () => {
  const p = getP(editingId); if (!p) return;
  ask(tr('del_ask', { name: p.name }), tr('del'), () => {
    state.plants = state.plants.filter(x => x.id !== editingId); (state.deleted ||= []).push({ id: editingId, at: Date.now() }); save(); $('#formDlg').close(); render(); toast(tr('deleted', { name: p.name }));
  });
});
function ask(txt, ok, fn){
  $('#askTxt').textContent = txt; $('#askOk').textContent = ok;
  $('#askOk').onclick = () => { $('#askDlg').close(); fn(); };
  $('#askDlg').showModal();
}

/* ---------- Pflanzenerkennung über api/identify.php (nur PWA-Build) ---------- */
async function identify(){
  if (!pendingPhoto) return;
  const btn = $('#identifyBtn'), out = $('#idResults');
  btn.disabled = true; btn.textContent = tr('f_identifying'); out.innerHTML = '';
  try {
    const blob = await (await fetch(pendingPhoto)).blob();
    const fd = new FormData(); fd.append('image', blob, 'plant.jpg'); fd.append('lang', lang());
    const r = await fetch('api/identify.php', { method: 'POST', body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || tr('id_status', { n: r.status }));
    const res = (j.results || []).slice(0, 3);
    out.innerHTML = res.length
      ? res.map(x => `<button type="button" class="chip" data-sci="${esc(x.scientific)}" data-common="${esc(x.common || '')}">${esc(x.common || x.scientific)} <small>${Math.round(x.score * 100)} %</small></button>`).join('')
      : `<span class="hint">${tr('id_none')}</span>`;
  } catch (e) {
    out.innerHTML = `<span class="hint">${esc(tr('id_fail', { msg: e.message }))}</span>`;
  } finally {
    btn.disabled = false; btn.textContent = tr('f_identify');
  }
}
$('#identifyBtn').addEventListener('click', identify);
$('#idResults').addEventListener('click', e => {
  const c = e.target.closest('[data-sci]'); if (!c) return;
  $('#fSpecies').value = c.dataset.sci;
  if (!$('#fName').value.trim()) $('#fName').value = c.dataset.common || c.dataset.sci;
  $('#idResults').innerHTML = '';
  const care = careFor(c.dataset.sci); if (care) applyCare(care, false);
});

/* ---------- Pflegevorschläge aus CARE (js/care.js) ---------- */
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
// Wissenschaftlicher Name (z. B. aus der Erkennung): zuerst Art, sonst Gattung
function careFor(sci){
  const w = norm(sci).replace(/\s+x\s+|\s*×\s*/g, ' ').split(/\s+/), sp = w.slice(0, 2).join(' '), genus = w[0];
  const all = c => [c.sci, ...c.syn].map(x => norm(x).replace(/\s*×\s*/g, ' '));
  return CARE.find(c => all(c).includes(sp)) || CARE.find(c => all(c).includes(genus)) || null;
}
// Freitext (Name oder Art): Treffer in allen Sprachen, Anfang vor Mitte, aktuelle Sprache zuerst
function careSearch(q){
  q = norm(q); if (q.length < 3) return [];
  const score = c => {
    const own = norm(c.names[lang()]), rest = [c.sci, ...c.syn, ...Object.values(c.names)].map(norm);
    if (own.startsWith(q)) return 0; if (rest.some(x => x.startsWith(q))) return 1;
    if (own.includes(q)) return 2; if (rest.some(x => x.includes(q))) return 3; return 9;
  };
  return CARE.map(c => [score(c), c]).filter(x => x[0] < 9).sort((a, b) => a[0] - b[0]).slice(0, 4).map(x => x[1]);
}
function showCareSug(e){
  const hits = careSearch(e.target.value), sp = norm($('#fSpecies').value);
  $('#careSug').innerHTML = hits.filter(c => norm(c.sci) !== sp).map(c => `<button type="button" class="chip" data-care="${esc(c.sci)}">${esc(c.names[lang()])} <small>${esc(c.sci)}</small></button>`).join('');
}
function applyCare(c, setName){
  $('#fSpecies').value = c.sci;
  // Namensfeld ergänzen, wenn leer oder nur ein Suchbegriff für diese Pflanze («Fenster» → «Fensterblatt»)
  const n = norm($('#fName').value);
  if (setName && (!n || [c.sci, ...c.syn, ...Object.values(c.names)].some(x => norm(x).includes(n)))) $('#fName').value = c.names[lang()];
  $('#fWater').value = c.water; $('#fFeed').value = c.feed;
  if (pendingIcon === 'generic' && c.icon !== 'generic'){ pendingIcon = c.icon; renderIconPick(); }
  $('#careSug').innerHTML = '';
  const h = $('#careHint'); h.hidden = false;
  h.textContent = tr('care_hint', { name: c.names[lang()], w: c.water, feed: c.feed ? tr('care_feedN', { n: c.feed }) : tr('care_feed0') });
}
$('#fName').addEventListener('input', showCareSug);
$('#fSpecies').addEventListener('input', showCareSug);
$('#careSug').addEventListener('click', e => { const c = e.target.closest('[data-care]'); if (c) applyCare(CARE.find(x => x.sci === c.dataset.care), true); });

/* ---------- Ereignisse ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-action]'); if (!b) return;
  const { action, id, type } = b.dataset;
  if (action === 'new') openForm();
  else if (action === 'edit') openForm(id);
  else if (action === 'open'){ detailId = id; renderDetail(); $('#detailDlg').showModal(); }
  else if (action === 'log') logAction(id, type);
  else if (action === 'note'){ const v = $('#noteIn').value.trim(); if (!v){ $('#noteIn').focus(); return; } logAction(id, 'note', v); }
  else if (action === 'rules') celebrate('rules');
  else if (action === 'day') showDay(+b.dataset.i);
  else if (action === 'later') snoozeSheet(id, type);
  else if (action === 'snz'){ $('#celDlg').close(); logAction(id, 'check', '', { for: type, days: +b.dataset.n }); }
  else if (action === 'site'){ state.site = b.dataset.sid || null; roomFilter = null; save(); render(); }
  else if (action === 'sites') siteSheet();
  else if (action === 'siteadd'){ const v = $('#newSite').value.trim(); if (!v){ $('#newSite').focus(); return; } state.sites.push({ id: uid(), name: v }); save(); render(); siteSheet(); toast(tr('siteAdded', { name: v })); }
  else if (action === 'sitedel'){ const sid = b.dataset.sid; if (state.plants.some(p => p.siteId === sid) || state.sites.length === 1) return; state.sites = state.sites.filter(x => x.id !== sid); if (state.site === sid) state.site = null; save(); render(); siteSheet(); }
  else if (action === 'room'){ roomFilter = b.dataset.room || null; render(); }
  else if (action === 'vac') vacSheet();
  else if (action === 'vacon'){ const v = $('#vacIn').value; if (!v){ $('#vacIn').focus(); return; } game().vacation = { until: v }; save(); $('#celDlg').close(); render(); toast(tr('vac_on', { date: fmtDay(fromKey(v), { day:'numeric', month:'long' }) })); }
  else if (action === 'vacoff'){ delete game().vacation; save(); $('#celDlg').close(); render(); toast(tr('vac_off')); }
  else if (action === 'cover'){ const p = getP(id), l = p && p.log.find(x => x.id === b.dataset.lid); if (l){ p.photo = l.img; save(); refresh(); toast(tr('cover_done')); } }
  else if (action === 'demo'){ if (!state.plants.length) loadDemo(); else ask(tr('demo_ask'), tr('load'), loadDemo); }
  else if (action === 'reset') ask(tr('reset_ask'), tr('del'), () => { state = { lang: state.lang, plants: [] }; migrateSites(); game(); save(); replaced(); render(); toast(tr('reset_done')); });
  else if (action === 'install') install();
  else if (action === 'settings') openSettings();
  else if (action === 'export') exportData();
  else if (action === 'import') $('#importIn').click();
  else if (action === 'close') b.closest('dialog').close();
});
document.addEventListener('change', e => {
  if (e.target.id !== 'langSel') return;
  state.lang = e.target.value; save(); applyStatic(); refresh(); if ($('#setDlg').open) renderSettings();
});
document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'noteIn'){ e.preventDefault(); const p = e.target.nextElementSibling; p && p.click(); } });


/* ---------- PWA: Service Worker und Installation (nur eigener Server) ---------- */
if (BUILD === 'pwa' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
// Android/Chrome liefert einen Installationsdialog, iPhone braucht eine Anleitung (Teilen, Zum Home-Bildschirm)
function isStandalone(){ return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
function isIOS(){ return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
function canInstall(){ return BUILD === 'pwa' && !isStandalone() && (!!installEvt || isIOS()); }
async function install(){
  if (installEvt){
    installEvt.prompt();
    const { outcome } = await installEvt.userChoice; installEvt = null; render();
    if (outcome === 'accepted') toast(tr('inst_done'));
    return;
  }
  openCel(`<div class="big">${plantSvg(7)}</div><h2>${tr('inst_h')}</h2><p>${isIOS() ? tr('inst_ios') : tr('inst_other')}</p><button class="primary" data-action="close">${tr('btn_continue')}</button>`);
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; render(); });
window.addEventListener('appinstalled', () => { installEvt = null; render(); });
