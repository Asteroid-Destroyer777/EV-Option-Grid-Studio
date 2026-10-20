// The ready-made planet's terrain, in its native Three.js Y-up coordinates.
// Reuse the source world's coastline so new towers remain on dry, level land.
const TAU = Math.PI * 2;
const LAKES = [[-.65,.3,.23,.16],[1.05,-.34,.23,.21],[2.48,.47,.22,.18],[3.65,-.5,.24,.16],[5.05,.15,.22,.25],[.25,-1.01,.24,.19],[2.7,1.1,.22,.20]];
const PEAKS = [[-.22,.55,.21],[1.5,.27,.24],[2.95,-.25,.22],[4.2,.55,.24],[5.63,-.5,.23],[.6,-.7,.18],[3,1.26,.17]];
const normalize = v => { const length = Math.hypot(...v); return v.map(x => x / length); };
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const angleDiff = (a,b) => ((a-b+Math.PI)%TAU+TAU)%TAU-Math.PI;
export const distanceSq = (a,b) => a.reduce((sum,x,i) => sum+(x-b[i])**2,0);

export function terrainAt(direction) {
  const [x,y,z] = normalize(direction), lon = Math.atan2(x,z), lat = Math.asin(y);
  const noise = .48*Math.sin(12*x+3*Math.sin(7*z))*Math.sin(11*z-2*Math.sin(8*y)) + .26*Math.sin(28*x+7*z)*Math.sin(23*y-5*x) + .15*Math.sin(63*x+41*y-23*z);
  let coast = Math.abs(lat-(.26*Math.sin(2*lon+.4)+.09*Math.sin(5*lon)))-(.022+.009*Math.sin(3*lon)**2);
  const wrapped = (lon+TAU)%TAU;
  if (wrapped>1.3 && wrapped<3.3) coast = Math.min(coast,Math.abs(lat-(.31+.16*Math.sin(3*lon+1)))-.017);
  for (const [a,b,rx,ry] of LAKES) coast = Math.min(coast,(Math.hypot(angleDiff(lon,a)*Math.max(.25,Math.cos(lat))/rx,(lat-b)/ry)-1)*.14);
  if (coast<0) return {radius:.992,water:true,ridge:0};
  const amount = Math.min(1,coast/.036);
  const peak = Math.max(...PEAKS.map(([a,b,w]) => Math.exp(-((angleDiff(lon,a)*Math.cos(lat))**2+(lat-b)**2)/(w*w))));
  const ridge = Math.max(0,peak-.24)/.76;
  return {radius:1.001+amount*(.003+noise*.006)+amount*ridge*(.040+.014*Math.sin(lon*37+lat*24)*Math.sin(lat*43-lon*18)),water:false,ridge};
}

export function createSkylineLayout(layout) {
  const stations = layout.stations.map(s => normalize(s.normal));
  const roads = (layout.roadRoutes||[]).flatMap(r => r.points.map(normalize));
  const towers = [];
  let seed = 20261020;
  const random = () => { seed = (Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; };
  for (const [index,n] of stations.entries()) {
    const east = normalize(Math.abs(n[1])>.98 ? [1,0,0] : [n[2],0,-n[0]]), north = cross(n,east);
    let count = 0;
    for (let attempt=0;attempt<220 && count<9;attempt++) {
      const angle = attempt*2.39996323+index*.7, distance = .066+random()*.105;
      const direction = normalize(n.map((v,i) => v+east[i]*Math.cos(angle)*distance+north[i]*Math.sin(angle)*distance));
      const terrain = terrainAt(direction), width = .022+random()*.014, depth = .022+random()*.014;
      if (terrain.water || terrain.ridge>.24) continue;
      if (stations.some(s => distanceSq(direction,s)<.064**2)) continue;
      if (roads.some(p => distanceSq(direction,p)<.042**2)) continue;
      if (towers.some(t => distanceSq(direction,t.normal)<.043**2)) continue;
      towers.push({normal:direction,radius:terrain.radius-.002,width,depth,height:.115+random()*.14,angle:angle+Math.PI/4,style:index%3,spire:count%3===0});
      count++;
    }
  }
  return towers;
}
