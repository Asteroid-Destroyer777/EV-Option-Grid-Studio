import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {brotliDecompressSync} from 'node:zlib';
import {STATION_DEFS, NODE_DEFS} from '../src/data/dataset.js';
import {RESEARCH} from '../src/data/research-bundle.js';
import {RESEARCH as core} from '../src/data/research-core.js';
import {stations as registry} from '../src/data/research-registry.js';
import {evaluate} from '../src/simulation/engine.js';
import {recommend} from '../src/simulation/recommend.js';
import {economics} from '../src/simulation/economics.js';
import {calculateRequest} from '../src/simulation/service.js';
import {readURL, writeURL} from '../src/url-state.js';
import {num, int, mln, sgn, pct, attentionCompare, queueText} from '../src/ui/format.js';

function fixture(scale=1) {
  const stations = STATION_DEFS.map(s => {
    const p=RESEARCH.district.stations.find(r=>r.id===s.id);
    return {...structuredClone(s),pos:{x:p.x,z:p.z},site:{x:p.x+100,z:p.z}};
  });
  return {demandModel:'huff-zil-v1',demandScale:scale,stations,nodes:structuredClone(NODE_DEFS),byId:Object.fromEntries(stations.map(s=>[s.id,s]))};
}

test('Аудит: все 12 режимов учитывают пик в статусе и сохраняют баланс', () => {
  for (const year of [2026,2027,2030,2035]) for (const scenario of ['low','base','high']) {
    const sim=evaluate(fixture(),{year,scenario,decisions:[]});
    assert.ok(Math.abs(sim.totals.demand-sim.totals.served-sim.totals.lost)<1e-6);
    for (const s of sim.stations) {
      if (s.rho >= .8) assert.ok(['high','constraint'].includes(s.status), `${year}/${scenario}/${s.id}`);
      if (s.queueUnstable) assert.equal(queueText(s),'Перегрузка');
    }
  }
});
test('Аудит: очередь сортируется численно, перегрузка выше конечного ожидания', () => {
  const rows=[{id:'C',queueUnstable:false,wait:20.6,rho:.9},{id:'B',queueUnstable:true,wait:120,rho:1.1},{id:'A',queueUnstable:true,wait:120,rho:1.2}];
  assert.deepEqual(rows.sort(attentionCompare).map(r=>r.id),['A','B','C']);
});
test('Аудит: округление не выводит отрицательный ноль и не прячет малые суммы высокой точности', () => {
  assert.equal(num(-.004,2),'0,00'); assert.equal(int(-.1),'0');
  assert.equal(mln(-.1),'0 млн ₽'); assert.equal(sgn(-.1),'0'); assert.equal(pct(-.0001),'0%');
  assert.equal(sgn(-.1,1),'−0,1'); assert.equal(sgn(.1,1),'+0,1'); assert.equal(mln(Infinity),'—');
});
test('Аудит: ссылка восстанавливает сценарий, станцию, раздел, масштаб спроса и план', () => {
  const state={year:2035,scenario:'high',selectedStation:'ZIL-03',view:'research',activeLayer:'grid',panelTab:'economics',decisions:[{station:'ZIL-01',year:2027,options:['storage','expansion']}]};
  const url=writeURL('https://example.com/polygon3d.html?demo=1#anchor',state,1.5);
  const result=readURL(url.search);
  for (const key of Object.keys(state)) assert.deepEqual(result.patch[key],state[key]);
  assert.equal(result.demandScale,1.5); assert.equal(url.hash,'#anchor'); assert.equal(url.searchParams.get('demo'),'1');
});
test('Аудит: некорректные значения URL и несовместимые пакеты отбрасываются', () => {
  const p=new URLSearchParams({y:'3000',s:'__proto__',st:'<script>',sec:'99',scale:'Infinity',plan:JSON.stringify([['ZIL-01',2027,['pilot','expansion']],['ZIL-01',2027,['__proto__']],['ZIL-01',2027,['pilot']],['ZIL-01',2027,['storage']]])});
  const result=readURL(p);
  assert.equal(result.patch.year,2026); assert.equal(result.patch.scenario,'base'); assert.equal(result.patch.selectedStation,null);
  assert.equal(result.patch.view,'map'); assert.equal(result.demandScale,1);
  assert.deepEqual(result.patch.decisions,[{station:'ZIL-01',year:2027,options:['pilot']}]);
});
test('Аудит: выгодный пример использует исходную экономику, базовое состояние вправе не строить', () => {
  const ds=fixture(1.5), r=recommend(ds,{station:'ZIL-01',year:2027,baseline:[]});
  assert.deepEqual(r.best.options,['pilot']); assert.ok(r.best.expNpv>0); assert.ok(r.best.score>0); assert.ok(r.best.byScenario.high.npv>0);
  const decisions=[{station:'ZIL-01',year:2027,options:r.best.options}];
  const server=calculateRequest({dataset:ds,year:2030,scenario:'high',decisions});
  assert.ok(Math.abs(server.economics.npv-economics(ds,'high',decisions).npv)<1e-6);
  assert.deepEqual(recommend(fixture(),{station:'ZIL-01',year:2027,baseline:[]}).best.options,['none']);
});
test('Аудит: стресс спроса выявляет дефицит узла без изменения исходных лимитов', () => {
  const ds=fixture(2), sim=evaluate(ds,{year:2035,scenario:'high',decisions:[]});
  assert.ok(sim.totals.constrainedNodes>0); assert.equal(sim.totals.gridViolations,0);
  assert.deepEqual(ds.nodes.map(n=>n.headroom),NODE_DEFS.map(n=>n.headroom));
});
test('Аудит: ленивый реестр и ядро в точности сохраняют все исходные исследовательские данные', () => {
  const copy=structuredClone(core);delete copy.city.stationCount;copy.city.stations=registry;
  assert.deepEqual(copy,RESEARCH); assert.equal(core.city.holdoutCheck.AUC,.407);
});
test('Аудит: бинарная геометрия побитно совпадает с Float32 исходной JSON-модели', () => {
  const base=new URL('../assets/',import.meta.url);
  const original=JSON.parse(readFileSync(new URL('charger-model.json',base))), packed=JSON.parse(readFileSync(new URL('charger-mesh.json',base))), bytes=readFileSync(new URL('charger-mesh.bin',base));
  assert.deepEqual(brotliDecompressSync(readFileSync(new URL('charger-mesh.bin.br',base))),bytes);
  assert.equal(packed.meshes.length,original.meshes.length);
  packed.meshes.forEach((mesh,i)=>{
    assert.equal(mesh.name,original.meshes[i].name);assert.deepEqual(mesh.color,original.meshes[i].color);
    for (const field of ['positions','normals']) {
      const info=mesh[field], expected=new Float32Array(original.meshes[i][field]);
      assert.equal(info.length,expected.length);
      for(let j=0;j<expected.length;j++) assert.equal(bytes.readFloatLE(info.byteOffset+j*4),expected[j]);
    }
  });
});
