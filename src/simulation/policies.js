// Две стратегии развития сети: «традиционная» (дефицит → строим ЭЗС) и План зарядной сети (поэтапные решения с учётом сети и сценариев).
import { evaluate, evaluateSeries } from './engine.js';
import { recommend, pkgKey } from './recommend.js';
import { ALL_YEARS, MODEL, SCENARIOS, OPTIONS } from './params.js';
import { PLANNING_DEFAULTS } from './assumptions.js';
import { seriesCached } from './economics.js';

export const PLAN_YEARS = [...PLANNING_DEFAULTS.decisionYears];

/** Рекомендованная траектория План зарядной сети: на каждой контрольной точке — лучший пакет для самых «горячих» станций. */
export function recommendedPlan(ds, scenario) {
  const decisions = [];
  for (const y of PLAN_YEARS) {
    const st = evaluate(ds, { year: y, scenario, decisions });
    const hot = st.stations.filter(s => !s.isNew && (s.load >= 0.72 || s.queueRisk === 'high' || s.status === 'constraint' || s.unserved > 1))
      .sort((a, b) => (b.rho + (b.status === 'constraint' ? 1 : 0)) - (a.rho + (a.status === 'constraint' ? 1 : 0))).slice(0, MODEL.planMaxStations);
    for (const s of hot) {
      const r = recommend(ds, { station: s.id, year: y, baseline: decisions, scenario });
      const best = r.best;
      if (best.options[0] === 'none' || best.score <= MODEL.planMinScore) continue;
      decisions.push({ station: s.id, year: y, options: [...best.options] });
    }
  }
  return decisions;
}

/** Традиционный подход: увидели дефицит — построили новую ЭЗС; сеть чиним постфактум. */
export function traditionalPlan(ds, scenario) {
  const decisions = [];
  const built = new Set();
  for (const y of ALL_YEARS.filter(y => y >= 2027)) {
    const st = evaluate(ds, { year: y, scenario, decisions });
    for (const s of [...st.stations].sort((a,b)=>b.rho-a.rho)) {
      if (s.isNew) continue;
      if (y + OPTIONS.new_station.lead <= ALL_YEARS.at(-1) && (s.rho >= .8 || s.unserved > 1) && !built.has(s.id)) { decisions.push({ station: s.id, year: y, options: ['new_station'] }); built.add(s.id); }
    }
    for (const n of Object.values(st.nodes)) {
      if (y + OPTIONS.grid_upgrade.lead <= ALL_YEARS.at(-1) && n.status === 'constraint' && n.upgrade === 0 && !decisions.some(d => d.options.includes('grid_upgrade') && ds.byId[d.station].node === n.id)) {
        decisions.push({ station: n.stations.find(id => !id.includes('-N')), year: y, options: ['grid_upgrade'] });
      }
    }
  }
  return decisions;
}

/** Показатели траектории (критерии из постановки задачи: загрузка сети, инфраструктурные издержки, доступность зарядки). */
export function planKpis(ds, scenario, decisions) {
  const S = evaluateSeries(ds, scenario, decisions);
  const yrs = S.filter(s => s.year >= 2027);
  const avg = (f) => yrs.reduce((a, s) => a + f(s), 0) / yrs.length;
  const last = S[S.length - 1];
  return {
    util: avg(s => s.totals.util),                        // средняя загрузка установленной ёмкости
    availability: avg(s => s.totals.availability),        // доля спроса без отказа
    lost: yrs.reduce((a, s) => a + s.totals.lost * 12, 0),
    capex: last.totals.capexCum,
    constraintYears: yrs.reduce((a, s) => a + s.totals.constrainedNodes, 0),
    queuingYears: yrs.reduce((a, s) => a + s.totals.queuing, 0),
    posts2035: last.totals.posts,
    util2035: last.totals.util, avail2035: last.totals.availability,
    series: S,
  };
}
