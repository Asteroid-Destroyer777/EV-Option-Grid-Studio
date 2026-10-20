import {gridCaseNodes} from './simulation/grid-case.js';
import { YEARS, SCENARIOS, OPTIONS, EXCLUSIVE, MODEL } from './simulation/params.js';
import { STATION_DEFS, NODE_DEFS } from './data/dataset.js';

const stations = new Set(STATION_DEFS.map(s => s.id));
const nodes = new Set(NODE_DEFS.map(n => n.id));
const views = ['map', 'scenarios', 'plan', 'passport', 'compare', 'data', 'research'];
const layers = ['city', 'demand', 'grid', 'investment', 'future'];
const tabs = ['passport', 'options', 'decision', 'economics'];
export const DEMAND_SCALES = [0.5, 1, 1.5, 2];
const defaults = {gridCase:'base', year: 2026, scenario: 'base', selectedStation: null, selectedNode: null, view: 'map', activeLayer: 'city', panelTab: 'passport', decisions: [], panelHidden: false, selectedFlow: null, selectedSite: null};
const known = (choices, value, fallback) => choices.includes(value) ? value : fallback;

export function readURL(search) {
  const p = new URLSearchParams(search), patch = {...defaults, decisions: []};
  patch.gridCase = p.get('grid')==='limited'?'limited':'base';
  patch.year = known(YEARS, Number(p.get('y')), defaults.year);
  patch.scenario = Object.hasOwn(SCENARIOS, p.get('s')) ? p.get('s') : defaults.scenario;
  patch.selectedStation = stations.has(p.get('st')) ? p.get('st') : null;
  patch.selectedNode = !patch.selectedStation && nodes.has(p.get('nd')) ? p.get('nd') : null;
  const section = p.get('sec');
  patch.view = /^0[1-7]$/.test(section) ? views[Number(section) - 1] : known(views, section, 'map');
  patch.activeLayer = known(layers, p.get('l'), 'city');
  if (patch.activeLayer === 'future' && patch.year !== 2035) patch.activeLayer = 'city';
  patch.panelTab = known(tabs, p.get('tab'), 'passport');
  let plan;
  try { if ((p.get('plan') || '').length <= 12000) plan = JSON.parse(p.get('plan')); } catch {}
  if (Array.isArray(plan) && plan.length <= 40) {
    const seen = new Set();
    patch.decisions = plan.flatMap(d => {
      if (!Array.isArray(d) || d.length !== 3) return [];
      const [station, year, options] = d, key = station + ':' + year;
      if (!stations.has(station) || !MODEL.decisionYears.includes(year) || seen.has(key) || !Array.isArray(options) || !options.length || options.length > 5 || new Set(options).size !== options.length || !options.every(o => typeof o === 'string' && Object.hasOwn(OPTIONS, o)) || (options.length > 1 && options.some(o => EXCLUSIVE.includes(o)))) return [];
      seen.add(key);
      return [{station, year, options}];
    });
  }
  return {patch, demandScale: known(DEMAND_SCALES, Number(p.get('scale')), 1)};
}

export function writeURL(url, state, demandScale) {
  const result = new URL(url), p = result.searchParams;
  for (const key of ['y','s','st','nd','sec','l','tab','plan','scale','grid']) p.delete(key);
  p.set('y', state.year); p.set('s', state.scenario);
  if (state.selectedStation) p.set('st', state.selectedStation);
  if (state.selectedNode) p.set('nd', state.selectedNode);
  if (state.view !== 'map') p.set('sec', String(views.indexOf(state.view) + 1).padStart(2, '0'));
  if (state.activeLayer !== 'city') p.set('l', state.activeLayer);
  if (state.panelTab !== 'passport') p.set('tab', state.panelTab);
  if (state.gridCase==='limited') p.set('grid','limited');
  if (demandScale !== 1) p.set('scale', demandScale);
  if (state.decisions.length) p.set('plan', JSON.stringify(state.decisions.map(d => [d.station, d.year, d.options])));
  return result;
}

export function bindURLState(state, dataset, subscribe, setState) {
  const initial = readURL(location.search);
  Object.assign(state, initial.patch); dataset.demandScale = initial.demandScale;
  dataset.nodes = gridCaseNodes(dataset.nodes,initial.patch.gridCase);dataset.nodeById=Object.fromEntries(dataset.nodes.map(n=>[n.id,n]));
  const sync = () => {
    const url = writeURL(location.href, state, dataset.demandScale);
    if (url.href !== location.href) history.replaceState(history.state, '', url);
  };
  subscribe(sync); sync();
  window.addEventListener('popstate', () => {
    const next = readURL(location.search);
    dataset.demandScale = next.demandScale;
    dataset.nodes=gridCaseNodes(dataset.nodes,next.patch.gridCase);dataset.nodeById=Object.fromEntries(dataset.nodes.map(n=>[n.id,n]));
    next.patch.decisions=[...next.patch.decisions];
    setState(next.patch);
  });
}
