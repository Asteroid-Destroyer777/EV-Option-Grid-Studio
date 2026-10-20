import {RESEARCH} from '../src/data/research-core.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, profileFor, collectAssets, queueMetrics } from '../src/simulation/engine.js';
import { economics, irr } from '../src/simulation/economics.js';
import { recommend } from '../src/simulation/recommend.js';
import { calculateRequest } from '../src/simulation/service.js';
import { MODEL, USER_TYPES } from '../src/simulation/params.js';
import { STATION_DEFS, NODE_DEFS } from '../src/data/dataset.js';
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a-b) < tol, `${a} != ${b}`);
function fixture() {
  const stations = STATION_DEFS.map(s => ({ ...structuredClone(s), sessions:RESEARCH.district.stations.find(r=>r.id===s.id).sessions,avgMin:RESEARCH.energy.sessionMinutes,sens:1, pos: { x:(s.lon-37.65)*62500, z:(55.71-s.lat)*111000 }, site:null }));
  return { stations, nodes:structuredClone(NODE_DEFS), byId:Object.fromEntries(stations.map(s=>[s.id,s])) };
}
const decision = (options, year=2027) => [{ station:'ZIL-01', year, options }];
test('Профили сохраняют суточный спрос', () => {
  for(const k of Object.keys(USER_TYPES)) near(profileFor(k).reduce((a,b)=>a+b,0),1);
});
test('Все сценарии и пакеты: баланс спроса, энергии, пределы сети и накопителя', () => {
  const ds=fixture(); ds.nodes.forEach(n=>n.headroom=.12);
  for(const scenario of ['low','base','high']) for(const year of [2026,2027,2030,2035]) for(const options of [[],['storage'],['local_gen'],['storage','local_gen'],['expansion'],['new_station'],['grid_upgrade']]) {
    const st=evaluate(ds,{year,scenario,decisions:decision(options)});
    near(st.totals.demand,st.totals.served+st.totals.lost);
    near(st.totals.lost,st.stations.reduce((a,s)=>a+s.lost,0));
    near(st.stations.reduce((a,s)=>a+s.spillIn-s.spillOut,0),0);
    assert.equal(st.totals.gridViolations,0);
    for(const n of Object.values(st.nodes)) {
      near(n.socClosureErrorMWh,0);
      for(const r of n.hourly){
        assert.ok(r.gridImportMW<=r.gridLimitMW+1e-8);
        assert.ok(r.socEndMWh>=0 && r.socEndMWh<=n.storageMWh+1e-8);
        near(r.gridImportMW+r.solarMW+r.dischargeMW,r.evMW+r.chargeMW+r.curtailedSolarMW);
        assert.ok(!(r.chargeMW>1e-8&&r.dischargeMW>1e-8));
        if(r.hour<7||r.hour>=19) near(r.solarMW,0);
      }
    }
  }
});
test('Накопитель не повышает лимит подключения; новые ЭЗС не создают спрос',()=>{
  const ds=fixture(), a=evaluate(ds,{year:2030,decisions:[]}), b=evaluate(ds,{year:2030,decisions:decision(['storage','new_station'])});
  near(a.nodes['SUB-ZIL-01'].H,b.nodes['SUB-ZIL-01'].H); near(a.totals.demand,b.totals.demand);
});
test('Подготовка участка применяется один раз и только позже',()=>{
  const {built}=collectAssets([...decision(['defer']),...decision(['expansion'],2030),...decision(['expansion'],2031)],2035);
  assert.deepEqual(built.map(a=>!!a.prepared),[false,true,false]);
});
test('Очередь: отсутствие спроса, устойчивый режим, перегрузка',()=>{
  assert.equal(queueMetrics(0,4,40).wait,0);
  assert.ok(queueMetrics(.5,4,40).stable);
  assert.equal(queueMetrics(1,4,40).stable,false);
});
test('Экономика: нулевой план, одинаковый базис, сроки, дисконтирование',()=>{
  const ds=fixture(); const dec=decision(['expansion']);
  near(economics(ds,'base',[],[]).npv,0);
  near(economics(ds,'base',dec,dec).npv,0);
  const e=economics(ds,'base',dec);
  assert.ok(Number.isFinite(e.npv));
  assert.equal(e.flows.find(f=>f.year===2027).capex,35);
  assert.equal(e.flows.find(f=>f.year===2027).opex,0);
  assert.equal(e.flows.find(f=>f.year===2028).opex,2);
  near(e.npv,e.cash.reduce((a,v,t)=>a+v/(1+MODEL.discount)**t,0));
  assert.equal(economics(ds,'base',decision(['new_station'],2035)).flows.at(-1).residual,0);
  near(irr([-100,110]),.1); assert.equal(irr([-100,230,-132]),null);
});
test('Кэш зависит от входных данных',()=>{
  const ds=fixture(), before=economics(ds,'base',decision(['expansion'])).npv;
  ds.stations[0].sessions=0;
  assert.notEqual(economics(ds,'base',decision(['expansion'])).npv,before);
});
test('Выбор сценария не раскрывает алгоритму будущее',()=>{
  const ds=fixture();
  const a=recommend(ds,{station:'ZIL-01',year:2030,baseline:[],scenario:'low'});
  const b=recommend(ds,{station:'ZIL-01',year:2030,baseline:[],scenario:'high'});
  assert.deepEqual(a.best.options,b.best.options); assert.equal(a.useRecourse,false);
  assert.ok(a.ranked.every(p=>Number.isFinite(p.score)));
});
test('Серверное ядро воспроизводит расчёт и отклоняет неверные параметры',()=>{
  const input={dataset:fixture(),year:2030,scenario:'base',decisions:[]};
  near(calculateRequest(input).simulation.totals.served,evaluate(input.dataset,input).totals.served);
  assert.throws(()=>calculateRequest({...input,year:3000}));
  assert.throws(()=>calculateRequest({...input,scenario:'unknown'}));
  input.dataset.stations[0].sessions=-1; assert.throws(()=>calculateRequest(input));
});
