import {planSensitivity,breakpoints,twoStage,demandBoundary} from './analysis.js';
self.onmessage=({data})=>{
  try{
    const ds={...data.dataset,byId:Object.fromEntries(data.dataset.stations.map(s=>[s.id,s]))};
    const progress=value=>self.postMessage({progress:value});
    let result;
    if(data.kind==='flexibility'){
      const scale=ds.demandScale||1,stressScale=scale===1.5?1:1.5;
      result={...twoStage(ds,{station:data.station,year:2027},v=>progress(v*.5)),scale};
      result.stress={...twoStage({...ds,demandScale:stressScale},{station:data.station,year:2027},v=>progress(.5+v*.5)),scale:stressScale};
    }
    else {const sensitivity=planSensitivity(ds,data.scenario,progress);result={sensitivity,boundary:demandBoundary(ds,data.scenario,sensitivity),breakpoints:breakpoints(ds,{station:data.station,scenario:data.scenario})};}
    self.postMessage({result});
  }catch(error){self.postMessage({error:error.message});}
};
