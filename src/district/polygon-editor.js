import {normalizePolygon,validatePolygon,polygonAssessment} from './geography.js';

// A single polygon survives dragging. Handles are rebuilt only after editing ends.
export function createPolygonEditor(map,L,{onChange,onStatus}){
 let points=[],mode='idle',shape=null,handles=[],midpoints=[],beforeDrag=null;
 const $=id=>document.getElementById(id),latlngs=()=>points.map(p=>[p.lat,p.lon]);
 const assessment=()=>polygonAssessment(points);
 function paint(){
  const a=assessment(),closed=points.length>=3;
  if(shape&&shape._evClosed!==closed){shape.remove();shape=null;}
  if(points.length>=2){if(!shape){shape=(closed?L.polygon:L.polyline)(latlngs(),{renderer:L.svg(),color:'#a5b0ff',weight:3,fillOpacity:.16,interactive:false,smoothFactor:0}).addTo(map);shape._evClosed=closed;}else shape.setLatLngs(latlngs());shape.setStyle({color:closed&&!a.valid?'#f0a19e':'#a5b0ff'});}
  else {shape?.remove();shape=null;}
  $('finish-area').disabled=mode!=='draw'||points.length<3;
  $('undo-point').disabled=mode!=='draw'||!points.length;
  $('edit-area').disabled=points.length<3;
  $('clear-area').disabled=!points.length&&mode==='idle';
  $('edit-area').textContent=mode==='edit'?'Готово · сохранить контур':'Редактировать вершины';
  $('area-size').textContent=points.length>=3?a.areaKm2.toLocaleString('ru-RU',{maximumFractionDigits:3})+' км²':'Добавьте 3 вершины';
  $('area-limit').textContent=points.length>=3?(a.valid?`В пределах лимита · загрузка ${a.requestKm2.toLocaleString('ru-RU',{maximumFractionDigits:2})} из 100 км²`:a.error):'Допустимо: от 0,01 км²; окно загрузки — до 100 км²';
  $('area-meter').dataset.state=points.length>=3?(a.valid?'valid':'invalid'):'empty';
 }
 function notify(){onChange(points.map(p=>({...p})),{...assessment(),complete:mode!=='draw'});}
 function removeHandles(){handles.forEach(m=>m.remove());midpoints.forEach(m=>m.remove());handles=[];midpoints=[];}
 function applyMove(index,point,commit){points[index]=point;paint();if(commit){try{validatePolygon(points,{minArea:0});}catch(e){let priorValid=true;try{validatePolygon(beforeDrag,{minArea:0});}catch{priorValid=false;}if(priorValid){points=beforeDrag;onStatus(e.message+' Последнее перемещение отменено.');}else onStatus(e.message+' Продолжайте исправлять вершины.');paint();}notify();buildHandles();}}
 function buildHandles(){removeHandles();if(mode==='idle')return;
  points.forEach((p,i)=>{
   const m=L.marker([p.lat,p.lon],{draggable:mode==='edit',autoPan:true,keyboard:true,title:`Вершина ${i+1}. Перетащите или используйте стрелки клавиатуры`,icon:L.divIcon({className:'polygon-handle',html:`<span>${i+1}</span>`,iconSize:[28,28],iconAnchor:[14,14]})}).addTo(map);
   m.on('click',e=>{L.DomEvent.stopPropagation(e.originalEvent);if(mode==='draw'&&i===0&&points.length>=3)finish();});
   m.on('dragstart',()=>{beforeDrag=points.map(p=>({...p}));midpoints.forEach(m=>m.remove());midpoints=[];onChange(points,{...assessment(),complete:false});});
   m.on('drag',()=>{const q=m.getLatLng();applyMove(i,{lat:q.lat,lon:q.lng},false);});
   m.on('dragend',()=>{const q=m.getLatLng();applyMove(i,{lat:q.lat,lon:q.lng},true);});
   const el=m.getElement();el?.setAttribute('aria-label',`Вершина ${i+1}`);el?.addEventListener('keydown',e=>{
    if(mode!=='edit')return;const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
    if(delta){e.preventDefault();e.stopPropagation();beforeDrag=points.map(p=>({...p}));const pixel=map.latLngToLayerPoint(m.getLatLng()),step=e.shiftKey?20:4,q=map.layerPointToLatLng([pixel.x+delta[0]*step,pixel.y+delta[1]*step]);applyMove(i,{lat:q.lat,lon:q.lng},true);handles[i]?.getElement()?.focus();}
    if(e.key==='Delete'&&points.length>3){e.preventDefault();const prior=points.map(p=>({...p}));points.splice(i,1);try{validatePolygon(points,{minArea:0});paint();notify();buildHandles();}catch(e){points=prior;onStatus(e.message);}}
   });handles.push(m);
  });
  if(mode==='edit'&&points.length<100)points.forEach((p,i)=>{const q=points[(i+1)%points.length],m=L.marker([(p.lat+q.lat)/2,(p.lon+q.lon)/2],{title:'Добавить вершину на ребре',icon:L.divIcon({className:'polygon-midpoint',html:'+',iconSize:[20,20],iconAnchor:[10,10]})}).addTo(map);m.on('click',e=>{L.DomEvent.stopPropagation(e.originalEvent);points.splice(i+1,0,{lat:(p.lat+q.lat)/2,lon:(p.lon+q.lon)/2});paint();notify();buildHandles();});midpoints.push(m);});
 }
 function finish(){if(points.length<3)return;mode='edit';map.doubleClickZoom.enable();paint();notify();buildHandles();onStatus(assessment().valid?'Контур замкнут. Перетаскивайте вершины; кнопка «+» на ребре добавляет новую.':assessment().error+' Исправьте границы перетаскиванием; расчёт станет доступен после исправления.');}
 function clear(){mode='idle';points=[];map.doubleClickZoom.enable();removeHandles();paint();notify();}
 $('draw-area').onclick=()=>{clear();mode='draw';map.doubleClickZoom.disable();paint();onStatus('Нажимайте на карту. Контур замыкается автоматически после третьей точки; завершите кнопкой или нажатием первой вершины.');};
 $('finish-area').onclick=finish;
 $('undo-point').onclick=()=>{if(mode==='draw'){points.pop();paint();notify();buildHandles();}};
 $('clear-area').onclick=()=>{clear();onStatus('Область очищена. Нарисуйте новый контур.');};
 $('edit-area').onclick=()=>{mode=mode==='edit'?'idle':'edit';map.doubleClickZoom.enable();paint();notify();buildHandles();onStatus(mode==='edit'?'Перетаскивайте вершины. Стрелки клавиатуры также перемещают выбранную вершину.':'Границы сохранены. Можно выполнить расчёт.');};
 map.on('click',e=>{if(mode!=='draw')return;if(points.length>=100)return onStatus('Максимум 100 вершин.');const p={lat:e.latlng.lat,lon:e.latlng.lng};if(points.some(q=>map.latLngToContainerPoint([q.lat,q.lon]).distanceTo(map.latLngToContainerPoint(e.latlng))<3))return;points.push(p);paint();notify();buildHandles();});
 paint();
 return {get drawing(){return mode==='draw';},get editing(){return mode==='edit';},get points(){return points.map(p=>({...p}));},get valid(){return mode!=='draw'&&assessment().valid;},clear,setPoints(p,{fit=false,edit=false}={}){points=normalizePolygon(p);mode=edit?'edit':'idle';map.doubleClickZoom.enable();paint();notify();buildHandles();if(fit&&points.length>=3)map.fitBounds(latlngs(),{padding:[35,35]});},assertReady(){if(mode==='draw')throw new Error('Завершите контур перед расчётом.');const a=assessment();if(!a.valid)throw new Error(a.error);}};
}
