import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {brotliDecompressSync} from 'node:zlib';
import {createSkylineLayout,terrainAt} from '../src/planet/skyline-layout.js';
const layout=JSON.parse(readFileSync(new URL('../assets/planet/layout.json',import.meta.url)));
const towers=createSkylineLayout(layout);
const unit=p=>{const length=Math.hypot(...p);return p.map(x=>x/length);};
const distance=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));

test('Planet retains the complete volumetric test model and a spherical landscape',()=>{
  const bytes=brotliDecompressSync(readFileSync(new URL('../assets/planet/spherical-planet.glb.br',import.meta.url)));
  assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(8),bytes.length);
  const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  const terrain=gltf.meshes.find(m=>m.name.includes('Continuous spherical landscape'));
  assert.ok(terrain);assert.equal(gltf.images?.length||0,0,'The world must retain real mesh geometry, not image planes.');
  const positions=gltf.accessors[terrain.primitives[0].attributes.POSITION];
  const spans=positions.min.map((v,i)=>positions.max[i]-v);
  assert.ok(Math.min(...spans)>1.9);assert.ok(Math.max(...spans)/Math.min(...spans)<1.05);
  assert.ok(gltf.meshes.length>20);
});
test('Additional skyscrapers cover both hemispheres and remain on land away from roads and stations',()=>{
  assert.ok(towers.length>=100);
  const roads=layout.roadRoutes.flatMap(r=>r.points.map(unit));
  for(const tower of towers){
    assert.equal(terrainAt(tower.normal).water,false);
    assert.ok(tower.normal.every(Number.isFinite));assert.ok(tower.height>.1&&tower.height<.3);
    assert.ok(tower.width>0&&tower.depth>0);
    assert.ok(roads.every(p=>distance(p,tower.normal)>.03),'A skyscraper overlaps a road.');
    assert.ok(layout.stations.every(s=>distance(unit(s.normal),tower.normal)>.06),'A skyscraper overlaps a charging plaza.');
  }
  assert.ok(towers.some(t=>t.normal[2]>.5)&&towers.some(t=>t.normal[2]<-.5));
  assert.ok(towers.some(t=>t.normal[1]>.5)&&towers.some(t=>t.normal[1]<-.5));
});
test('Additional towers leave clearance between separate building footprints',()=>{
  for(let i=0;i<towers.length;i++) for(let j=i+1;j<towers.length;j++)
    assert.ok(distance(towers[i].normal,towers[j].normal)>.04);
});
test('Skyline generation is stable on reload and leaves the source layout intact',()=>{
  const snapshot=JSON.stringify(layout);
  assert.deepEqual(createSkylineLayout(layout),towers);assert.equal(JSON.stringify(layout),snapshot);
});
