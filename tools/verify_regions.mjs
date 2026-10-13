import {writeFile,mkdir} from 'node:fs/promises';
import {fetchRawArea} from '../src/district/source.js';
import {prepareArea,calculateDistrict} from '../src/district/model.js';
import {clipArea,pointInPolygon} from '../src/district/geography.js';
import {rankDistrict,candidateInput} from '../src/district/ranking.js';
await mkdir(new URL('../docs/revision-2d-v2/regions/',import.meta.url),{recursive:true});
const examples=[{id:'moscow-arbat',name:'Москва · Арбат',bounds:[55.744,37.584,55.754,37.604]},{id:'kazan-center',name:'Казань · центр',bounds:[55.783,49.112,55.793,49.132]},{id:'petersburg-center',name:'Санкт-Петербург · центр',bounds:[59.931,30.332,59.941,30.352]}];
const settings={dailyDemand:300,demandSource:'Тестовый спрос для проверки загрузки реальной географии; не прогноз',energy:25.2,sessionMinutes:30,posts:4,postKW:150,gridKW:300,defaultPosts:2,defaultKW:22,radiusM:1200,outsideWeight:.3,capex:12000000,opex:1000000,tariff:24,energyCost:12,discount:.12,growth:0,years:10,lead:1,profile:'evening'};
const summaries=[];
// One request at a time: respect shared public data services.
for(const site of examples){const t=Date.now();try{const raw=await fetchRawArea(site.bounds,{onProgress:message=>console.log(site.id+': '+message)}),[s,w,n,e]=site.bounds,poly=[{lat:s,lon:w},{lat:n,lon:w},{lat:n,lon:e},{lat:s+.002,lon:e}],area=clipArea(prepareArea(raw.elements,site.bounds,raw.provenance),poly),input={area,candidate:area.cells[0],settings,acceptAssumptions:true},r=rankDistrict(input,{top:10});if(r.top.some(x=>!pointInPolygon(x.point,poly)))throw new Error('Кандидат вне контура');const recomputed=calculateDistrict(candidateInput(input,r.top[0].point,r.options));if(Math.abs(recomputed.baseline.finance.npv-r.top[0].npv)>1e-6)throw new Error('Несовпадение модели');await writeFile(new URL('../docs/revision-2d-v2/regions/'+site.id+'.json',import.meta.url),JSON.stringify(raw));summaries.push({...site,passed:true,stations:area.stations.length,buildings:area.buildings,candidates:r.candidatesEvaluated,topCount:r.top.length,endpoint:raw.provenance.endpoint,date:raw.provenance.retrievedAt,elapsedMs:Date.now()-t});}catch(e){summaries.push({...site,passed:false,error:e.message,elapsedMs:Date.now()-t});}console.log(summaries.at(-1));}
await writeFile(new URL('../docs/revision-2d-v2/regions/results.json',import.meta.url),JSON.stringify(summaries,null,2));
