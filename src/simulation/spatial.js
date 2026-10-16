// Хафф: спрос территории распределяется между сетью, конкурентами и внешней альтернативой.
import { RESEARCH as R } from '../data/research-core.js';
const memo = new Map();
const SEGMENTS = { private: 'private_ev', corporate: 'corporate', transit: 'transit' };
export function allocateSpatial(stations, exponent = R.district.attractivenessExponent) {
  const own = stations.map(s => {
    const original = R.district.stations.find(d => d.id === s.id);
    return { id:s.id, posts:s.posts, x:original?.x ?? s.x, z:original?.z ?? s.z, own:true };
  });
  const key = JSON.stringify([own, exponent]);
  if (memo.has(key)) return memo.get(key);
  const sites = [...own, ...R.district.competitors];
  const byId = Object.fromEntries(own.map(s => [s.id, { sessions:0, segments:{private_ev:0,corporate:0,transit:0} }]));
  let competitors=0, outside=0, total=0;
  for (const cell of R.district.cells) for (const [segment,type] of Object.entries(SEGMENTS)) {
    const demand=cell[segment], beta=R.district.betaMeters[segment];
    const weights=sites.map(s => s.posts ** exponent * Math.exp(-Math.hypot(s.x-cell.x,s.z-cell.z)/beta));
    const other=R.district.outsidePosts ** exponent * Math.exp(-R.district.outsideDistanceM/beta);
    const denominator=weights.reduce((a,b)=>a+b,other);
    total+=demand; outside+=demand*other/denominator;
    sites.forEach((s,i)=>{const value=demand*weights[i]/denominator;if(s.own){byId[s.id].sessions+=value;byId[s.id].segments[type]+=value;}else competitors+=value;});
  }
  const result={ byId, competitors, outside, total, own:Object.values(byId).reduce((a,s)=>a+s.sessions,0) };
  memo.set(key,result); if(memo.size>64)memo.delete(memo.keys().next().value);
  return result;
}
