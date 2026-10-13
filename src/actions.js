// Действия приложения: единая точка изменения состояния (UI, 3D и клавиши вызывают только эти функции).
import { state, setState } from './state.js';
import { dataset as ds } from './data/dataset.js';
import { evaluate } from './simulation/engine.js';
import { recommend, pkgKey } from './simulation/recommend.js';
import { recommendedPlan } from './simulation/policies.js';
import { OPTIONS, EXCLUSIVE, YEARS } from './simulation/params.js';
import { nearestRoad } from './scene/roads.js';

export const ctx = { twin: null, walk: null, toast: () => {}, ui: null };
export const bind = (o) => Object.assign(ctx, o);

export function recompute() {
  state.networkState = evaluate(ds, { year: state.year, scenario: state.scenario, decisions: state.decisions });
  return state.networkState;
}
export const decisionFor = (station, year) => state.decisions.find(d => d.station === station && d.year === year) || null;
export const currentPackage = () => (state.selectedStation ? decisionFor(state.selectedStation, state.year)?.options || [] : []);
export const stationName = (id) => ds.byId[id] ? id : id;

export function recommendation(station = state.selectedStation, year = state.year) {
  if (!station || !ds.byId[station]) return null;
  return recommend(ds, { station, year, baseline: state.decisions, scenario: state.scenario });
}

export function setYear(y) {
  const patch = { year: y };
  if (state.activeLayer === 'future' && y !== 2035) { patch.activeLayer = 'city'; patch.prevYear = null; }
  setState(patch);
}
export function setScenario(id) { setState({ scenario: id }); }
export function setView(v) { setState({ view: v, metroFocus:null, ...(v === 'map' ? { panelHidden: false } : {}) }); }

export function setLayer(layer) {
  if (state.walkMode && layer === 'future') { }
  const patch = { activeLayer: layer, metroFocus:null };
  if (layer === 'future') { if (state.year !== 2035) { patch.prevYear = state.year; patch.year = 2035; } }
  else if (state.activeLayer === 'future' && state.prevYear && state.year === 2035) { patch.year = state.prevYear; patch.prevYear = null; }
  if (layer === 'investment' && !state.selectedStation) { patch.selectedStation = 'ZIL-01'; patch.panelTab = 'options'; }
  if (layer === 'investment') { patch.panelTab = 'options'; patch.panelHidden = false; }
  setState(patch);
  const t = ctx.twin, o = t.orbit;
  if (state.walkMode) return;
  const c = o.cur;
  if (layer === 'grid') {
    const st = state.selectedStation && ds.byId[state.selectedStation];
    const tg = st ? st.pos : { x: c.tx, z: c.tz };
    o.flyTo({ tx: tg.x, ty: -8, tz: tg.z, dist: Math.min(c.dist, 620), az: c.az, pol: 1.3 }, 1.7);
  } else if (c.ty < -1 || c.pol > 1.2) {
    o.flyTo({ ty: 0, pol: Math.min(c.pol, 1.0), tx: c.tx, tz: c.tz, dist: c.dist, az: c.az }, 1.3);
  }
  if (layer === 'investment') {
    const st = ds.byId[state.selectedStation || 'ZIL-01'];
    o.flyTo({ tx: st.pos.x, ty: 0, tz: st.pos.z, dist: 260, az: c.az, pol: 0.95 }, 1.6);
  }
  if (layer === 'demand') {
    const st = ds.byId[state.selectedStation || 'ZIL-01'];
    o.flyTo({ tx: st.pos.x - 60, ty: 0, tz: st.pos.z + 40, dist: 1250, az: c.az, pol: 0.95 }, 1.8);
  }
}

export function flyToStation(id, { dist = 190, pol = 0.95, az } = {}) {
  const t = ctx.twin; if (!t) return Promise.resolve();
  const p = t.stationPos(id);
  return t.orbit.flyTo({ tx: p.x, ty: state.activeLayer === 'grid' ? -8 : 0, tz: p.z, dist, az: az ?? t.orbit.cur.az, pol }, 1.5);
}

export function selectStation(id, { fly = true, tab } = {}) {
  setState({ panelHidden: false });
  setState({ selectedStation: id, metroFocus:null, selectedNode: null, selectedSite: null, selectedFlow: null, panelTab: tab || (state.activeLayer === 'investment' ? 'options' : (state.panelTab === 'options' ? 'options' : 'passport')), view: 'map' });
  if (fly && !state.walkMode) flyToStation(id, { dist: state.activeLayer === 'investment' ? 260 : 210 });
}
export function selectNode(id, { fly = true } = {}) {
  setState({ panelHidden: false });
  setState({ selectedNode: id, selectedStation: null, selectedSite: null, selectedFlow: null, view: 'map' });
  if (fly && !state.walkMode) { const n = ds.nodeById[id]; ctx.twin.orbit.flyTo({ tx: n.pos.x, ty: state.activeLayer === 'grid' ? -10 : 0, tz: n.pos.z, dist: 260, pol: state.activeLayer === 'grid' ? 1.25 : 1.0 }, 1.4); }
}
export function selectSite(stationId, { fly = true } = {}) {
  setState({ panelHidden: false });
  setState({ selectedSite: stationId, selectedStation: stationId, selectedNode: null, selectedFlow: null, panelTab: 'options', view: 'map' });
  if (fly && !state.walkMode) { const s = ds.byId[stationId].site; ctx.twin.orbit.flyTo({ tx: s.x, ty: 0, tz: s.z, dist: 200, pol: 0.95 }, 1.4); }
}
export function selectFlow(id) { setState({ panelHidden:false, selectedFlow: id, selectedStation: null, selectedNode: null, selectedSite: null, view: 'map' }); }
export function clearSelection() { setState({ panelHidden:true, selectedStation: null, selectedNode: null, selectedSite: null, selectedFlow: null, investmentOption: null, hoverOption: null, focusOption: null }); }

/* ---------- инвестиционные решения ---------- */
export function setPackage(station, year, opts) {
  const others = state.decisions.filter(d => !(d.station === station && d.year === year));
  const decisions = opts.length ? [...others, { station, year, options: [...opts] }] : others;
  setState({ decisions, investmentOption: opts.length ? opts[opts.length - 1] : null, focusOption: opts.length ? opts[opts.length - 1] : null });
}
export function toggleOption(id) {
  const st = state.selectedStation; if (!st) return;
  if (state.activeLayer === 'future') { ctx.toast('В режиме «Итог» показан результат плана — решения меняйте в другом режиме'); return; }
  const year = state.year;
  const cur = currentPackage();
  let opts = [...cur];
  if (EXCLUSIVE.includes(id)) opts = opts.includes(id) ? [] : [id];
  else { opts = opts.filter(o => !EXCLUSIVE.includes(o)); opts = opts.includes(id) ? opts.filter(o => o !== id) : [...opts, id]; }
  setPackage(st, year, opts);
  setState({ focusOption: id, investmentOption: id, panelTab: state.panelTab === 'options' ? 'decision' : state.panelTab });
}
export function applyRecommended() {
  const st = state.selectedStation; if (!st) return;
  const r = recommendation(st, state.year); if (!r) return;
  setPackage(st, state.year, r.best.options);
  setState({ panelTab: 'decision' });
}
export function clearDecisions() { setState({ decisions: [], investmentOption: null, focusOption: null }); }
export function removeDecision(station, year) { setPackage(station, year, []); }
export function applyRecommendedPlan() {
  const plan = recommendedPlan(ds, state.scenario);
  setState({ decisions: plan });
  return plan;
}
export function hoverOption(id) { setState({ hoverOption: id }); }
export function focusOption(id) { setState({ focusOption: id, investmentOption: id }); }

/* ---------- режимы ---------- */
/** Точка появления пешехода: на улице перед станцией (открытое место без стен), взгляд — на станцию. */
export function spawnPoint(st) {
  const t = ctx.twin;
  const nr = nearestRoad(t.roads.roadGrid, st.pos.x, st.pos.z, 90, 4);
  let x = st.pos.x + st.pos.fx * 26, z = st.pos.z + st.pos.fz * 26;
  if (nr) { const dx = nr.x - st.pos.x, dz = nr.z - st.pos.z, L = Math.hypot(dx, dz) || 1; x = nr.x + (dx / L) * 1.5; z = nr.z + (dz / L) * 1.5; }
  // от улицы шагаем к станции по свободной земле (тротуар, площадка) — до ~20 м от центра
  const total = Math.hypot(st.pos.x - x, st.pos.z - z);
  if (total > 22) {
    const ux = (st.pos.x - x) / total, uz = (st.pos.z - z) / total;
    let seenFree = false, bx = x, bz = z;
    for (let d = 0; d < total - 20; d += 2) {
      const px = x + ux * d, pz = z + uz * d;
      if (t.placer.free(px, pz, 1.2)) { seenFree = true; bx = px; bz = pz; } else if (seenFree) break;
    }
    x = bx; z = bz;
  }
  return { x, z, yaw: Math.atan2(-(st.pos.x - x), -(st.pos.z - z)) };
}
export function enterWalk(target) {
  if (state.walkMode) return;
  const id = target || state.selectedStation || 'ZIL-01';
  const st = ds.byId[id] || ds.byId['ZIL-01'];
  const sp = spawnPoint(st);
  setState({ walkMode: true, view: 'map' });
  document.getElementById('app').dataset.mode = 'walk';
  ctx.walk.enter(sp);
}
export function exitWalk() {
  if (!state.walkMode) return;
  ctx.walk.exit();
  setState({ walkMode: false });
  document.getElementById('app').dataset.mode = 'orbit';
}
