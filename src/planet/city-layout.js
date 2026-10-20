import * as T from '../../vendor/three/three.module.js';
import {terrainAt} from './skyline-layout.js';
const unit=v=>v.normalize();
const polar=(lon,lat)=>new T.Vector3(Math.sin(lon)*Math.cos(lat),Math.sin(lat),Math.cos(lon)*Math.cos(lat));

// An illustrated network, not a geographic map or a calculated transport flow.
export function cityLayout(){
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
  for(const city of cities){const t=terrainAt(city.normal);city.position=city.normal.map(v=>v*(t.radius+.012));}
  return cities;
}

export function cityRoutes(cities){
  const start=new T.Vector3(...cities[0].normal);
  return cities.slice(1).map(city=>{
    const end=new T.Vector3(...city.normal),angle=start.angleTo(end),points=[];
    for(let j=0;j<=56;j++){
      const t=j/56,n=start.clone().multiplyScalar(Math.sin((1-t)*angle)).addScaledVector(end,Math.sin(t*angle)).divideScalar(Math.sin(angle)).normalize();
      const radius=Math.max(1.015,terrainAt(n.toArray()).radius+.022)+Math.sin(t*Math.PI)*.065;
      points.push(n.multiplyScalar(radius).toArray());
    }
    return {points};
  });
}

