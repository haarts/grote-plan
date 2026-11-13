'use strict';
/* Grote Plan — frontend. Geen build-stap: de Rust-server serveert dit bestand direct.
 *
 *  D  = data van de server (verdiepingen, ruimtes, zones, aantekeningen, markeringen)
 *  U  = UI-toestand (modus, selectie, open aantekening…)
 *  V  = kaartweergave (zoom k, verschuiving tx/ty)
 */

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const CLIENT = Math.random().toString(36).slice(2);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const svgEl = $('#map');

const ROOM_COLORS = ['#5b8def', '#e07a5f', '#81b29a', '#e9b949', '#9d79bc', '#3fb5ac', '#ef8354', '#6c91bf', '#c98b8b', '#8fbf5a'];
const ZONE_COLORS = ['#c4572e', '#2f6db5', '#2f9b72', '#8e5bb5', '#c9a227', '#d0487a', '#4a463f'];

// ------------------------------------------------------------------ installatie-symbolen
// Lokale coördinaten: wandpunten hangen aan de wand in (0,0), +y wijst de ruimte in.
const W = '#fff', K = '#23211d';
const FX = {
  socket:   { name: 'Stopcontact', short: 'Wcd', grp: 'stroom', wall: true, color: '#e07a2f', h: 30,
              icon: `<circle r="5.4" fill="none" stroke="${W}" stroke-width="1.7"/><circle cx="-2.2" r="1.15" fill="${W}"/><circle cx="2.2" r="1.15" fill="${W}"/>` },
  socket2:  { name: 'Dubbel stopcontact', short: '2× wcd', grp: 'stroom', wall: true, color: '#e07a2f', h: 30,
              icon: `<circle cx="-3.9" r="3.4" fill="none" stroke="${W}" stroke-width="1.5"/><circle cx="3.9" r="3.4" fill="none" stroke="${W}" stroke-width="1.5"/><circle cx="-3.9" r="1" fill="${W}"/><circle cx="3.9" r="1" fill="${W}"/>` },
  power:    { name: 'Krachtgroep / perilex', short: 'Kracht', grp: 'stroom', wall: true, color: '#c2410c', h: 30,
              icon: `<path d="M1.2 -6.5 L-3.6 1 L-0.4 1 L-1.4 6.5 L3.6 -1.2 L0.4 -1.2 Z" fill="${W}"/>` },
  data:     { name: 'Data (UTP)', short: 'Data', grp: 'data', wall: true, color: '#2f9b72', h: 30,
              icon: `<path d="M-5.5 4.5V-2H-3.2V-4.6H3.2V-2H5.5V4.5Z" fill="none" stroke="${W}" stroke-width="1.6" stroke-linejoin="round"/><path d="M-2.4 4.5v-2.4M0 4.5v-2.4M2.4 4.5v-2.4" stroke="${W}" stroke-width="1.1"/>` },
  switch:   { name: 'Schakelaar', short: 'Schak.', grp: 'schakel', wall: true, color: '#3170d6', h: 105,
              icon: `<circle cx="-2.6" cy="2.8" r="2.2" fill="${W}"/><path d="M-2.6 2.8 L4 -4 l2 2" stroke="${W}" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` },
  switch2:  { name: 'Dubbele schakelaar', short: '2× schak.', grp: 'schakel', wall: true, color: '#3170d6', h: 105,
              icon: `<circle cx="-3" cy="3.4" r="2.1" fill="${W}"/><path d="M-3 3.4 L1.6 -5.4 l2 1.2 M-3 3.4 L5.4 -1.4 l1 1.9" stroke="${W}" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` },
  dimmer:   { name: 'Dimmer', short: 'Dimmer', grp: 'schakel', wall: true, color: '#3170d6', h: 105,
              icon: `<circle cx="-2.6" cy="2.8" r="2.2" fill="${W}"/><path d="M-2.6 2.8 L4 -4 l2 2" stroke="${W}" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M1 5.6 L6 5.6 L6 1 Z" fill="${W}"/>` },
  light:    { name: 'Lichtpunt plafond', short: 'Licht', grp: 'licht', wall: false, color: '#f2b705', dark: true,
              icon: `<path d="M-4.6 -4.6L4.6 4.6M4.6 -4.6L-4.6 4.6" stroke="${K}" stroke-width="1.9" stroke-linecap="round"/>` },
  spot:     { name: 'Inbouwspot', short: 'Spot', grp: 'licht', wall: false, color: '#f2b705', dark: true, r: 8.5,
              icon: `<circle r="3.6" fill="none" stroke="${K}" stroke-width="1.5"/><circle r="1.3" fill="${K}"/>` },
  walllight:{ name: 'Wandlamp', short: 'Wandlamp', grp: 'licht', wall: true, color: '#f2b705', dark: true, h: 180,
              icon: `<path d="M-4 -3.2L4 4.8M4 -3.2L-4 4.8" stroke="${K}" stroke-width="1.8" stroke-linecap="round"/><path d="M-5.5 -6h11" stroke="${K}" stroke-width="1.8" stroke-linecap="round"/>` },
  smoke:    { name: 'Rookmelder', short: 'Rook', grp: 'overig', wall: false, color: '#8a8478',
              icon: `<circle r="5.2" fill="none" stroke="${W}" stroke-width="1.5"/><path d="M-2.4 1.6c1-1 .2-2 1.2-3s.2-2 1.2-3M.9 2.6c1-1 .2-2 1.2-3" stroke="${W}" stroke-width="1.2" fill="none" stroke-linecap="round"/>` },
};
const FX_GROUPS = [
  ['stroom', 'Stroom'], ['data', 'Data'], ['schakel', 'Schakelaars'], ['licht', 'Licht'], ['overig', 'Overig'],
];
const SWITCHES = ['switch', 'switch2', 'dimmer'];
/** Vaste todo's die voor elke ruimte (en alleen ruimtes) gelden. */
const ROOM_TODOS = [['floor', 'Vloerafwerking', 'Vloer'], ['wall', 'Muurafwerking', 'Muur'], ['ceiling', 'Plafondafwerking', 'Plafond'], ['elec', 'Locatie stopcontacten/schakelaars', 'Elektra']];
const LIGHTS = ['light', 'spot', 'walllight'];
const HEIGHTS = { stroom: [30, 60, 105, 120], data: [30, 105], schakel: [90, 105, 120], licht: [180, 200, 220], overig: [] };

function fxBadge(kind, extraClass = '') {
  const d = FX[kind]; if (!d) return '';
  return `<circle class="badge ${extraClass}" r="${d.r || 11}" fill="${d.color}" stroke="#fff" stroke-width="2"/>${d.icon}`;
}
function fxIconSvg(kind, size = 30) {
  return `<svg viewBox="-13 -13 26 26" width="${size}" height="${size}">${fxBadge(kind)}</svg>`;
}

// ------------------------------------------------------------------ toestand
let D = { floors: [], rooms: [], zones: [], notes: [], images: [], markers: [], me: '', users: [] };
const idx = { floor: new Map(), room: new Map(), zone: new Map(), note: new Map(), marker: new Map(), imgs: new Map(), pins: new Map() };
const U = {
  floorId: null, mode: 'view', ctx: { kind: 'all' }, openNote: null, editing: false, search: '',
  tool: null, selMk: null, linking: null, draw: null, hoverW: null, editRoom: null, selVtx: null,
  calib: null, meas: [], measA: null, placeNote: null, zonePick: null, dropRoom: null, hoverNote: null, guides: [], preview: null,
  layers: { notes: true, elec: true, rooms: true, dims: false, plan: true }, view: 'list', showDone: false,
};
const V = { k: 1, tx: 0, ty: 0 };

const store = {
  get(k, d) { try { const v = localStorage.getItem('gp.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('gp.' + k, JSON.stringify(v)); } catch {} },
};
Object.assign(U.layers, store.get('layers', {}));
U.floorId = store.get('floor', null);

// ------------------------------------------------------------------ server
async function api(method, url, body) {
  const opt = { method, headers: { 'x-client': CLIENT } };
  if (body instanceof FormData) opt.body = body;
  else if (body !== undefined) { opt.headers['content-type'] = 'application/json'; opt.body = JSON.stringify(body); }
  const r = await fetch(url, opt);
  if (r.status === 401) { location.href = '/login'; throw new Error('niet ingelogd'); }
  if (!r.ok) {
    let m = r.statusText;
    try { m = (await r.json()).error || m; } catch {}
    toast(m, true);
    throw new Error(m);
  }
  return r.status === 204 ? null : r.json();
}

let loading = null, loadAgain = false;
async function load() {
  if (loading) { loadAgain = true; return loading; }
  loading = (async () => {
    try {
      D = await api('GET', '/api/state');
      reindex();
      renderAll();
    } finally {
      loading = null;
      if (loadAgain) { loadAgain = false; load(); }
    }
  })();
  return loading;
}

function reindex() {
  for (const k of ['floor', 'room', 'zone', 'note', 'marker']) idx[k].clear();
  D.floors.forEach(f => idx.floor.set(f.id, f));
  D.rooms.forEach(r => idx.room.set(r.id, r));
  D.zones.forEach(z => idx.zone.set(z.id, z));
  D.notes.forEach(n => idx.note.set(n.id, n));
  D.markers.forEach(m => idx.marker.set(m.id, m));
  idx.imgs.clear(); idx.pins.clear();
  D.images.forEach(i => { if (!idx.imgs.has(i.note_id)) idx.imgs.set(i.note_id, []); idx.imgs.get(i.note_id).push(i); });
  D.markers.filter(m => m.note_id).forEach(m => { if (!idx.pins.has(m.note_id)) idx.pins.set(m.note_id, []); idx.pins.get(m.note_id).push(m); });
  // Verwijzingen die niet meer bestaan opruimen.
  if (!idx.floor.has(U.floorId)) U.floorId = D.floors[0]?.id ?? null;
  if (U.openNote && !idx.note.has(U.openNote)) { U.openNote = null; U.editing = false; }
  if (U.selMk && !idx.marker.has(U.selMk)) U.selMk = null;
  if (U.editRoom && !idx.room.has(U.editRoom)) { U.editRoom = null; U.selVtx = null; }
  if (U.ctx.kind === 'room' && !idx.room.has(U.ctx.id)) U.ctx = { kind: 'all' };
  if (U.ctx.kind === 'zone' && !idx.zone.has(U.ctx.id)) U.ctx = { kind: 'all' };
  if (U.zonePick && !idx.zone.has(U.zonePick)) U.zonePick = null;
}

/** Lokale wijziging direct tonen, daarna opslaan en verversen. */
async function patch(kind, id, changes) {
  const map = { floors: 'floor', rooms: 'room', zones: 'zone', notes: 'note', markers: 'marker' }[kind];
  const obj = idx[map]?.get(id);
  if (obj) Object.assign(obj, changes);
  renderAll();
  await api('PATCH', `/api/${kind}/${id}`, changes);
  await load();
}
async function create(kind, obj) {
  const r = await api('POST', `/api/${kind}`, obj);
  await load();
  return r;
}
async function remove(kind, id) {
  await api('DELETE', `/api/${kind}/${id}`);
  await load();
}

function connectLive() {
  let es, retry = 1000;
  const open = () => {
    es = new EventSource('/api/events');
    es.onopen = () => { $('#live').classList.add('on'); retry = 1000; };
    es.onmessage = ev => {
      try { if (JSON.parse(ev.data).by !== CLIENT) load(); } catch {}
    };
    es.onerror = () => {
      $('#live').classList.remove('on');
      es.close();
      setTimeout(() => { open(); load().catch(() => {}); }, retry);
      retry = Math.min(retry * 2, 30000);
    };
  };
  open();
}

// ------------------------------------------------------------------ hulpjes
/** Melding onderin. Met `act` ({label, fn}) komt er een knop bij en blijft de melding staan. */
function toast(msg, err = false, act = null) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast' + (err ? ' err' : '');
  clearTimeout(toast.t);
  if (act) {
    const b = document.createElement('button');
    b.textContent = act.label;
    b.onclick = () => { t.classList.add('hidden'); act.fn(); };
    const x = document.createElement('button');
    x.textContent = '✕'; x.setAttribute('aria-label', 'Sluiten');
    x.onclick = () => t.classList.add('hidden');
    t.append(b, x);
    return;
  }
  toast.t = setTimeout(() => t.classList.add('hidden'), err ? Math.max(5000, msg.length * 70) : 2600);
}
const nf = (v, d = 2) => v.toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtM = m => nf(m, 2) + ' m';
const fmtA = a => nf(a, 1) + ' m²';
const rtf = new Intl.RelativeTimeFormat('nl', { numeric: 'auto' });
function ago(ts) {
  const s = (ts > 1e11 ? ts / 1000 : ts) - Date.now() / 1000;
  const a = Math.abs(s);
  if (a < 60) return 'zojuist';
  if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (a < 86400 * 30) return rtf.format(Math.round(s / 86400), 'day');
  return new Date(ts * 1000).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
}
const floor = () => idx.floor.get(U.floorId);
const floorRooms = (fid = U.floorId) => D.rooms.filter(r => r.floor_id === fid);

// ------------------------------------------------------------------ geometrie
function polyArea(p) { let a = 0; for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; a += x1 * y2 - x2 * y1; } return a / 2; }
function centroid(p) {
  const A = polyArea(p);
  if (Math.abs(A) < 1e-6) { const n = p.length || 1; return [p.reduce((s, q) => s + q[0], 0) / n, p.reduce((s, q) => s + q[1], 0) / n]; }
  let cx = 0, cy = 0;
  for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; const f = x1 * y2 - x2 * y1; cx += (x1 + x2) * f; cy += (y1 + y2) * f; }
  return [cx / (6 * A), cy / (6 * A)];
}
function inPoly([x, y], p) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function segProj(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
  const q = [a[0] + t * dx, a[1] + t * dy];
  return { q, t, d: Math.hypot(p[0] - q[0], p[1] - q[1]), len: Math.sqrt(L2) };
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** Normaal van rand i die de ruimte in wijst. */
function inwardNormal(pts, i) {
  const a = pts[i], b = pts[(i + 1) % pts.length];
  const L = dist(a, b) || 1;
  let n = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
  const m = [(a[0] + b[0]) / 2 + n[0] * 2, (a[1] + b[1]) / 2 + n[1] * 2];
  if (!inPoly(m, pts)) n = [-n[0], -n[1]];
  return n;
}
function roomAt(w, fid = U.floorId) {
  let best = null, ba = Infinity;
  for (const r of floorRooms(fid)) {
    if (r.points.length > 2 && inPoly(w, r.points)) { const a = Math.abs(polyArea(r.points)); if (a < ba) { ba = a; best = r; } }
  }
  return best;
}
/** Punt waarmee we bepalen in welke ruimte een markering valt (wandpunten iets naar binnen). */
function markerProbe(m) {
  if (!FX[m.kind]?.wall) return [m.x, m.y];
  const r = m.rotation * Math.PI / 180;
  return [m.x - Math.sin(r) * 6, m.y + Math.cos(r) * 6];
}
const markerRoom = m => roomAt(markerProbe(m), m.floor_id);

function isOrtho(p) {
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], c = p[(i + 2) % p.length];
    const u = [b[0] - a[0], b[1] - a[1]], v = [c[0] - b[0], c[1] - b[1]];
    const cos = (u[0] * v[0] + u[1] * v[1]) / ((Math.hypot(...u) * Math.hypot(...v)) || 1);
    if (Math.abs(cos) > 0.035) return false;
  }
  return true;
}
function roomMetrics(r) {
  const f = idx.floor.get(r.floor_id), s = f?.m_per_px, p = r.points;
  const edgesPx = p.map((a, i) => dist(a, p[(i + 1) % p.length]));
  if (!s || p.length < 3) return { scaled: false, edgesPx };
  const area = Math.abs(polyArea(p)) * s * s;
  const edges = edgesPx.map(e => e * s);
  const perim = edges.reduce((a, b) => a + b, 0);
  const rect = p.length === 4 && isOrtho(p) ? [edges[0], edges[1]].sort((a, b) => b - a) : null;
  const volume = r.ceiling_height ? area * r.ceiling_height : null;
  return { scaled: true, area, perim, edges, edgesPx, rect, volume };
}
function zoneArea(z) {
  let a = 0, ok = true;
  for (const id of z.room_ids) { const r = idx.room.get(id); if (!r) continue; const m = roomMetrics(r); if (m.scaled) a += m.area; else ok = false; }
  return { area: a, complete: ok };
}

// ------------------------------------------------------------------ kaart: weergave
function mapRect() { return svgEl.getBoundingClientRect(); }
function toWorld(cx, cy) { const r = mapRect(); return [(cx - r.left - V.tx) / V.k, (cy - r.top - V.ty) / V.k]; }
function toScreen([x, y]) { return [x * V.k + V.tx, y * V.k + V.ty]; }
function fit() {
  const f = floor(); if (!f) return;
  const r = mapRect(); if (!r.width) return;
  const topPad = 56, pad = 16;
  V.k = Math.min((r.width - 2 * pad) / f.width, (r.height - topPad - pad) / f.height);
  V.tx = (r.width - f.width * V.k) / 2;
  V.ty = topPad + (r.height - topPad - pad - f.height * V.k) / 2;
  applyView();
}
function zoomAt(factor, cx, cy) {
  const r = mapRect();
  const sx = cx ?? r.left + r.width / 2, sy = cy ?? r.top + r.height / 2;
  const [wx, wy] = toWorld(sx, sy);
  V.k = Math.max(0.02, Math.min(40, V.k * factor));
  V.tx = sx - r.left - wx * V.k; V.ty = sy - r.top - wy * V.k;
  applyView();
}
function centerOn(x, y, minK) {
  const r = mapRect();
  if (minK && V.k < minK) V.k = minK;
  V.tx = r.width / 2 - x * V.k; V.ty = r.height / 2 - y * V.k;
  applyView();
}
let rafPending = false;
function applyView() {
  $('#world').setAttribute('transform', `translate(${V.tx} ${V.ty}) scale(${V.k})`);
  if (!rafPending) { rafPending = true; requestAnimationFrame(() => { rafPending = false; renderOverlays(); }); }
}

// ------------------------------------------------------------------ kaart: tekenen
function renderMap() {
  const f = floor();
  const plan = $('#plan');
  $('#empty').classList.toggle('hidden', !!f);
  if (!f) {
    $('#empty').innerHTML = `<div class="box"><h2>Begin met de plattegrond</h2>
      <p>Upload de PDF van de architect. Elke pagina wordt een verdieping. Daarna stel je de schaal in en teken je de ruimtes over.</p>
      <button class="btn pri" data-act="upload-plan">PDF of afbeelding kiezen</button></div>`;
    plan.removeAttribute('href');
    ['#g-rooms', '#g-dims', '#g-links', '#g-markers', '#g-draft'].forEach(s => $(s).innerHTML = '');
    renderMapChrome();
    return;
  }
  const href = '/files/' + f.image;
  if (plan.getAttribute('href') !== href) {
    plan.setAttribute('href', href);
    plan.setAttribute('width', f.width); plan.setAttribute('height', f.height);
  }
  plan.style.display = U.layers.plan ? '' : 'none';
  applyView();
  renderMapChrome();
}

function renderOverlays() {
  const f = floor(); if (!f) return;
  const u = 1 / V.k;
  const rooms = floorRooms();
  const zone = U.ctx.kind === 'zone' ? idx.zone.get(U.ctx.id) : U.zonePick ? idx.zone.get(U.zonePick) : null;

  // Ruimtes
  let h = '';
  if (U.layers.rooms || U.mode === 'rooms') {
    for (const r of rooms) {
      if (r.points.length < 3) continue;
      const inZone = zone?.room_ids.includes(r.id);
      const sel = (U.ctx.kind === 'room' && U.ctx.id === r.id) || U.editRoom === r.id;
      const color = zone && inZone ? zone.color : r.color;
      const cls = ['room', sel ? 'sel' : '', zone && !inZone ? 'dim' : '', U.dropRoom === r.id ? 'drop' : ''].join(' ');
      const fo = zone && inZone ? .32 : sel ? .22 : .12;
      h += `<g class="${cls}" data-room="${r.id}"><polygon points="${r.points.map(p => p.join(',')).join(' ')}" fill="${color}" fill-opacity="${fo}" stroke="${color}"/></g>`;
    }
    // Labels
    for (const r of rooms) {
      if (r.points.length < 3) continue;
      const m = roomMetrics(r);
      const [cx, cy] = centroid(r.points);
      const xs = r.points.map(p => p[0]), w = (Math.max(...xs) - Math.min(...xs)) * V.k;
      const fs = 13 * u;
      let t = `<text class="rlabel" x="${cx}" y="${cy}" text-anchor="middle" stroke-width="${3 * u}" font-size="${fs}"><tspan class="n" x="${cx}" dy="${m.scaled && w > 60 ? -0.25 * fs : 0.35 * fs}">${esc(r.name)}</tspan>`;
      if (m.scaled && w > 60) t += `<tspan class="a" x="${cx}" dy="${1.25 * fs}" font-size="${12 * u}">${fmtA(m.area)}${m.rect && w > 110 ? ` · ${nf(m.rect[0])} × ${nf(m.rect[1])}` : ''}</tspan>`;
      h += t + '</text>';
    }
  }
  $('#g-rooms').innerHTML = h;

  // Maatvoering langs de wanden
  h = '';
  for (const r of rooms) {
    const show = U.layers.dims || (U.ctx.kind === 'room' && U.ctx.id === r.id) || U.editRoom === r.id;
    if (!show || r.points.length < 3) continue;
    const m = roomMetrics(r);
    const editable = U.mode === 'rooms' && U.editRoom === r.id;
    r.points.forEach((a, i) => {
      const b = r.points[(i + 1) % r.points.length];
      const Lpx = dist(a, b); if (Lpx * V.k < 34) return;
      const n = inwardNormal(r.points, i);
      const mx = (a[0] + b[0]) / 2 + n[0] * 12 * u, my = (a[1] + b[1]) / 2 + n[1] * 12 * u;
      let ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
      if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
      const label = m.scaled ? nf(m.edges[i]) : (editable ? '? m' : '');
      if (!label) return;
      h += `<g class="dim ${editable ? 'edit' : ''}" data-dim="${i}" data-dimroom="${r.id}">
        <text x="${mx}" y="${my}" transform="rotate(${ang} ${mx} ${my})" text-anchor="middle" dominant-baseline="middle" font-size="${11.5 * u}" stroke-width="${3 * u}">${label}</text></g>`;
    });
  }
  // Bewerk-handvatten
  if (U.mode === 'rooms' && U.editRoom) {
    const r = idx.room.get(U.editRoom);
    if (r && r.floor_id === U.floorId) {
      r.points.forEach((a, i) => {
        const b = r.points[(i + 1) % r.points.length];
        if (dist(a, b) * V.k > 40) h += `<circle class="mid" data-mid="${i}" cx="${(a[0] + b[0]) / 2}" cy="${(a[1] + b[1]) / 2}" r="${6 * u}"/>`;
      });
      r.points.forEach((p, i) => { h += `<circle class="vtx ${U.selVtx === i ? 'sel' : ''}" data-vtx="${i}" cx="${p[0]}" cy="${p[1]}" r="${7 * u}"/>`; });
    }
  }
  $('#g-dims').innerHTML = h;

  // Schakelaar → lichtpunt verbindingen
  h = '';
  if (U.layers.elec) {
    const sel = idx.marker.get(U.selMk);
    const showAll = U.mode === 'install';
    for (const s of D.markers) {
      if (s.floor_id !== U.floorId || !SWITCHES.includes(s.kind)) continue;
      for (const lid of s.controls || []) {
        const l = idx.marker.get(lid); if (!l || l.floor_id !== U.floorId) continue;
        const active = sel && (sel.id === s.id || sel.id === l.id) || U.linking === s.id;
        if (!active && !showAll) continue;
        const [sx, sy] = fxCenter(s), [lx, ly] = fxCenter(l);
        const mx = (sx + lx) / 2, my = (sy + ly) / 2, dx = lx - sx, dy = ly - sy;
        const cx = mx - dy * .18, cy = my + dx * .18;
        h += `<path class="link" d="M${sx} ${sy} Q${cx} ${cy} ${lx} ${ly}" stroke-opacity="${active ? 1 : .35}"/>`;
      }
    }
  }
  $('#g-links').innerHTML = h;

  // Markeringen
  h = '';
  const openPins = new Set([U.openNote, U.hoverNote].filter(Boolean));
  const linkSw = U.linking ? idx.marker.get(U.linking) : null;
  for (const m of D.markers) {
    if (m.floor_id !== U.floorId) continue;
    if (m.kind === 'note') {
      if (!U.layers.notes) continue;
      const note = idx.note.get(m.note_id); if (!note) continue;
      const img = idx.imgs.get(note.id)?.[0];
      const cls = ['mk', 'pin', U.selMk === m.id ? 'sel' : '', openPins.has(note.id) ? 'hl' : ''].join(' ');
      const inner = img
        ? `<clipPath id="cp-${m.id}"><circle cy="-24" r="10.5"/></clipPath><image href="/files/${img.thumb}" x="-10.5" y="-34.5" width="21" height="21" clip-path="url(#cp-${m.id})" preserveAspectRatio="xMidYMid slice"/>`
        : `<circle cy="-24" r="10.5" fill="#fff"/><path d="M-5 -28h10M-5 -24h10M-5 -20h6" stroke="#c4572e" stroke-width="1.8" stroke-linecap="round"/>`;
      h += `<g class="${cls}" data-mk="${m.id}" transform="translate(${m.x} ${m.y}) scale(${u})">
        <ellipse rx="5" ry="2" fill="#0003"/>
        <path class="pinbody" d="M0 0C-3 -7 -14 -13 -14 -24A14 14 0 1 1 14 -24C14 -13 3 -7 0 0Z" fill="#c4572e" stroke="#fff" stroke-width="2"/>${inner}</g>`;
    } else if (FX[m.kind]) {
      if (!U.layers.elec) continue;
      const linkT = linkSw && LIGHTS.includes(m.kind) && linkSw.controls?.includes(m.id);
      h += fxMarkup(m, `mk fx ${U.selMk === m.id ? 'sel' : ''} ${linkT ? 'linktarget' : ''}`, u);
    }
  }
  if (U.preview && U.mode === 'install' && U.tool) {
    h += fxMarkup({ id: '', kind: U.tool, ...U.preview }, 'preview', u, .55);
  }
  $('#g-markers').innerHTML = h;

  renderDraft();
  positionPopover();
}

function fxMarkup(m, cls, u, opacity = 1) {
  const d = FX[m.kind];
  if (d.wall) {
    return `<g class="${cls}" data-mk="${m.id}" opacity="${opacity}" transform="translate(${m.x} ${m.y}) rotate(${m.rotation || 0}) scale(${u})">
      <rect x="-7" y="-1.5" width="14" height="3" rx="1.5" fill="${d.color}"/>
      <line x1="0" y1="0" x2="0" y2="9" stroke="${d.color}" stroke-width="2.4"/>
      <g transform="translate(0 19) rotate(${-(m.rotation || 0)})">${fxBadge(m.kind)}</g></g>`;
  }
  return `<g class="${cls}" data-mk="${m.id}" opacity="${opacity}" transform="translate(${m.x} ${m.y}) scale(${u})">${fxBadge(m.kind)}</g>`;
}
/** Middelpunt van het symbool (voor lijnen en popover). */
function fxCenter(m) {
  if (!FX[m.kind]?.wall) return [m.x, m.y];
  const r = (m.rotation || 0) * Math.PI / 180, o = 19 / V.k;
  return [m.x - Math.sin(r) * o, m.y + Math.cos(r) * o];
}

function renderDraft() {
  const u = 1 / V.k;
  let h = '';
  for (const g of U.guides) h += `<line class="guide" x1="${g[0]}" y1="${g[1]}" x2="${g[2]}" y2="${g[3]}"/>`;
  if (U.draw) {
    const pts = [...U.draw]; if (U.hoverW) pts.push(U.hoverW);
    if (pts.length > 1) h += `<polygon class="draft" points="${pts.map(p => p.join(',')).join(' ')}"/>`;
    U.draw.forEach((p, i) => { h += `<circle class="vtx ${i === 0 && U.draw.length > 2 ? 'sel' : ''}" cx="${p[0]}" cy="${p[1]}" r="${(i === 0 ? 8 : 5) * u}"/>`; });
    const s = floor()?.m_per_px;
    if (U.hoverW && U.draw.length && s) {
      const a = U.draw[U.draw.length - 1], L = dist(a, U.hoverW) * s;
      h += `<text class="rlabel" x="${U.hoverW[0] + 12 * u}" y="${U.hoverW[1] - 10 * u}" font-size="${13 * u}" stroke-width="${3 * u}" font-weight="700">${fmtM(L)}</text>`;
    }
  }
  h += measureSvg(u);
  if (U.calib) {
    const pts = [...U.calib]; if (U.hoverW && pts.length === 1) pts.push(U.hoverW);
    if (pts.length === 2) h += `<line class="calib" x1="${pts[0][0]}" y1="${pts[0][1]}" x2="${pts[1][0]}" y2="${pts[1][1]}"/>`;
    pts.forEach(p => { h += `<circle class="calibpt" cx="${p[0]}" cy="${p[1]}" r="${5 * u}"/><line class="calib" x1="${p[0]}" y1="${p[1] - 12 * u}" x2="${p[0]}" y2="${p[1] + 12 * u}"/>`; });
  }
  $('#g-draft').innerHTML = h;
}

/** Werkbalk, hints en palet rond de kaart. */
function renderMapChrome() {
  $$('#modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === U.mode));
  $$('#layers input').forEach(i => { i.checked = !!U.layers[i.dataset.layer]; });
  svgEl.classList.toggle('cross', !!(U.tool || U.draw || U.calib || U.placeNote || U.mode === 'measure'));
  const f = floor();

  // Hint
  let hint = '';
  if (U.placeNote) hint = `Tik op de plattegrond om de aantekening te plaatsen <button class="alt" data-act="cancel">Annuleer</button>`;
  else if (U.zonePick) hint = `Tik ruimtes aan om ze aan “${esc(idx.zone.get(U.zonePick)?.name)}” toe te voegen of te verwijderen <button data-act="zonepick-done">Klaar</button>`;
  else if (U.linking) hint = `Tik de lichtpunten die deze schakelaar bedient <button data-act="link-done">Klaar</button>`;
  else if (U.mode === 'scale') hint = U.calib?.length === 1 ? 'Tik het tweede punt' : `Tik twee punten met een bekende afstand (bv. een maatlijn)${f?.m_per_px ? ` · nu: 1 m = ${Math.round(1 / f.m_per_px)} px` : ''}`;
  else if (U.mode === 'rooms' && U.draw) hint = U.draw.length < 3 ? 'Tik de hoeken van de ruimte (binnenkant wand). Rechte hoeken worden vanzelf uitgelijnd.' : 'Tik op het eerste punt of “Klaar” om te sluiten';
  else if (U.mode === 'measure') hint = measureHint(f);
  else if (U.mode === 'install' && !U.tool && !U.selMk) hint = 'Kies een symbool en tik op de plattegrond. Wandpunten klikken vast aan de wand.';
  else if (f && !f.m_per_px && U.mode === 'view') hint = `Schaal nog niet ingesteld — maten en oppervlaktes ontbreken <button data-act="mode" data-mode="scale">Instellen</button>`;
  $('#hint').innerHTML = hint;
  $('#hint').classList.toggle('hidden', !hint || !f);

  // Elektra-palet
  const pal = $('#palette');
  pal.classList.toggle('hidden', U.mode !== 'install' || !f || !!U.selMk);
  if (U.mode === 'install') {
    pal.innerHTML = FX_GROUPS.map(([g]) => `<div class="grp">${Object.entries(FX).filter(([, d]) => d.grp === g).map(([k, d]) =>
      `<button data-tool="${k}" class="${U.tool === k ? 'on' : ''}" title="${esc(d.name)}">${fxIconSvg(k)}<span>${esc(d.short)}</span></button>`).join('')}</div>`).join('');
  }

  // Ruimte-balk
  const rb = $('#roombar');
  rb.classList.toggle('hidden', U.mode !== 'rooms' || !f);
  if (U.mode === 'rooms') {
    if (U.draw) {
      rb.innerHTML = `<span class="info">${U.draw.length} punten</span>
        <button class="btn small" data-act="draw-undo" ${U.draw.length ? '' : 'disabled'}>↶ Ongedaan</button>
        <button class="btn small pri" data-act="draw-done" ${U.draw.length > 2 ? '' : 'disabled'}>Klaar</button>
        <button class="btn small" data-act="cancel">Annuleer</button>`;
    } else if (U.editRoom) {
      const r = idx.room.get(U.editRoom);
      rb.innerHTML = `<span class="info"><b>${esc(r?.name)}</b> · sleep de punten, tik een maat om die exact in te voeren</span>
        ${U.selVtx != null ? '<button class="btn small" data-act="vtx-del">Punt verwijderen</button>' : ''}
        <button class="btn small" data-act="room-edit">Naam/kleur</button>
        <button class="btn small danger" data-act="room-del">Verwijder</button>
        <button class="btn small" data-act="room-done">Klaar</button>`;
    } else {
      rb.innerHTML = `<button class="btn small pri" data-act="draw-start">+ Nieuwe ruimte</button><span class="info">of tik een ruimte om te bewerken</span>`;
    }
  }
  renderFloors();
}

function renderFloors() {
  $('#floors').innerHTML = D.floors.map(f =>
    `<button data-floor="${f.id}" class="${f.id === U.floorId ? 'on' : ''}">${esc(f.name)}${f.id === U.floorId ? '<span class="more" data-act="floor-menu">⋯</span>' : ''}</button>`).join('')
    + `<button class="add" data-act="upload-plan" title="Plattegrond toevoegen">+</button>`;
  $('#me').textContent = D.me;
}

// ------------------------------------------------------------------ popover (installatiepunt)
function renderPopover() {
  const po = $('#popover');
  const m = idx.marker.get(U.selMk);
  if (!m || !FX[m.kind] || m.floor_id !== U.floorId || U.linking) { po.classList.add('hidden'); return; }
  const d = FX[m.kind];
  const room = markerRoom(m);
  const s = floor()?.m_per_px;
  let where = room ? esc(room.name) : 'Buiten een ruimte';
  if (s && room) {
    const info = positionInfo(m, room, s);
    if (info) where += ` · ${info}`;
  }
  let extra = '';
  if (SWITCHES.includes(m.kind)) {
    const n = (m.controls || []).filter(id => idx.marker.has(id)).length;
    extra = `<div class="row"><span class="note" style="flex:1">Bedient ${n} lichtpunt${n === 1 ? '' : 'en'}</span><button class="btn small" data-act="link-start">Koppel lichtpunten</button></div>`;
  } else if (LIGHTS.includes(m.kind)) {
    const by = D.markers.filter(s => s.controls?.includes(m.id));
    extra = `<div class="note">${by.length ? 'Geschakeld door: ' + by.map(s => esc(s.label || FX[s.kind].name)).join(', ') : 'Nog niet aan een schakelaar gekoppeld'}</div>`;
  }
  const hs = HEIGHTS[d.grp] || [];
  po.innerHTML = `
    <div class="head">${fxIconSvg(m.kind, 34)}
      <select data-f="kind">${Object.entries(FX).map(([k, v]) => `<option value="${k}" ${k === m.kind ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select>
      <button class="x" data-act="pop-close" title="Sluiten">×</button></div>
    <div class="note">📍 ${where}</div>
    <label class="f">Omschrijving<input type="text" data-f="label" value="${esc(m.label)}" placeholder="bv. boven aanrecht, bij bed links"></label>
    ${d.wall ? `<label class="f">Hoogte hart doos (cm)<input type="number" inputmode="numeric" data-f="height_cm" value="${m.height_cm ?? ''}" placeholder="${d.h ?? ''}"></label>
      <div class="chips">${hs.map(v => `<button data-height="${v}" class="${m.height_cm === v ? 'on' : ''}">${v}</button>`).join('')}</div>` : ''}
    ${extra}
    <div class="row">
      <button class="btn small" data-act="mk-rotate" title="Draaien">↻ Draai</button>
      <button class="btn small" data-act="mk-dup" title="Dupliceren">⧉ Kopie</button>
      <span style="flex:1"></span>
      <button class="btn small danger" data-act="mk-del">Verwijder</button>
    </div>`;
  po.classList.remove('hidden');
  positionPopover();
}

/** Afstanden tot hoeken/wanden — handig voor de installateur. */
function positionInfo(m, room, s) {
  const pts = room.points;
  if (FX[m.kind]?.wall) {
    let best = null;
    pts.forEach((a, i) => { const b = pts[(i + 1) % pts.length]; const pr = segProj([m.x, m.y], a, b); if (!best || pr.d < best.d) best = { ...pr, a, b }; });
    if (!best || best.d * s > 0.05) return '';
    const d1 = best.t * best.len * s, d2 = (1 - best.t) * best.len * s;
    return `${nf(d1)} m / ${nf(d2)} m uit de hoeken`;
  }
  // Plafondpunten: kortste afstand tot een "horizontale" en een "verticale" wand.
  let dx = Infinity, dy = Infinity;
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length]; const pr = segProj([m.x, m.y], a, b);
    if (Math.abs(b[0] - a[0]) < Math.abs(b[1] - a[1])) dx = Math.min(dx, pr.d); else dy = Math.min(dy, pr.d);
  });
  const parts = [dx, dy].filter(isFinite).map(v => nf(v * s));
  return parts.length ? `${parts.join(' m / ')} m uit de wanden` : '';
}

function positionPopover() {
  const po = $('#popover');
  if (po.classList.contains('hidden')) return;
  const m = idx.marker.get(U.selMk); if (!m) return;
  const [sx, sy] = toScreen(fxCenter(m));
  const r = mapRect(), pw = po.offsetWidth || 280, ph = po.offsetHeight || 220;
  let x = sx + 26, y = sy - ph / 2;
  if (x + pw > r.width - 8) x = sx - 26 - pw;
  x = Math.max(8, Math.min(r.width - pw - 8, x));
  y = Math.max(56, Math.min(r.height - ph - 8, y));
  po.style.left = x + 'px'; po.style.top = y + 'px';
}

// ------------------------------------------------------------------ snappen
const SNAP = 11; // schermpixels
function snapDraw(w, free) {
  if (free || !U.draw?.length) return snapVertexToRooms(w, free);
  let p = [...w];
  const last = U.draw[U.draw.length - 1];
  const thr = SNAP / V.k;
  const tan = Math.tan(7 * Math.PI / 180);
  const dx = p[0] - last[0], dy = p[1] - last[1];
  if (Math.abs(dy) < Math.abs(dx) * tan) p[1] = last[1];
  else if (Math.abs(dx) < Math.abs(dy) * tan) p[0] = last[0];
  U.guides = [];
  for (const q of U.draw.slice(0, -1)) {
    if (Math.abs(p[0] - q[0]) < thr) { p[0] = q[0]; U.guides.push([q[0], q[1], p[0], p[1]]); }
    if (Math.abs(p[1] - q[1]) < thr) { p[1] = q[1]; U.guides.push([q[0], q[1], p[0], p[1]]); }
  }
  return snapVertexToRooms(p, false, true);
}
function snapVertexToRooms(p, free, keepGuides) {
  if (!keepGuides) U.guides = [];
  if (free) return p;
  const thr = SNAP / V.k;
  for (const r of floorRooms()) for (const q of r.points) if (dist(p, q) < thr) return [...q];
  return p;
}
function snapVertexEdit(r, i, w, free) {
  U.guides = [];
  if (free) return w;
  const n = r.points.length, prev = r.points[(i - 1 + n) % n], next = r.points[(i + 1) % n];
  const p = [...w], thr = SNAP / V.k;
  for (const q of [prev, next]) {
    if (Math.abs(p[0] - q[0]) < thr) { p[0] = q[0]; U.guides.push([q[0], q[1], p[0], p[1]]); }
    if (Math.abs(p[1] - q[1]) < thr) { p[1] = q[1]; U.guides.push([q[0], q[1], p[0], p[1]]); }
  }
  return p;
}
/** Positie + draaiing voor een installatiepunt. Wandpunten klikken aan de dichtstbijzijnde wand. */
function snapFixture(kind, w, rotation = 0, selfId = null) {
  U.guides = [];
  const d = FX[kind], thr = 26 / V.k;
  if (d.wall) {
    let best = null;
    for (const r of floorRooms()) r.points.forEach((a, i) => {
      const pr = segProj(w, a, r.points[(i + 1) % r.points.length]);
      if (!best || pr.d < best.d) best = { ...pr, r, i };
    });
    if (best && best.d < thr) {
      const n = inwardNormal(best.r.points, best.i);
      return { x: best.q[0], y: best.q[1], rotation: Math.round(Math.atan2(-n[0], n[1]) * 180 / Math.PI) };
    }
    return { x: w[0], y: w[1], rotation };
  }
  // Plafond: uitlijnen op het midden van de ruimte en op andere plafondpunten.
  const p = [...w], t = 12 / V.k;
  const room = roomAt(w);
  const refs = [];
  if (room) refs.push(centroid(room.points));
  for (const m of D.markers) if (m.id !== selfId && m.floor_id === U.floorId && FX[m.kind] && !FX[m.kind].wall) refs.push([m.x, m.y]);
  let sx = false, sy = false;
  for (const q of refs) {
    if (!sx && Math.abs(p[0] - q[0]) < t) { p[0] = q[0]; sx = q; }
    if (!sy && Math.abs(p[1] - q[1]) < t) { p[1] = q[1]; sy = q; }
  }
  if (sx) U.guides.push([sx[0], sx[1], p[0], p[1]]);
  if (sy) U.guides.push([sy[0], sy[1], p[0], p[1]]);
  return { x: p[0], y: p[1], rotation: 0 };
}

// ------------------------------------------------------------------ kaart: invoer
const ptrs = new Map();
let G = null;

function hitTest(target) {
  const el = target.closest?.('[data-meas],[data-mk],[data-vtx],[data-mid],[data-dim],[data-room]');
  if (!el) return {};
  const ds = el.dataset;
  return { meas: ds.meas || null, mk: ds.mk || null, vtx: ds.vtx != null ? +ds.vtx : null, mid: ds.mid != null ? +ds.mid : null,
           dim: ds.dim != null ? +ds.dim : null, dimRoom: ds.dimroom || null, room: ds.room || null };
}

svgEl.addEventListener('pointerdown', e => {
  if (!floor()) return;
  svgEl.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    G = { type: 'pinch', d0: dist(a, b), m0: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], v0: { ...V } };
    return;
  }
  if (ptrs.size > 2) return;
  const hit = hitTest(e.target);
  G = { type: 'one', x0: e.clientX, y0: e.clientY, v0: { ...V }, hit, w0: toWorld(e.clientX, e.clientY), moved: false, touch: e.pointerType === 'touch' };
  const mk = hit.mk && idx.marker.get(hit.mk);
  if (U.mode === 'measure' && hit.meas) { const [i, j] = hit.meas.split(':').map(Number); G.drag = { kind: 'meas', i, j }; }
  else if (mk && !U.linking && !U.zonePick && (U.selMk === mk.id || (U.mode === 'install' && mk.kind !== 'note'))) G.drag = { kind: 'mk', m: mk };
  else if (U.mode === 'rooms' && U.editRoom && hit.vtx != null) G.drag = { kind: 'vtx', i: hit.vtx };
  else if (U.mode === 'rooms' && U.editRoom && hit.mid != null) G.drag = { kind: 'mid', i: hit.mid };
});

svgEl.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId)) { hover(e); return; }
  ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (G?.type === 'pinch' && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()];
    const r = mapRect(), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const k = Math.max(0.02, Math.min(40, G.v0.k * dist(a, b) / G.d0));
    const wx = (G.m0[0] - r.left - G.v0.tx) / G.v0.k, wy = (G.m0[1] - r.top - G.v0.ty) / G.v0.k;
    V.k = k; V.tx = m[0] - r.left - wx * k; V.ty = m[1] - r.top - wy * k;
    applyView();
    return;
  }
  if (!G || G.type !== 'one') return;
  const dx = e.clientX - G.x0, dy = e.clientY - G.y0;
  if (!G.moved && Math.hypot(dx, dy) > (G.touch ? 8 : 4)) {
    G.moved = true;
    if (G.drag?.kind === 'mid') {
      const r = idx.room.get(U.editRoom);
      r.points.splice(G.drag.i + 1, 0, G.w0);
      G.drag = { kind: 'vtx', i: G.drag.i + 1 };
      U.selVtx = G.drag.i;
    }
  }
  if (!G.moved) return;
  const w = toWorld(e.clientX, e.clientY);
  if (G.drag?.kind === 'mk') {
    const m = G.drag.m;
    if (m.kind === 'note') { m.x = w[0]; m.y = w[1]; }
    else Object.assign(m, snapFixture(m.kind, e.altKey ? w : w, m.rotation, m.id));
    if (e.altKey) { m.x = w[0]; m.y = w[1]; U.guides = []; }
    renderOverlays();
  } else if (G.drag?.kind === 'meas') {
    const m = U.meas[G.drag.i];
    m[G.drag.j ? 'b' : 'a'] = snapMeasure(w, G.drag.j ? m.a : m.b, e.altKey);
    renderOverlays();
  } else if (G.drag?.kind === 'vtx') {
    const r = idx.room.get(U.editRoom);
    r.points[G.drag.i] = snapVertexEdit(r, G.drag.i, w, e.altKey);
    U.selVtx = G.drag.i;
    renderOverlays();
  } else {
    V.tx = G.v0.tx + dx; V.ty = G.v0.ty + dy;
    applyView();
  }
});

function endPointer(e, cancelled) {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.delete(e.pointerId);
  if (G?.type === 'pinch') { if (ptrs.size === 0) G = null; else G = { type: 'none' }; return; }
  if (!G || G.type !== 'one') { if (!ptrs.size) G = null; return; }
  const g = G; G = null;
  U.guides = [];
  if (cancelled) { renderOverlays(); return; }
  if (!g.moved) onTap(g.hit, g.w0, e);
  else if (g.drag?.kind === 'mk') {
    const m = g.drag.m;
    patch('markers', m.id, { x: m.x, y: m.y, rotation: m.rotation });
    if (U.selMk === m.id) renderPopover();
  } else if (g.drag?.kind === 'vtx') {
    const r = idx.room.get(U.editRoom);
    patch('rooms', r.id, { points: r.points });
  } else if (g.drag?.kind === 'meas') { U.measLast = g.drag.i; renderOverlays(); renderMapChrome(); }
  else renderOverlays();
}
svgEl.addEventListener('pointerup', e => endPointer(e, false));
svgEl.addEventListener('pointercancel', e => endPointer(e, true));
svgEl.addEventListener('pointerleave', () => { if (U.preview || U.hoverW) { U.preview = null; U.hoverW = null; U.guides = []; renderOverlays(); } });
svgEl.addEventListener('wheel', e => {
  e.preventDefault();
  const f = e.ctrlKey ? Math.exp(-e.deltaY * 0.01) : Math.exp(-e.deltaY * 0.0015);
  zoomAt(f, e.clientX, e.clientY);
}, { passive: false });

function hover(e) {
  if (e.pointerType === 'touch') return;
  const w = toWorld(e.clientX, e.clientY);
  if (U.draw) { U.hoverW = snapDraw(w, e.altKey); renderOverlays(); }
  else if (U.calib?.length === 1) { U.hoverW = w; renderDraft(); }
  else if (U.mode === 'install' && U.tool) { U.preview = snapFixture(U.tool, w); renderOverlays(); }
  else if (U.mode === 'measure') { U.hoverW = snapMeasure(w, U.measA, e.altKey); renderOverlays(); }
}

async function onTap(hit, w, e) {
  if (U.placeNote) { const id = U.placeNote; U.placeNote = null; await createPin(id, w); return; }
  if (U.zonePick) {
    if (hit.room) {
      const z = idx.zone.get(U.zonePick);
      const ids = z.room_ids.includes(hit.room) ? z.room_ids.filter(i => i !== hit.room) : [...z.room_ids, hit.room];
      patch('zones', z.id, { room_ids: ids });
    }
    return;
  }
  if (U.linking) {
    const m = hit.mk && idx.marker.get(hit.mk);
    const s = idx.marker.get(U.linking);
    if (m && s && LIGHTS.includes(m.kind)) {
      const c = s.controls || [];
      patch('markers', s.id, { controls: c.includes(m.id) ? c.filter(i => i !== m.id) : [...c, m.id] });
    }
    return;
  }
  if (U.mode === 'scale') return calibTap(w);
  if (U.mode === 'measure') return measureTap(w, e);
  if (U.mode === 'rooms') return roomsTap(hit, w, e);

  const mk = hit.mk && idx.marker.get(hit.mk);
  if (mk) {
    U.selMk = mk.id; U.tool = null; U.preview = null;
    if (mk.kind === 'note') openNote(mk.note_id);
    renderAll();
    return;
  }
  if (U.mode === 'install' && U.tool) {
    const pos = snapFixture(U.tool, w);
    U.guides = [];
    const d = FX[U.tool];
    await create('markers', { floor_id: U.floorId, kind: U.tool, ...pos, height_cm: d.wall ? d.h ?? null : null });
    return;
  }
  if (U.selMk) { U.selMk = null; renderAll(); return; }
  if (U.mode === 'view' && hit.room) { setCtx({ kind: 'room', id: hit.room }); return; }
}

// ------------------------------------------------------------------ meten (niet bewaard)
/** Vastklikken voor het meetlint: hoekpunten, recht uitlijnen, wanden. Alt = vrij. */
function snapMeasure(w, from, free) {
  U.guides = [];
  if (free) return w;
  const thr = SNAP / V.k;
  const pts = floorRooms().flatMap(r => r.points).concat(U.meas.filter(m => m.fid === U.floorId).flatMap(m => [m.a, m.b]));
  for (const q of pts) if (dist(w, q) < thr) return [...q];
  const p = [...w];
  let axis = null;
  if (from) {
    const dx = p[0] - from[0], dy = p[1] - from[1], tan = Math.tan(7 * Math.PI / 180);
    if (Math.abs(dy) < Math.abs(dx) * tan) { p[1] = from[1]; axis = 'h'; }
    else if (Math.abs(dx) < Math.abs(dy) * tan) { p[0] = from[0]; axis = 'v'; }
  }
  let best = null;
  for (const r of floorRooms()) r.points.forEach((a, i) => {
    const b = r.points[(i + 1) % r.points.length];
    let q;
    if (axis) {
      // Waar de rechte meetlijn deze wand snijdt.
      const [c, k] = axis === 'h' ? [1, 0] : [0, 1];
      if (Math.abs(b[c] - a[c]) < 1e-6) return;
      const t = (p[c] - a[c]) / (b[c] - a[c]);
      if (t < 0 || t > 1) return;
      q = [...p]; q[k] = a[k] + t * (b[k] - a[k]);
    } else q = segProj(p, a, b).q;
    const d = dist(p, q);
    if (d < thr && (!best || d < best.d)) best = { q, d };
  });
  return best ? best.q : p;
}
function measureTap(w, e) {
  const p = snapMeasure(w, U.measA, e?.altKey);
  if (!U.measA) U.measA = p;
  else {
    if (dist(p, U.measA) * V.k > 3) { U.meas.push({ fid: U.floorId, a: U.measA, b: p }); U.measLast = U.meas.length - 1; }
    U.measA = null;
  }
  U.hoverW = null;
  renderAll();
}
function measText(a, b) {
  const s = floor()?.m_per_px;
  return s ? fmtM(dist(a, b) * s) : `${Math.round(dist(a, b))} px`;
}
function measureHint(f) {
  if (!f?.m_per_px) return `Stel eerst de schaal in om in meters te meten <button data-act="mode" data-mode="scale">Instellen</button>`;
  const clear = U.meas.length ? ' <button class="alt" data-act="meas-clear">Wissen</button>' : '';
  if (U.measA) return 'Tik het eindpunt — klikt vast op hoeken en wanden, Alt = vrij' + clear;
  const m = U.meas[U.measLast ?? U.meas.length - 1];
  if (!m) return 'Tik twee punten om te meten. Punten klikken vast op hoeken en wanden; bijna rechte lijnen worden recht.';
  const s = f.m_per_px, dx = Math.abs(m.b[0] - m.a[0]) * s, dy = Math.abs(m.b[1] - m.a[1]) * s;
  const diag = dx > 0.01 && dy > 0.01 ? ` <span style="opacity:.7">(${nf(dx)} × ${nf(dy)})</span>` : '';
  return `<span><b style="white-space:nowrap">${measText(m.a, m.b)}</b>${diag} · tik opnieuw voor een volgende meting</span>` + clear;
}
function measureSvg(u) {
  if (U.mode !== 'measure') return '';
  const line = (a, b, i, live) => {
    const L = dist(a, b); if (!L) return '';
    const n = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L], t = 7 * u;
    const tick = p => `<line class="meas" x1="${p[0] - n[0] * t}" y1="${p[1] - n[1] * t}" x2="${p[0] + n[0] * t}" y2="${p[1] + n[1] * t}"/>`;
    const mx = (a[0] + b[0]) / 2 - n[0] * 12 * u, my = (a[1] + b[1]) / 2 - n[1] * 12 * u;
    let ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
    if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
    const handles = live ? '' : [a, b].map((p, j) =>
      `<circle class="meashandle" data-meas="${i}:${j}" cx="${p[0]}" cy="${p[1]}" r="${10 * u}"/><circle class="measpt" cx="${p[0]}" cy="${p[1]}" r="${3 * u}"/>`).join('');
    return `<line class="meas ${live ? 'live' : ''}" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/>${tick(a)}${tick(b)}${handles}
      <text class="measlabel" x="${mx}" y="${my}" transform="rotate(${ang} ${mx} ${my})" text-anchor="middle" dominant-baseline="middle" font-size="${12.5 * u}" stroke-width="${3.5 * u}">${measText(a, b)}</text>`;
  };
  let h = '';
  U.meas.forEach((m, i) => { if (m.fid === U.floorId) h += line(m.a, m.b, i, false); });
  if (U.measA && U.hoverW) h += line(U.measA, U.hoverW, -1, true);
  if (U.measA) h += `<circle class="measpt" cx="${U.measA[0]}" cy="${U.measA[1]}" r="${4 * u}"/>`;
  else if (U.hoverW) h += `<circle class="meascursor" cx="${U.hoverW[0]}" cy="${U.hoverW[1]}" r="${5 * u}"/>`;
  return h;
}

async function calibTap(w) {
  U.calib = U.calib || [];
  let p = w;
  if (U.calib.length === 1) {
    const a = U.calib[0], dx = p[0] - a[0], dy = p[1] - a[1];
    if (Math.abs(dy) < Math.abs(dx) * .12) p = [p[0], a[1]]; else if (Math.abs(dx) < Math.abs(dy) * .12) p = [a[0], p[1]];
  }
  U.calib.push(p);
  renderAll();
  if (U.calib.length < 2) return;
  const px = dist(U.calib[0], U.calib[1]);
  const r = await ask({ title: 'Schaal instellen', text: `De lijn is ${Math.round(px)} pixels lang. Hoe lang is die in werkelijkheid?`,
    fields: [{ name: 'len', label: 'Lengte in meters', type: 'number', step: 'any', placeholder: 'bv. 4.20' }], ok: 'Instellen' });
  const len = r && parseFloat(String(r.len).replace(',', '.'));
  U.calib = null;
  if (!len || !(len > 0)) { renderAll(); return; }
  await patch('floors', U.floorId, { m_per_px: len / px });
  toast(`Schaal ingesteld: 1 m = ${Math.round(px / len)} px`);
  setMode(floorRooms().length ? 'view' : 'rooms');
}

async function roomsTap(hit, w, e) {
  if (U.draw) {
    const p = snapDraw(w, e?.altKey);
    if (U.draw.length > 2 && dist(p, U.draw[0]) * V.k < 16) return finishDraw();
    U.draw.push(p); U.hoverW = null; U.guides = [];
    renderAll();
    return;
  }
  if (hit.dim != null && hit.dimRoom === U.editRoom) return editEdge(hit.dim);
  if (hit.vtx != null) { U.selVtx = hit.vtx; renderAll(); return; }
  if (hit.room) { U.editRoom = hit.room; U.selVtx = null; U.ctx = { kind: 'room', id: hit.room }; closeNote(); renderAll(); return; }
  U.editRoom = null; U.selVtx = null; renderAll();
}

async function finishDraw() {
  const pts = U.draw; U.draw = null; U.hoverW = null; U.guides = [];
  if (!pts || pts.length < 3) { renderAll(); return; }
  const n = D.rooms.length;
  const r = await ask({ title: 'Nieuwe ruimte', fields: [{ name: 'name', label: 'Naam', value: '', placeholder: 'bv. Woonkamer' }], ok: 'Opslaan' });
  if (!r) { renderAll(); return; }
  const room = await create('rooms', { floor_id: U.floorId, name: r.name || `Ruimte ${n + 1}`, color: ROOM_COLORS[n % ROOM_COLORS.length], points: pts });
  U.editRoom = room.id; U.ctx = { kind: 'room', id: room.id };
  renderAll();
}

async function editEdge(i) {
  const r = idx.room.get(U.editRoom), s = floor()?.m_per_px;
  if (!s) { toast('Stel eerst de schaal in', true); return; }
  const n = r.points.length, a = r.points[i], b = r.points[(i + 1) % n];
  const cur = dist(a, b) * s;
  const res = await ask({ title: 'Wandlengte', text: 'Het eindpunt van deze wand schuift mee; rechte hoeken blijven behouden.',
    fields: [{ name: 'len', label: 'Lengte in meters', type: 'number', step: 'any', value: cur.toFixed(2) }], ok: 'Toepassen' });
  const L = res && parseFloat(String(res.len).replace(',', '.'));
  if (!L || !(L > 0)) return;
  const pts = r.points.map(p => [...p]);
  const dir = [(b[0] - a[0]) / dist(a, b), (b[1] - a[1]) / dist(a, b)];
  const nb = [a[0] + dir[0] * L / s, a[1] + dir[1] * L / s];
  const delta = [nb[0] - b[0], nb[1] - b[1]];
  const j = (i + 1) % n, k = (i + 2) % n;
  pts[j] = nb;
  if (n >= 4 && k !== i) {
    const c = r.points[k], v = [c[0] - b[0], c[1] - b[1]];
    const cos = (v[0] * dir[0] + v[1] * dir[1]) / (Math.hypot(...v) || 1);
    if (Math.abs(cos) < 0.05) pts[k] = [c[0] + delta[0], c[1] + delta[1]];
  }
  await patch('rooms', r.id, { points: pts });
}

// ------------------------------------------------------------------ modi
function setMode(m) {
  U.meas = []; U.measA = null; U.measLast = null;
  U.mode = m; U.tool = null; U.preview = null; U.draw = null; U.calib = null; U.hoverW = null; U.guides = [];
  U.linking = null; U.selVtx = null;
  if (m !== 'rooms') U.editRoom = null;
  if (m === 'rooms' && U.ctx.kind === 'room') U.editRoom = U.ctx.id;
  renderAll();
}

// ------------------------------------------------------------------ paneel
function setCtx(ctx) {
  U.ctx = ctx; U.openNote = null; U.editing = false; U.view = 'list';
  if (U.mode === 'rooms' && ctx.kind === 'room') U.editRoom = ctx.id;
  renderAll();
  $('#panel').scrollTop = 0;
}
function openNote(id, edit = false) {
  U.openNote = id; U.editing = edit; U.view = 'list';
  renderPanel(true);
  $('#panel').scrollTop = 0;
  renderOverlays();
}
function closeNote() { U.openNote = null; U.editing = false; }

function scopeLabel(n) {
  if (n.scope === 'room') return idx.room.get(n.scope_id)?.name ?? 'Ruimte';
  if (n.scope === 'zone') return idx.zone.get(n.scope_id)?.name ?? 'Zone';
  return 'Algemeen';
}
function noteTitle(n) {
  if (n.title) return n.title;
  const line = n.body.split('\n').map(l => l.replace(/^[#>*\-\s\[\]x]+/i, '').trim()).find(Boolean);
  if (line) return line.slice(0, 80);
  return idx.imgs.get(n.id)?.length ? 'Foto' : 'Zonder titel';
}
function excerpt(n) {
  return n.body.replace(/(^|\s)#todo\b/gi, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[#>*_`~|]/g, '').replace(/- \[[ x]\]/gi, '•').replace(/\s+/g, ' ').trim().slice(0, 220);
}
function notesInRoom(roomId) {
  const r = idx.room.get(roomId); if (!r) return [];
  return D.notes.filter(n => (n.scope === 'room' && n.scope_id === roomId)
    || (idx.pins.get(n.id) || []).some(m => m.floor_id === r.floor_id && r.points.length > 2 && inPoly([m.x, m.y], r.points)));
}
function matches(n) {
  if (!U.search) return true;
  const q = U.search.toLowerCase();
  return (n.title + ' ' + n.body).toLowerCase().includes(q);
}

// ---- todo's
/** De ruimte waar een aantekening bij hoort: expliciet gekozen, anders waar hij geprikt is. */
function noteRoom(n) {
  if (n.scope === 'room') return idx.room.get(n.scope_id) || null;
  for (const m of idx.pins.get(n.id) || []) { const r = markerRoom(m); if (r) return r; }
  return null;
}
function noteTodos(notes) {
  const out = [];
  for (const n of notes) for (const t of n.todos || []) out.push({ ...t, note: n, room: noteRoom(n) });
  return out.sort((a, b) => (a.room?.name ?? '~').localeCompare(b.room?.name ?? '~', 'nl') || b.note.updated - a.note.updated || a.line - b.line);
}
const roomOpenChecks = r => ROOM_TODOS.filter(([k]) => !r.checks?.[k]).length;

function todoRowHtml(t, showRoom = true) {
  const id = `td-${t.note.id}-${t.line}`;
  const where = t.room ? t.room.name : t.note.scope === 'zone' ? scopeLabel(t.note) : 'Algemeen';
  return `<div class="todo ${t.done ? 'done' : ''}">
    <input type="checkbox" id="${id}" data-todo="${t.note.id}" data-line="${t.line}" ${t.done ? 'checked' : ''}>
    <label for="${id}">${esc(t.text)}</label>
    <span class="links">
      ${showRoom ? (t.room ? `<button class="lnk" data-ctx="room" data-id="${t.room.id}"><span class="dot" style="background:${t.room.color}"></span>${esc(where)}</button>` : `<span class="lnk muted">${esc(where)}</span>`) : ''}
      <button class="lnk" data-open="${t.note.id}" title="Open aantekening">📝 ${esc(noteTitle(t.note))}</button>
    </span></div>`;
}
function roomChecksHtml(r) {
  return ROOM_TODOS.map(([k, long, short]) =>
    `<button class="tchip ${r.checks?.[k] ? 'on' : ''}" data-rcheck="${r.id}" data-k="${k}" title="${esc(long)}">${r.checks?.[k] ? '✓' : '○'} ${esc(short)}</button>`).join('');
}

/** Todo-overzicht op het beginscherm. */
function todosHtml() {
  const q = U.search.toLowerCase();
  const all = noteTodos(D.notes).filter(t => !q || t.text.toLowerCase().includes(q) || (t.room?.name ?? '').toLowerCase().includes(q));
  const open = all.filter(t => !t.done), done = all.filter(t => t.done);
  const rooms = D.floors.flatMap(f => floorRooms(f.id).sort((a, b) => a.name.localeCompare(b.name, 'nl')))
    .filter(r => !q || r.name.toLowerCase().includes(q));
  const roomsOpen = rooms.filter(r => roomOpenChecks(r) > 0);
  const roomsDone = rooms.filter(r => roomOpenChecks(r) === 0);
  const nOpen = open.length + roomsOpen.reduce((s, r) => s + roomOpenChecks(r), 0);
  const nDone = done.length + rooms.reduce((s, r) => s + ROOM_TODOS.length - roomOpenChecks(r), 0);
  if (!all.length && !rooms.length) {
    return `<div class="todos"><div class="todo-head"><h3>Todo</h3></div>
      <div class="sub">Zet <code>#todo</code> achter een regel in een aantekening om hem hier te zien.</div></div>`;
  }
  const roomRow = r => `<div class="rtodo"><button class="lnk" data-ctx="room" data-id="${r.id}"><span class="dot" style="background:${r.color}"></span>${esc(r.name)}</button><span class="tchips">${roomChecksHtml(r)}</span></div>`;
  let h = `<div class="todos"><div class="todo-head"><h3>Todo <span class="count">${nOpen} open</span></h3>
    <button class="btn small" data-act="todo-done">${U.showDone ? 'Verberg afgerond' : `Afgerond (${nDone})`}</button></div>`;
  if (open.length) h += open.map(t => todoRowHtml(t)).join('');
  else if (all.length) h += `<div class="sub" style="padding:4px 0">Alle todo's uit aantekeningen zijn afgerond 🎉</div>`;
  if (roomsOpen.length) h += `<div class="todo-sub">Per ruimte</div>${roomsOpen.map(roomRow).join('')}`;
  if (U.showDone) {
    if (done.length) h += `<div class="todo-sub">Afgerond</div>${done.map(t => todoRowHtml(t)).join('')}`;
    if (roomsDone.length) h += `<div class="todo-sub">Ruimtes klaar</div>${roomsDone.map(roomRow).join('')}`;
  }
  return h + '</div>';
}

async function toggleNoteTodo(noteId, line, done) {
  const n = idx.note.get(noteId), t = n?.todos?.find(x => x.line === line);
  if (!t) return;
  t.done = done;
  if (!U.editing) renderPanel();
  try { await api('POST', `/api/notes/${noteId}/todo`, { line, done, text: t.text }); }
  finally { await load(); }
}
function toggleRoomCheck(roomId, k) {
  const r = idx.room.get(roomId); if (!r) return;
  patch('rooms', r.id, { checks: { ...(r.checks || {}), [k]: !r.checks?.[k] } });
}

function renderPanel(force = false) {
  const p = $('#panel');
  if (U.openNote) {
    if (U.editing && !force) { renderNoteSide(); return; }
    p.innerHTML = noteFullHtml(idx.note.get(U.openNote));
    afterNoteRender();
    return;
  }
  if (U.editing) U.editing = false;
  let h = ctxBarHtml();
  if (U.view === 'overview') { p.innerHTML = h + overviewHtml(); return; }
  h += ctxHeadHtml();
  h += `<div class="toolbar">
    <button class="btn pri" data-act="note-new">+ Aantekening</button>
    <button class="btn" data-act="photo-new">📷 Foto's</button>
    <button class="btn" data-act="url-new" title="Plaatje via een link toevoegen">🔗 Link</button>
    <input class="search" type="search" placeholder="Zoeken…" value="${esc(U.search)}" data-act="search">
  </div>`;
  const sections = [];
  const c = U.ctx;
  if (c.kind === 'all') { h += todosHtml(); sections.push([D.notes.length ? 'Aantekeningen' : null, D.notes]); }
  else if (c.kind === 'global') sections.push([null, D.notes.filter(n => n.scope === 'global')]);
  else if (c.kind === 'room') sections.push([null, notesInRoom(c.id)]);
  else if (c.kind === 'zone') {
    const z = idx.zone.get(c.id);
    const own = D.notes.filter(n => n.scope === 'zone' && n.scope_id === c.id);
    const seen = new Set(own.map(n => n.id));
    const fromRooms = [];
    for (const rid of z.room_ids) for (const n of notesInRoom(rid)) if (!seen.has(n.id)) { seen.add(n.id); fromRooms.push(n); }
    sections.push(['Zone', own]);
    if (fromRooms.length) sections.push(['Uit de ruimtes', fromRooms]);
  }
  let any = false;
  for (const [title, list] of sections) {
    const l = list.filter(matches);
    if (!l.length && title !== 'Zone') continue;
    any = any || l.length > 0;
    if (title) h += `<div class="section-title">${title}</div>`;
    h += l.length ? `<div class="cards">${l.map(cardHtml).join('')}</div>` : '';
  }
  if (!any) h += `<div class="empty-list">${U.search ? 'Niets gevonden.' : 'Nog geen aantekeningen hier.<br>Maak er een met <b>+ Aantekening</b>, of plak/sleep een afbeelding hierheen.'}</div>`;
  p.innerHTML = h;
}

function ctxBarHtml() {
  const c = U.ctx;
  let h = `<div class="ctxbar">
    <button class="chip ${c.kind === 'all' && U.view === 'list' ? 'on' : ''}" data-ctx="all">Alles</button>
    <button class="chip ${c.kind === 'global' && U.view === 'list' ? 'on' : ''}" data-ctx="global">Algemeen</button>`;
  if (c.kind === 'room') {
    const r = idx.room.get(c.id);
    h += `<button class="chip ${U.view === 'list' ? 'on' : ''}" data-ctx="room" data-id="${c.id}"><span class="dot" style="background:${r.color}"></span>${esc(r.name)}</button>`;
  }
  for (const z of D.zones) h += `<button class="chip ${c.kind === 'zone' && c.id === z.id && U.view === 'list' ? 'on' : ''}" data-ctx="zone" data-id="${z.id}"><span class="dot" style="background:${z.color}"></span>${esc(z.name)}</button>`;
  h += `<button class="chip add" data-act="zone-new">+ Zone</button>
    <button class="chip ${U.view === 'overview' ? 'on' : ''}" data-act="overview">▦ Overzicht</button></div>`;
  return h;
}

function fxCounts(markers) {
  const c = {};
  for (const m of markers) if (FX[m.kind]) c[m.kind] = (c[m.kind] || 0) + 1;
  return c;
}
function fxCountHtml(c) {
  const keys = Object.keys(FX).filter(k => c[k]);
  if (!keys.length) return '';
  return `<div class="fxcount">${keys.map(k => `<span title="${esc(FX[k].name)}">${fxIconSvg(k, 20)}${c[k]}× ${esc(FX[k].short)}</span>`).join('')}</div>`;
}

function ctxHeadHtml() {
  const c = U.ctx;
  if (c.kind === 'room') {
    const r = idx.room.get(c.id), m = roomMetrics(r), f = idx.floor.get(r.floor_id);
    const zones = D.zones.filter(z => z.room_ids.includes(r.id));
    const mk = D.markers.filter(x => x.floor_id === r.floor_id && FX[x.kind] && r.points.length > 2 && inPoly(markerProbe(x), r.points));
    return `<div class="ctxhead">
      <h2><span class="dot" style="background:${r.color}"></span>${esc(r.name)}</h2>
      <div class="sub">${esc(f?.name)}${zones.length ? ' · ' + zones.map(z => esc(z.name)).join(', ') : ''}</div>
      ${m.scaled ? `<div class="stats">
        <span>Oppervlakte <b>${fmtA(m.area)}</b></span>
        ${m.rect ? `<span>Binnenmaten <b>${nf(m.rect[0])} × ${nf(m.rect[1])} m</b></span>` : ''}
        <span>Omtrek <b>${fmtM(m.perim)}</b></span>
        ${r.ceiling_height ? `<span>Plafond <b>${fmtM(r.ceiling_height)}</b></span><span>Inhoud <b>${nf(m.volume, 1)} m³</b></span>` : ''}
      </div>` : `<div class="stats"><span class="sub">Stel de schaal in voor maten en oppervlakte.</span></div>`}
      ${fxCountHtml(fxCounts(mk))}
      <div class="todos inroom"><div class="todo-head"><h3>Todo</h3></div>
        <div class="tchips">${roomChecksHtml(r)}</div>
        ${noteTodos(notesInRoom(r.id)).filter(t => !t.done || U.showDone).map(t => todoRowHtml(t, false)).join('')}
      </div>
      <div class="rowbtns">
        <button class="btn small" data-act="room-edit">Naam / kleur / plafond</button>
        <button class="btn small" data-act="room-shape">Vorm bewerken</button>
        <button class="btn small" data-act="room-focus">Toon op kaart</button>
      </div></div>`;
  }
  if (c.kind === 'zone') {
    const z = idx.zone.get(c.id), a = zoneArea(z);
    const rooms = z.room_ids.map(id => idx.room.get(id)).filter(Boolean);
    const mk = D.markers.filter(x => FX[x.kind] && rooms.some(r => r.floor_id === x.floor_id && r.points.length > 2 && inPoly(markerProbe(x), r.points)));
    return `<div class="ctxhead">
      <h2><span class="dot" style="background:${z.color}"></span>${esc(z.name)}</h2>
      <div class="stats"><span>Oppervlakte <b>${rooms.length ? fmtA(a.area) : '–'}</b>${a.complete ? '' : ' <span class="sub">(niet alle schalen ingesteld)</span>'}</span><span>${rooms.length} ruimte${rooms.length === 1 ? '' : 's'}</span></div>
      <div class="fxcount">${rooms.map(r => `<button class="chip" data-ctx="room" data-id="${r.id}"><span class="dot" style="background:${r.color}"></span>${esc(r.name)}</button>`).join('')}</div>
      ${fxCountHtml(fxCounts(mk))}
      <div class="rowbtns">
        <button class="btn small ${U.zonePick === z.id ? 'acc' : ''}" data-act="zone-pick">${U.zonePick === z.id ? 'Klaar met kiezen' : 'Ruimtes kiezen op kaart'}</button>
        <button class="btn small" data-act="zone-edit">Naam / kleur</button>
        <button class="btn small danger" data-act="zone-del">Verwijder zone</button>
      </div></div>`;
  }
  if (c.kind === 'global') return `<div class="ctxhead"><h2>Algemeen</h2><div class="sub">Aantekeningen die niet bij één ruimte horen.</div></div>`;
  return '';
}

function cardHtml(n) {
  const imgs = idx.imgs.get(n.id) || [];
  const pins = (idx.pins.get(n.id) || []).length;
  const ex = excerpt(n);
  const handle = `<button class="handle" data-handle="${n.id}" title="Sleep naar de plattegrond om te koppelen"><svg viewBox="0 0 24 24"><path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" fill="currentColor"/></svg></button>`;
  return `<article class="card" data-note="${n.id}">
    ${imgs.length ? `<div class="thumb" style="background-image:url('/files/${imgs[0].thumb}')">${handle}${imgs.length > 1 ? `<span class="n">${imgs.length} foto's</span>` : ''}</div>` : ''}
    <div class="body">${imgs.length ? '' : handle}
      <h3>${esc(noteTitle(n))}</h3>
      ${ex && ex !== noteTitle(n) ? `<div class="ex">${esc(ex)}</div>` : ''}
      <div class="meta">
        ${U.ctx.kind !== 'room' ? `<span class="scope">${esc(scopeLabel(n))}</span>` : ''}
        ${pins ? `<span class="pinned">📍 ${pins}</span>` : ''}
        ${(n.todos || []).some(t => !t.done) ? `<span class="tdc">☐ ${(n.todos || []).filter(t => !t.done).length}</span>` : ''}
        <span>${esc(n.updated_by || n.author)} · ${ago(n.updated)}</span>
      </div></div></article>`;
}

function overviewHtml() {
  const cols = [['stroom', ['socket', 'socket2', 'power'], 'socket'], ['data', ['data'], 'data'], ['schak', SWITCHES, 'switch'], ['licht', LIGHTS, 'light']];
  const head = `<tr><th>Ruimte</th><th>m²</th>${cols.map(c => `<th title="${c[0]}">${fxIconSvg(c[2], 22)}</th>`).join('')}<th title="Open todo's">Todo</th></tr>`;
  let h = `<div class="pad"><h2 style="margin:4px 0 12px;letter-spacing:-.02em">Overzicht</h2><table class="ov">${head}`;
  const tot = { a: 0, c: cols.map(() => 0) };
  for (const f of D.floors) {
    const rooms = floorRooms(f.id).sort((a, b) => a.name.localeCompare(b.name, 'nl'));
    if (!rooms.length) continue;
    h += `<tr class="flh"><td colspan="${3 + cols.length}">${esc(f.name)}</td></tr>`;
    for (const r of rooms) {
      const m = roomMetrics(r);
      const mk = D.markers.filter(x => x.floor_id === f.id && FX[x.kind] && inPoly(markerProbe(x), r.points));
      const counts = cols.map(c => mk.filter(x => c[1].includes(x.kind)).length);
      if (m.scaled) tot.a += m.area;
      counts.forEach((v, i) => tot.c[i] += v);
      const todo = roomOpenChecks(r) + noteTodos(notesInRoom(r.id)).filter(t => !t.done).length;
      h += `<tr class="click" data-ctx="room" data-id="${r.id}"><td>${esc(r.name)}</td><td>${m.scaled ? nf(m.area, 1) : '–'}</td>${counts.map(v => `<td>${v || ''}</td>`).join('')}<td>${todo || '✓'}</td></tr>`;
    }
  }
  h += `<tr class="tot"><td>Totaal</td><td>${nf(tot.a, 1)}</td>${tot.c.map(v => `<td>${v}</td>`).join('')}<td></td></tr></table>`;
  if (D.zones.length) {
    h += `<h3 style="margin:22px 0 8px">Zones</h3><table class="ov"><tr><th>Zone</th><th>Ruimtes</th><th>m²</th></tr>`;
    for (const z of D.zones) h += `<tr class="click" data-ctx="zone" data-id="${z.id}"><td><span class="dot" style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${z.color};margin-right:6px"></span>${esc(z.name)}</td><td>${z.room_ids.filter(i => idx.room.has(i)).length}</td><td>${nf(zoneArea(z).area, 1)}</td></tr>`;
    h += '</table>';
  }
  const all = fxCounts(D.markers);
  h += `<h3 style="margin:22px 0 8px">Elektra totaal</h3>${fxCountHtml(all) || '<div class="sub">Nog niets geplaatst.</div>'}</div>`;
  return h;
}

// ---- uitgeklapte aantekening
function noteFullHtml(n) {
  const imgs = idx.imgs.get(n.id) || [];
  const bar = `<div class="bar">
    <button class="btn small" data-act="note-back">← Terug</button><span class="sp"></span>
    ${U.editing
      ? `<button class="btn small" data-act="note-cancel">Annuleer</button><button class="btn small pri" data-act="note-save">Opslaan</button>`
      : `<button class="btn small" data-act="note-place" title="Plaats op de plattegrond">📍 Plaatsen</button>
         <button class="btn small" data-act="note-edit">✎ Bewerk</button>
         <button class="btn small danger" data-act="note-del" title="Verwijderen">🗑</button>`}
  </div>`;
  if (U.editing) {
    const scopes = [`<option value="global">Algemeen</option>`]
      .concat(D.floors.flatMap(f => floorRooms(f.id).map(r => `<option value="room:${r.id}" ${n.scope === 'room' && n.scope_id === r.id ? 'selected' : ''}>Ruimte: ${esc(r.name)} (${esc(f.name)})</option>`)))
      .concat(D.zones.map(z => `<option value="zone:${z.id}" ${n.scope === 'zone' && n.scope_id === z.id ? 'selected' : ''}>Zone: ${esc(z.name)}</option>`));
    return `<div class="note-full">${bar}<div class="pad editor">
      <input class="title" id="ed-title" placeholder="Titel" value="${esc(n.title)}">
      <select id="ed-scope">${scopes.join('')}</select>
      <div class="mdtools">
        <button data-md="b" title="Vet"><b>B</b></button><button data-md="i" title="Cursief"><i>I</i></button>
        <button data-md="h" title="Kop">H</button><button data-md="ul" title="Lijst">•</button>
        <button data-md="task" title="Takenlijst">☐</button><button data-md="todo" title="Maak van deze regel een todo">#todo</button><button data-md="link" title="Link">🔗</button>
        <button data-md="table" title="Tabel">▦</button><span style="flex:1"></span>
        <button data-md="preview" id="ed-prev-btn">Voorbeeld</button>
      </div>
      <textarea id="ed-body" placeholder="Schrijf in Markdown…  bv.\n- [ ] offerte tegels opvragen\n- [x] kleur kozijnen: RAL 9010">${esc(n.body)}</textarea>
      <div class="md preview hidden" id="ed-preview"></div>
      <div class="drop-hint" id="ed-drop">Sleep foto's hierheen, plak ze, <button class="btn small" data-act="img-add">kies bestanden</button> of <button class="btn small" data-act="img-url">via link</button></div>
      <div id="note-side"></div>
    </div></div>`;
  }
  return `<div class="note-full">${bar}<div class="pad">
    <h1>${esc(noteTitle(n))}</h1>
    <div class="metaline"><span class="chip">${esc(scopeLabel(n))}</span><span>${esc(n.author)} · ${ago(n.created)}${n.updated - n.created > 60 ? ` · bijgewerkt ${ago(n.updated)}${n.updated_by && n.updated_by !== n.author ? ' door ' + esc(n.updated_by) : ''}` : ''}</span></div>
    ${imgs.length ? `<div class="gallery ${imgs.length === 1 ? 'one' : ''}">${imgs.map((im, i) => `<div class="im" data-lb="${i}"><img src="/files/${imgs.length === 1 ? im.file : im.thumb}" loading="lazy" alt=""></div>`).join('')}</div>` : ''}
    <div class="md" id="note-md">${n.body_html}</div>
    ${locsHtml(n)}
  </div></div>`;
}
function locsHtml(n) {
  const pins = idx.pins.get(n.id) || [];
  return `<div class="locs"><h4>Op de plattegrond</h4>${pins.length ? pins.map(m => {
    const r = markerRoom(m), f = idx.floor.get(m.floor_id);
    return `<div class="loc">📍 <span>${esc(r?.name ?? 'Los punt')} <span class="sub">· ${esc(f?.name)}</span></span><span class="sp"></span>
      <button class="btn small" data-act="pin-show" data-id="${m.id}">Toon</button><button class="btn small" data-act="pin-del" data-id="${m.id}" title="Ontkoppelen">✕</button></div>`;
  }).join('') : `<div class="sub">Nog niet geplaatst. Sleep de kaart (📍) naar de plattegrond, of gebruik “📍 Plaatsen”.</div>`}</div>`;
}
/** Bij bewerken alleen de foto's en locaties verversen, zodat de tekst niet verspringt. */
function renderNoteSide() {
  const n = idx.note.get(U.openNote), el = $('#note-side');
  if (!n || !el) return;
  const imgs = idx.imgs.get(n.id) || [];
  el.innerHTML = (imgs.length ? `<div class="gallery">${imgs.map((im, i) => `<div class="im" data-lb="${i}"><img src="/files/${im.thumb}" alt=""><button class="del" data-act="img-del" data-id="${im.id}" title="Verwijder foto">✕</button></div>`).join('')}</div>` : '') + locsHtml(n);
}
function afterNoteRender() {
  if (U.editing) { renderNoteSide(); return; }
  const md = $('#note-md'); if (!md) return;
  md.querySelectorAll('a').forEach(a => { a.target = '_blank'; a.rel = 'noopener'; });
  md.querySelectorAll('input[type=checkbox]').forEach((cb, i) => {
    cb.disabled = false;
    cb.addEventListener('change', () => toggleTask(i));
  });
  decorateTodoTags(md, idx.note.get(U.openNote));
}
/** Vervangt de tekst "#todo" in de weergave door een knop om af te strepen. */
function decorateTodoTags(root, n) {
  const todos = n?.todos || [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: node => node.parentElement.closest('code, pre') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  const nodes = [];
  while (walker.nextNode()) if (/#todo/i.test(walker.currentNode.nodeValue)) nodes.push(walker.currentNode);
  let i = 0;
  for (const node of nodes) {
    const frag = document.createDocumentFragment();
    let last = 0;
    const re = /(^|\s)#todo(?=[ \t]*(\n|$))/gi;
    const v = node.nodeValue;
    let m;
    while ((m = re.exec(v))) {
      const start = m.index + m[1].length;
      frag.append(v.slice(last, start));
      const t = todos[i++];
      const b = document.createElement('button');
      b.className = 'todotag' + (t?.done ? ' done' : '');
      b.textContent = t?.done ? '✓ afgerond' : '☐ todo';
      b.title = t?.done ? 'Weer openzetten' : 'Afstrepen';
      if (t) b.dataset.todotag = t.line;
      frag.append(b);
      last = start + 5;
    }
    frag.append(v.slice(last));
    node.replaceWith(frag);
  }
}

function toggleTask(i) {
  const n = idx.note.get(U.openNote); let k = -1;
  const body = n.body.replace(/^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/gm, (all, a, x, b) => (++k === i ? a + (x === ' ' ? 'x' : ' ') + b : all));
  patch('notes', n.id, { body });
}

async function saveNote() {
  const n = idx.note.get(U.openNote);
  const sc = $('#ed-scope').value;
  const [scope, scope_id] = sc === 'global' ? ['global', null] : sc.split(':');
  const changes = { title: $('#ed-title').value.trim(), body: $('#ed-body').value, scope, scope_id };
  U.editing = false;
  await patch('notes', n.id, changes);
  renderPanel(true);
}
async function cancelEdit() {
  const n = idx.note.get(U.openNote);
  U.editing = false;
  if (n && !n.title && !n.body && !(idx.imgs.get(n.id) || []).length && !(idx.pins.get(n.id) || []).length && n._new) {
    U.openNote = null;
    await remove('notes', n.id);
  }
  renderPanel(true);
}
/** Nieuwe aantekeningen horen bij de ruimte/zone die je bekijkt. */
function ctxScope() {
  const c = U.ctx;
  return c.kind === 'room' || c.kind === 'zone' ? { scope: c.kind, scope_id: c.id } : { scope: 'global' };
}
async function newNote(files) {
  // Foto's eerst veilig inlezen, pas daarna een aantekening aanmaken.
  if (files?.length) { files = await readFiles(files); if (!files.length) return; }
  const n = await create('notes', { title: '', body: '', ...ctxScope() });
  if (files?.length) await uploadImages(n.id, files);
  const obj = idx.note.get(n.id); if (obj) obj._new = !files?.length;
  openNote(n.id, !files?.length);
  if (!files?.length) setTimeout(() => $('#ed-title')?.focus(), 30);
  return n;
}
/**
 * Bestanden direct in het geheugen inlezen. Chrome op Android leest een camerafoto
 * anders pas bij het versturen; is de camera-app het bestand dan nog aan het
 * afronden, dan mislukt de upload stil. Lukt lezen niet meteen, dan nog even wachten.
 */
async function readFiles(files) {
  const out = [], bad = [];
  for (const [i, f] of [...files].entries()) {
    const name = f.name || `foto-${i + 1}.jpg`;
    let ok = null;
    for (let attempt = 0; attempt < 5 && !ok; attempt++) {
      if (attempt) await new Promise(r => setTimeout(r, 400 * attempt));
      try {
        const buf = await f.arrayBuffer();
        if (buf.byteLength) ok = new File([buf], name, { type: f.type || 'image/jpeg' });
      } catch {}
    }
    if (ok) out.push(ok); else bad.push(name);
  }
  if (bad.length) toast(`Kon ${bad.join(', ')} niet lezen — probeer het opnieuw`, true);
  return out;
}
/** Multipart versturen met voortgang; verwerpt met {net: true} bij een verbindingsfout. */
function sendForm(url, fd, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', url);
    x.setRequestHeader('x-client', CLIENT);
    x.timeout = 180000;
    x.upload.onprogress = e => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
    x.onload = () => {
      if (x.status === 401) { location.href = '/login'; return reject({ msg: 'niet ingelogd' }); }
      if (x.status >= 200 && x.status < 300) return resolve();
      let m = x.statusText || `fout ${x.status}`;
      try { m = JSON.parse(x.responseText).error || m; } catch {}
      reject({ msg: m, net: x.status === 502 || x.status === 503 || x.status === 504 });
    };
    x.onerror = () => reject({ net: true, msg: 'geen verbinding' });
    x.ontimeout = () => reject({ net: true, msg: 'het duurde te lang' });
    x.send(fd);
  });
}
async function uploadImages(noteId, files) {
  files = await readFiles(files);
  if (!files.length) return false;
  const fd = new FormData();
  for (const f of files) fd.append('files', f, f.name || 'plakken.png');
  const what = `${files.length} afbeelding${files.length > 1 ? 'en' : ''}`;
  let err = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) { toast(`Verbinding mislukt, opnieuw proberen (${attempt + 1}/3)…`); await new Promise(r => setTimeout(r, 1500 * attempt)); }
    try {
      toast(`${what} uploaden…`);
      await sendForm(`/api/notes/${noteId}/images`, fd, p => { if (p < 1) $('#toast').textContent = `${what} uploaden… ${Math.round(p * 100)}%`; else $('#toast').textContent = `${what} verwerken…`; });
      err = null; break;
    } catch (e) { err = e; if (!e.net) break; }
  }
  if (err) {
    // De foto's blijven in het geheugen: opnieuw proberen kan zonder opnieuw te fotograferen.
    toast(`Uploaden mislukt: ${err.msg}`, true, { label: 'Opnieuw', fn: () => uploadImages(noteId, files) });
    return false;
  }
  await load();
  toast('Geüpload');
  return true;
}
/** Plaatje via een link: de server haalt het op en bewaart het lokaal. */
async function addImageUrl(url, noteId = U.openNote) {
  url = String(url || '').trim();
  if (!/^https?:\/\//i.test(url)) { toast('Dat is geen http(s)-link', true); return; }
  let id = noteId, fresh = false;
  if (!id) { id = (await create('notes', { title: '', body: '', ...ctxScope() })).id; fresh = true; }
  toast('Plaatje ophalen…');
  try {
    await api('POST', `/api/notes/${id}/images/url`, { url });
  } catch {
    if (fresh) await remove('notes', id);
    return;
  }
  await load();
  toast('Plaatje toegevoegd');
  if (fresh) openNote(id); else if (!U.editing) renderPanel(true);
}
async function askImageUrl(noteId) {
  const r = await ask({ title: 'Plaatje via link', text: 'Link naar een plaatje, of naar een pagina (bv. een webshop) — dan wordt de voorbeeldafbeelding gebruikt. Het plaatje wordt hier bewaard.',
    fields: [{ name: 'url', label: 'Link', placeholder: 'https://…' }], ok: 'Ophalen' });
  if (r?.url) await addImageUrl(r.url, noteId);
}

async function createPin(noteId, w) {
  const room = roomAt(w);
  await create('markers', { floor_id: U.floorId, kind: 'note', note_id: noteId, x: w[0], y: w[1] });
  toast(room ? `Gekoppeld aan ${room.name}` : 'Op de plattegrond geplaatst');
  if (U.openNote !== noteId) openNote(noteId); else renderAll();
}

// ---- markdown-hulpjes in de editor
function mdTool(kind) {
  const ta = $('#ed-body'); if (!ta) return;
  const s = ta.selectionStart, e = ta.selectionEnd, v = ta.value, sel = v.slice(s, e);
  const wrap = (a, b, ph) => { const t = sel || ph; ta.setRangeText(a + t + b, s, e, 'end'); if (!sel) ta.setSelectionRange(s + a.length, s + a.length + t.length); };
  const prefix = p => {
    const ls = v.lastIndexOf('\n', s - 1) + 1;
    const block = v.slice(ls, e);
    ta.setRangeText(block.split('\n').map(l => p + l).join('\n'), ls, e, 'end');
  };
  if (kind === 'b') wrap('**', '**', 'vet');
  else if (kind === 'i') wrap('_', '_', 'cursief');
  else if (kind === 'h') prefix('## ');
  else if (kind === 'ul') prefix('- ');
  else if (kind === 'task') prefix('- [ ] ');
  else if (kind === 'todo') {
    const le = v.indexOf('\n', e) === -1 ? v.length : v.indexOf('\n', e);
    const line = v.slice(v.lastIndexOf('\n', s - 1) + 1, le);
    if (!/#todo\s*$/i.test(line)) ta.setRangeText((line && !line.endsWith(' ') ? ' ' : '') + '#todo', le, le, 'end');
  }
  else if (kind === 'link') wrap('[', '](https://)', 'tekst');
  else if (kind === 'table') ta.setRangeText(`\n| Wat | Prijs | Notitie |\n|---|---|---|\n|  |  |  |\n`, s, e, 'end');
  else if (kind === 'preview') { togglePreview(); return; }
  ta.focus();
}
async function togglePreview() {
  const pv = $('#ed-preview'), ta = $('#ed-body'), btn = $('#ed-prev-btn');
  if (pv.classList.contains('hidden')) {
    const r = await api('POST', '/api/markdown', { body: ta.value });
    pv.innerHTML = r.html; pv.classList.remove('hidden'); ta.classList.add('hidden'); btn.textContent = 'Bewerken';
  } else { pv.classList.add('hidden'); ta.classList.remove('hidden'); btn.textContent = 'Voorbeeld'; ta.focus(); }
}

// ------------------------------------------------------------------ slepen: kaart → plattegrond
function startCardDrag(e, noteId) {
  e.preventDefault(); e.stopPropagation();
  const n = idx.note.get(noteId), img = idx.imgs.get(noteId)?.[0];
  const ghost = $('#ghost');
  ghost.innerHTML = `${img ? `<img src="/files/${img.thumb}" alt="">` : '<span class="ico">📝</span>'}<span>${esc(noteTitle(n))}</span>`;
  ghost.classList.remove('hidden');
  let onMap = false;
  const move = ev => {
    ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px';
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    onMap = !!(el && el.closest('#map') && floor());
    ghost.classList.toggle('over', onMap);
    const r = onMap ? roomAt(toWorld(ev.clientX, ev.clientY)) : null;
    if ((r?.id ?? null) !== U.dropRoom) { U.dropRoom = r?.id ?? null; renderOverlays(); }
  };
  const end = async ev => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    ghost.classList.add('hidden');
    U.dropRoom = null;
    dragJustEnded = true; setTimeout(() => dragJustEnded = false, 50);
    if (ev.type === 'pointerup' && onMap) await createPin(noteId, toWorld(ev.clientX, ev.clientY));
    else renderOverlays();
  };
  move(e);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
}
let dragJustEnded = false;

$('#panel').addEventListener('pointerdown', e => {
  const h = e.target.closest('[data-handle]');
  if (h) { startCardDrag(e, h.dataset.handle); return; }
  const card = e.target.closest('[data-note]');
  if (card && e.pointerType === 'mouse' && e.button === 0) {
    const x0 = e.clientX, y0 = e.clientY;
    const mv = ev => { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 6) { cleanup(); startCardDrag(ev, card.dataset.note); } };
    const cleanup = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', cleanup); };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', cleanup);
  }
});
$('#panel').addEventListener('mouseover', e => {
  const c = e.target.closest('[data-note]');
  const id = c?.dataset.note ?? null;
  if (id !== U.hoverNote) { U.hoverNote = id; renderOverlays(); }
});

// ------------------------------------------------------------------ klikken (gedelegeerd)
document.addEventListener('click', async e => {
  const t = e.target;
  if (t.closest('#modal') || t.closest('#lightbox')) return;
  const fl = t.closest('[data-floor]');
  if (fl && !t.closest('[data-act]')) { switchFloor(fl.dataset.floor); return; }
  const mode = t.closest('[data-mode]');
  if (mode) { setMode(mode.dataset.mode); return; }
  const tool = t.closest('[data-tool]');
  if (tool) { U.tool = U.tool === tool.dataset.tool ? null : tool.dataset.tool; U.selMk = null; U.preview = null; renderAll(); return; }
  const ctx = t.closest('[data-ctx]');
  if (ctx) {
    const kind = ctx.dataset.ctx;
    setCtx(kind === 'all' || kind === 'global' ? { kind } : { kind, id: ctx.dataset.id });
    if (kind === 'room') focusRoom(ctx.dataset.id, false);
    return;
  }
  const height = t.closest('[data-height]');
  if (height) { patch('markers', U.selMk, { height_cm: +height.dataset.height }).then(renderPopover); return; }
  const lb = t.closest('[data-lb]');
  if (lb && !t.closest('[data-act]')) { openLightbox(+lb.dataset.lb); return; }
  const md = t.closest('[data-md]');
  if (md) { e.preventDefault(); mdTool(md.dataset.md); return; }
  const rc = t.closest('[data-rcheck]');
  if (rc) { toggleRoomCheck(rc.dataset.rcheck, rc.dataset.k); return; }
  const tt = t.closest('[data-todotag]');
  if (tt) { const n = idx.note.get(U.openNote), tl = +tt.dataset.todotag; const td = n?.todos.find(x => x.line === tl); if (td) toggleNoteTodo(n.id, tl, !td.done); return; }
  const on = t.closest('[data-open]');
  if (on) {
    const n = idx.note.get(on.dataset.open), r = n && noteRoom(n);
    if (r) { U.ctx = { kind: 'room', id: r.id }; focusRoom(r.id, false); }
    openNote(on.dataset.open); renderAll(); return;
  }
  const card = t.closest('[data-note]');
  if (card && !t.closest('[data-handle]') && !dragJustEnded) { openNote(card.dataset.note); return; }
  const act = t.closest('[data-act]');
  if (act) await action(act.dataset.act, act, e);
});

async function action(a, el, e) {
  const m = idx.marker.get(U.selMk);
  switch (a) {
    case 'upload-plan': $('#file-plan').click(); break;
    case 'floor-menu': e.stopPropagation(); floorMenu(); break;
    case 'cancel':
      U.placeNote = null; U.draw = null; U.calib = null; U.hoverW = null; U.guides = []; renderAll(); break;
    case 'mode': setMode(el.dataset.mode); break;
    case 'meas-clear': U.meas = []; U.measA = null; U.measLast = null; renderAll(); break;
    // ruimtes
    case 'draw-start': U.draw = []; U.editRoom = null; U.selVtx = null; renderAll(); break;
    case 'draw-undo': U.draw.pop(); renderAll(); break;
    case 'draw-done': finishDraw(); break;
    case 'room-done': U.editRoom = null; U.selVtx = null; renderAll(); break;
    case 'vtx-del': {
      const r = idx.room.get(U.editRoom);
      if (r.points.length <= 3) { toast('Een ruimte heeft minstens drie punten', true); break; }
      const pts = r.points.filter((_, i) => i !== U.selVtx); U.selVtx = null;
      patch('rooms', r.id, { points: pts }); break;
    }
    case 'room-edit': editRoomProps(U.mode === 'rooms' && U.editRoom ? U.editRoom : U.ctx.id); break;
    case 'room-del': {
      const r = idx.room.get(U.editRoom);
      if (await confirmAsk(`Ruimte “${r.name}” verwijderen?`, 'Aantekeningen blijven bestaan en worden “Algemeen”.')) {
        U.editRoom = null; U.ctx = { kind: 'all' }; await remove('rooms', r.id);
      }
      break;
    }
    case 'room-shape': { const id = U.ctx.id; focusRoom(id); setMode('rooms'); U.editRoom = id; renderAll(); break; }
    case 'room-focus': focusRoom(U.ctx.id); break;
    // zones
    case 'zone-new': {
      const r = await ask({ title: 'Nieuwe zone', text: 'Een zone is een eigen groep ruimtes, bv. “Benedenverdieping natte ruimtes” of “Fase 1”.',
        fields: [{ name: 'name', label: 'Naam', placeholder: 'bv. Leefruimte' }, { name: 'color', label: 'Kleur', type: 'color', value: ZONE_COLORS[D.zones.length % ZONE_COLORS.length], options: ZONE_COLORS }] });
      if (!r) break;
      const z = await create('zones', { name: r.name || 'Zone', color: r.color, room_ids: U.ctx.kind === 'room' ? [U.ctx.id] : [] });
      U.zonePick = z.id; setCtx({ kind: 'zone', id: z.id });
      break;
    }
    case 'zone-pick': U.zonePick = U.zonePick === U.ctx.id ? null : U.ctx.id; renderAll(); break;
    case 'zonepick-done': U.zonePick = null; renderAll(); break;
    case 'zone-edit': {
      const z = idx.zone.get(U.ctx.id);
      const r = await ask({ title: 'Zone', fields: [{ name: 'name', label: 'Naam', value: z.name }, { name: 'color', label: 'Kleur', type: 'color', value: z.color, options: ZONE_COLORS }] });
      if (r) patch('zones', z.id, { name: r.name || z.name, color: r.color });
      break;
    }
    case 'zone-del': {
      const z = idx.zone.get(U.ctx.id);
      if (await confirmAsk(`Zone “${z.name}” verwijderen?`, 'De ruimtes blijven bestaan. Aantekeningen van de zone worden “Algemeen”.')) {
        U.zonePick = null; U.ctx = { kind: 'all' }; await remove('zones', z.id);
      }
      break;
    }
    case 'todo-done': U.showDone = !U.showDone; renderPanel(); break;
    case 'overview': U.view = U.view === 'overview' ? 'list' : 'overview'; U.openNote = null; renderPanel(true); break;
    // aantekeningen
    case 'note-new': newNote(); break;
    case 'photo-new': pickImages(files => newNote(files)); break;
    case 'note-back': U.openNote = null; U.editing = false; renderAll(); break;
    case 'note-edit': U.editing = true; renderPanel(true); break;
    case 'note-save': saveNote(); break;
    case 'note-cancel': cancelEdit(); break;
    case 'note-del': {
      const n = idx.note.get(U.openNote);
      if (await confirmAsk(`“${noteTitle(n)}” verwijderen?`, 'Inclusief foto’s en plekken op de plattegrond.')) { U.openNote = null; await remove('notes', n.id); }
      break;
    }
    case 'note-place':
      if (!floor()) { toast('Upload eerst een plattegrond', true); break; }
      U.placeNote = U.openNote; renderMapChrome(); toast('Tik op de plattegrond'); break;
    case 'img-add': pickImages(files => uploadImages(U.openNote, files)); break;
    case 'img-url': askImageUrl(U.openNote); break;
    case 'url-new': askImageUrl(null); break;
    case 'img-del': if (await confirmAsk('Foto verwijderen?')) { await api('DELETE', `/api/images/${el.dataset.id}`); await load(); } break;
    case 'pin-show': {
      const pm = idx.marker.get(el.dataset.id);
      if (pm.floor_id !== U.floorId) switchFloor(pm.floor_id);
      U.selMk = pm.id; centerOn(pm.x, pm.y, 0); renderAll();
      if (matchMedia('(max-width: 760px)').matches) window.scrollTo(0, 0);
      break;
    }
    case 'pin-del': await remove('markers', el.dataset.id); break;
    // installatiepunten
    case 'pop-close': U.selMk = null; renderAll(); break;
    case 'mk-rotate': await patch('markers', m.id, { rotation: ((m.rotation || 0) + 90) % 360 }); renderPopover(); break;
    case 'mk-dup': {
      const off = 30 / V.k;
      const c = await create('markers', { floor_id: m.floor_id, kind: m.kind, x: m.x + off, y: m.y, rotation: m.rotation, label: m.label, height_cm: m.height_cm });
      U.selMk = c.id; renderAll(); break;
    }
    case 'mk-del': U.selMk = null; await remove('markers', m.id); break;
    case 'link-start': U.linking = m.id; U.mode = 'install'; renderAll(); break;
    case 'link-done': U.linking = null; renderAll(); break;
  }
}

// invoervelden in panel / popover
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.act === 'search') {
    U.search = t.value;
    const pos = t.selectionStart;
    renderPanel();
    const s = $('#panel [data-act=search]'); if (s) { s.focus(); s.setSelectionRange(pos, pos); }
  }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.closest('#popover') && t.dataset.f) {
    const f = t.dataset.f;
    let v = t.value;
    if (f === 'height_cm') v = v === '' ? null : +v;
    patch('markers', U.selMk, { [f]: v }).then(() => { if (f === 'kind') renderPopover(); });
  }
  if (t.dataset.todo) { toggleNoteTodo(t.dataset.todo, +t.dataset.line, t.checked); return; }
  const layer = t.dataset.layer;
  if (layer) { U.layers[layer] = t.checked; store.set('layers', U.layers); renderMap(); }
});

function focusRoom(id, zoom = true) {
  const r = idx.room.get(id); if (!r) return;
  if (r.floor_id !== U.floorId) switchFloor(r.floor_id);
  if (!zoom) { renderOverlays(); return; }
  const xs = r.points.map(p => p[0]), ys = r.points.map(p => p[1]);
  const rect = mapRect();
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
  V.k = Math.min(rect.width / (w * 1.6), (rect.height - 60) / (h * 1.6), 6);
  centerOn((Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2);
}

function switchFloor(id) {
  if (id === U.floorId) return;
  U.floorId = id; store.set('floor', id);
  U.selMk = null; U.draw = null; U.calib = null; U.editRoom = null; U.selVtx = null; U.measA = null;
  renderAll(); fit();
}

async function floorMenu() {
  const f = floor();
  const r = await ask({ title: 'Verdieping', fields: [{ name: 'name', label: 'Naam', value: f.name }],
    extra: [{ id: 'scale', label: 'Schaal opnieuw' }, { id: 'del', label: 'Verwijder', danger: true }] });
  if (!r) return;
  if (r._btn === 'scale') { setMode('scale'); return; }
  if (r._btn === 'del') {
    if (await confirmAsk(`“${f.name}” verwijderen?`, 'Alle ruimtes, elektra en plekken op deze verdieping verdwijnen. Aantekeningen blijven bestaan.')) await remove('floors', f.id);
    return;
  }
  if (r.name && r.name !== f.name) patch('floors', f.id, { name: r.name });
}

async function editRoomProps(id) {
  const r = idx.room.get(id); if (!r) return;
  const res = await ask({ title: 'Ruimte', fields: [
    { name: 'name', label: 'Naam', value: r.name },
    { name: 'ceiling', label: 'Plafondhoogte (m, optioneel)', type: 'number', step: 'any', value: r.ceiling_height ?? '' },
    { name: 'color', label: 'Kleur', type: 'color', value: r.color, options: ROOM_COLORS }] });
  if (!res) return;
  const ch = parseFloat(String(res.ceiling).replace(',', '.'));
  patch('rooms', r.id, { name: res.name || r.name, color: res.color, ceiling_height: ch > 0 ? ch : null });
}

// ------------------------------------------------------------------ bestanden
function pickImages(cb) {
  const inp = $('#file-img');
  inp.value = '';
  inp.onchange = () => { if (inp.files.length) cb([...inp.files]); };
  inp.click();
}
$('#file-plan').addEventListener('change', async e => {
  const files = [...e.target.files]; e.target.value = '';
  if (files.length) uploadPlan(files);
});
async function uploadPlan(files) {
  const fd = new FormData();
  files.forEach(f => fd.append('files', f, f.name));
  toast('Plattegrond verwerken…');
  const created = await api('POST', '/api/floors', fd);
  U.floorId = created[0]?.id ?? U.floorId;
  await load();
  fit();
  setMode('scale');
  toast(`${created.length} verdieping${created.length > 1 ? 'en' : ''} toegevoegd — stel nu de schaal in`);
}

// slepen van bestanden: afbeeldingen naar paneel, PDF naar kaart
/** Link van een plaatje dat vanaf een andere website gesleept wordt. */
function droppedImageUrl(dt) {
  const html = dt.getData('text/html');
  const src = html && new DOMParser().parseFromString(html, 'text/html').querySelector('img[src]')?.src;
  if (src && /^https?:/i.test(src)) return src;
  const uri = (dt.getData('text/uri-list') || '').split(/\r?\n/).find(l => /^https?:/i.test(l));
  return uri || null;
}
['dragover', 'drop', 'dragleave'].forEach(type => document.addEventListener(type, e => {
  const types = e.dataTransfer?.types || [];
  if (!types.includes('Files') && !types.includes('text/uri-list')) return;
  if (!types.includes('Files') && e.target.closest?.('textarea, input')) return;
  e.preventDefault();
  const onMap = e.target.closest?.('#mapwrap');
  const onEdit = e.target.closest?.('#ed-drop, .editor');
  $('#empty').classList.toggle('drag', type === 'dragover' && !!onMap);
  $('#ed-drop')?.classList.toggle('on', type === 'dragover' && !!onEdit);
  if (type !== 'drop') return;
  const files = [...e.dataTransfer.files];
  const pdfs = files.filter(f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
  const imgs = files.filter(f => f.type.startsWith('image/'));
  if (onMap && (pdfs.length || (!floor() && imgs.length))) { uploadPlan(pdfs.length ? pdfs : imgs); return; }
  if (!imgs.length) {
    if (onMap) return;
    const url = droppedImageUrl(e.dataTransfer);
    if (url) addImageUrl(url, U.openNote);
    return;
  }
  if (U.openNote) uploadImages(U.openNote, imgs); else newNote(imgs);
}));
document.addEventListener('paste', e => {
  const imgs = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
  if (!imgs.length) {
    // Een geplakte link (buiten tekstvelden) wordt als plaatje toegevoegd.
    const text = (e.clipboardData?.getData('text/plain') || '').trim();
    if (/^https?:\/\/\S+$/i.test(text) && !e.target.closest('input, textarea, [contenteditable]')) {
      e.preventDefault();
      addImageUrl(text, U.openNote);
    }
    return;
  }
  e.preventDefault();
  if (U.openNote) uploadImages(U.openNote, imgs); else newNote(imgs);
});

// ------------------------------------------------------------------ toetsenbord
document.addEventListener('keydown', e => {
  const typing = e.target.closest('input, textarea, select');
  if ((e.ctrlKey || e.metaKey) && e.key === 's' && U.editing) { e.preventDefault(); saveNote(); return; }
  if ($('#modal').open || typing) return;
  if ($('#lightbox').open) {
    if (e.key === 'ArrowRight') stepLightbox(1); else if (e.key === 'ArrowLeft') stepLightbox(-1);
    return;
  }
  if (e.key === 'Escape') {
    if (U.linking) U.linking = null;
    else if (U.draw) { U.draw = null; U.hoverW = null; }
    else if (U.tool) { U.tool = null; U.preview = null; }
    else if (U.placeNote || U.calib) { U.placeNote = null; U.calib = null; }
    else if (U.mode === 'measure' && (U.measA || U.meas.length)) { if (U.measA) U.measA = null; else { U.meas = []; U.measLast = null; } }
    else if (U.zonePick) U.zonePick = null;
    else if (U.selMk) U.selMk = null;
    else if (U.editRoom) { U.editRoom = null; U.selVtx = null; }
    U.guides = [];
    renderAll();
  } else if (e.key === 'Enter' && U.draw?.length > 2) finishDraw();
  else if ((e.key === 'Delete' || e.key === 'Backspace')) {
    if (U.mode === 'measure') { U.measA = null; U.meas.pop(); U.measLast = null; renderAll(); }
    else if (U.mode === 'rooms' && U.editRoom && U.selVtx != null) action('vtx-del');
    else if (U.selMk && FX[idx.marker.get(U.selMk)?.kind]) action('mk-del');
  } else if (e.key === '+' || e.key === '=') zoomAt(1.25);
  else if (e.key === '-') zoomAt(0.8);
  else if (e.key === '0') fit();
});

// ------------------------------------------------------------------ dialogen
// Native <dialog>: de browser regelt focus, Esc/terug-gebaar en een inerte pagina.
function ask({ title, text, fields = [], ok = 'Opslaan', cancel = 'Annuleren', extra = [], safe = false }) {
  return new Promise(resolve => {
    const m = $('#modal');
    // OK staat als eerste in de DOM zodat Enter in een veld die knop kiest; .btns draait de volgorde visueel om.
    m.innerHTML = `<form method="dialog">
      <h3 id="modal-title">${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}
      ${fields.map(f => f.type === 'color'
        ? `<fieldset><legend>${esc(f.label)}</legend><div class="colors">${f.options.map(c => `<label><input type="radio" name="${f.name}" value="${c}" ${c === f.value ? 'checked' : ''} aria-label="${c}"><span style="background:${c}"></span></label>`).join('')}</div></fieldset>`
        : `<label>${esc(f.label)}<input name="${f.name}" type="text" ${f.type === 'number' ? 'inputmode="decimal"' : ''} value="${esc(f.value ?? '')}" placeholder="${esc(f.placeholder ?? '')}" autocomplete="off"></label>`).join('')}
      <div class="btns">
        <button value="ok" class="btn pri">${esc(ok)}</button>
        <button value="" class="btn" formnovalidate ${safe || !fields.length ? 'autofocus' : ''}>${esc(cancel)}</button>
        ${extra.map(x => `<button value="${x.id}" class="btn extra ${x.danger ? 'danger' : ''}" formnovalidate>${esc(x.label)}</button>`).join('')}
      </div></form>`;
    const form = $('form', m);
    const first = $('input:not([type=radio])', form);
    if (first && !safe) first.autofocus = true;
    m.returnValue = '';
    m.addEventListener('close', () => {
      const v = m.returnValue; m.returnValue = '';
      const values = Object.fromEntries(new FormData(form).entries());
      resolve(!v ? null : v === 'ok' ? values : { ...values, _btn: v });
    }, { once: true });
    m.showModal();
    first?.select?.();
  });
}
async function confirmAsk(title, text) {
  return !!(await ask({ title, text, ok: 'Ja, verwijder', cancel: 'Nee', safe: true }));
}

// ------------------------------------------------------------------ lightbox
let LB = null;
function openLightbox(i) {
  const imgs = idx.imgs.get(U.openNote) || [];
  if (!imgs.length) return;
  LB = { imgs, i }; renderLightbox();
}
function renderLightbox() {
  const lb = $('#lightbox'), im = LB.imgs[LB.i];
  lb.innerHTML = `<img src="/files/${im.file}" alt="">
    <form method="dialog"><button class="close" aria-label="Sluiten" autofocus>×</button></form>
    ${LB.imgs.length > 1 ? '<button class="prev" aria-label="Vorige foto">‹</button><button class="next" aria-label="Volgende foto">›</button>' : ''}
    <span class="lbmeta"><a href="/files/${im.orig}" target="_blank" rel="noopener">Origineel (${LB.i + 1}/${LB.imgs.length})</a>${im.source ? ` · <a href="${esc(im.source)}" target="_blank" rel="noopener noreferrer">Bron: ${esc(new URL(im.source).hostname)}</a>` : ''}</span>`;
  $('.prev', lb) && ($('.prev', lb).onclick = () => stepLightbox(-1));
  $('.next', lb) && ($('.next', lb).onclick = () => stepLightbox(1));
  $('img', lb).onclick = closeLightbox;
  let x0 = null;
  lb.onpointerdown = e => { x0 = e.clientX; };
  lb.onpointerup = e => { if (x0 != null && Math.abs(e.clientX - x0) > 60) stepLightbox(e.clientX < x0 ? 1 : -1); x0 = null; };
  if (!lb.open) lb.showModal();
}
function stepLightbox(d) { LB.i = (LB.i + d + LB.imgs.length) % LB.imgs.length; renderLightbox(); }
function closeLightbox() { $('#lightbox').close(); }
$('#lightbox').addEventListener('close', () => { LB = null; $('#lightbox').innerHTML = ''; });

// Klik buiten een dialoog sluit hem; `closedby="any"` doet dat al, behalve in Safari.
if (!('closedBy' in HTMLDialogElement.prototype)) {
  const outside = (e, d) => { const r = d.getBoundingClientRect(); return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom; };
  for (const d of $$('dialog[closedby="any"]')) {
    let down = false;
    d.addEventListener('pointerdown', e => { down = outside(e, d); });
    d.addEventListener('pointerup', e => { if (down && outside(e, d)) d.close(); });
  }
}

// ------------------------------------------------------------------ overige knoppen
$('#zoom-in').onclick = () => zoomAt(1.4);
$('#zoom-out').onclick = () => zoomAt(1 / 1.4);
$('#zoom-fit').onclick = fit;
$('#layers-btn').onclick = () => $('#layers').classList.toggle('hidden');
$('#hint').addEventListener('click', e => {
  e.stopPropagation();
  const a = e.target.closest('[data-act]');
  if (a) action(a.dataset.act, a, e);
});
$('#split').onclick = () => {
  const order = ['50dvh', '78dvh', '30dvh'];
  const cur = store.get('mapH', '50dvh');
  const next = order[(order.indexOf(cur) + 1) % order.length];
  store.set('mapH', next);
  document.documentElement.style.setProperty('--mapH', next);
  setTimeout(fit, 220);
};
document.documentElement.style.setProperty('--mapH', store.get('mapH', '50dvh'));
new ResizeObserver(() => { if (!floor()) return; if (!fit.done) { fit(); fit.done = true; } else applyView(); }).observe($('#mapwrap'));

function renderAll() {
  renderMap();
  renderPanel();
  renderPopover();
}

load().then(() => { fit(); fit.done = true; connectLive(); });
