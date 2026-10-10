import {validateBounds,prepareArea} from './model.js';
const cache=new Map();
export async function loadArea(bounds){
  validateBounds(bounds);const key=JSON.stringify(bounds.map(v=>+v.toFixed(5))),old=cache.get(key);
  if(old&&Date.now()-old.time<600000)return old.data;
  const query=`[out:json][timeout:20];(nwr["amenity"="charging_station"](${bounds.join(',')});way["building"](${bounds.join(',')}););out center 30001;`;
  const response=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json','User-Agent':'EV-Option-Grid/0.4 (district research prototype)'},body:new URLSearchParams({data:query}),signal:AbortSignal.timeout(25000)});
  if(!response.ok)throw new Error(`Открытый источник недоступен (HTTP ${response.status}). Импортируйте выгрузку или задайте объекты вручную; отсутствие данных не означает отсутствие конкурентов.`);
  const text=await response.text();if(text.length>15000000)throw new Error('Слишком большой ответ: уменьшите район.');
  const result=JSON.parse(text);if(result.remark)throw new Error('Источник вернул неполные данные. Уменьшите район и повторите запрос.');
  const data=prepareArea(result.elements,bounds,{provider:'OpenStreetMap / Overpass',retrievedAt:new Date().toISOString(),osmTimestamp:result.osm3s?.timestamp_osm_base||null,query});
  if(cache.size>=20)cache.delete(cache.keys().next().value);cache.set(key,{time:Date.now(),data});return data;
}
