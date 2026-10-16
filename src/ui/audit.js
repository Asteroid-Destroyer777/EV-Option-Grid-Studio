import { state } from '../state.js';
import { dataset } from '../data/dataset.js';
import { economics } from '../simulation/economics.js';
import { MODEL, OPTIONS, SCENARIOS } from '../simulation/params.js';
import { num, int, pct, pkText } from './format.js';
import { RESEARCH } from '../data/research-core.js';

export function auditInput() {
  return { year: state.year, scenario: state.scenario, decisions: state.decisions,
    dataset: { demandModel:dataset.demandModel, demandScale:dataset.demandScale, attractivenessExponent:dataset.attractivenessExponent, stations: dataset.stations.map(({ id, posts, sessions, avgMin, sens, node, mix, pos, site, serviceClass }) => ({ id, posts, sessions, avgMin, sens, node, mix, pos, site, serviceClass })),
      nodes: dataset.nodes.map(({ id, headroom, headroomByHour }) => ({ id, headroom, headroomByHour })) } };
}
export async function exportAudit() {
  const { stations } = await import('../data/research-registry.js');
  const report = { version: '0.3.0', ...auditInput(), assumptions: MODEL, options: OPTIONS,
    research: {...RESEARCH, city: {...RESEARCH.city, stations}},
    simulation: state.networkState, economics: economics(dataset, state.scenario, state.decisions),
    warning: 'Не прогноз оператора. Сценарные входные параметры требуют подтверждения.' };
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = `Расчёт-${state.year}-${state.scenario}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function verifyServer() {
  const el = document.getElementById('server-result');
  el.textContent = 'Проверка серверного расчёта…';
  try {
    const response = await fetch('/api/calculate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(auditInput()) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Сервер недоступен');
    const local = state.networkState.totals;
    const localEconomics = economics(dataset, state.scenario, state.decisions);
    const ok = result.researchVersion === RESEARCH.version &&
      ['demand', 'served', 'lost', 'gridEnergyKWhDay'].every(k => Math.abs(local[k] - result.simulation.totals[k]) < 1e-6) &&
      Math.abs(localEconomics.npv - result.economics.npv) < 1e-6 &&
      localEconomics.flows.every((f, i) => Math.abs(f.discounted - result.economics.flows[i]?.discounted) < 1e-6);
    el.textContent = ok ? 'Сервер и браузер: результаты совпадают. Это проверка воспроизводимости, не достоверности исходных данных.' : 'Обнаружено расхождение. Пересчитайте текущий план.';
  } catch (error) { el.textContent = 'Серверная проверка не выполнена: ' + error.message + '. Локальный расчёт доступен.'; }
}
export function passportSheet() {
  const sim = state.networkState, id = state.selectedStation && sim.byId[state.selectedStation] ? state.selectedStation : 'ZIL-01';
  const s = sim.byId[id], n = sim.nodes[s.node], e = economics(dataset, state.scenario, state.decisions);
  const table = (heads, rows) => `<div class="audit-table"><table class="tbl"><thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(v => `<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const section = (title, body) => `<section class="sec"><h3>${title}</h3>${body}</section>`;
  return `<div class="sheet-h"><div><div class="mn">Паспорт расчёта · версия 0.3</div><h1>От исходных данных до решения</h1><p>${id} · ${state.year} · ${SCENARIOS[state.scenario].name}. Все таблицы построены из текущего плана.</p></div></div>
    <div class="evidence-note"><b>Это сценарный расчёт, не подтверждённый прогноз.</b> География — из открытой карты. Спрос рассчитан моделью Хаффа по 512 ячейкам с 17 конкурентными объектами и внешней альтернативой. Средняя энергия ≈25,2 кВт·ч выведена из опубликованной статистики Росатома. Загрузка 10% — калибровочный якорь из пересказа ответов заказчика; временные профили, мощности сети, цены и рост требуют подтверждения. Движущиеся машины не являются измеренным потоком. До получения телеметрии и технических условий нельзя использовать результат как основание для инвестиций.</div>
    <div class="section-actions"><button class="btn primary" data-act="export-audit">Скачать исходные данные и расчёт</button><button class="btn" data-act="verify-server">Проверить расчёт на сервере</button></div><p id="server-result" class="note"></p>` +
    section('1. Спрос и пропускная способность', `<div class="formula">Вес станции = посты^0,7 × exp(−расстояние / радиус сегмента)\nСпрос станции = Σ спрос ячейки × вес станции / (веса всех станций + внешняя альтернатива)\nСпрос года = базовая оценка × рост электропарка / рост сети × множитель чувствительности\nСпрос в час = спрос за месяц ÷ (365/12) × нормированная доля часа\nСессий в час на станции = посты ÷ max(длительность сессии, энергия / мощность поста)</div><p class="note">Профиль каждого сегмента нормирован до 100%. Смена пика не создаёт дополнительный спрос. При добавлении постов перерасчитывается доля нашей сети и конкурентов. Рост — исследовательские сценарии, не статистический прогноз. С 2031 по 2035 индекс удерживается постоянным: дальше исходная оценка не распространяется. Раздел «Данные исследования» содержит источники и сравнение со старой моделью. ${s.posts} постов; ${num(s.serviceHours * 60)} мин на сессию; ${int(s.D)} запросов в месяц.</p>`) +
    section('2. Электросеть и накопитель', `<div class="formula">Покупка из сети ≤ часовой лимит подключения\nВыдача автомобилям + заряд накопителя = сеть + солнечная энергия + разряд\nЗапас энергии следующего часа = запас + заряд × КПД − разряд ÷ КПД</div><p class="note">Накопитель не увеличивает договорную мощность: он переносит энергию между часами, имеет конечную ёмкость и потери. Сутки замыкаются по запасу энергии. Ночная солнечная выработка равна нулю. Усиление сети повышает лимит только после ввода. Непроданная солнечная энергия не приносит выручку. Проверка ограничений: ${sim.totals.gridViolations} нарушений.</p>` +
      table(['Час', 'Лимит, МВт', 'Из сети, МВт', 'Солнце, МВт', 'Заряд / разряд, МВт', 'Запас, МВт·ч'], n.hourly.map(r => [r.hour, num(r.gridLimitMW, 3), num(r.gridImportMW, 3), num(r.solarMW, 3), `${num(r.chargeMW, 3)} / ${num(r.dischargeMW, 3)}`, num(r.socEndMWh, 3)]))) +
    section('3. Обслуживание, переток и очередь', `<p class="note">Переток допускается к совместимым соседям в пределах ${MODEL.spillMaxM} м, с затуханием по расстоянию и проверкой свободных постов и общего узла. Расстояние прямое, не маршрутное. Сумма обслуженного и потерянного спроса сохраняется. Основной баланс — почасовое обслуживание с немедленным отказом сверх ёмкости. Отдельный эталон Эрланга C показывает гипотетическую систему без отказов; его ожидание не относится к уехавшим клиентам основного баланса. При нагрузке ≥ 1 конечного стационарного ожидания нет; 120 минут — только предел отображения, не прогноз.</p>` +
      table(['Час', 'Спрос', 'Обслужено', 'Принято / передано', 'Потеряно', 'Эталон M/M/c'], s.hourly.map(r => [r.hour, num(r.arrivals), num(r.served), `${num(r.spillIn)} / ${num(r.spillOut)}`, num(r.lost), !r.queueStable ? 'Перегрузка' : (r.waitCapped ? '≥120 мин' : num(r.wait) + ' мин')]))) +
    section('4. Экономика всего плана относительно «ничего не менять»', `<div class="formula">Выручка = обслуженные сессии × энергия сессии × тариф\nЭнергозатраты = фактическая покупка энергии × цена покупки\nПрирост операционного потока = прирост выручки − прирост энергозатрат − расходы новых активов\nЧистая приведённая стоимость = Σ[−вложенияᵧ/(1+r)ᵗ + (операционный потокᵧ + остатокᵧ)/(1+r)ᵗ⁺¹]</div><p class="note">Вложения — начало года, операции — конец года. Остаток ${pct(MODEL.residual)} только введённых капитальных активов в конце 2035 года — допущение, не оценка рынка. Налоги, кредит, инфляция, замены батарей и деградация не учтены. Условная польза от снижения отказов показана отдельно и не добавляется к денежной доходности. Это предварительная, а не банковская финансовая модель.</p>` +
      table(['Показатель', 'Значение'], [['Чистая приведённая стоимость, млн ₽', num(e.npv, 2)], ['Окупаемость, лет', e.payback == null ? 'Не достигается в горизонте / нет вложений' : num(e.payback, 1)], ['Дисконтированная окупаемость, лет', e.discountedPayback == null ? 'Не достигается в горизонте / нет вложений' : num(e.discountedPayback, 1)], ['Внутренняя доходность', e.irr == null ? 'Не определена однозначно' : pct(e.irr, 1)]]) +
      table(['Год', 'Вложения', 'Прирост выручки', 'Прирост маржи', 'Эксплуатация', 'Остаток', 'Приведённый поток'], e.flows.map(f => [f.year, ...['capex', 'dRev', 'dMargin', 'opex', 'residual', 'discounted'].map(k => num(f[k], 2))]))) +
    section('5. Что именно выбирает алгоритм', `<p class="note">Перебор пакетов до трёх совместимых действий для выбранной станции. Критерий: средняя денежная приведённая стоимость по сценариям минус ${MODEL.regretWeight} × максимальное сожаление. Веса ${Object.values(MODEL.probs).map(v => pct(v)).join(' / ')} — предпочтения для анализа, не доказанные вероятности. Основная рекомендация — одноэтапная с фиксированными весами. Отдельная двухэтапная оценка с пересмотром в 2030 доступна в разделе «План». План по сети строится эвристически, глобальный оптимум не гарантирован.</p>`) +
    section('6. Что нужно подтвердить у заказчика', `<p class="note">Журнал зарядных сессий по часам и сезонам; отказы и очереди; энергия, мощность и длительность сессий по типам транспорта; паспорт постов; доступные площадки; технические условия и нагрузка узлов; тарифы, сметы и сроки подключения; сценарии развития территории. Для электробусов отдельно нужны совместимые депо, расписания и энергопотребление маршрутов. Сейчас электробусы не подмешиваются к общественным автомобильным постам.</p>`);
}
