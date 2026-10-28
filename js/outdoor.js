/* i leaf you: Pflanzen draussen. Kälte-Werte aus COLD (js/care.js), Wetter von Open-Meteo (frei, ohne Schlüssel).
   Pro Pflanze: outdoor (Balkon/Garten), minT (verträgt Kälte bis °C), winter (inside|cool|cover|hardy|annual), inNow (im Winterquartier).
   Pro Ort: geo { lat, lon, name } für den Wetterbericht. Lädt nach app.js. */

const WINTERS = ['inside', 'cool', 'cover', 'hardy', 'annual'];
const deg = n => String(n).replace('-', '\u2212');   // echtes Minuszeichen
let weather = {};   // 'lat,lon' → { at, days: [{ date, min }] }

// Kälte-Werte für eine Art: genaue Art/Gattung aus CARE, sonst Familie, sonst vorsichtig
function coldFor(species, family, name){
  const c = (species && careFor(species)) || (name && CARE.find(x => [...Object.values(x.names), ...x.syn].some(n => norm(n) === norm(name))));
  return (c && COLD[c.sci]) || (family && COLD_FAMILY[family]) || COLD_DEFAULT;
}

/* ---------- Formular ---------- */
function outForm(p){
  $('#fWinter').innerHTML = WINTERS.map(w => `<option value="${w}">${tr('win_opt_' + w)}</option>`).join('');
  $('#fOut').checked = !!(p && p.outdoor);
  $('#fMinT').value = p && p.outdoor && p.minT !== undefined ? p.minT : '';
  $('#fWinter').value = (p && p.winter) || 'inside';
  $('#outBox').hidden = !$('#fOut').checked;
}
// Vorschlag aus der Pflanzenliste eintragen (beim Einschalten oder wenn sich die Art ändert)
function outPrefill(force){
  if (!$('#fOut').checked || (!force && $('#fMinT').value !== '')) return;
  const [t, w] = coldFor($('#fSpecies').value.trim(), pendingFamily, $('#fName').value.trim());
  $('#fMinT').value = t; $('#fWinter').value = w;
}
function outData(){
  if (!$('#fOut').checked) return { outdoor: false };
  const t = parseInt($('#fMinT').value, 10);
  return { outdoor: true, minT: Number.isFinite(t) ? t : coldFor($('#fSpecies').value.trim(), pendingFamily, $('#fName').value.trim())[0], winter: $('#fWinter').value };
}
$('#fOut').addEventListener('change', () => { $('#outBox').hidden = !$('#fOut').checked; outPrefill(false); });

/* ---------- Wetter ---------- */
const geoKey = g => g.lat.toFixed(2) + ',' + g.lon.toFixed(2);
function siteGeo(id){ return (state.sites.find(s => s.id === id) || {}).geo || null; }
function loadCache(){ try { weather = JSON.parse(localStorage.getItem('ileafyou.weather') || '{}'); } catch(e) { weather = {}; } }
function saveCache(){ try { localStorage.setItem('ileafyou.weather', JSON.stringify(weather)); } catch(e) {} }
async function loadWeather(){
  if (!Object.keys(weather).length) loadCache();
  const geos = [...new Map(state.plants.filter(p => p.outdoor).map(p => siteGeo(p.siteId)).filter(Boolean).map(g => [geoKey(g), g])).values()];
  let changed = false;
  for (const g of geos){
    const k = geoKey(g), w = weather[k];
    if (w && Date.now() - w.at < 3 * 3600e3) continue;
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${g.lat}&longitude=${g.lon}&daily=temperature_2m_min&timezone=auto&forecast_days=8`);
      const j = await r.json();
      weather[k] = { at: Date.now(), days: j.daily.time.map((date, i) => ({ date, min: Math.round(j.daily.temperature_2m_min[i]) })) };
      changed = true;
    } catch(e) {}
  }
  if (changed){ saveCache(); if (!document.body.classList.contains('authing')) refresh(); }
}
// Nächte ab heute: Index 0 = heute Nacht (Tiefstwert des nächsten Morgens)
function nights(p){
  const g = siteGeo(p.siteId), w = g && weather[geoKey(g)]; if (!w) return null;
  const today = dkey(new Date());
  return w.days.filter(d => d.date > today);
}
const nightText = (i, date) => i === 0 ? tr('night1') : i === 1 ? tr('night2') : tr('nightN', { day: fmtDay(fromKey(date), { weekday: 'long' }) });

// Was ist zu tun? { kind: 'cold'|'warm', i, min, date } oder null
function outStatus(p){
  if (!p.outdoor) return null;
  const n = nights(p); if (!n) return null;
  if (!p.inNow){
    const i = n.slice(0, 4).findIndex(d => d.min < p.minT);
    if (i >= 0 && p.coldAck !== n[i].date) return { kind: 'cold', i, ...n[i] };
  } else if (['inside', 'cool'].includes(p.winter)){
    const m = new Date().getMonth();
    const week = n.slice(0, 7), lo = Math.min(...week.map(d => d.min));
    if (m >= 2 && m <= 6 && week.length >= 5 && lo >= p.minT + 3) return { kind: 'warm', min: lo };
  }
  return null;
}
function outMsg(p, s){
  if (s.kind === 'warm') return tr('warm_out', { name: esc(p.name), min: deg(s.min) });
  const k = ['inside', 'cool'].includes(p.winter) ? 'cold_in' : 'cold_' + p.winter;
  return tr(k, { name: esc(p.name), when: nightText(s.i, s.date), min: deg(s.min), t: deg(p.minT) });
}

/* ---------- Startseite: Warnungen und fehlender Wetter-Standort ---------- */
function outdoorHtml(){
  const out = state.plants.filter(inView).filter(p => p.outdoor);
  if (!out.length) return '';
  const noGeo = [...new Set(out.filter(p => !siteGeo(p.siteId)).map(p => p.siteId))];
  const items = out.map(p => ({ p, s: outStatus(p) })).filter(x => x.s).sort((a, b) => (a.s.i ?? 9) - (b.s.i ?? 9));
  if (!noGeo.length && !items.length) return '';
  const btn = (p, s) => s.kind === 'warm' ? `<button class="do" data-action="coldout" data-id="${p.id}">${tr('btn_out')}</button>`
    : ['inside', 'cool'].includes(p.winter) ? `<button class="do" data-action="coldin" data-id="${p.id}">${tr('btn_in')}</button>`
    : `<button class="do" data-action="coldok" data-id="${p.id}" data-date="${s.date}">${tr('btn_ok')}</button>`;
  const rows = items.map(({ p, s }) => `<div class="task outtask ${s.kind}">${thumb(p, 'thumb')}<button class="t" data-action="open" data-id="${p.id}"><div class="s">${outMsg(p, s)}</div></button>${btn(p, s)}</div>`).join('');
  const geo = noGeo.map(id => `<div class="geoask"><p>${tr('geo_need', { site: esc(siteName(id)) })}</p><div class="setrow"><button class="setbtn" data-action="geohere" data-sid="${id}">${tr('geo_here')}</button><button class="setbtn" data-action="geosearch" data-sid="${id}">${tr('geo_search')}</button></div></div>`).join('');
  return `<section><h2>${tr('h_out')}</h2><div class="today outdoor">${rows}${geo}</div></section>`;
}

/* ---------- Detailansicht ---------- */
function outDetailHtml(p){
  if (!p.outdoor) return '';
  const s = outStatus(p), n = nights(p);
  let st;
  if (p.inNow) st = s ? outMsg(p, s) : tr('st_in');
  else if (!siteGeo(p.siteId)) st = tr('geo_need', { site: esc(siteName(p.siteId)) });
  else if (s) st = outMsg(p, s);
  else if (n) st = tr('st_ok', { min: deg(Math.min(...n.slice(0, 7).map(d => d.min))), t: deg(p.minT) });
  else st = tr('st_load');
  const toggle = ['inside', 'cool'].includes(p.winter)
    ? `<button class="setbtn" data-action="${p.inNow ? 'coldout' : 'coldin'}" data-id="${p.id}">${tr(p.inNow ? 'btn_out' : 'btn_in')}</button>` : '';
  const spring = ['inside', 'cool'].includes(p.winter) ? ' ' + tr('win_spring', { t: deg(p.minT + 3) }) : '';
  return `<section class="care outcare"><h2>${tr('h_out')}</h2><p class="setp"><b>${st}</b></p><p>${tr('win_' + p.winter, { t: deg(p.minT) })}${spring}</p>
    ${!siteGeo(p.siteId) ? `<div class="setrow"><button class="setbtn" data-action="geohere" data-sid="${p.siteId}">${tr('geo_here')}</button><button class="setbtn" data-action="geosearch" data-sid="${p.siteId}">${tr('geo_search')}</button></div>` : ''}
    <div class="setrow">${toggle}</div></section>`;
}

/* ---------- Wetter-Standort pro Ort ---------- */
function setGeo(sid, geo){
  const s = state.sites.find(x => x.id === sid); if (!s) return;
  s.geo = { lat: Math.round(geo.lat * 100) / 100, lon: Math.round(geo.lon * 100) / 100, name: geo.name || '' };   // auf ca. 1 km gerundet
  save(); toast(tr('geo_set')); refresh(); loadWeather();
}
function geoSearchSheet(sid, results){
  openCel(`<h2>${tr('geo_h', { site: esc(siteName(sid)) })}</h2><form id="geoForm" data-sid="${sid}" class="siterow"><input id="geoQ" placeholder="${esc(tr('geo_ph'))}" autocomplete="off"><button>${tr('geo_search')}</button></form>
    <div class="georesults">${(results || []).map(r => `<button class="setbtn" data-action="geopick" data-sid="${sid}" data-lat="${r.latitude}" data-lon="${r.longitude}" data-name="${esc(r.name)}">${esc(r.name)}<small>${esc([r.admin1, r.country].filter(Boolean).join(', '))}</small></button>`).join('')}</div>
    <button class="ghost" data-action="close" style="color:var(--muted)">${tr('cancel')}</button>`);
  $('#geoQ').focus();
}
document.addEventListener('submit', async e => {
  if (e.target.id !== 'geoForm') return;
  e.preventDefault();
  const sid = e.target.dataset.sid, q = $('#geoQ').value.trim(); if (!q) return;
  try {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=5&language=${lang()}&name=${encodeURIComponent(q)}`);
    const res = (await r.json()).results || [];
    geoSearchSheet(sid, res); $('#geoQ').value = q;
    if (!res.length) toast(tr('geo_none'));
  } catch(err){ toast(tr('err_net')); }
});
document.addEventListener('click', e => {
  const b = e.target.closest('[data-action]'); if (!b) return;
  const a = b.dataset.action, p = b.dataset.id && getP(b.dataset.id);
  if (a === 'coldin' && p){ p.inNow = true; save(); refresh(); toast(tr('done_in', { name: p.name })); }
  else if (a === 'coldout' && p){ p.inNow = false; delete p.coldAck; save(); refresh(); toast(tr('done_out', { name: p.name })); }
  else if (a === 'coldok' && p){ p.coldAck = b.dataset.date; save(); refresh(); }
  else if (a === 'geosearch') geoSearchSheet(b.dataset.sid);
  else if (a === 'geopick'){ $('#celDlg').close(); setGeo(b.dataset.sid, { lat: +b.dataset.lat, lon: +b.dataset.lon, name: b.dataset.name }); }
  else if (a === 'geohere'){
    if (!navigator.geolocation) return toast(tr('geo_fail'));
    navigator.geolocation.getCurrentPosition(pos => setGeo(b.dataset.sid, { lat: pos.coords.latitude, lon: pos.coords.longitude }), () => toast(tr('geo_fail')), { timeout: 15000, maximumAge: 3600e3 });
  }
});
