import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../vendor/three/three.module.js';
import {MODEL,growthAt} from '../src/simulation/params.js';
import {STATION_DEFS,NODE_DEFS} from '../src/data/dataset.js';
import {RESEARCH} from '../src/data/research-core.js';
import {evaluate} from '../src/simulation/engine.js';
import {calculateRequest} from '../src/simulation/service.js';
import {explain} from '../src/simulation/explain.js';
import {readURL} from '../src/url-state.js';
import {investmentVerdict} from '../src/district/verdict.js';
import {hourlyProfile} from '../src/district/model.js';
import {chargingPower} from '../src/district/charging-power.js';
import {plainAnswer} from '../src/assistant/plain-text.js';
import {optionContext} from '../src/assistant/option-context.js';
import {cityLayout,cityRoutes} from '../src/planet/city-layout.js';
import {terrainAt} from '../src/planet/skyline-layout.js';
import {syncPlanetShadow} from '../src/planet/lighting.js';
import handler from '../api/calculate.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function fixture(){const stations=STATION_DEFS.map(s=>{const r=RESEARCH.district.stations.find(r=>r.id===s.id);return {...structuredClone(s),pos:{x:r.x,z:r.z},site:{x:r.x+100,z:r.z}};});return {demandModel:'huff-zil-v1',demandScale:1,stations,nodes:structuredClone(NODE_DEFS),byId:Object.fromEntries(stations.map(s=>[s.id,s]))};}
test('v3: URL and API admit only the two decision dates, while observation 2035 remains valid',()=>{
  const ds=fixture();for(const year of [2026,2028,2035]){const plan=[['ZIL-01',year,['expansion']]];assert.deepEqual(readURL('?plan='+encodeURIComponent(JSON.stringify(plan))).patch.decisions,[]);assert.throws(()=>calculateRequest({dataset:ds,year:2035,scenario:'base',decisions:[{station:'ZIL-01',year,options:['expansion']}]}),/2027 и 2030/);}
  for(const year of MODEL.decisionYears)assert.equal(calculateRequest({dataset:ds,year:2035,scenario:'base',decisions:[{station:'ZIL-01',year,options:['expansion']}]}).decisions[0].year,year);
});
test('v3: active Huff inputs no longer require obsolete station demand fields',()=>{
  const ds=fixture();assert.equal(ds.stations[0].sessions,undefined);
  const r=calculateRequest({dataset:ds,year:2026,scenario:'base'});near(r.simulation.byId['ZIL-01'].serviceHours,RESEARCH.energy.sessionMinutes/60);assert.ok(r.simulation.totals.demand>0);
  assert.throws(()=>calculateRequest({dataset:{...ds,demandModel:undefined},year:2026,scenario:'base'}),/параметры станции/);
});
test('v3: peak queue and load classifications share 50/80% boundaries',()=>{
  const base=fixture(),s={...base.stations[0],posts:8,sessions:1000,avgMin:RESEARCH.energy.sessionMinutes,sens:1,mix:{private_ev:1}},ds={stations:[s],nodes:[{...base.nodes[0],headroom:10}]};
  const rho=evaluate(ds,{year:2026}).byId[s.id].rho;
  for(const [target,risk] of [[.49,'low'],[.51,'mid'],[.79,'mid'],[.81,'high'],[.87,'high']]){s.sessions=1000*target/rho;const st=evaluate(ds,{year:2026}).byId[s.id];near(st.rho,target);assert.equal(st.queueRisk,risk);assert.equal(st.status,risk);}
});
test('v3: 2030 decision text and colour use the same index relative to 2026',()=>{
  const e=explain(fixture(),{station:'ZIL-01',year:2030,scenario:'high',decisions:[],options:['none']});assert.equal(e.indicators.demand.cls,'bad');assert.ok(e.text.join(' ').includes('Индекс парка к 2026'));assert.equal(e.indicators.demand.v,'×'+growthAt('high',2030).toFixed(2).replace('.',','));
});
test('v3: one verdict distinguishes a profitable base and unprofitable stress',()=>{
  assert.match(investmentVerdict({npv:22e6,lowNpv:-10e6,payback:6.8}),/100%.*положительна, при 50% — неположительна/);
  assert.match(investmentVerdict({npv:-1,lowNpv:-2,payback:null}),/пересмотрите/);
  assert.match(investmentVerdict({npv:3,lowNpv:1,payback:6}),/пилоте/);
});
test('v3: normalized evening and commute profiles have a night dip',()=>{
  for(const type of ['flat','evening','commute'])near(hourlyProfile(type).reduce((a,b)=>a+b,0),1);assert.ok(hourlyProfile('evening')[3]<hourlyProfile('evening')[15]);assert.ok(hourlyProfile('evening')[18]>hourlyProfile('evening')[15]);
});
test('v3: DC inference is an explicit assumption and never overrides a tagged power',()=>{
  const inferred=chargingPower({brand:'Tesla Supercharger'});assert.equal(inferred.kw,50);assert.equal(inferred.powerHasTag,false);assert.ok(inferred.powerAssumption);
  assert.equal(chargingPower({brand:'Tesla Destination'}).kw,null);assert.equal(chargingPower({brand:'Tesla Supercharger','socket:type2:output':'22 kW'}).kw,22);
});
test('v3: assistant keeps network scope without silently selecting the first station',()=>{
  const r=optionContext({dataset:fixture(),year:2030,scenario:'base'},null,'Почему пустой план?');assert.equal(r.scope,'network');assert.equal(r.station,undefined);assert.match(r.directAnswer,/не доказывает/);assert.equal(plainAnswer('option:none; optionAnalysis; lost'),'без вложений; сравнение вариантов; потерянный спрос');assert.equal(plainAnswer('option: none'),'без вложений');
});
test('v3: malformed JSON returns a Russian API error',()=>{
  let status,body;const res={setHeader(){},status(s){status=s;return this;},json(b){body=b;return this;}};handler({method:'POST',body:'{'},res);assert.equal(status,400);assert.match(body.error,/Некорректный JSON/);handler({method:'POST',get body(){throw new Error('Invalid JSON');}},res);assert.match(body.error,/Некорректный JSON/);
});
test('v3: Moscow remains the single capital and every pair of cities is connected',()=>{
  const cities=cityLayout(),routes=cityRoutes(cities);assert.equal(cities[0].name,'МОСКВА');assert.equal(cities.filter(c=>c.hub).length,1);assert.equal(routes.length,cities.length*(cities.length-1)/2);assert.equal(new Set(cities.map(c=>c.name)).size,7);
  cities.forEach(c=>assert.equal(terrainAt(c.normal).water,false));routes.forEach((r,i)=>{const first=new T.Vector3(...r.points[0]).normalize(),last=new T.Vector3(...r.points.at(-1)).normalize();near(first.distanceTo(new T.Vector3(...cities[r.from].normal)),0);near(last.distanceTo(new T.Vector3(...cities[r.to].normal)),0);});
});
test('v3: cached shadow texture remains in the same local coordinates under arbitrary rotations',()=>{
  const root=new T.Group(),light=new T.DirectionalLight();light.position.set(-2.5,3.5,4.5);root.add(light,light.target);let reference;
  for(const rotation of [[0,0,0],[.3,.9,-.2],[1.2,2.7,.8],[-.5,6,.3]]){root.rotation.set(...rotation);syncPlanetShadow(root,light);const matrix=new T.Matrix4().multiplyMatrices(light.shadow.matrix,root.matrixWorld);if(reference)matrix.elements.forEach((v,i)=>near(v,reference[i]));else reference=[...matrix.elements];}
});
