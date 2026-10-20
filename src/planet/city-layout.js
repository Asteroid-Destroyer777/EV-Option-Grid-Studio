import * as T from '../../vendor/three/three.module.js';
import {terrainAt} from './skyline-layout.js';
const unit=v=>v.normalize();
const polar=(lon,lat)=>new T.Vector3(Math.sin(lon)*Math.cos(lat),Math.sin(lat),Math.cos(lon)*Math.cos(lat));

// An illustrated network, not a geographic map or a calculated transport flow.
export function cityLayout(layout){
  const hub=polar(.18,.43),east=unit(new T.Vector3(hub.z,0,-hub.x)),north=unit(new T.Vector3().crossVectors(hub,east));
  const cities=[{name:'МОСКВА',normal:hub.toArray(),hub:true}];
  ['Тверь','Ярославль','Владимир','Рязань','Тула','Калуга'].forEach((name,i)=>{
    const angle=i*Math.PI/3+.2;
    let best;
    for(let j=0;j<30;j++){
      const a=angle+(j%5-2)*.035,d=.71+Math.floor(j/5)*.025;
      const n=hub.clone().multiplyScalar(Math.cos(d)).addScaledVector(east,Math.cos(a)*Math.sin(d)).addScaledVector(north,Math.sin(a)*Math.sin(d)).normalize();
      const t=terrainAt(n.toArray());if(!t.water&&t.ridge<.22){best=n;break;}
    }
    best ||= hub.clone().addScaledVector(east,Math.cos(angle)*.9).addScaledVector(north,Math.sin(angle)*.9).normalize();
    cities.push({name,normal:best.toArray(),hub:false});
  });
  for(const [index,station] of (layout?.stations||[]).entries()){
    const normal=unit(new T.Vector3(...station.normal));
    if(cities.some(c=>normal.distanceTo(new T.Vector3(...c.normal))<.15))continue;
    cities.push({name:`Город ${String(index+1).padStart(2,'0')}`,normal:normal.toArray(),position:[...station.position],existing:true,hub:false});
  }
  for(const city of cities){const t=terrainAt(city.normal);city.position ||= city.normal.map(v=>v*(t.radius+.012));}
  return cities;
}

export function cityRoutes(cities){
  const routes=[];
  for(let from=0;from<cities.length;from++)for(let to=from+1;to<cities.length;to++){
    const start=new T.Vector3(...cities[from].normal),end=new T.Vector3(...cities[to].normal),turn=new T.Quaternion().setFromUnitVectors(start,end),rotation=new T.Quaternion(),points=[];
    for(let j=0;j<=48;j++){
      const t=j/48,n=start.clone().applyQuaternion(rotation.identity().slerp(turn,t)).normalize();
      const radius=Math.max(1.015,terrainAt(n.toArray()).radius+.022)+Math.sin(t*Math.PI)*.065;
      points.push(n.multiplyScalar(radius).toArray());
    }
    routes.push({from,to,points});
  }
  return routes;
}

