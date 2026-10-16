import {planSensitivity,breakpoints,twoStage,demandBoundary} from './analysis.js';
self.onmessage=({data})=>{
  try{
    const ds={...data.dataset,byId:Object.fromEntries(data.dataset.stations.map(s=>[s.id,s]))};
    const progress=value=>self.postMessage({progress:value});
    let result;
    if(data.kind==='flexibility')result=twoStage(ds,{station:data.station,year:2027},progress);
    else {const sensitivity=planSensitivity(ds,data.scenario,progress);result={sensitivity,boundary:demandBoundary(ds,data.scenario,sensitivity),breakpoints:breakpoints(ds,{station:data.station,scenario:data.scenario})};}
    self.postMessage({result});
  }catch(error){self.postMessage({error:error.message});}
};
