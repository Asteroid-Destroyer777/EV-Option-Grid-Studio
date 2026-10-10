import test from 'node:test';import assert from 'node:assert/strict';
import {prepareArea,calculateDistrict,validateBounds} from '../src/district/model.js';
const bounds=[55.74,37.60,55.76,37.64];
const raw=[{type:'node',id:1,lat:55.75,lon:37.62,tags:{amenity:'charging_station',capacity:'2','socket:type2:output':'22 kW'}},{type:'way',id:2,center:{lat:55.749,lon:37.615},tags:{building:'yes'}}];
const fixture=()=>({area:prepareArea(raw,bounds),candidate:{lat:55.751,lon:37.624},acceptAssumptions:true,settings:{dailyDemand:300,demandSource:'Тестовое допущение',energy:25,sessionMinutes:30,posts:4,postKW:150,gridKW:200,defaultPosts:2,defaultKW:22,radiusM:1200,outsideWeight:.3,capex:1e6,opex:100000,tariff:24,energyCost:12,discount:.12,growth:0,years:10,lead:1,profile:'evening'}});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
test('Любой район: независимая география и ограничения границ',()=>{
  assert.throws(()=>validateBounds([-80,-180,80,180]));assert.throws(()=>validateBounds([0,0,0,0]));
  const a=prepareArea(raw,bounds);assert.equal(a.stations.length,1);assert.equal(a.buildings,1);assert.equal(a.stations[0].kw,22);
  const k=fixture();k.area=prepareArea([], [59.9,30.3,59.92,30.34]);k.candidate={lat:59.91,lon:30.32};assert.ok(calculateDistrict(k).baseline.first.candidate.served>0);
});
test('Район: спрос и энергия сохраняются, предел подключения соблюдается',()=>{
  const r=calculateDistrict(fixture());
  for(const s of r.sensitivity){const f=s.first;for(const day of [f.withCandidate,f.withoutCandidate])near(day.demand,day.served+day.lost+day.outside);for(const h of f.candidate.hours){near(h.arrivals,h.served+h.lost);near(h.energyKWh,h.served*25);assert.ok(h.energyKWh<=200+1e-8);}}
});
test('Район: нулевой спрос, нулевая мощность и задержка ввода',()=>{
  let a=fixture();a.settings.gridKW=0;near(calculateDistrict(a).baseline.first.candidate.served,0);
  a=fixture();a.settings.dailyDemand=0;near(calculateDistrict(a).baseline.first.withCandidate.demand,0);
  a=fixture();a.settings.lead=10;const r=calculateDistrict(a);assert.equal(r.baseline.first,null);near(r.baseline.finance.npv,-a.settings.capex);
});
test('Район: дисконтирование и чувствительность независимо пересчитываются',()=>{
  const a=fixture(),r=calculateDistrict(a),f=r.baseline.finance;
  assert.equal(f.rows[0].operating,0);near(f.npv,-a.settings.capex+f.rows.reduce((s,v)=>s+v.operating/(1.12)**v.year,0));
  assert.ok(r.sensitivity[0].finance.npv<r.sensitivity[2].finance.npv);
  const b=fixture();b.settings.discount=0;near(calculateDistrict(b).baseline.finance.npv,calculateDistrict(b).baseline.finance.rows.at(-1).cumulative);
});
test('Район: некорректный импорт и отсутствующие данные не вычисляются',()=>{
  for(const change of [x=>x.settings.dailyDemand=NaN,x=>x.settings.gridKW=-1,x=>x.candidate.lat=0,x=>x.settings.demandSource='',x=>x.acceptAssumptions=false,x=>x.area.cells[0].weight=-1]){const a=fixture();change(a);assert.throws(()=>calculateDistrict(a));}
  const r=prepareArea([...raw,...raw,{type:'node',id:3,lat:55.75,lon:37.62,tags:{amenity:'charging_station',access:'private'}}],bounds);assert.equal(r.stations.length,1);assert.equal(r.excluded,1);
});
