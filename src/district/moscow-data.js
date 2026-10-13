import {prepareArea,validateBounds} from './model.js';
import {containsBounds} from './geography.js';
let manifestPromise;const tiles=new Map();
export async function moscowManifest({fetcher=fetch}={}){manifestPromise||=fetcher('./data/moscow-osm/manifest.json').then(r=>{if(!r.ok)throw new Error('Московский источник не найден.');return r.json();}).catch(e=>{manifestPromise=null;throw e;});return manifestPromise;}
export async function moscowRaw(bounds,{signal,fetcher=fetch}={}){
 const meta=await moscowManifest({fetcher});if(!containsBounds(meta.bounds,bounds))throw new Error('Контур выходит за покрытие московской выгрузки.');
 const names=[];for(let y=Math.floor((bounds[0]-meta.bounds[0])/meta.latStep);y<=Math.floor((bounds[2]-meta.bounds[0])/meta.latStep);y++)for(let x=Math.floor((bounds[1]-meta.bounds[1])/meta.lonStep);x<=Math.floor((bounds[3]-meta.bounds[1])/meta.lonStep);x++){const id=`${y}-${x}`;if(meta.tiles.includes(id))names.push(id);}
 if(names.length>64)throw new Error('Для подробной карты приблизьте район.');const rows=new Map();
 for(let i=0;i<names.length;i+=4){signal?.throwIfAborted();const batch=await Promise.all(names.slice(i,i+4).map(async id=>{if(tiles.has(id))return tiles.get(id);const r=await fetcher('./data/moscow-osm/'+id+'.json.gz',{signal});if(!r.ok)throw new Error('Фрагмент карты не найден: '+id);const data=await r.json();if(tiles.size>=40)tiles.delete(tiles.keys().next().value);tiles.set(id,data);return data;}));for(const raw of batch)for(const e of raw.elements)rows.set(e.type+'/'+e.id,e);}
 const overlaps=e=>{const g=e.geometry||[],p=e.center||e;if(!g.length)return p.lat>=bounds[0]&&p.lat<=bounds[2]&&p.lon>=bounds[1]&&p.lon<=bounds[3];let s=90,w=180,n=-90,k=-180;for(const q of g){s=Math.min(s,q.lat);n=Math.max(n,q.lat);w=Math.min(w,q.lon);k=Math.max(k,q.lon);}return n>=bounds[0]&&s<=bounds[2]&&k>=bounds[1]&&w<=bounds[3];};
 return {elements:[...rows.values()].filter(overlaps),provenance:{...meta,tilesLoaded:names.length,bounds:[...bounds],coverageBounds:meta.bounds}};
}
export async function moscowArea(bounds,options){validateBounds(bounds);const raw=await moscowRaw(bounds,options);return prepareArea(raw.elements,bounds,raw.provenance);}
