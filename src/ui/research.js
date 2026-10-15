import { RESEARCH as R } from '../data/research-core.js';
import { dataset as ds } from '../data/dataset.js';
import { state, setState } from '../state.js';
import { evaluate } from '../simulation/engine.js';
import { economics, clearEconCache } from '../simulation/economics.js';
import { clearRecommendCache } from '../simulation/recommend.js';
import { num, int, pct, esc } from './format.js';
import { DEMAND_SCALES } from '../url-state.js';

let registry = null, registryPromise;
export const registryReady = () => registry !== null;
export async function loadRegistry() {
  if (!registryPromise) registryPromise = import('../data/research-registry.js').then(m => {registry = m.stations; return registry;}).catch(error => {registryPromise = null; throw error;});
  return registryPromise;
}

export function setDemandScale(value) {
  const scale=Number(value); if(!DEMAND_SCALES.includes(scale))return;
  ds.demandScale=scale; clearEconCache();clearRecommendCache();
  setState({decisions:[...state.decisions]});
}
const table=(headers,rows)=>`<div class="audit-table"><table class="tbl"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(v=>`<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const section=(title,body)=>`<section class="sec"><h3>${title}</h3>${body}</section>`;
const mapLink=(lat,lon)=>`<a href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}" target="_blank" rel="noopener noreferrer">${num(lat,5)}; ${num(lon,5)} ↗</a>`;

export function researchSheet() {
  const market=state.networkState.spatial;
  const sensitivityPlan = state.decisions.some(d=>d.options.some(o=>o!=='none')) ? state.decisions : [{station:'ZIL-01',year:2027,options:['pilot']}];
  const sens=[.5,1,1.5].map(scale=>{
    const data={...ds,demandScale:scale}, s=evaluate(data,{year:2030,scenario:state.scenario,decisions:sensitivityPlan}), e=economics(data,state.scenario,sensitivityPlan);
    return [`×${num(scale,1)}`,int(s.totals.demand),pct(s.totals.availability),num(e.npv,2),e.discountedPayback==null?'Не достигнута':num(e.discountedPayback,1)+' лет'];
  });
  return `<div class="sheet-h"><div><div class="mn">Исследовательская база · открытые источники</div><h1>Данные, которые можно проверить</h1><p>География, оценка спроса и инвестиционный расчёт связаны, но имеют разную степень достоверности. Мы не называем результат модели измерением.</p></div></div>
    <div class="cards3"><div class="card"><h3>${R.city.stationCount} групп объектов</h3><p>Реестр зарядок из выгрузки открытой карты. Точки в пределах 60 м объединены эвристически — это не официальный реестр оператора.</p></div><div class="card"><h3>${R.district.cells.length} ячеек спроса</h3><p>Районная сетка 200 м: здания, дороги и точки притяжения. Веса и высоты части зданий остаются модельными.</p></div><div class="card"><h3>${R.district.competitors.length} конкурентных объектов</h3><p>Участвуют в перераспределении спроса при каждом изменении постов. Есть также вариант зарядки за пределами района.</p></div></div>
    <div class="evidence-note" style="margin-top:20px">Проверено воспроизведение районного исследования: по каждой из шести станций отклонение от исходного файла меньше одной сессии в месяц — только округление. Это воспроизведение алгоритма, не проверка его прогноза на реальных сессиях.</div>`+
    section('1. Что имеет источник',table(['Величина','Основание','Статус'],[
      ['≈25,2 кВт·ч на сессию',`12,6 млн кВт·ч ÷ около 500 тыс. сессий. <a target="_blank" rel="noopener noreferrer" href="${R.publicSource.url}">Пресс-релиз Росатома ↗</a>`,'Производная от опубликованных округлённых агрегатов; не профиль конкретной станции'],
      ['Средняя загрузка 10%','Пересказ ответов представителя заказчика: research/docs/02_client_qa.md','Якорь калибровки; прямая ссылка на сообщение не приложена'],
      ['≈27,5 мин на сессию','25,2 кВт·ч ÷ 55 кВт × 60','55 кВт — допущение исследования, не измеренная кривая заряда'],
      ['Расположение станций','Идентификаторы и теги открытой карты — в реестре ниже','Наличие тега не подтверждает актуальность, доступность и оператора'],
      ['Сметы, тарифы, мощности узлов','Демонстрационные параметры прототипа','Не подтверждены. Не подменены обратным расчётом из желаемой окупаемости'],
    ]))+
    section('2. Новый базовый спрос вместо старых демонстрационных чисел',table(['Адресный ориентир','Старый вход, сессий/мес','Оценка из географии, сессий/мес','Пересчёт минус архив'],R.district.stations.map((s,i)=>[s.id,int(s.old_sessions),int(s.sessions),num(R.district.reproduction[i].difference,3)]))+`<p class="note">Шесть ориентиров не стали подтверждёнными станциями Росатома. При меньшем спросе может быть выгоднее ничего не строить — алгоритм не заставляет выбрать инвестицию ради презентации.</p>`)+
    section('3. Конкуренция в текущем плане',market?table(['Куда распределён месячный спрос','Сессии','Доля'],[
      ['Наша модельная сеть',int(market.own),pct(market.own/market.total)],['Конкурентные объекты',int(market.competitors),pct(market.competitors/market.total)],['За пределами территории',int(market.outside),pct(market.outside/market.total)],['Всего по территории',int(market.total),'100%']
    ])+`<p class="note">Это распределение предпочтений до ограничений постов и энергии. Затем почасовой движок отдельно считает обслуживание и отказы. В районной модели неизвестная мощность конкурентов не восстанавливается из воздуха; различия быстрых и медленных зарядок здесь ещё упрощены.</p>`:'')+
    section('4. Проверка чувствительности — не доверительный интервал',`<p class="note">Сравните уровень спроса 50%, 100% и 150% от оценки исследования. ${state.decisions.some(d=>d.options.some(o=>o!=='none')) ? 'Экономика рассчитана для текущего плана.' : 'Текущий план не содержит вложений; для сравнения показан отдельный пример: пилот ZIL-01 в 2027. Он не добавляется в ваш план.'} Меняется весь расчёт: станции, сеть, экономика и рекомендации. Это тестовые допущения, не вероятности. 200% — отдельный стресс-тест сети; исходные лимиты узлов сохраняются.</p><div class="section-actions">${[.5,1,1.5].map(v=>`<button class="btn ${ds.demandScale===v?'primary':''}" data-act="research-scale" data-arg="${v}">Спрос ${v*100}%</button>`).join('')}<button class="btn" data-act="research-scale" data-arg="2">Стресс-тест 200%</button></div>`+table(['Спрос','Запросы сети в 2030, мес','Обслуженная доля','ЧПС сравниваемого плана, млн ₽','Дисконтированная окупаемость'],sens)+`<p class="note">ЧПС — прирост относительно «без вложений» при том же уровне спроса. У пустого плана ЧПС равна нулю по определению. Горизонт — 2026–2035; поздние решения имеют меньше времени для возврата. <button class="btn" data-act="investment-case">Открыть пример: спрос +50%</button> Финансовые предпосылки пока демонстрационные.</p>`)+
    section('5. Где исследование не прошло проверку',`<div class="note warn">Итоговый файл validation.json: показатель различения реальных и контрольных площадок ${num(R.city.holdoutCheck.AUC,3)} при случайном ориентире 0,5. Этот тест не пройден. README архива приводит другое, более раннее число — мы показываем итоговый файл. Доля быстрых станций с модельной загрузкой выше 20% — ${pct(R.city.allocationCheck['получилось_у_модели'],1)}, а в пересказе ответов заказчика — около 10%. Это не подтверждённая точность прогноза.</div><p class="note">Прогноз «через 1, 3, 5 лет» отнесён к 2027, 2029, 2031 годам относительно 2026 года. В архиве те же точки ошибочно растянуты до 2035. После 2031 здесь принят постоянный индекс — явно обозначенное допущение. Модель всего города и работающий почасовой районный расчёт — разные уровни; их показатели не смешиваются.</p>`)+
    section('6. Реестр открытой карты',`<p class="note">Число постов и мощность могут быть восстановлены предположением при отсутствии тега — это отмечено в каждой строке. Отнесение к «быстрым» по порогу 50 кВт не доказывает тип тока. Бренд «Энергия Москвы» не означает принадлежность Росатому. Оценки спроса сохранены только для 60 строк исходного отчёта; прочие значения не выдумываются.</p><div class="research-registry">`+(registry ? table(['Объект / бренд','Карта','Мощность, кВт','Посты','Сессии/мес — модель'],registry.map(s=>[
      esc(s.name||s.brand),s.osmEvidence[0]?`<a target="_blank" rel="noopener noreferrer" href="${s.osmEvidence[0].url}">Объект ↗</a>`:mapLink(s.lat,s.lon),`${int(s.kw)} · ${s.powerHasTag?'есть тег':'допущение'}`,`${s.posts} · ${s.postsHasTag?'есть тег':'допущение'}`,s.sessions_per_month==null?'Нет в отчёте':int(s.sessions_per_month)
    ])) : '<p class="note" role="status">Реестр загружается отдельно от расчёта. <button class="btn" data-act="registry-retry">Повторить загрузку</button></p>')+`</div>`)+
    section('7. Районные зоны для дальнейшей проверки',`<p class="note">Список из исследования для новой станции на два поста. Значения — оценки до почасовой проверки, а не обещание результата. Земля, подъезд, подключение и конкуренты требуют обследования. Нельзя складывать потенциал отдельных площадок без повторного расчёта каннибализации.</p>`+table(['Ориентир','Карта','Потенциал, сессий/мес','Из своей сети','Чистый прирост'],R.district.candidates.slice(0,10).map(c=>[esc(c.landmarks?.[0]||'Зона поиска'),mapLink(c.lat,c.lon),int(c.sessions_per_month),int(c.cannibalized_from_own),int(c.net_gain)])));
}
