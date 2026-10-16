import test from 'node:test';import assert from 'node:assert/strict';
import {renderRatio,createRenderBudget} from '../src/scene/render-budget.js';
import {createPlanJob} from '../src/simulation/plan-job.js';
import {simulationDataset} from '../src/simulation/input.js';
import {recommend,recommendationKey,seedRecommendation,clearRecommendCache} from '../src/simulation/recommend.js';
import {STATION_DEFS,NODE_DEFS} from '../src/data/dataset.js';
import {RESEARCH as R} from '../src/data/research-core.js';
function fixture(){const stations=STATION_DEFS.map(s=>{const p=R.district.stations.find(r=>r.id===s.id);return {...structuredClone(s),pos:{x:p.x,z:p.z},site:{x:p.x+100,z:p.z},sceneObject:{notAModelInput:true}}});return {demandModel:'huff-zil-v1',demandScale:1,stations,nodes:structuredClone(NODE_DEFS),byId:Object.fromEntries(stations.map(s=>[s.id,s]))};}
test('Render budget bounds Retina pixels and leaves mobile/native 1× intact',()=>{
 assert.equal(renderRatio({width:375,height:812,dpr:3,mobile:true}),1.35);
 assert.equal(renderRatio({width:1440,height:1000,dpr:1}),1);
 const ratio=renderRatio({width:1440,height:1000,dpr:2});assert.ok(ratio<1.5);assert.ok(1440*1000*ratio*ratio<=2500001);
 const budget=createRenderBudget(ratio);let now=5000,result;
 for(let i=0;i<180;i++){now+=30;result=budget.sample(30,now)??result;}assert.ok(result<ratio);assert.ok(budget.ratio>=.85);
 for(let i=0;i<1200;i++){now+=16.7;budget.sample(16.7,now);}assert.ok(budget.ratio<=ratio);assert.ok(budget.ratio>result);
 assert.equal(budget.sample(500,now),null);
});
test('Plan Worker job terminates on completion, cancellation and failure',async()=>{
 let worker;const createWorker=()=>worker={postMessage(input){this.input=input;},terminate(){this.stopped=true;}};
 const done=createPlanJob({scenario:'high'},{createWorker});worker.onmessage({data:{plan:[{station:'A'}]}});assert.deepEqual(await done.promise,[{station:'A'}]);assert.ok(worker.stopped);done.cancel();
 const cancel=createPlanJob({}, {createWorker});const stopped=assert.rejects(cancel.promise,{name:'AbortError'});cancel.cancel();await stopped;assert.ok(worker.stopped);
 const fail=createPlanJob({}, {createWorker});worker.onmessage({data:{error:'bad'}});await assert.rejects(fail.promise,/bad/);assert.ok(worker.stopped);
});
test('Warm recommendations preserve results and reject stale model inputs',()=>{
 const ds=fixture(),query={station:'ZIL-01',year:2027,baseline:[],scenario:'base'},key=recommendationKey(ds,query),result=structuredClone(recommend(ds,query));
 clearRecommendCache();assert.ok(seedRecommendation(ds,query,key,result));assert.equal(recommend(ds,query),result);
 ds.demandScale=1.5;assert.equal(seedRecommendation(ds,query,key,result),false);assert.notEqual(recommend(ds,query),result);
 const input=simulationDataset(ds);assert.equal(input.stations[0].sceneObject,undefined);assert.equal(input.demandScale,1.5);
});
