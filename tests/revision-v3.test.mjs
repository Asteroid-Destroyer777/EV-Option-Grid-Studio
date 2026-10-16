import test from 'node:test';import assert from 'node:assert/strict';
import {createCalculationPresentation} from '../src/district/calculation-presentation.js';
import {labelCandidates} from '../src/district/map-labels.js';
function mockElement(){const children=new Map();return {hidden:true,classList:{add(){},remove(){}},querySelector(s){if(!children.has(s))children.set(s,{});return children.get(s);}};}
test('Бобр остаётся 7 секунд, расчёт уже готов; отмена убирает таймер',async()=>{let time=100,timer,delay;const el=mockElement(),p=createCalculationPresentation(el,{now:()=>time,setTimer:(fn,ms)=>{timer=fn;delay=ms;return 1;},clearTimer:()=>{timer=null;}});p.show();time=170;const done=p.finish();assert.equal(el.hidden,false);assert.equal(delay,6930);assert.equal(el.querySelector('#cancel-calculation').disabled,true);timer();await done;assert.equal(el.hidden,true);p.show();const second=p.finish();p.cancel();await second;assert.equal(timer,null);assert.equal(el.hidden,true);});
test('Медленный расчёт не получает ещё семь лишних секунд',async()=>{let time=0,delay,timer;const p=createCalculationPresentation(mockElement(),{now:()=>time,setTimer:(fn,ms)=>{timer=fn;delay=ms;return 1;},clearTimer:()=>{}});p.show();time=8000;const done=p.finish();assert.equal(delay,0);timer();await done;});
test('Подписи метро сохраняют тип; одноимённые метро и МЦК не объединяются',()=>{const index=[{id:1,name:'Автозаводская',lat:55.7,lon:37.65,railway:'station',subway:true},{id:2,name:'Автозаводская',lat:55.705,lon:37.66,railway:'station',subway:false}];const rows=labelCandidates([{id:1,lat:55.7,lon:37.65,tags:{railway:'station',name:'Автозаводская'}}],index,14);assert.equal(rows.length,2);assert.equal(rows.find(x=>x.subway).lat,55.7);});
test('Улицы скрыты в мелком масштабе, подписи не меняют объекты модели',()=>{const raw=[{id:1,center:{lat:55.7,lon:37.6},tags:{highway:'primary',name:'Автозаводская улица'}}],before=JSON.stringify(raw);assert.equal(labelCandidates(raw,[],12).length,0);assert.equal(labelCandidates(raw,[],14)[0].kind,'road');assert.equal(JSON.stringify(raw),before);});

test('Новый поиск после загрузки данных получает собственные семь секунд',async()=>{let time=0,timer,delay;const p=createCalculationPresentation(mockElement(),{now:()=>time,setTimer:(fn,ms)=>{timer=fn;delay=ms;return 1;},clearTimer:()=>{timer=null;}});p.show();const loaded=p.finish();time=6500;p.show();await loaded;const ranked=p.finish();assert.equal(delay,7000);timer();await ranked;});

test('Пропуск заставки открывает только готовый расчёт и сохраняет выбор',async()=>{
  let timer,delay,shown=0;const el=mockElement(),p=createCalculationPresentation(el,{now:()=>0,setTimer:(fn,ms)=>{timer=fn;delay=ms;return 1;},clearTimer:()=>{timer=null;}});
  p.show();p.skip();assert.equal(el.hidden,false);const done=p.finish(()=>shown++);assert.equal(delay,0);timer();await done;assert.equal(shown,1);
  p.show();const again=p.finish(()=>shown++);assert.equal(delay,0);p.skip();await again;assert.equal(shown,2);assert.equal(timer,null);
  p.show();const cancelled=p.finish(()=>shown++);p.cancel();await cancelled;p.skip();assert.equal(shown,2);
});
