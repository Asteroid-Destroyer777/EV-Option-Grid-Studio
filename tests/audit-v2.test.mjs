import {fitMapBounds} from '../src/district/map-view.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {RESEARCH as R} from '../src/data/research-core.js';
import {STATION_DEFS,NODE_DEFS,FLOW_DEFS} from '../src/data/dataset.js';
import {MODEL,OPTIONS} from '../src/simulation/params.js';
import {evaluate} from '../src/simulation/engine.js';
import {economics} from '../src/simulation/economics.js';
import {traditionalPlan,recommendedPlan,PLAN_YEARS} from '../src/simulation/policies.js';
import {planSensitivity,breakpoints,twoStage} from '../src/simulation/analysis.js';
import {gridCaseNodes} from '../src/simulation/grid-case.js';
import {potentialDuplicates} from '../src/data/nearby-evidence.js';
import {sharedDemoSettings,moduleComparison} from '../src/district/comparison.js';
import {optionContext} from '../src/assistant/option-context.js';
import {assistantResponse,prepareQuestion,projectScope} from '../src/assistant/service.js';
import {placeLabel,overlaps} from '../src/scene/label-layout.js';
import {readURL,writeURL} from '../src/url-state.js';
const near=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
function fixture(){const stations=STATION_DEFS.map(s=>{const p=R.district.stations.find(r=>r.id===s.id);return {...structuredClone(s),pos:{x:p.x,z:p.z},site:{x:p.x+100,z:p.z}}});return {demandModel:'huff-zil-v1',demandScale:1,stations,nodes:structuredClone(NODE_DEFS),byId:Object.fromEntries(stations.map(s=>[s.id,s]))};}
test('v2: сравнение проверяет дефицит ежегодно и не строит за горизонтом',()=>{
  const ds=fixture(),plan=traditionalPlan(ds,'high');assert.ok(plan.length>0);
  assert.ok(plan.every(d=>d.options.every(o=>d.year+OPTIONS[o].lead<=2035)));
  assert.ok(plan.some(d=>![2027,2030,2035].includes(d.year)));
  assert.deepEqual(PLAN_YEARS,[2027,2030]);
  assert.ok(evaluate(ds,{year:2035,scenario:'high',decisions:plan}).totals.served>evaluate(ds,{year:2035,scenario:'high',decisions:[]}).totals.served);
});
test('v2: чувствительность заново подбирает план; границы ЧПС не меняют исходные цены',()=>{
  const ds=fixture(),before=JSON.stringify(MODEL),rows=planSensitivity(ds,'high');
  for(const row of rows){const data={...ds,demandScale:row.scale};assert.deepEqual(row.plan,recommendedPlan(data,'high'));near(row.npv,economics(data,'high',row.plan).npv);}
  assert.ok(rows[2].plan.length>rows[0].plan.length);
  const b=breakpoints(ds),plan=[{station:b.station,year:b.year,options:[b.option]}];
  assert.ok(b.tariff>24&&b.tariff<40);near(economics(ds,b.scenario,plan,[],{tariff:b.tariff}).npv,0);
  near(economics(ds,b.scenario,plan,[],{capexScale:b.capexScale}).npv,0);
  assert.notEqual(b.terminal[0].npv,b.terminal[1].npv);assert.equal(JSON.stringify(MODEL),before);
});
test('v2: двухэтапная оценка фиксирует первый шаг и допускает отказ от второго',()=>{
  const ds=fixture(),r=twoStage(ds);assert.ok(r.rows.length>8);
  for(const row of r.rows){assert.ok(row.flexibility>=-1e-8);near(row.expected,['low','base','high'].reduce((a,sc)=>a+MODEL.probs[sc]*row.values[sc],0));
    for(const sc of ['low','base','high']){const first=[{station:r.station,year:r.year,options:row.first}];const plan=row.responses[sc][0]==='none'?first:[...first,{station:r.station,year:2030,options:row.responses[sc]}];near(row.values[sc],economics(ds,sc,plan).npv);}}
  assert.ok(r.rows.some(row=>row.first[0]==='defer'));assert.equal(r.reviewYear,2030);
});
test('v2: сетевой стресс восстанавливает исходные лимиты и сохраняет энергию',()=>{
  const ds=fixture(),limited={...ds,nodes:gridCaseNodes(ds.nodes,'limited')};
  assert.equal(limited.nodes[0].headroom,.3);near(gridCaseNodes(limited.nodes,'base')[0].headroom,ds.nodes[0].headroom);near(ds.nodes[0].headroom,1.2);
  const a=evaluate(limited,{year:2031,scenario:'high',decisions:[]}),b=evaluate(limited,{year:2031,scenario:'high',decisions:[{station:'ZIL-01',year:2030,options:['storage']}]});
  assert.ok(b.byId['ZIL-01'].served>a.byId['ZIL-01'].served);assert.equal(b.totals.gridViolations,0);
  for(const n of Object.values(b.nodes)){assert.ok(n.withinHourUpperMW<=n.connectedMW+1e-6);assert.ok(n.connectedMW>0);}
  const state={...readURL('').patch,gridCase:'limited'};assert.equal(readURL(writeURL('https://test.local',state,1).search).patch.gridCase,'limited');
});
test('v2: источники 2D согласованы по смете; отличия спроса раскрыты',()=>{
  const s=sharedDemoSettings(JSON.parse(readFileSync(new URL('../data/district-demo.json',import.meta.url))).settings);
  near(s.capex,OPTIONS.new_station.capex*1e6);assert.equal(s.posts,OPTIONS.new_station.addPosts);assert.equal(s.lead,OPTIONS.new_station.lead);
  const note=moduleComparison(s);assert.ok(!note.includes('NaN'));assert.match(note,/474/);
  assert.ok(FLOW_DEFS.every(f=>['private_ev','corporate','transit'].includes(f.type)));assert.equal(potentialDuplicates().length,3);
});
test('v2: помощник различает нулевой план и отдельное расширение',async()=>{
  const input={dataset:fixture(),year:2030,scenario:'high',decisions:[]};
  const question='Какова ЧПС расширения ZIL-01 в 2030, высокий сценарий?';
  const c=prepareQuestion({question,calculation:input,selectedStation:'ZIL-01'}).context;
  assert.equal(c.economics.npv,0);const v=c.optionAnalysis.variants.find(v=>v.option==='expansion').byScenario.high;
  assert.ok(v.npv<0);near(v.npv,economics(input.dataset,'high',[{station:'ZIL-01',year:2030,options:['expansion']}]).npv);
  const answer=await assistantResponse({question,calculation:input},{apiKey:'test',fetchImpl:()=>assert.fail('direct numeric answer uses calculation')});
  assert.match(answer.answer,/ЧПС −?[-\d]/);assert.ok(answer.answer.includes(v.npv.toFixed(2).replace('.',',')));
  for(const q of ['Подбери план','Что рекомендуешь строить?','Подготовка площадки','Почему не расширять ZIL-01?'])assert.ok(projectScope.test(q));
  assert.ok(prepareQuestion({question:'Почему не расширять ZIL-01?',calculation:input}).context.optionAnalysis.recommendation);
  assert.equal(optionContext({...input,decisions:undefined},null,'Варианты').scope,'network');
  assert.equal(optionContext({...input,decisions:undefined},'ZIL-01','Варианты').variants.length,8);
});
test('v2: подписи вариантов не пересекаются, когда вокруг есть место',()=>{
  const used=[];for(let i=0;i<8;i++){const p=placeLabel(450,350,60,28,{w:1000,h:800},used,[]);assert.ok(p);assert.ok(used.every(r=>!overlaps(r,p.rect)));used.push(p.rect);}
});

test('v2: переток работает при свободном совместимом соседе и сохраняет спрос',()=>{
  const ds=fixture();delete ds.demandModel;
  ds.stations.forEach((s,i)=>{s.sessions=i===0?20000:0;s.posts=i===0?1:30;s.pos={x:i*100,z:0};});ds.nodes.forEach(n=>n.headroom=20);
  const sim=evaluate(ds,{year:2026,scenario:'base',decisions:[]});assert.ok(sim.byId['ZIL-01'].spillOut>0);
  near(sim.stations.reduce((a,s)=>a+s.spillIn,0),sim.stations.reduce((a,s)=>a+s.spillOut,0));near(sim.totals.demand,sim.totals.served+sim.totals.lost);
  ds.stations.slice(1).forEach(s=>s.serviceClass='depot');const isolated=evaluate(ds,{year:2026,scenario:'base',decisions:[]});near(isolated.byId['ZIL-01'].spillOut,0);
});
test('v2: серверный ответ убирает сырую математическую разметку',async()=>{
  const r=await assistantResponse({question:'Почему очередь зависит от загрузки?'},{apiKey:'test',provider:'OpenAI',fetchImpl:async()=>({ok:true,json:async()=>({output:[{type:'message',content:[{type:'output_text',text:'Привет! $\\rho$ — нагрузка, $\\frac{a}{b}$.'}]}]})})});
  assert.equal(r.answer,'ρ — нагрузка, (a)/(b).');
});


test('v2: карта не подбирает масштаб при нулевой ширине и не применяет устаревший контур',()=>{
  let width=0,queue=[],fits=[],refreshes=0;
  const map={invalidateSize:()=>refreshes++,getSize:()=>({x:width,y:500}),fitBounds:b=>fits.push(b)};
  fitMapBounds(map,'old',{},fn=>queue.push(fn));assert.deepEqual(fits,[]);
  fitMapBounds(map,'new',{},fn=>queue.push(fn));width=600;for(const fn of queue)fn();
  assert.deepEqual(fits,['new']);assert.ok(refreshes>0);
});
