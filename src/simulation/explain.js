// Объяснение решения (ОБОСНОВАНИЕ РЕШЕНИЯ): показатели «почему» и связный текст строятся из чисел модели, а не из шаблонной заглушки.
import { OPTIONS, SCENARIOS, MODEL, growthAt } from './params.js';
import { evaluate } from './engine.js';
import { recommend, pkgKey } from './recommend.js';
import { int, num, pct, mln } from '../ui/format.js';

const level = (v, lo, hi) => v < lo ? 'low' : v < hi ? 'mid' : 'high';

export function explain(ds, { station, year, scenario, decisions, options }) {
  const others = decisions.filter(d => !(d.station === station && d.year === year));
  const rec = recommend(ds, { station, year, baseline: decisions, scenario });
  const pkg = rec.byKey[pkgKey(options)] || rec.best;
  const s0 = evaluate(ds, { year, scenario, decisions: others });
  const s30 = evaluate(ds, { year: Math.max(year, 2030), scenario, decisions: others });
  const st0 = s0.byId[station], st30 = s30.byId[station];
  const node0 = s0.nodes[st0.node], node30 = s30.nodes[st0.node];
  const st = ds.byId[station];
  const gRise = growthAt(scenario,Math.max(year,2030));
  const sc = pkg.byScenario[scenario];
  const single = (k) => rec.byKey[k];
  const capexNew = OPTIONS.new_station.capex;
  const pkgCapex = pkg.capex;
  const capexLevel = level(pkgCapex, 20, 60);
  const opts = new Set(options);

  const indicators = {
    demand: { v: '×'+num(growthAt(scenario,Math.max(year,2030)),2), cls: gRise > 1.5 ? 'bad' : gRise > 1.15 ? 'warn' : 'ok', note: `индекс парка к 2026; оценка ${Math.max(year,2030)}` },
    load: { v: pct(st0.load), cls: st0.load >= 0.8 ? 'bad' : st0.load >= 0.5 ? 'warn' : 'ok', note: `${int(st0.D)} сессий/мес` },
    grid: { v: node30.status === 'constraint' ? 'ограничена' : node30.status === 'warn' ? 'на пределе' : 'достаточна', cls: node30.status === 'constraint' ? 'bad' : node30.status === 'warn' ? 'warn' : 'ok', note: `${num(node30.desired, 2)} из ${num(node30.H, 2)} МВт` },
    queue: { v: st0.queueRisk === 'high' ? 'высокий' : st0.queueRisk === 'mid' ? 'средний' : 'низкий', cls: st0.queueRisk === 'high' ? 'bad' : st0.queueRisk === 'mid' ? 'warn' : 'ok', note: st0.queueUnstable ? 'расчётная перегрузка' : `эталон M/M/c: ${num(st0.wait)} мин` },
    capex: { v: capexLevel === 'high' ? 'высокий' : capexLevel === 'mid' ? 'средний' : 'низкий', cls: capexLevel === 'high' ? 'bad' : capexLevel === 'mid' ? 'warn' : 'ok', note: mln(pkgCapex) },
    risk: { v: pkg.riskUnder === 'none' ? 'не применим' : pkg.riskUnder === 'high' ? 'высокий' : pkg.riskUnder === 'mid' ? 'средний' : 'низкий', cls: pkg.riskUnder === 'high' ? 'bad' : pkg.riskUnder === 'mid' ? 'warn' : 'ok', note: `низкий спрос, ${pkg.riskYear}; отрицательная ЧПС в ${pkg.lossScenarios} из 3 сценариев` },
  };

  const gridYear = (() => { for (const y of [2027, 2030, 2035]) { const s = evaluate(ds, { year: y, scenario, decisions: others }); if (s.nodes[st0.node].status === 'constraint') return y; } return null; })();
  const parts = [];
  if(pkgKey(options)!==pkgKey(rec.best.options))parts.push(`Вы выбрали пакет, уступающий рекомендации на <em>${num(Math.max(0,rec.best.score-pkg.score),2)} млн ₽ по score</em>. Это оценка выбранной альтернативы, не обоснование её выгодности.`);
  parts.push(`Модельная станция ${station}: средняя загрузка <em>${pct(st0.load)}</em>, ${st0.queueUnstable ? 'в отдельные часы расчётная перегрузка' : 'стационарное приближение очереди применимо'}. Индекс парка к 2026 году — <em>×${num(gRise, 2)}</em> на ${Math.max(year, 2030)} год. Это не измерения оператора.`);
  const rob = `Ожидаемый ЧПС по сценариям ${mln(pkg.expNpv)} (демо), максимальное сожаление ${mln(pkg.maxRegret)}.`;
  parts.push(`Для заданного пакета: вложения ${mln(pkgCapex)}, денежная ЧПС в выбранном сценарии ${mln(sc.npv)}. В низком сценарии ${mln(pkg.byScenario.low.npv)}, в высоком ${mln(pkg.byScenario.high.npv)}.`,
    `Обслуженная доля спроса всей сети в 2030: ${pct(sc.net2030.availability)} против ${pct(sc.netB2030.availability)} без этого шага.`,rob);
  const en = 'Результат зависит от неподтверждённых исходных параметров. Рекомендация — выбор среди рассмотренных пакетов, не гарантия доходности.';

  // альтернативы
  const alts = rec.ranked.slice(0, 5).map(p => ({ options: p.options, expNpv: p.expNpv, capex: p.capex, regret: p.maxRegret, score: p.score, chosen: pkgKey(p.options) === pkgKey(options), best: p === rec.best }));
  if (!alts.some(a => a.chosen)) alts.push({ options, expNpv: pkg.expNpv, capex: pkg.capex, regret: pkg.maxRegret, score: pkg.score, chosen: true });
  // ответные шаги (реальные опционы)
  const responses = Object.keys(SCENARIOS).map(k => ({ scenario: k, response: pkg.stage?.[k]?.response || null }));
  return { rec, pkg, indicators, text: parts, en, alts, responses, st0, st30, node0, node30, gridYear, sc };
}
