import {planSensitivity,demandBoundary} from '../simulation/analysis.js';
import {datasetKey} from '../simulation/engine.js';
const boundaries=new Map();
import {economics} from '../simulation/economics.js';
import {recommend} from '../simulation/recommend.js';
import {MODEL,OPTIONS,SCENARIOS} from '../simulation/params.js';

const aliases=[['expansion',/расшир|добав.{0,10}пост/i],['new_station',/нов.{0,12}(станци|эзс)|строительств/i],['storage',/накопител|батаре/i],['grid_upgrade',/усилен.{0,10}сет|сет.{0,10}усилен/i],['local_gen',/солн|генерац/i],['defer',/отлож|подготов/i],['pilot',/пилот/i],['none',/ничего не|без (влож|проект)/i]];
export function optionContext(input,selectedStation,question) {
  const ds={...input.dataset,byId:Object.fromEntries(input.dataset.stations.map(s=>[s.id,s]))};
  const explicit=question.match(/ZIL-0[1-6]/i)?.[0].toUpperCase();
  const station=ds.byId[explicit]?explicit:ds.byId[selectedStation]?selectedStation:null;
  if(/границ.{0,30}(спрос|план)|при каком.{0,20}спрос|точк.{0,10}перелом/i.test(question)){
    if(ds.stations.length>6)return {scope:'network',directAnswer:'Для расширенного набора станций порог нужно рассчитать в фоновом анализе: «Данные исследования» → расчёт чувствительности. Без расчёта численную границу назвать нельзя.'};
    const key=datasetKey({...ds,demandScale:1})+'|'+input.scenario;
    let boundary=boundaries.get(key);
    if(!boundaries.has(key)){boundary=demandBoundary(ds,input.scenario,planSensitivity(ds,input.scenario));if(boundaries.size>=8)boundaries.delete(boundaries.keys().next().value);boundaries.set(key,boundary);}
    return {scope:'network',boundary,directAnswer:boundary?`Весь план меняет решение в локальном интервале масштаба спроса ×${boundary.low.toFixed(3)}–×${boundary.high.toFixed(3)}. Это граница ограниченного алгоритма, а не доверительный интервал. Проверить: «Данные исследования» → «Граница смены всего плана». Тариф и смета при этом не изменялись.`:'В проверенном диапазоне спроса ×0,5–×1,5 граница смены всего плана не обнаружена. Проверить: «Данные исследования» → расчёт чувствительности.'};
  }
  if(!station)return {scope:'network',selectionRequired:true,criteria:{minimumScore:MODEL.planMinScore,regretWeight:MODEL.regretWeight,maxStations:MODEL.planMaxStations},directAnswer:`Станция не выбрана: сейчас рассматривается вся сеть. Автоматический план принимает шаги с критерием «ожидаемая ЧПС − ${MODEL.regretWeight} × максимальное сожаление» выше ${MODEL.planMinScore} млн ₽, до ${MODEL.planMaxStations} станций за шаг. Пустой план не доказывает отрицательную ЧПС всех отдельных вариантов. Выберите ЭЗС для сравнения её восьми вариантов; для границы всего плана откройте «Данные исследования» → расчёт чувствительности.`};
  const year=Number(question.match(/\b(202[6-9]|203[0-5])\b/)?.[0]||input.year);
  const scenario=/высок/i.test(question)?'high':/низк/i.test(question)?'low':/базов/i.test(question)?'base':input.scenario;
  if(!MODEL.decisionYears.includes(year))return {station,year,observationOnly:true,directAnswer:'Инвестиционные решения разрешены в 2027 и 2030; остальные годы показывают состояние сети. Укажите один из этих годов для сравнения вариантов.'};
  const baseline=(input.decisions||[]).filter(d=>!(d.station===station&&d.year===year));
  const variants=Object.keys(OPTIONS).map(option=>({option,name:OPTIONS[option].name,
    byScenario:Object.fromEntries(Object.keys(SCENARIOS).map(sc=>{
      const e=economics(ds,sc,[...baseline,{station,year,options:[option]}],baseline);
      return [sc,{npv:e.npv,capex:e.capex,discountedPayback:e.discountedPayback}];
    }))}));
  const result={station,year,scenario,baseline:'Текущий план без шага этой станции в этом году; прирост от одного варианта',variants};
  const matches=aliases.filter(([,pattern])=>pattern.test(question)),scenariosMentioned=[/высок/i,/базов/i,/низк/i].filter(pattern=>pattern.test(question)).length;
  const match=matches.length===1?matches[0]:null;
  if(match&&scenariosMentioned<2&&!/если|при тариф|измен.{0,12}(спрос|тариф|смет)/i.test(question)&&/чпс|npv|окуп|влож|стоим/i.test(question)){
    const variant=variants.find(v=>v.option===match[0]),e=variant.byScenario[scenario];
    result.directAnswer=`${station} · решение ${year} · ${SCENARIOS[scenario].short}. ${variant.name}: ЧПС ${e.npv.toFixed(2).replace('.',',')} млн ₽; вложения ${e.capex.toFixed(1).replace('.',',')} млн ₽. Дисконтированная окупаемость ${e.discountedPayback==null?'не достигается в горизонте':e.discountedPayback.toFixed(1).replace('.',',')+' лет'}. Это прирост относительно указанной базы, а не ЧПС всего текущего плана. Сценарные параметры требуют подтверждения.`;
  }
  if(/рекоменд|лучш|выгодн|выбр|план|почему/i.test(question)){
    const rec=recommend(ds,{station,year,baseline:input.decisions||[],scenario});
    result.recommendation={options:rec.best.options,score:rec.best.score,expectedNPV:rec.best.expNpv,weights:rec.weights,note:'Одноэтапный робастный выбор; выбранный сценарий не меняет веса.'};
  }
  return result;
}
