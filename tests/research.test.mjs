import test from 'node:test';
import assert from 'node:assert/strict';
import { RESEARCH as R } from '../src/data/research-bundle.js';
import { STATION_DEFS, NODE_DEFS } from '../src/data/dataset.js';
import { evaluate } from '../src/simulation/engine.js';
import { economics } from '../src/simulation/economics.js';
import { calculateRequest } from '../src/simulation/service.js';
import { growthAt } from '../src/simulation/params.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function fixture(){const stations=STATION_DEFS.map(s=>{const p=R.district.stations.find(r=>r.id===s.id);return {...structuredClone(s),pos:{x:p.x,z:p.z},site:{x:p.x+100,z:p.z}};});return {demandModel:'huff-zil-v1',demandScale:1,stations,nodes:structuredClone(NODE_DEFS),byId:Object.fromEntries(stations.map(s=>[s.id,s]))};}
test('Данные исследования: реестр, исходные ссылки и точное воспроизведение',()=>{
  assert.equal(R.city.stations.length,268); assert.equal(R.district.cells.length,512);assert.equal(R.district.competitors.length,17);
  assert.ok(R.city.stations.every(s=>s.osmEvidence.length>0));
  const urls=R.city.stations.flatMap(s=>s.osmEvidence.map(e=>e.url));
  assert.equal(new Set(urls).size,urls.length,'Объект карты входит только в одну группу');
  assert.ok(R.district.reproduction.every(r=>Math.abs(r.difference)<.5));
  const sim=evaluate(fixture(),{year:2026,decisions:[]});
  for(const s of R.district.stations)near(sim.byId[s.id].D,s.sessions);
});
test('Хафф: сохранение рынка при расширении, новых станциях и изменении спроса',()=>{
  for(const scale of [.5,1,1.5]){
    const ds={...fixture(),demandScale:scale};
    const a=evaluate(ds,{year:2030,decisions:[]});
    const b=evaluate(ds,{year:2030,decisions:[{station:'ZIL-01',year:2027,options:['new_station','expansion','storage']}]});
    for(const s of [a,b]){near(s.spatial.total,s.spatial.own+s.spatial.competitors+s.spatial.outside);near(s.spatial.own,s.totals.demand);near(s.totals.demand,s.totals.served+s.totals.lost);assert.equal(s.totals.gridViolations,0);}
    near(a.spatial.total,b.spatial.total);
    assert.ok(b.spatial.own>a.spatial.own); assert.ok(b.spatial.competitors<a.spatial.competitors);
  }
});
test('Чувствительность проходит через экономику и сервер, а не только подпись',()=>{
  const ds=fixture(), decisions=[{station:'ZIL-01',year:2027,options:['expansion']}];
  const low={...ds,demandScale:.5},high={...ds,demandScale:1.5};
  assert.notEqual(economics(low,'base',decisions).npv,economics(high,'base',decisions).npv);
  const input={dataset:high,year:2030,scenario:'base',decisions};
  near(calculateRequest(input).simulation.totals.served,evaluate(high,input).totals.served);
  assert.throws(()=>calculateRequest({...input,dataset:{...high,demandScale:Infinity}}));
});
test('Горизонт прогноза не растянут за пятилетний источник',()=>{
  for(const sc of ['low','base','high'])near(growthAt(sc,2035),growthAt(sc,2031));
  assert.equal(R.city.holdoutCheck.AUC,.407);
  assert.ok(R.city.holdoutCheck.AUC<.5);
});
