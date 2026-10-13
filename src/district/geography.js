// Coordinates are stored once per vertex. Leaflet and point-in-polygon close the ring.
export const AREA_LIMITS = Object.freeze({min:.01,max:100});
const same=(a,b)=>Math.abs(a.lat-b.lat)<1e-10&&Math.abs(a.lon-b.lon)<1e-10;
export function normalizePolygon(poly){const p=poly.map(p=>({lat:p.lat,lon:p.lon}));if(p.length>1&&same(p[0],p.at(-1)))p.pop();return p;}
export function pointInPolygon(p,poly){if(!poly?.length)return true;let hit=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j],cross=(p.lon-a.lon)*(b.lat-a.lat)-(p.lat-a.lat)*(b.lon-a.lon);if(Math.abs(cross)<1e-10&&p.lon>=Math.min(a.lon,b.lon)-1e-10&&p.lon<=Math.max(a.lon,b.lon)+1e-10&&p.lat>=Math.min(a.lat,b.lat)-1e-10&&p.lat<=Math.max(a.lat,b.lat)+1e-10)return true;if((a.lat>p.lat)!==(b.lat>p.lat)&&p.lon<(b.lon-a.lon)*(p.lat-a.lat)/(b.lat-a.lat)+a.lon)hit=!hit;}return hit;}
export function polygonBounds(poly){return [Math.min(...poly.map(p=>p.lat)),Math.min(...poly.map(p=>p.lon)),Math.max(...poly.map(p=>p.lat)),Math.max(...poly.map(p=>p.lon))];}
export function polygonAreaKm2(poly){if(poly.length<3)return 0;const origin=poly[0],c=Math.cos(poly.reduce((a,p)=>a+p.lat,0)/poly.length*Math.PI/180);let s=0;for(let i=0,j=poly.length-1;i<poly.length;j=i++)s+=(poly[j].lon-origin.lon)*(poly[i].lat-origin.lat)-(poly[i].lon-origin.lon)*(poly[j].lat-origin.lat);return Math.abs(s)*111.32**2*c/2;}
export function boundsAreaKm2(b){return (b[2]-b[0])*111.32*(b[3]-b[1])*111.32*Math.cos((b[0]+b[2])*Math.PI/360);}
export function validatePolygon(poly,{minArea=AREA_LIMITS.min}={}){
 if(!Array.isArray(poly)||poly.length<3||poly.length>100||poly.some(p=>!Number.isFinite(p.lat)||!Number.isFinite(p.lon)||Math.abs(p.lat)>80||Math.abs(p.lon)>180))throw new Error('Контур: от 3 до 100 корректных вершин.');
 const orient=(a,b,c)=>(b.lon-a.lon)*(c.lat-a.lat)-(b.lat-a.lat)*(c.lon-a.lon),on=(a,b,c)=>Math.abs(orient(a,b,c))<1e-12&&c.lat>=Math.min(a.lat,b.lat)-1e-10&&c.lat<=Math.max(a.lat,b.lat)+1e-10&&c.lon>=Math.min(a.lon,b.lon)-1e-10&&c.lon<=Math.max(a.lon,b.lon)+1e-10;
 for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length],prev=poly[(i+poly.length-1)%poly.length];
  if(same(a,b)||on(prev,a,b)||on(a,b,prev))throw new Error('Вершины совпадают или ребро накладывается на соседнее.');
  for(let j=i+2;j<poly.length;j++){if(i===0&&j===poly.length-1)continue;const c=poly[j],d=poly[(j+1)%poly.length];if(orient(a,b,c)*orient(a,b,d)<0&&orient(c,d,a)*orient(c,d,b)<0||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b))throw new Error('Контур пересекает или касается сам себя. Переместите вершину.');}
 }
 if(polygonAreaKm2(poly)<=0||polygonAreaKm2(poly)<minArea)throw new Error('Площадь контура меньше 0,01 км².');return poly;
}
export function polygonAssessment(poly){const areaKm2=polygonAreaKm2(poly),bounds=poly.length?polygonBounds(poly):null,requestKm2=bounds?boundsAreaKm2(bounds):0;let error='';try{validatePolygon(poly,{minArea:0});}catch(e){error=e.message;}if(!error&&areaKm2<AREA_LIMITS.min)error='Слишком мало: увеличьте контур до 0,01 км².';if(!error&&requestKm2>AREA_LIMITS.max)error='Слишком много: прямоугольник загрузки превышает 100 км². Уменьшите контур.';return {areaKm2,requestKm2,bounds,error,valid:!error};}
export function clipArea(area,poly){if(!poly?.length)return area;validatePolygon(poly);const a={...area,selectionPolygon:poly.map(p=>({...p})),areaKm2:polygonAreaKm2(poly)};for(const k of ['cells','stations','features','candidates'])if(area[k])a[k]=area[k].filter(p=>pointInPolygon(p,poly));if(!a.cells.length)throw new Error('В контуре нет расчётных ячеек. Увеличьте область.');return a;}

export const containsBounds=(coverage,b)=>b[0]>=coverage[0]&&b[1]>=coverage[1]&&b[2]<=coverage[2]&&b[3]<=coverage[3];
export function pointInFootprint(p,g){return Array.isArray(g)?pointInPolygon(p,g):pointInPolygon(p,g.outer)&&!(g.holes||[]).some(h=>pointInPolygon(p,h));}
