import {recommend,recommendationKey} from './recommend.js';
self.onmessage=({data})=>{
  try{
    const ds={...data.dataset,byId:Object.fromEntries(data.dataset.stations.map(s=>[s.id,s]))};
    for(const year of [2026,2027]){
      const query={station:'ZIL-01',year,baseline:[],scenario:'base'};
      self.postMessage({query,key:recommendationKey(ds,query),result:recommend(ds,query)});
    }
    self.postMessage({done:true});
  }catch{self.postMessage({done:true});}
};
