import {datasetKey} from '../simulation/engine.js';
import {analysisMarkup,analysisReady,requestAnalysis} from './analysis.js';
// Рабочие листы: сценарии, план развития, паспорт расчёта, сравнение подходов, данные и допущения.
import { state, setState } from '../state.js';
import { syncSheetModal } from './modal.js';
import { passportSheet } from './audit.js';
import { researchSheet, registryReady, loadRegistry } from './research.js';
import { dataset as ds } from '../data/dataset.js';
import { evaluate } from '../simulation/engine.js';
import { seriesCached, marginPerSession } from '../simulation/economics.js';
import { recommend } from '../simulation/recommend.js';
import { recommendedPlan, traditionalPlan, planKpis } from '../simulation/policies.js';
import { recommendation } from '../actions.js';
import { MODEL, OPTIONS, SCENARIOS, ALL_YEARS, YEARS, growthAt, assumptionRows, USER_TYPES } from '../simulation/params.js';
import { esc, num, int, pct, mln, sgn, TAG, PROV, pkCode, pkText, lineChart, chipStatus, ICONS, riskCls, RISK_RU } from './format.js';

const $ = (s) => document.querySelector(s);
let registryLoading = false;
let compareTimer = null, compareCache = {}, compareRun = 0;

export function renderSheet() {
  const el = $('#sheet');
  const close = () => setState({ view: 'map' });
  if (state.view === 'map') { el.hidden = true; el.innerHTML = ''; stopCompare(); syncSheetModal(el, close); return; }
  el.hidden = false;
  const scroll = el.scrollTop;
  const focused = el.contains(document.activeElement) ? document.activeElement : null;
  const focusId = focused?.id, act = focused?.dataset.act, arg = focused?.dataset.arg;
  const v = state.view;
  if(v==='research'&&!analysisReady('sensitivity')) setTimeout(()=>{if(state.view==='research'&&!analysisReady('sensitivity'))requestAnalysis('sensitivity');},0);
  if (v === 'research' && !registryReady() && !registryLoading) {
    registryLoading = true;
    loadRegistry().then(() => { if (state.view === 'research') renderSheet(); }).catch(() => {}).finally(() => { registryLoading = false; });
  }
  const body = v === 'research' ? researchSheet() : v === 'scenarios' ? scenariosSheet() : v === 'plan' ? planSheet() : v === 'passport' ? passportSheet() : v === 'compare' ? compareSheet() : dataSheet();
  el.innerHTML = `<div class="sheet-in">${body}</div><button class="btn sheet-x" data-act="view" data-arg="map">${ICONS.x}&nbsp; К карте</button>`;
  syncSheetModal(el, close);
  el.scrollTop = scroll;
  const replacement = [...el.querySelectorAll('[id], [data-act]')].find(n => focusId ? n.id === focusId : act && n.dataset.act === act && n.dataset.arg === arg);
  replacement?.focus({preventScroll: true});
  if (v === 'compare') startCompare();
}
const H = (kicker, title, text, right = '') => `<div class="sheet-h"><div><div class="mn" style="color:#c6bdff">${kicker}</div><h1>${title}</h1><p>${text}</p></div><div>${right}</div></div>`;

/* ---------- 01. СЦЕНАРИИ ---------- */
function scenariosSheet() {
  const scs = Object.values(SCENARIOS);
  const chart = lineChart({ w: 1100, h: 210, pad: [16, 20, 26, 44], yMin: 1, yMax: 5, yFmt: (v) => '×' + v.toFixed(1).replace('.', ','), xTicks: [2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035], cur: state.year,
    series: scs.map(s => ({ pts: ALL_YEARS.map(y => [y, growthAt(s.id, y)]), color: s.color, w: s.id === state.scenario ? 3 : 1.6, dots: s.id === state.scenario })) });
  const cards = scs.map(s => {
    const S30 = evaluate(ds, { year: 2030, scenario: s.id, decisions: state.decisions }), S35 = evaluate(ds, { year: 2035, scenario: s.id, decisions: state.decisions });
    const S35n = evaluate(ds, { year: 2035, scenario: s.id, decisions: [] });
    const r = recommend(ds, { station: 'ZIL-01', year: state.year, baseline: [], scenario: s.id });
    return `<div class="card ${s.id === state.scenario ? 'on' : ''}">
      <div class="mn" style="color:${s.color}">■ ${s.short.toUpperCase()}</div><h3>${s.name}</h3><p>${s.note}</p>
      <div class="kpirow"><div><b>×${num(growthAt(s.id, 2030), 2)}</b><span>парк EV 2030</span></div><div><b>×${num(growthAt(s.id, 2035), 2)}</b><span>парк EV 2035</span></div></div>
      <table class="tbl" style="margin:10px 0 12px"><tbody>
        <tr><td>Загрузка сети 2035</td><td class="r num">${pct(S35.totals.util)}</td></tr>
        <tr><td>Риск очереди в 2035 · эталон</td><td class="r num">${S35.totals.queuing} из ${S35.stations.length}</td></tr>
        <tr><td>Узлов в ограничении 2035</td><td class="r num">${S35.totals.constrainedNodes}</td></tr>
        <tr><td>Потери спроса «без решений»</td><td class="r num neg">${int(S35n.totals.lost)} сессий/мес</td></tr></tbody></table>
      <div class="mn" style="margin-bottom:6px">Лучший первый шаг для ZIL-01</div><div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">${pkCode(r.best.options)}</div>
      <button class="btn ${s.id === state.scenario ? '' : 'primary'} block" data-act="scenario" data-arg="${s.id}">${s.id === state.scenario ? '✓ Выбран' : 'Выбрать сценарий'}</button></div>`;
  }).join('');
  return H('02 · СЦЕНАРИИ', 'Три сценария неопределённости спроса', 'Смена сценария меняет транспортные потоки, загрузку ЭЗС, очереди, нагрузку сети и экономику. Робастная рекомендация использует фиксированные веса 25/50/25; переключатель сценария их не меняет. Значения — сценарные допущения.', TAG.scn) +
    `<div class="chart-box" style="margin-bottom:18px"><div class="sec-h"><h3 class="mono">Индекс роста парка электромобилей (2026 = ×1,0)</h3><div class="legend" style="margin:0">${scs.map(s => `<span style="--c:${s.color}"><i></i>${s.name}</span>`).join('')}</div></div>${chart}</div><div class="cards3">${cards}</div>`;
}

/* ---------- 03. ПЛАН ---------- */
function planSheet() {
  const dec = state.decisions;
  const rows = ds.stations.map(s => `<div class="rowh"><b>${s.id}</b><span>${s.address}</span></div>` + YEARS.map(y => {
    const d = dec.find(x => x.station === s.id && x.year === y);
    const lead = d ? Math.max(...d.options.map(o => OPTIONS[o].lead)) : 0;
    return `<div class="cell ${y === state.year ? 'now' : ''}">${d ? pkCode(d.options) + (lead ? `<span class="note" style="width:100%">ввод ${y + lead}</span>` : '') : '<span class="note">—</span>'}</div>`;
  }).join('')).join('');
  const S = seriesCached(ds, state.scenario, dec), S0 = seriesCached(ds, state.scenario, []);
  const kpi = YEARS.map(y => { const i = ALL_YEARS.indexOf(y), a = S[i], b = S0[i]; return { y, a, b }; });
  const cell = (f) => kpi.map(k => `<div>${f(k)}</div>`).join('');
  const lostSer = (X) => X.map((s, i) => [ALL_YEARS[i], s.totals.lost]);
  const chart = lineChart({ w: 520, h: 190, yMax: Math.max(1000, ...S0.map(s => s.totals.lost)) * 1.1, yFmt: (v) => int(v), cur: state.year, series: [{ pts: lostSer(S0), color: '#ff6b78', dash: true, w: 1.8 }, { pts: lostSer(S), color: '#8b7bff', w: 2.6, area: true }] });
  const util = lineChart({ w: 520, h: 190, yMax: 1, cur: state.year, series: [{ pts: S0.map((s, i) => [ALL_YEARS[i], s.totals.availability]), color: '#ff6b78', dash: true, w: 1.8 }, { pts: S.map((s, i) => [ALL_YEARS[i], s.totals.availability]), color: '#8b7bff', w: 2.6, area: true }], yMin: 0.4 });
  return H('03 · ПЛАН РАЗВИТИЯ', 'Последовательность инвестиционных шагов', 'Решение принимается не «где поставить ЭЗС», а «где, когда и какой шаг». Первый шаг в 2027, пересмотр в 2030; 2035 — оценка результата. Исходный спрос 2026 и 2027 одинаков: новых наблюдений для различения этих лет нет.',
    `<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn violet" data-act="plan-rec" ${state.planBusy?'disabled':''}>${state.planBusy?'Подбираем план…':'★ Рекомендованная траектория'}</button><button class="btn" data-act="plan-clear" ${dec.length && !state.planBusy ? '' : 'disabled'}>Очистить план</button></div>`) +
    (state.planMessage?`<p class="evidence-note" role="status">${esc(state.planMessage)}</p>`:'') +
    `${!dec.some(d=>d.options.some(o=>o!=='none')) ? '<p class="evidence-note">Сейчас в плане нет вложений. Для автоматического подбора нажмите «Рекомендованная траектория». Если подбор завершился пустым планом, подходящие шаги не прошли ограничения и порог score. Это не доказывает глобальную невыгодность всех проектов; чувствительность в «Данных исследования» пересчитывает решение заново.</p>' : ''}<p class="note">Критерий: ожидаемая ЧПС − 0,35 × максимальное сожаление; принимается score &gt; ${MODEL.planMinScore} млн ₽, до ${MODEL.planMaxStations} горячих станций на шаг. Это ограниченный жадный подбор, а не глобальный оптимум. Двухэтапный анализ ниже оценивает последующий ответ отдельно.</p><div class="plan"><div class="hd">ЭЗС / адрес</div>${YEARS.map(y => `<div class="hd yr">${y}</div>`).join('')}${rows}</div>
    <div class="cards2" style="margin-top:22px">
      <div class="chart-box"><div class="sec-h"><h3 class="mono">Потерянный спрос, сессий/мес</h3>${TAG.scn}</div>${chart}<div class="legend"><span style="--c:#8b7bff"><i></i>с планом</span><span style="--c:#ff6b78"><i class="dash"></i>без решений</span></div></div>
      <div class="chart-box"><div class="sec-h"><h3 class="mono">Доступность зарядки (доля обслуженного спроса)</h3>${TAG.scn}</div>${util}<div class="legend"><span style="--c:#8b7bff"><i></i>с планом</span><span style="--c:#ff6b78"><i class="dash"></i>без решений</span></div></div>
    </div>
    <div class="plan" style="grid-template-columns:150px repeat(4,1fr);margin-top:22px"><div class="hd">Показатель · план / без решений</div>${YEARS.map(y => `<div class="hd yr">${y}</div>`).join('')}
      <div class="rowh"><b>Загрузка сети</b></div>${cell(k => `<span class="num">${pct(k.a.totals.util)}</span> <span class="note">/ ${pct(k.b.totals.util)}</span>`)}
      <div class="rowh"><b>Доступность</b></div>${cell(k => `<span class="num ${k.a.totals.availability > k.b.totals.availability ? 'pos' : ''}">${pct(k.a.totals.availability)}</span> <span class="note">/ ${pct(k.b.totals.availability)}</span>`)}
      <div class="rowh"><b>Риск очереди · эталон</b></div>${cell(k => `<span class="num">${k.a.totals.queuing}</span> <span class="note">/ ${k.b.totals.queuing}</span>`)}
      <div class="rowh"><b>Узлов в ограничении</b></div>${cell(k => `<span class="num">${k.a.totals.constrainedNodes}</span> <span class="note">/ ${k.b.totals.constrainedNodes}</span>`)}
      <div class="rowh"><b>Вложения накопленный</b></div>${cell(k => `<span class="num">${int(k.a.totals.capexCum)}</span> <span class="note">млн ₽</span>`)}
    </div>`+analysisMarkup('flexibility');
}

/* ---------- 04. ПАСПОРТ РАСЧЁТА ---------- */

/* ---------- 05. СРАВНЕНИЕ ---------- */
const TR = [['Проверять ежегодно', 'Пиковая нагрузка ≥80% или необслуженный спрос >1/мес'], ['Запланировать ввод', 'Новая ЭЗС через 2 года, не позже 2035'], ['Проверить узел', 'При фактическом модельном дефиците — усиление сети'], ['Учесть результат', 'В KPI входят только введённые мощности']];
const EV = [['Спрос', 'Потоки по типам пользователей, сценарный рост'], ['Существующая сеть', 'Загрузка, очереди, переток между станциями'], ['Энергосеть', 'Допустимая мощность узла, накопители'], ['Сценарии', 'Низкий / базовый / высокий рост электропарка'], ['Инвестиционные варианты', '8 шагов: от «не строить» до новой ЭЗС'], ['Экономика и риск', 'ЧПС, ВД, сожаление по сценариям'], ['Инвестиционный шаг → следующий год', 'Решение меняет исходные данные будущего']];
function compareSheet() {
  return H('05 · СРАВНЕНИЕ ПОДХОДОВ', 'Сравнение: базовая стратегия и План зарядной сети', 'Слева — условная контрольная логика «определить дефицит → построить ЭЗС». Справа — цепочка, которая связывает спрос, сеть, экономику и последовательность шагов. Ниже — результат на тех же трёх сценариях.',
    `<button class="btn" data-act="cmp-replay">↻ Повторить анимацию</button>`) +
    `<div class="flowchart">
      <div class="col bad"><div class="mn" style="color:var(--st-high)">БАЗОВАЯ СТРАТЕГИЯ</div><h3>Точка за точкой</h3><div class="lead">Определить дефицит → построить станцию</div><div class="steps">${TR.map((s, i) => `<div class="step" data-i="${i}"><div class="sn">${i + 1}</div><div><b>${s[0]}</b><span>${s[1]}</span></div></div>`).join('')}</div></div>
      <div class="col good"><div class="mn" style="color:#c6bdff">ПЛАН ЗАРЯДНОЙ СЕТИ</div><h3>Последовательность решений</h3><div class="lead">Спрос → сеть → сценарии → варианты → шаг → следующий год</div><div class="steps">${EV.map((s, i) => `<div class="step" data-i="${i}"><div class="sn">${i + 1}</div><div><b>${s[0]}</b><span>${s[1]}</span></div></div>`).join('')}</div></div>
    </div>
    <div class="sec-h" style="margin-top:28px"><h3 class="mono">Результат траекторий 2026–2035 · критерии из постановки задачи</h3>${TAG.model}</div>
    <div id="cmpres" class="cmp-kpi"><div class="note">Считаю траектории для трёх сценариев…</div></div>
    <div class="note" style="margin-top:14px">Контрольная траектория: ежегодно с 2027 проверяются пиковая нагрузка ≥80% или необслуженный спрос >1 сессии/мес; новая ЭЗС вводится через 2 года. Проекты за горизонтом 2035 не запускаются. При текущем ограничении узла отдельно планируется усиление. План зарядной сети: на каждой контрольной точке выбирается пакет с лучшим ожидаемым ЧПС и минимальным сожалением. Демо-модель — значения сценарные.</div>`;
}
export function stopCompare() { compareRun++; clearTimeout(compareTimer); }
function startCompare() {
  const my = ++compareRun;
  playSteps(my);
  computeCompare(my);
}
export function replaySteps() { const my = ++compareRun; document.querySelectorAll('#sheet .step').forEach(s => s.classList.remove('on')); playSteps(my); if (compareCache.html) computeCompare(my, true); }
function playSteps(my) {
  const cols = [...document.querySelectorAll('#sheet .col')];
  const max = Math.max(TR.length, EV.length);
  let i = 0;
  const tick = () => {
    if (my !== compareRun) return;
    cols.forEach(c => c.querySelector(`.step[data-i="${i}"]`)?.classList.add('on'));
    if (++i <= max) compareTimer = setTimeout(tick, 650);
  };
  tick();
}
async function computeCompare(my, again) {
  const out = $('#cmpres'); if (!out) return;
  if (compareCache.key === datasetKey(ds) && compareCache.html && !again) { out.innerHTML = compareCache.html; return; }
  const res = {};
  for (const sc of Object.keys(SCENARIOS)) {
    await new Promise(r => setTimeout(r, 30)); if (my !== compareRun) return;
    const tp = traditionalPlan(ds, sc), rp = recommendedPlan(ds, sc);
    res[sc] = { tr: planKpis(ds, sc, tp), ev: planKpis(ds, sc, rp), tp, rp };
  }
  if (my !== compareRun) return;
  const block = (title, sub, get, fmt, better) => {
    const rows = Object.keys(SCENARIOS).map(sc => {
      const a = get(res[sc].tr), b = get(res[sc].ev); const mx = Math.max(a, b, 1e-6);
      return `<div class="brow tr"><span>${SCENARIOS[sc].short}</span><div class="bar"><i style="width:${(a / mx) * 100}%"></i></div><span class="num" style="text-align:right">${fmt(a)}</span></div>
              <div class="brow ev"><span></span><div class="bar"><i style="width:${(b / mx) * 100}%"></i></div><span class="num" style="text-align:right;color:#c6bdff">${fmt(b)}</span></div>`;
    }).join('<div style="height:6px"></div>');
    const d = (get(res.base.ev) - get(res.base.tr));
    return `<div class="card"><div class="mn">${sub}</div><h3>${title}</h3><div class="bars">${rows}</div><div class="note" style="margin-top:12px">Базовый сценарий: <b style="color:${Math.abs(d)<1e-7?'var(--paper-2)':better(d) ? 'var(--st-low)' : 'var(--st-high)'}">${Math.abs(d)<1e-7?'Равенство:':better(d)?'Лучше по критерию:':'Ниже по критерию:'} План зарядной сети ${d >= 0 ? '+' : '−'}${fmtDelta(title, Math.abs(d))}</b></div></div>`;
  };
  const fmtDelta = (t, v) => t.includes('издерж') ? int(v) + ' млн ₽' : (v * 100).toFixed(1).replace('.', ',') + ' п.п.';
  const html = block('Загрузка сети', 'Средняя загрузка; оценивать вместе с доступностью', k => k.util, v => pct(v, 0), d => d > 0) +
    block('Инфраструктурные издержки', 'Только капитальные вложения, не полная стоимость владения', k => k.capex, v => int(v) + ' млн', d => d < 0) +
    block('Доступность зарядки', 'Критерий 3 · выше — лучше', k => k.availability, v => pct(v, 0), d => d > 0);
  const legend = `<div class="legend" style="grid-column:1/-1;margin-top:-4px"><span style="--c:#ff6b78"><i></i>Базовая стратегия</span><span style="--c:#8b7bff"><i></i>План зарядной сети</span></div>`;
  compareCache.key = datasetKey(ds);
  compareCache.html = html + legend;
  if ($('#cmpres')) $('#cmpres').innerHTML = compareCache.html;
}
export function clearCompareCache() { compareCache = {}; }

/* ---------- 06. ДАННЫЕ ---------- */
function dataSheet() {
  const rows = assumptionRows();
  const groups = [...new Set(rows.map(r => r.g))];
  return H('06 · ДАННЫЕ И ДОПУЩЕНИЯ', 'Что подтверждено, а что — сценарий', 'Мы разделяем открытые данные и сценарные допущения. Ни одна демонстрационная цифра не выдаётся за данные РСЗС, ни один параметр сети — за инженерные данные.') +
    `<div class="cards3" style="margin-bottom:24px">
      <div class="card"><div style="margin-bottom:8px">${TAG.osm}</div><h3>Реальные объекты территории</h3><p>Здания, улицы, Москва-река, МЦК, ж/д, ТЭЦ-9 и подстанции — из OpenStreetMap: ${int(4002)} зданий, ${int(6133)} участков улиц. Положение узлов сети совпадает с объектами power=substation.</p></div>
      <div class="card"><div style="margin-bottom:8px">${TAG.verified}</div><h3>Адреса ЭЗС-ориентиров</h3><p>1-й Автозаводский проезд, 5 · Автозаводская ул., 5 и 7 · 1-й Кожуховский проезд · Восточная ул. · Мытная ул. Заданы командой, геокодированы; загрузка и принадлежность не подтверждены.</p></div>
      <div class="card"><div style="margin-bottom:8px">${TAG.scn}</div><h3>Сценарии и экономика</h3><p>Загрузка — результат модели Хаффа и почасового расчёта. Мощности узлов, цены и сметы пока демонстрационные. Источники и качество новой оценки спроса доступны в разделе «Данные исследования».</p></div></div>` +
    groups.map(g => `<div class="sec"><div class="sec-h"><h3 class="mono">${g}</h3></div><table class="tbl assum"><tbody>${rows.filter(r => r.g === g).map(r => `<tr><td>${r.g}</td><td>${r.k}</td><td>${r.v}</td><td>${PROV[r.p] || ''}</td><td>${r.note}</td></tr>`).join('')}</tbody></table></div>`).join('') +
    `<div class="sec" style="margin-top:24px"><div class="sec-h"><h3 class="mono">Об РСЗС (из описания задачи)</h3>${TAG.rszs}</div><div class="note" style="font-size:12px;max-width:820px;color:var(--paper-2)">Источник: приложенный кейс «Зарядка электромобилей в мегаполисах», страницы 4–8. Критерии проверки решения: рост загрузки сети, снижение инфраструктурных издержек, улучшение доступности зарядки; прогноз загрузки станции, влияние на соседние станции и сценарный анализ на несколько лет вперёд; экономическая модель и сравнение с традиционными подходами.</div></div>
    <div class="sec" style="margin-top:20px"><div class="note">© участники OpenStreetMap (лицензия ODbL). Геокодирование адресов — OSM Nominatim. Визуализация стилизована и не является инженерной GIS-моделью.</div></div>`;
}
