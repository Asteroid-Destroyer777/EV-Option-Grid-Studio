// Only model inputs cross the Worker/API boundary, never scene objects or DOM.
export function simulationDataset(ds) {
  return {demandModel:ds.demandModel,demandScale:ds.demandScale,attractivenessExponent:ds.attractivenessExponent,
    stations:ds.stations.map(({id,posts,sessions,avgMin,sens,node,mix,pos,site,serviceClass})=>({id,posts,sessions,avgMin,sens,node,mix,pos,site,serviceClass})),
    nodes:ds.nodes.map(({id,headroom,headroomByHour})=>({id,headroom,headroomByHour}))};
}
