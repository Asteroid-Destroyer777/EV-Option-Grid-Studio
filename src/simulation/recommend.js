// Робастный перебор пакетов без знания будущего сценария.
import { COMBINABLE, EXCLUSIVE, SCENARIOS, MODEL } from './params.js';
import { evaluatePackage, economics } from './economics.js';
import { decisionsKey, datasetKey } from './engine.js';

export const RECOURSE_YEAR = 2030;

export function candidatePackages() {
  const res = [];
  const n = COMBINABLE.length;
  for (let mask = 1; mask < (1 << n); mask++) {
    const pkg = COMBINABLE.filter((_, i) => mask & (1 << i));
    if (pkg.length <= 3) res.push(pkg);
  }
  for (const e of EXCLUSIVE) res.push([e]);
  return res;
}
export const pkgKey = (options) => [...options].sort().join('+');

export function weightsFor(scenario, year) {
  return { ...MODEL.probs }; // Переключатель сценария — не новые наблюдения.
}

const memo = new Map();
export function recommend(ds, { station, year, baseline, scenario = 'base' }) {
  const others = baseline.filter(d => !(d.station === station && d.year === year));
  const W = weightsFor(scenario, year);
  const key = `${datasetKey(ds)}|${station}@${year}|${W.low}/${W.base}/${W.high}|${decisionsKey(others)}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const scs = Object.keys(SCENARIOS);
  const pk = candidatePackages().map(options => evaluatePackage(ds, { station, year, options, baseline, weights: W }));
  const useRecourse = false; // Будущие шаги задаются явно в плане, без знания будущего.
  for (const p of pk) {
    p.stage = {};
    for (const sc of scs) {
      let val = p.byScenario[sc].npv, resp = null;
      p.stage[sc] = { value: val, response: resp };
    }
    p.exp = scs.reduce((a, k) => a + W[k] * p.stage[k].value, 0);
  }
  const best = {};
  for (const sc of scs) best[sc] = Math.max(...pk.map(p => p.stage[sc].value));
  for (const p of pk) {
    p.regret = {}; let mr = 0;
    for (const sc of scs) { p.regret[sc] = best[sc] - p.stage[sc].value; mr = Math.max(mr, p.regret[sc]); }
    p.maxRegret = mr;
    p.score = p.exp - MODEL.regretWeight * mr;
    p.useRecourse = useRecourse;
  }
  pk.sort((a, b) => b.score - a.score);
  const res = { ranked: pk, best: pk[0], byKey: Object.fromEntries(pk.map(p => [pkgKey(p.options), p])), weights: W, useRecourse };
  memo.set(key, res);
  if (memo.size > 300) memo.delete(memo.keys().next().value);
  return res;
}
export function clearRecommendCache() { memo.clear(); }
