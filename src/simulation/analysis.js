import {recommendedPlan} from './policies.js';
import {economics} from './economics.js';
import {candidatePackages, pkgKey} from './recommend.js';
import {MODEL, SCENARIOS, OPTIONS} from './params.js';

// Each demand level is reoptimised independently; no current-plan carry-over.
export function planSensitivity(ds, scenario, progress = () => {}) {
  return [.5,1,1.5].map((scale,i) => {
    const data={...ds,demandScale:scale},plan=recommendedPlan(data,scenario),e=economics(data,scenario,plan);
    progress((i+1)/3);
    return {scale,plan,npv:e.npv,payback:e.discountedPayback,capex:e.capex};
  });
}
export function demandBoundary(ds,scenario,rows) {
  const index=rows.findIndex((r,i)=>i>0&&r.plan.length>0&&rows[i-1].plan.length===0);
  if(index<0)return null;
  let low=rows[index-1].scale,high=rows[index].scale;
  for(let i=0;i<5;i++){
    const mid=(low+high)/2;
    if(recommendedPlan({...ds,demandScale:mid},scenario).length)high=mid;else low=mid;
  }
  return {low,high,note:'Локальный интервал смены решения ограниченного алгоритма; не доверительный интервал и не гарантия глобальной монотонности.'};
}

// The score threshold belongs to plan selection; these roots concern the stated
// package's cash NPV only. All prices remain unchanged outside this calculation.
export function breakpoints(ds, {station='ZIL-01',year=2030,scenario='high',option='expansion'} = {}) {
  const plan=[{station,year,options:[option]}];
  const e=financial=>economics(ds,scenario,plan,[],financial);
  const threshold=(fn,lo,hi)=>{
    const a=fn(lo),b=fn(hi);
    if(Math.abs(a)<1e-9)return lo;
    if(Math.sign(a)===Math.sign(b))return null;
    for(let i=0;i<32;i++){const mid=(lo+hi)/2;if(Math.sign(fn(mid))===Math.sign(a))lo=mid;else hi=mid;}
    return (lo+hi)/2;
  };
  return {station,year,scenario,option,npv:e().npv,
    tariff:threshold(t=>e({tariff:t}).npv,0,100),
    capexScale:threshold(k=>e({capexScale:k}).npv,0,3),
    terminal:[{method:'40% вложений',npv:e().npv},{method:'Остаток по возрасту · срок 12 лет (допущение)',npv:e({residualPolicy:'linear-life',assetLifeYears:12}).npv}],
    attractiveness:[.3,.7,1].map(k=>({k,npv:economics({...ds,attractivenessExponent:k},scenario,plan).npv})),
    capture:e().flows.find(f=>f.year===Math.min(2035,year+OPTIONS[option].lead)),
  };
}

// Scenario is learned at the 2030 review in this explicit information assumption.
// All first actions see the same three scenarios and probabilities.
export function twoStage(ds,{station='ZIL-01',year=2027}={},progress=()=>{}) {
  if(year>=2030)throw new Error('Первый шаг двухэтапной оценки должен предшествовать 2030.');
  const packages=candidatePackages(),scenarios=Object.keys(SCENARIOS),rows=[];
  for(let i=0;i<packages.length;i++) {
    const first=packages[i],initial=[{station,year,options:first}],responses={},values={},fixed={};
    for(const sc of scenarios) {
      fixed[sc]=economics(ds,sc,initial).npv;
      let winner={options:['none'],npv:fixed[sc]};
      for(const response of packages) {
        const next=response[0]==='none'?initial:[...initial,{station,year:2030,options:response}];
        const npv=economics(ds,sc,next).npv;
        if(npv>winner.npv+1e-9)winner={options:response,npv};
      }
      responses[sc]=winner.options;values[sc]=winner.npv;
    }
    rows.push({first,responses,values,expected:scenarios.reduce((a,sc)=>a+MODEL.probs[sc]*values[sc],0),fixedExpected:scenarios.reduce((a,sc)=>a+MODEL.probs[sc]*fixed[sc],0)});
    progress((i+1)/packages.length);
  }
  const bestByScenario=Object.fromEntries(scenarios.map(sc=>[sc,Math.max(...rows.map(r=>r.values[sc]))]));
  for(const row of rows){row.regret=Math.max(...scenarios.map(sc=>bestByScenario[sc]-row.values[sc]));row.score=row.expected-MODEL.regretWeight*row.regret;row.flexibility=row.expected-row.fixedExpected;}
  rows.sort((a,b)=>b.score-a.score||pkgKey(a.first).localeCompare(pkgKey(b.first)));
  return {station,year,reviewYear:2030,rows,best:rows[0],information:'В 2030 сценарий считается известным; это демонстрационное допущение об информации, не знание будущего в первом шаге.'};
}
