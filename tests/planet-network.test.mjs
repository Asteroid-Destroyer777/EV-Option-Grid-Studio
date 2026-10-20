import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cityLayout,cityRoutes} from '../src/planet/city-layout.js';
const layout=JSON.parse(readFileSync(new URL('../assets/planet/layout.json',import.meta.url))),cities=cityLayout(layout),routes=cityRoutes(cities);
const normal=p=>{const l=Math.hypot(...p);return p.map(v=>v/l);};
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
test('Planet network covers the original towns on both hemispheres and retains Moscow',()=>{
 assert.equal(cities.length,21);assert.equal(cities.filter(c=>c.existing).length,14);assert.equal(cities.filter(c=>c.hub).length,1);assert.equal(cities[0].name,'МОСКВА');
 assert.ok(cities.some(c=>c.normal.reduce((sum,v,i)=>sum+v*cities[0].normal[i],0)<-.9));
 for(const station of layout.stations)assert.ok(cities.some(c=>distance(c.normal,normal(station.normal))<1e-8));
});
test('Every town pair has exactly one continuous finite route with correct endpoints',()=>{
 assert.equal(routes.length,210);const pairs=new Set(),degree=Array(cities.length).fill(0);
 for(const route of routes){const key=route.from+':'+route.to;assert.ok(route.from<route.to);assert.ok(!pairs.has(key));pairs.add(key);degree[route.from]++;degree[route.to]++;
  assert.ok(distance(normal(route.points[0]),cities[route.from].normal)<1e-8);assert.ok(distance(normal(route.points.at(-1)),cities[route.to].normal)<1e-8);
  route.points.forEach(p=>{assert.ok(p.every(Number.isFinite));assert.ok(Math.hypot(...p)>1);});
 }
 assert.ok(degree.every(n=>n===cities.length-1));
});
test('Opposite poles do not produce broken or non-finite arcs',()=>{
 const [route]=cityRoutes([{normal:[0,1,0]},{normal:[0,-1,0]}]);assert.ok(route.points.every(p=>p.every(Number.isFinite)));assert.ok(distance(normal(route.points.at(-1)),[0,-1,0])<1e-8);
});
