import test from 'node:test';import assert from 'node:assert/strict';
import {createPolygonEditor} from '../src/district/polygon-editor.js';
function fixture(){
 const els=new Map();globalThis.document={getElementById:id=>{if(!els.has(id))els.set(id,{textContent:'',disabled:false,dataset:{}});return els.get(id);}};
 const layers=[],events={},map={doubleClickZoom:{enable(){},disable(){}},on:(k,f)=>events[k]=f,fitBounds(){},latLngToContainerPoint:p=>({x:p[1]*1000,y:p[0]*1000,distanceTo:q=>Math.hypot(p[1]*1000-q.x,p[0]*1000-q.y)})};
 const shape=(points)=>({points,addTo(){return this;},remove(){},setLatLngs(p){this.points=p;},setStyle(){}}),markers=[];
 const L={svg(){return {};},polygon:shape,polyline:shape,divIcon:x=>x,DomEvent:{stopPropagation(){}},marker(p){const callbacks={},element={setAttribute(){},addEventListener(){},focus(){}};let position={lat:p[0],lng:p[1]};const m={on(k,f){callbacks[k]=f;return m;},addTo(){return m;},remove(){},getElement:()=>element,getLatLng:()=>position,move(p){position=p;},fire(k){callbacks[k]?.({target:m});}};markers.push(m);return m;}};
 const changes=[],statuses=[],editor=createPolygonEditor(map,L,{onChange:(p,a)=>changes.push({p,a}),onStatus:s=>statuses.push(s)});return {editor,els,markers,changes,statuses};
}
const p=[{lat:55.7,lon:37.6},{lat:55.71,lon:37.6},{lat:55.71,lon:37.62},{lat:55.7,lon:37.62}];
test('Перетаскивание удерживает тот же контур; новые границы применяются после dragend',()=>{const f=fixture();f.editor.setPoints(p,{edit:true});const m=f.markers[1];m.fire('dragstart');m.move({lat:55.712,lng:37.602});m.fire('drag');assert.deepEqual(f.editor.points[1],{lat:55.712,lon:37.602});m.fire('dragend');assert.equal(f.editor.valid,true);assert.equal(f.editor.points.length,4);assert.equal(f.changes.at(-1).a.complete,true);delete globalThis.document;});
test('Перетаскивание через противоположное ребро откатывается и сохраняет замкнутый контур',()=>{const f=fixture();f.editor.setPoints(p,{edit:true});const m=f.markers[1];m.fire('dragstart');m.move({lat:55.695,lng:37.615});m.fire('drag');m.fire('dragend');assert.deepEqual(f.editor.points,p);assert.match(f.statuses.at(-1),/отменено/);assert.equal(f.editor.valid,true);delete globalThis.document;});
test('Неверно нарисованный контур остаётся редактируемым до исправления',()=>{const f=fixture(),bad=[p[0],p[2],p[1],p[3]];f.editor.setPoints(bad,{edit:true});assert.equal(f.editor.valid,false);assert.equal(f.els.get('edit-area').disabled,false);assert.throws(()=>f.editor.assertReady());delete globalThis.document;});
