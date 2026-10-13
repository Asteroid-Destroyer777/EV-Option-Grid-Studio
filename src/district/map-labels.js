// Labels are cartography only. They never enter demand, ranking or financial calculations.
export function labelCandidates(raw=[],index=[],zoom=14){
 const rows=new Map();
 for(const p of index){if(p.railway&&zoom>=12)rows.set('s'+p.id,{...p,kind:'station',priority:0});else if(p.place&&zoom>=(['city','town'].includes(p.place)?9:12)&&zoom<=16)rows.set('p'+p.id,{...p,kind:'place',priority:1});}
 for(const e of raw){const t=e.tags||{},p=e.center||e,name=t['name:ru']||t.name;if(!name||!Number.isFinite(p.lat)||!Number.isFinite(p.lon))continue;
 if(['station','halt'].includes(t.railway)&&zoom>=12)rows.set('s'+e.id,{...p,name,kind:'station',subway:rows.get('s'+e.id)?.subway||t.station==='subway'||t.subway==='yes',priority:0});
 else if(t.highway&&t.highway!=='bus_stop'&&zoom>=14&&(['motorway','trunk','primary','secondary','tertiary'].includes(t.highway)||zoom>=16))rows.set('r'+name,{...p,name,kind:'road',priority:2});
 else if(t.natural==='water'&&zoom>=13)rows.set('w'+name,{...p,name,kind:'water',priority:3});
 }
 return [...rows.values()].sort((a,b)=>a.priority-b.priority||a.name.localeCompare(b.name,'ru'));
}
export function createMapLabels(map,L){
 let raw=[],index=[],enabled=false,canvas;const pane=map.createPane('geographyLabels');pane.style.zIndex='360';pane.style.pointerEvents='none';
 function draw(){if(!canvas)return;const size=map.getSize(),dpr=Math.min(devicePixelRatio||1,2),ctx=canvas.getContext('2d');canvas.width=size.x*dpr;canvas.height=size.y*dpr;canvas.style.width=size.x+'px';canvas.style.height=size.y+'px';L.DomUtil.setPosition(canvas,map.containerPointToLayerPoint([0,0]));ctx.scale(dpr,dpr);if(!enabled)return;const occupied=[],visibleNames=[];
 for(const r of labelCandidates(raw,index,map.getZoom())){const p=map.latLngToContainerPoint([r.lat,r.lon]);if(p.x<30||p.y<20||p.x>size.x-30||p.y>size.y-20)continue;
 const text=(r.kind==='station'?(r.subway?'Ⓜ ':'◉ '):'')+r.name;ctx.font=(r.kind==='place'?'600 14px':r.kind==='station'?'600 12px':'11px')+' Onest, sans-serif';const w=ctx.measureText(text).width+16,h=23,x=p.x-w/2,y=p.y-h/2;if(occupied.some(b=>x<b.x+b.w&&x+w>b.x&&y<b.y+b.h&&y+h>b.y))continue;visibleNames.push(r.name);occupied.push({x:x-3,y:y-4,w:w+6,h:h+8});ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';ctx.lineWidth=4;ctx.strokeStyle='#182634';ctx.strokeText(text,p.x,p.y);ctx.fillStyle=r.kind==='station'?'#e6edff':r.kind==='water'?'#87b6d4':r.kind==='place'?'#c7d7e5':'#a7bbce';ctx.fillText(text,p.x,p.y);
 }canvas.setAttribute('aria-label','Подписи карты: '+visibleNames.join(', '));}
 canvas=L.DomUtil.create('canvas','map-geography-labels',pane);canvas.setAttribute('role','img');map.on('moveend zoomend resize',draw);map.on('zoomstart',()=>{canvas.style.visibility='hidden';});map.on('zoomend',()=>{canvas.style.visibility='';draw();});
 fetch('./data/moscow-map-labels.json').then(r=>r.ok?r.json():null).then(d=>{index=d?.elements||[];draw();}).catch(()=>{});document.fonts.ready.then(draw);
 return {setData(elements){raw=elements;draw();},setVisible(v){enabled=v;draw();}};
}
