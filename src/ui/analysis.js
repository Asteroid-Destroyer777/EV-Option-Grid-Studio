import {state,setState} from '../state.js';
import {dataset as ds} from '../data/dataset.js';
import {auditInput} from './audit.js';
import {datasetKey} from '../simulation/engine.js';
import {SCENARIOS,MODEL} from '../simulation/params.js';
import {num,sgn,esc,pkText} from './format.js';
const entries=new Map();
const keyFor=kind=>kind+'|'+datasetKey(kind==='sensitivity'?{...ds,demandScale:1}:ds)+'|'+state.scenario+'|'+(ds.byId[state.selectedStation]?state.selectedStation:'ZIL-01');
const refresh=()=>setState({analysisTick:(state.analysisTick||0)+1});
const table=(head,rows)=>`<div class="audit-table"><table class="tbl"><thead><tr>${head.map(t=>`<th>${t}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(t=>`<td>${t}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
export function analysisReady(kind){return entries.has(keyFor(kind));}
export function requestAnalysis(kind,toast=()=>{}) {
  if(!['sensitivity','flexibility'].includes(kind))return;
  const key=keyFor(kind);if(entries.get(key)?.busy)return;
  for(const [oldKey,old] of entries)if(oldKey.startsWith(kind+'|')&&old.busy){clearTimeout(old.timer);old.worker.terminate();entries.delete(oldKey);}
  let worker;
  try{worker=new Worker(new URL('../simulation/analysis-worker.js',import.meta.url),{type:'module'});}catch{toast('Фоновый расчёт недоступен в этом браузере.');return;}
  const entry={busy:true,worker};entries.set(key,entry);
  if(entries.size>12)for(const [oldKey,old] of entries){if(oldKey!==key&&!old.busy){entries.delete(oldKey);break;}}
  const finish=()=>{clearTimeout(entry.timer);entry.worker.terminate();entry.busy=false;refresh();};
  entry.timer=setTimeout(()=>{entry.error='Расчёт занял больше трёх минут. Попробуйте повторить.';finish();},180000);
  entry.worker.onerror=()=>{entry.error='Фоновый расчёт недоступен. Повторите попытку.';finish();};
  entry.worker.onmessage=({data})=>{
    if(data.progress!=null){const el=document.getElementById('analysis-progress-'+kind);if(el&&key===keyFor(kind))el.textContent=`Пересчитано ${Math.round(data.progress*100)}%.`;return;}
    if(data.error){entry.error=data.error;toast(data.error);}else entry.result=data.result;
    finish();
  };
  entry.worker.postMessage({...auditInput(),kind,station:ds.byId[state.selectedStation]?state.selectedStation:'ZIL-01'});
  refresh();
}
export function cancelAnalysis(kind){const entry=entries.get(keyFor(kind));if(entry?.busy){clearTimeout(entry.timer);entry.worker.terminate();entry.busy=false;entry.error='Расчёт отменён.';refresh();}}
export function analysisMarkup(kind) {
  const entry=entries.get(keyFor(kind)),flex=kind==='flexibility';
  let content='';
  if(entry?.result){
    if(flex){
      const r=entry.result,shown=[...r.rows.slice(0,5)];
      for(const id of ['defer','none']){const row=r.rows.find(x=>x.first.length===1&&x.first[0]===id);if(row&&!shown.includes(row))shown.push(row);}
      content=`<p class="note">${esc(r.station)} · первый шаг ${r.year}, пересмотр ${r.reviewYear}. ${esc(r.information)} Это отдельный расчёт с пустого плана: ваши решения не изменяются. Веса 25/50/25; первый шаг одинаков для всех сценариев, ответный шаг выбирается после наблюдения.</p>`+table(['Первый шаг','ЧПС с пересмотром, млн ₽','Без пересмотра','Ценность гибкости','Score','Ответы: низкий / базовый / высокий'],shown.map(row=>[esc(pkText(row.first)),sgn(row.expected,2),sgn(row.fixedExpected,2),sgn(row.flexibility,2),sgn(row.score,2),['low','base','high'].map(sc=>esc(SCENARIOS[sc].short)+': '+esc(pkText(row.responses[sc]))).join('<br>')]));
    }else{
      const {sensitivity,breakpoints:b,boundary}=entry.result;
      content=table(['Спрос','Заново подобранный план','ЧПС, млн ₽','Вложения','Дисконтированная окупаемость'],sensitivity.map(row=>['×'+num(row.scale,1),row.plan.length?row.plan.map(d=>esc(`${d.station} · ${d.year} · ${pkText(d.options)}`)).join('<br>'):`Без вложений: нет шагов с score > ${MODEL.planMinScore}`,sgn(row.npv,2),num(row.capex,1),row.payback==null?'Не достигнута':num(row.payback,1)+' лет']));
      content+=`<h3>Точки перелома · ${esc(b.station)} · ${b.year} · ${SCENARIOS[b.scenario].short}</h3><p class="note">${boundary?`План меняет решение в найденном интервале спроса ×${num(boundary.low,3)}–×${num(boundary.high,3)}. ${esc(boundary.note)}`:'В проверенном диапазоне граница смены плана не обнаружена.'} Для тарифа и сметы проверяется отдельное расширение, денежная ЧПС относительно «без проекта». Положительная ЧПС отдельного варианта не означает прохождение робастного порога всего плана.</p>`+table(['Параметр','Нулевая ЧПС расширения'],[['Тариф',b.tariff==null?'Нет пересечения в диапазоне 0–100 ₽':num(b.tariff,2)+' ₽/кВт·ч'],['Смета',b.capexScale==null?'Нет пересечения в диапазоне ×0–3':num(b.capexScale,3)+' от исходного CAPEX']]);
      content+=table(['Допущение об остатке','ЧПС, млн ₽'],b.terminal.map(r=>[esc(r.method),sgn(r.npv,2)]));
      content+=table(['Привлекательность: показатель k','ЧПС, млн ₽'],b.attractiveness.map(r=>[num(r.k,1),sgn(r.npv,2)]));
      content+='<p class="note">Калибровка спроса 10% не подтверждена телеметрией. Все эти изменения — проверка чувствительности. Тариф станции берётся в приложении оператора; условные 24 ₽ не выдаются за актуальную цену. Базовый остаток 40% не учитывает возраст — рядом показана альтернатива на явно условном 12-летнем сроке.</p>';
    }
  }
  return `<section class="sec analysis" data-analysis="${kind}"><h3>${flex?'Двухэтапная оценка опций':'Переоптимизация плана при разном спросе'}</h3><p class="note">${flex?'Подготовка площадки оценивается вместе с последующим строительством или отказом в 2030.':'При каждом уровне 50/100/150% план подбирается заново с теми же порогом и ограничениями. ЧПС пустого плана — ноль по определению.'}</p><button class="btn" data-act="analysis-run" data-arg="${kind}" ${entry?.busy?'disabled':''}>${entry?.busy?'Расчёт выполняется…':entry?.result?'Пересчитать':'Рассчитать'}</button>${entry?.busy?` <button class="btn" data-act="analysis-cancel" data-arg="${kind}">Отменить</button><p id="analysis-progress-${kind}" role="status">Расчёт в фоновом потоке; интерфейс доступен.</p>`:''}${entry?.error?`<p role="status">${esc(entry.error)}</p>`:''}${content}</section>`;
}
