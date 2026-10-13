import {prepareArea} from './model.js';
import {loadArea} from './source.js';
import {saveArea,savedArea} from './geography-cache.js';
import {containsBounds} from './geography.js';
export {containsBounds} from './geography.js';
import {moscowArea} from './moscow-data.js';
let snapshot;
export async function localArea(bounds,options){
 try{return await moscowArea(bounds,options);}catch(e){if(options?.signal?.aborted)throw e;}
 snapshot||=fetch('./data/district-zil-osm.json').then(async r=>{if(!r.ok)throw new Error('Встроенный набор не найден.');return r.json();}).catch(e=>{snapshot=null;throw e;});
 const raw=await snapshot;
 if(!containsBounds(raw.provenance.bounds,bounds))throw new Error('Контур выходит за локальное покрытие Москвы. Выберите автоматический / онлайн-источник или импортируйте географию района.');
 return prepareArea(raw.elements,bounds,{...raw.provenance,osmTimestamp:raw.osm3s?.timestamp_osm_base});
}
export async function loadDistrictArea(bounds,mode,{local=localArea,online=loadArea,onNotice=()=>{},signal,onProgress,cacheGet=savedArea,cachePut=saveArea}={}){
 if(mode==='local')return local(bounds,{signal});
 if(mode==='auto'){try{return await local(bounds,{signal});}catch{}const cached=await cacheGet(bounds);if(cached){onNotice('Использована сохранённая география выбранного района · '+cached.source?.retrievedAt);return {...cached,source:{...cached.source,offlineCache:true}};}}
 try{const result=await online(bounds,{signal,onProgress});await cachePut(result);return result;}catch(remoteError){
  signal?.throwIfAborted();const cached=await cacheGet(bounds);if(cached){onNotice('Онлайн-источник недоступен. Использована ранее загруженная география того же района.');return {...cached,source:{...cached.source,offlineCache:true,fallbackReason:remoteError.message}};}
  try{const fallback=await local(bounds);onNotice('Онлайн-источник недоступен. Использована локальная география того же контура: '+fallback.source.provider);return {...fallback,source:{...fallback.source,fallbackReason:remoteError.message,requestedProvider:'OpenStreetMap / Overpass'}};}
  catch{throw new Error('Источники выбранного района временно недоступны. Импортируйте OSM JSON или сохранённый расчёт; затем поиск выполнится на его географии. Границы сохранены. Детали: '+remoteError.message);}
 }
}
