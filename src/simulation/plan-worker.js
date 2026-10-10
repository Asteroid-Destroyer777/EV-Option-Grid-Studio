import { recommendedPlan } from './policies.js';
self.onmessage = ({data}) => {
  try {
    const ds={...data.dataset,byId:Object.fromEntries(data.dataset.stations.map(s=>[s.id,s]))};
    self.postMessage({plan:recommendedPlan(ds,data.scenario)});
  } catch(error) { self.postMessage({error:error.message}); }
};
