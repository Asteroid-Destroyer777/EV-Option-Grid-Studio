import {RESEARCH as R} from './research-core.js';
export function potentialDuplicates(radius = 60) {
  return R.district.stations.flatMap(s=>R.district.competitors.flatMap(c=>{
    const metres=Math.hypot(s.x-c.x,s.z-c.z);
    return metres<=radius?[{station:s.id,competitor:c.id,operator:c.op,metres}]:[];
  }));
}
