import {pointInPolygon,validatePolygon} from './geography.js';
// Независимый районный скрининг. Не изменяет параметры и состояние 3D-полигона.
const check=(ok,message)=>{if(!ok)throw new Error(message);};
const finite=(v,a,b)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b;
const sum=a=>a.reduce((s,v)=>s+v,0);
export function validateBounds(b) {
  check(Array.isArray(b)&&b.length===4&&b.every(Number.isFinite),'Укажите границы района: юг, запад, север, восток.');
  const [s,w,n,e]=b;
  check(s>=-80&&n<=80&&w>=-180&&e<=180&&s<n&&w<e,'Некорректные границы. Переход через 180° не поддерживается.');
  const area=(n-s)*111.32*(e-w)*111.32*Math.cos((s+n)*Math.PI/360);
  check(area>=.01&&area<=100,'Выберите район площадью от 0,01 до 100 км². Приблизьте карту.');
  return area;
}
const inside=(p,b)=>p.lat>=b[0]&&p.lat<=b[2]&&p.lon>=b[1]&&p.lon<=b[3];
export function distance(a,b){const r=Math.PI/180,x=(a.lon-b.lon)*r*Math.cos((a.lat+b.lat)*r/2),y=(a.lat-b.lat)*r;return 6371000*Math.hypot(x,y);}
export function prepareArea(elements,bounds,source={}) {
  const areaKm2=validateBounds(bounds);
  check(Array.isArray(elements)&&elements.length<=30000,'Слишком много объектов: выберите меньший район.');
  const cells=Array.from({length:400},(_,i)=>({lat:bounds[0]+(Math.floor(i/20)+.5)*(bounds[2]-bounds[0])/20,lon:bounds[1]+(i%20+.5)*(bounds[3]-bounds[1])/20,weight:1}));
  const stations=[],features=[],candidates=[],footprints=[],water=[],seen=new Set();let buildings=0,excluded=0;
  for(const e of elements){
    const p=Number.isFinite(e.lat)?e:e.center,t=e.tags||{},id=`${e.type}/${e.id}`;
    if(e.geometry?.length>=3){const g=e.geometry;const overlaps=g.some(q=>inside(q,bounds))||pointInPolygon({lat:(bounds[0]+bounds[2])/2,lon:(bounds[1]+bounds[3])/2},g);if(overlaps){if(t.building)footprints.push(e.holes?.length?{outer:g,holes:e.holes}:g);if(t.natural==='water')water.push(e.holes?.length?{outer:g,holes:e.holes}:g);}}
    if(!p||!finite(p.lat,-80,80)||!finite(p.lon,-180,180)||!inside(p,bounds)||seen.has(id))continue;seen.add(id);
    if(t.building&&t.building!=='no'){
      const x=Math.min(19,Math.floor((p.lon-bounds[1])/(bounds[3]-bounds[1])*20)),y=Math.min(19,Math.floor((p.lat-bounds[0])/(bounds[2]-bounds[0])*20));
      cells[y*20+x].weight++;buildings++;
    }
    const kind=t.amenity==='parking'?'parking':t.railway==='subway_entrance'?'entrance':t.railway==='station'?'station':t.highway==='bus_stop'||t.public_transport==='platform'?'stop':t.shop==='mall'?'mall':['cafe','restaurant','fast_food'].includes(t.amenity)?'food':t.power==='substation'?'substation':t.highway?'road':null;
    if(kind)features.push({id,lat:p.lat,lon:p.lon,kind,name:String(t.name||t.ref||kind).slice(0,200),url:['node','way','relation'].includes(e.type)?`https://www.openstreetmap.org/${id}`:(e.source||null),geometry:e.geometry,access:t.access||null});
    if(kind==='parking'&&!['private','no'].includes(t.access))candidates.push({id,lat:p.lat,lon:p.lon,name:String(t.name||'Парковка OSM').slice(0,200),kind:'parking',url:`https://www.openstreetmap.org/${id}`,evidence:'Геометрия OSM; права и присоединение не подтверждены'});

    if(t.amenity!=='charging_station')continue;
    if(['private','no'].includes(t.access)||t.disused==='yes'){excluded++;continue;}
    const capacity=Number(t.capacity),power=Object.entries(t).filter(([k])=>k.endsWith(':output')).map(([,v])=>/^\s*\d+(\.\d+)?\s*kW\s*$/i.test(v)?parseFloat(v):null).filter(v=>v>0);
    stations.push({id,lat:p.lat,lon:p.lon,name:String(t.name||t.brand||t.operator||'Зарядный объект').slice(0,200),posts:Number.isInteger(capacity)&&capacity>0&&capacity<=200?capacity:null,kw:power.length?Math.max(...power):null,url:`https://www.openstreetmap.org/${id}`});
  }
  check(stations.length<=200,'Более 200 зарядных объектов: уменьшите район.');
  return {bounds,areaKm2,cells,stations,features,candidates,footprints,water,buildings,excluded,source,weighting:buildings?'1 + число зданий в ячейке (эвристика, не население)':'Равномерно: зданий нет в загруженных данных'};
}
export function validateInput(input){
  check(input&&typeof input==='object','Нет входных данных.');
  const {area,candidate,settings:p}=input;
  check(area&&p&&candidate,'Сначала выберите район и площадку.');validateBounds(area.bounds);
  if(area.selectionPolygon){validatePolygon(area.selectionPolygon);check(pointInPolygon(candidate,area.selectionPolygon),'Площадка вне контура.');check([...area.cells,...area.stations].every(p=>pointInPolygon(p,area.selectionPolygon)),'Объект или ячейка вне контура.');}
  check(Array.isArray(area.cells)&&area.cells.length>0&&area.cells.length<=1600,'Неверная сетка спроса.');
  check(Array.isArray(area.stations)&&area.stations.length<=200,'Не более 200 зарядных объектов.');
  for(const s of [...area.cells,...area.stations,candidate])check(finite(s.lat,-80,80)&&finite(s.lon,-180,180)&&inside(s,area.bounds),'Координаты вне выбранного района.');
  check(area.cells.every(c=>finite(c.weight,0,1e6))&&sum(area.cells.map(c=>c.weight))>0,'Некорректные веса ячеек.');
  for(const s of area.stations)check((s.posts==null||Number.isInteger(s.posts)&&finite(s.posts,1,200))&&(s.kw==null||finite(s.kw,.1,1000)),'Некорректная мощность или число постов.');
  for(const s of [...area.stations,candidate])check(s.attractiveness==null||finite(s.attractiveness,.25,4),'Привлекательность должна быть от 0,25 до 4.');
  const limits={dailyDemand:[0,1e6],energy:[1,300],sessionMinutes:[1,1440],posts:[1,200],postKW:[1,1000],gridKW:[0,10000],defaultPosts:[1,200],defaultKW:[1,1000],radiusM:[100,20000],outsideWeight:[.001,100],capex:[0,1e10],opex:[0,1e9],tariff:[0,1000],energyCost:[0,1000],discount:[0,1],growth:[-.5,.5],years:[1,15],lead:[0,10]};
  for(const [k,[a,b]] of Object.entries(limits))check(finite(p[k],a,b),`Параметр ${k}: допустимо от ${a} до ${b}.`);
  for(const k of ['posts','defaultPosts','years','lead'])check(Number.isInteger(p[k]),`Параметр ${k} должен быть целым.`);
  check(['flat','evening','commute'].includes(p.profile),'Неизвестный суточный профиль.');
  check(typeof p.demandSource==='string'&&p.demandSource.trim().length>=3&&p.demandSource.length<=1000,'Укажите источник или явно напишите, что спрос — допущение.');
  check(input.acceptAssumptions===true,'Подтвердите сценарный характер неподтверждённых параметров.');
}
function profile(type){const a=Array.from({length:24},(_,h)=>type==='flat'?1:type==='evening'?(h>=17&&h<22?3:1):((h>=7&&h<10)||(h>=17&&h<20)?3:1));const total=sum(a);return a.map(v=>v/total);}
function allocate(area,stations,p){const counts=stations.map(()=>0),total=sum(area.cells.map(c=>c.weight));let outside=0;
  for(const cell of area.cells){const w=stations.map(s=>s.posts**.7*(s.attractiveness??1)*Math.exp(-distance(cell,s)/p.radiusM)),den=sum(w)+p.outsideWeight;outside+=cell.weight/total*p.outsideWeight/den;for(let i=0;i<w.length;i++)counts[i]+=cell.weight/total*w[i]/den;}
  return {shares:counts,outside};
}
function day(stations,allocation,p,demand){const fractions=profile(p.profile);let served=0,lost=0;
  const results=stations.map((s,i)=>{const power=Math.min(s.posts*s.kw,s.gridKW??s.posts*s.kw),capacity=Math.min(s.posts*60/p.sessionMinutes,power/p.energy),offered=demand*allocation.shares[i];
    const hours=fractions.map((v,h)=>{const arrivals=offered*v,completed=Math.min(arrivals,capacity);return {hour:h,arrivals,served:completed,lost:arrivals-completed,energyKWh:completed*p.energy,powerLimitKW:power};});
    const done=sum(hours.map(h=>h.served));served+=done;lost+=offered-done;
    return {id:s.id,offered,served:done,lost:offered-done,utilization:capacity?done/(24*capacity):0,hours};});
  return {stations:results,served,lost,outside:demand*allocation.outside,demand};
}
function finances(flows,p){let cum=-p.capex,dcum=-p.capex,payback=null,discountedPayback=null;const rows=[];
  for(let t=1;t<=p.years;t++){const op=flows[t-1],discounted=op/(1+p.discount)**t;
    if(p.capex>0&&payback==null&&cum<0&&cum+op>=0)payback=t-1-cum/op;
    if(p.capex>0&&discountedPayback==null&&dcum<0&&dcum+discounted>=0)discountedPayback=t-1-dcum/discounted;
    cum+=op;dcum+=discounted;rows.push({year:t,operating:op,discounted,cumulative:cum,discountedCumulative:dcum});
  }
  return {npv:dcum,payback,discountedPayback,rows};
}
export function calculateDistrict(input){validateInput(input);const {area,candidate,settings:p}=input;
  const existing=area.stations.map((s,i)=>({...s,id:`existing-${i}`,posts:s.posts??p.defaultPosts,kw:s.kw??p.defaultKW}));
  const stations=[...existing,{...candidate,id:'candidate',posts:p.posts,kw:p.postKW,gridKW:p.gridKW}];
  const before=allocate(area,existing,p),after=allocate(area,stations,p);
  const compute=(scale)=>{const flows=[],networkFlows=[];let first=null;
    for(let t=1;t<=p.years;t++){
      const demand=p.dailyDemand*scale*(1+p.growth)**(t-1),active=t>p.lead;
      const a=day(stations,after,p,demand),b=day(existing,before,p,demand),own=a.stations.at(-1);
      if(!first&&active)first={year:t,withCandidate:a,withoutCandidate:b,candidate:own,netServed:a.served-b.served,capturedFromExisting:sum(b.stations.map(s=>s.offered))-sum(a.stations.slice(0,-1).map(s=>s.offered))};
      flows.push(active?own.served*365*p.energy*(p.tariff-p.energyCost)-p.opex:0);
      networkFlows.push(active?(a.served-b.served)*365*p.energy*(p.tariff-p.energyCost)-p.opex:0);
    }
    return {scale,first,finance:finances(flows,p),networkFinance:finances(networkFlows,p)};
  };
  return {version:'district-0.4.0',input,baseline:compute(1),sensitivity:[.5,1,1.5].map(compute),warnings:[
    'География не определяет число зарядных сессий: общий спрос и его источник заданы пользователем.',
    'Веса зданий, привлекательность, транспортная доступность, радиус выбора, внешний вариант, профиль и рост — сценарные предположения. Расстояния прямые, не маршруты по дорогам. Общий спрос сохраняется.',
    'Объекты карты не объединяются по близости: возможны дубли. Неизвестные посты и мощность заменяются явно заданными предположениями.',
    'Существующие объекты считаются конкурентами, не активами заказчика. Их сетевые лимиты неизвестны; предполагается сумма мощностей постов. Повторный выбор после отказа не моделируется.',
    'Вложения в момент 0, денежные потоки в конце года; до ввода доходов нет. Остаточная стоимость, налоги, кредиты, потери энергии и замены оборудования не включены.',
    'Скрининг площадки — не разрешение на строительство и не доказанный инвестиционный прогноз.'
  ]};
}
