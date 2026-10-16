// Демонстрационная экономика опций: Вложения, Эксплуатация, выручка, ЧПС, ВД, окупаемость, риски.
// ДЕМО-МОДЕЛЬ: все значения — сценарные допущения прототип, не данные РСЗС.
import { MODEL, OPTIONS, ALL_YEARS, YEAR_MIN, YEAR_MAX, SCENARIOS } from './params.js';
import { evaluate, evaluateSeries, collectAssets, decisionsKey, datasetKey } from './engine.js';

export const marginPerSession = () => MODEL.kwhPerSession * (MODEL.tariff - MODEL.energyCost);
export const revenuePerSession = () => MODEL.kwhPerSession * MODEL.tariff;

const cache = new Map();
export function seriesCached(ds, scenario, decisions) {
  const k = datasetKey(ds) + '#' + scenario + '#' + decisionsKey(decisions);
  let v = cache.get(k);
  if (!v) { v = evaluateSeries(ds, scenario, decisions); cache.set(k, v); if (cache.size > 64) cache.delete(cache.keys().next().value); }
  return v;
}
export function clearEconCache() { cache.clear(); }

const sig = (a) => `${a.station}|${a.option}|${a.decisionYear}`;
function allItems(decisions) { const { built, pending } = collectAssets(decisions, YEAR_MAX + 10); return [...built, ...pending]; }

function marginOf(state, tariff = MODEL.tariff) {
  return revenueOf(state, tariff) - state.totals.gridEnergyKWhDay * MODEL.daysPerYear * MODEL.energyCost / 1e6;
}
const revenueOf = (state, tariff = MODEL.tariff) => state.stations.reduce((a, s) => a + s.served, 0) * 12 * MODEL.kwhPerSession * tariff / 1e6;
const lostOf = (state) => state.totals.lost * 12;

export function irr(cf) {
  const signs = cf.filter(v => Math.abs(v) > 1e-9).map(Math.sign);
  if (signs.filter((v, i) => i && v !== signs[i - 1]).length !== 1) return null;
  const hasNeg = cf.some(v => v < -1e-9), hasPos = cf.some(v => v > 1e-9);
  if (!hasNeg || !hasPos) return null;
  const f = (r) => cf.reduce((a, v, t) => a + v / Math.pow(1 + r, t), 0);
  let lo = -0.85, hi = 4;
  if (f(lo) * f(hi) > 0) return null;
  for (let i = 0; i < 70; i++) { const mid = (lo + hi) / 2; if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid; }
  return (lo + hi) / 2;
}

/**
 * Экономика набора решений `decisions` относительно `baseline` в сценарии `scenario`.
 * Возвращает денежные потоки по годам, ЧПС, ВД, окупаемость.
 */
export function economics(ds, scenario, decisions, baseline = [], financial = {}) {
  const tariff = financial.tariff ?? MODEL.tariff, capexScale = financial.capexScale ?? 1;
  if (!Number.isFinite(tariff) || tariff < 0 || !Number.isFinite(capexScale) || capexScale < 0) throw new Error('Некорректные финансовые предпосылки.');
  const life = financial.assetLifeYears ?? 12;
  if (!Number.isFinite(life) || life <= 0) throw new Error('Срок службы должен быть положительным.');
  const A = seriesCached(ds, scenario, decisions), B = seriesCached(ds, scenario, baseline);
  const scaleAssets = plan => allItems(plan).map(a => ({...a,capex:a.capex * capexScale}));
  const proposed = scaleAssets(decisions), previous = scaleAssets(baseline);
  const items = proposed;
  const cash = [], flows = [];
  let capexTotal = 0;
  for (let t = 0; t < ALL_YEARS.length; t++) {
    const y = ALL_YEARS[t];
    const dMargin = marginOf(A[t], tariff) - marginOf(B[t], tariff);
    const dRev = revenueOf(A[t], tariff) - revenueOf(B[t], tariff);
    const dLost = lostOf(B[t]) - lostOf(A[t]);
    let opex = 0, capex = 0;
    for (const [assets, sign] of [[proposed, 1], [previous, -1]]) for (const a of assets) {
      if (a.effYear <= y) opex += sign * OPTIONS[a.option].opex;
      if (a.decisionYear === y) capex += sign * a.capex;
    }
    capexTotal += capex;
    const salvage = assets => assets.filter(a => a.effYear <= YEAR_MAX && a.option !== 'defer').reduce((s,a) => s + a.capex * (financial.residualPolicy === 'linear-life' ? Math.max(0,1-(YEAR_MAX-a.effYear+1)/life) : MODEL.residual),0);
    const residual = y === YEAR_MAX ? salvage(proposed) - salvage(previous) : 0;
    const operating = dMargin - opex;
    const c = operating - capex + residual;
    const good = dLost * MODEL.goodwillPerLost / 1e6;
    // Капвложения в начале года, операционный поток и остаток — в конце.
    if (t === 0) cash.push(-capex); else cash[t] -= capex;
    cash.push(operating + residual);
    const discounted = -capex / (1 + MODEL.discount) ** t + (operating + residual) / (1 + MODEL.discount) ** (t + 1);
    const competitorCapture = (B[t].spatial?.competitors ?? 0) - (A[t].spatial?.competitors ?? 0);
    const outsideCapture = (B[t].spatial?.outside ?? 0) - (A[t].spatial?.outside ?? 0);
    flows.push({ year: y, dMargin, dRev, opex, capex, operating, residual, discounted, cash: c, goodwill: good, dLost,competitorCapture,outsideCapture });
  }
  const npv = flows.reduce((a, f) => a + f.discounted, 0);
  const goodPV = flows.reduce((a, f, t) => a + f.goodwill / Math.pow(1 + MODEL.discount, t + 1), 0);
  // окупаемость без остаточной стоимости
  const firstY = flows.find(f => f.capex > 0)?.year;
  const repayment = discounted => {
    if (firstY == null) return null;
    let cum = 0, result = null;
    for (const f of flows) {
      const t = f.year - YEAR_MIN;
      cum -= f.capex / (discounted ? (1 + MODEL.discount) ** t : 1);
      if (cum < 0) result = null;
      const op = f.operating / (discounted ? (1 + MODEL.discount) ** (t + 1) : 1);
      if (cum < 0 && cum + op >= 0 && op > 0) result = f.year - firstY + (-cum / op);
      cum += op;
      if (cum < 0) result = null;
    }
    return result;
  };
  return { flows, cash, npv, npvAdj: npv + goodPV, goodPV, irr: irr(cash), payback: repayment(false), discountedPayback: repayment(true), capex: capexTotal, items };
}

/** Сводка по опции/пакету для конкретной станции и года решения — во всех сценариях. */
export function evaluatePackage(ds, { station, year, options, baseline, weights }) {
  const others = baseline.filter(d => !(d.station === station && d.year === year));
  const mine = { station, year, options: [...options] };
  const withPkg = [...others, mine];
  const out = { options, byScenario: {}, year, station };
  for (const sc of Object.keys(SCENARIOS)) {
    const e = economics(ds, sc, withPkg, others);
    const A = seriesCached(ds, sc, withPkg), B = seriesCached(ds, sc, others);
    const i30 = ALL_YEARS.indexOf(2030), i35 = ALL_YEARS.indexOf(2035), iy = ALL_YEARS.indexOf(Math.min(2035, Math.max(year, 2027)));
    const st = (S, i) => S[i].byId[station];
    const newId = A[i30].stations.filter(s => s.anchor === station).map(s => s.id);
    const focusLoad = (S, i) => { const s = st(S, i); const nn = S[i].stations.filter(x => x.anchor === station); return nn.length ? Math.max(s.load, ...nn.map(x => x.load)) : s.load; };
    out.byScenario[sc] = {
      econ: e, npv: e.npv, npvAdj: e.npvAdj, irr: e.irr, payback: e.payback, capex: e.capex,
      load2030: st(A, i30).load, load2035: st(A, i35).load, loadBase2030: st(B, i30).load, loadBase2035: st(B, i35).load,
      wait2030: st(A, i30).wait, waitBase2030: st(B, i30).wait,
      queue2030: st(A, i30).queueRisk, queueBase2030: st(B, i30).queueRisk,
      net2030: A[i30].totals, net2035: A[i35].totals, netB2030: B[i30].totals, netB2035: B[i35].totals,
      focusLoad2030: focusLoad(A, i30), focusLoad2035: focusLoad(A, i35),
      dRev2030: e.flows[i30].dRev, dMargin2030: e.flows[i30].dMargin, opex2030: e.flows[i30].opex,
      gridStatus2030: A[i30].nodes[ds.byId[station].node].status,
      gridUtil2030: A[i30].nodes[ds.byId[station].node].util,
      newStationLoad2030: newId.length ? A[i30].byId[newId[0]].load : null,
    };
  }
  const P = weights || MODEL.probs;
  const sc = out.byScenario;
  out.expNpv = Object.keys(sc).reduce((a, k) => a + P[k] * sc[k].npv, 0);
  out.expScore = Object.keys(sc).reduce((a, k) => a + P[k] * sc[k].npvAdj, 0);
  out.capex = sc.base.capex;
  // риск недозагрузки: как загружена целевая ёмкость при низком росте в 2030
  out.lead = Math.max(0, ...options.map(o => OPTIONS[o].lead));
  out.riskYear=Math.min(2035,Math.max(2030,year+out.lead));
  const lowState=seriesCached(ds,'low',withPkg)[ALL_YEARS.indexOf(out.riskYear)];
  const lowLoad = Math.max(lowState.byId[station].load,...lowState.stations.filter(s=>s.anchor===station).map(s=>s.load));
  const added = options.some(o => ['new_station', 'expansion', 'pilot'].includes(o));
  out.riskUnder = !added ? 'none' : lowLoad < 0.45 ? 'high' : lowLoad < 0.62 ? 'mid' : 'low';
  out.lossScenarios = Object.values(sc).filter(s=>s.npv<0).length;
  return out;
}
