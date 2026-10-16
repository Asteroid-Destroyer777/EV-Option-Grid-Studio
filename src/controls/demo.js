import {createPlanJob} from '../simulation/plan-job.js';
import {simulationDataset} from '../simulation/input.js';
// Обзор территории: кадры продолжаются по кнопке; автопоказ включается отдельно.
import { state, setState } from '../state.js';
import * as A from '../actions.js';
import { dataset as ds } from '../data/dataset.js';

const wait = (ms) => new Promise(r => setTimeout(r, ms));
const $ = (s) => document.querySelector(s);

export function createDemo(twin) {
  let running = false, aborted = false, saved, advance=null, auto=false, holdTimer=null, token=0, ending=false, active=null, planJob=null, background=[],returnFocus=null;
  const app = document.getElementById('app');
  const cap = (title, sub, tag) => { const c = $('#caption'); c.hidden = false; c.innerHTML = `<div class="cap"><b>${title}</b>${sub ? `<span>${sub}</span>` : ''}${tag ? `<i>${tag}</i>` : ''}</div>`; };
  const hideCap = () => { $('#caption').hidden = true; };
  const hold=()=>new Promise(resolve=>{advance=()=>{clearTimeout(holdTimer);holdTimer=null;advance=null;resolve();};if(auto)holdTimer=setTimeout(()=>advance?.(),9000);});

  async function run() {
    const runToken=++token;ending=false;const check=()=>{if(aborted||runToken!==token)throw new Error('skip');};
    saved = Object.fromEntries(['decisions','year','scenario','activeLayer','selectedStation','selectedNode','selectedFlow','selectedSite','panelTab','panelHidden','view','investmentOption','focusOption','metroFocus'].map(key=>[key,structuredClone(state[key])]));
    returnFocus=document.activeElement;
    running = true; aborted = false;auto=false;
    app.classList.add('demoing');document.body.classList.add('tour-running');
    const sk = document.createElement('button'); sk.className = 'btn skip'; sk.textContent = 'Пропустить · Esc'; sk.onclick = () => skip(); $('#ui').appendChild(sk);
    const it = document.createElement('div'); it.className = 'tour-panel';
    document.body.appendChild(it);it.appendChild($('#caption'));
    cap('План зарядной сети', 'От городской территории к проверяемому инвестиционному сценарию', 'Сцена 1 · Обзор территории');
    setState({ demo: true, metroFocus:null, year: 2026, activeLayer: 'city', decisions: [], selectedStation: null, selectedNode: null, selectedFlow: null, view: 'map', walkMode: false }, { sync: true });
    const o = twin.orbit; const hero = ds.byId['ZIL-01'];
    // полёт камеры + минимальная выдержка сцены; ждём завершения полёта (не таймера), чтобы кадры и подписи не расходились
    const controls=document.createElement('div');controls.className='demo-controls';controls.innerHTML='<button type="button" id="tour-next">Следующий кадр →</button><button type="button" id="tour-auto">Автопоказ: выкл</button>';it.appendChild(controls);controls.querySelector('#tour-next').disabled=true;controls.querySelector('#tour-next').onclick=()=>advance?.();controls.querySelector('#tour-auto').onclick=e=>{auto=!auto;e.target.textContent=auto?'Автопоказ: вкл':'Автопоказ: выкл';clearTimeout(holdTimer);holdTimer=null;if(auto&&advance)holdTimer=setTimeout(()=>advance?.(),9000);};
    controls.querySelector('#tour-auto').focus({preventScroll:true});
    background=[...document.querySelectorAll('#stage,#rail,#topbar,#chain,#panel,#dock,#guide,#legend3d,#nav-toggle,#restore-panel,#beaver-launch')].map(el=>({el,inert:el.inert}));
    for(const {el} of background)el.inert=true;
    active={sk,it,controls,runToken};
    const fly = async (to,dur) => {check();controls.querySelector('#tour-next').disabled=true;await o.flyTo(to,Math.max(dur,4));check();controls.querySelector('#tour-next').disabled=false;await hold();controls.querySelector('#tour-next').disabled=true;check();};
    try {
      // 1. Общий вид
      o.snap({ tx: 500, ty: 0, tz: 200, dist: 5200, az: -0.9, pol: 0.5 });
      await wait(400);
      await fly({ tx: 640, ty: 0, tz: 260, dist: 2500, az: -0.55, pol: 0.86 }, 8.5, 1200);

      // 2. Приближение к району с высокой нагрузкой
      cap('Автозаводская · ЗИЛ', 'Реальная география, сценарные параметры спроса', 'Сцена 2 / 8');
      await fly({ tx: hero.pos.x, ty: 0, tz: hero.pos.z, dist: 900, az: -0.2, pol: 0.95 }, 3.6, 400);
      // 3. Потоки спроса
      A.setLayer('demand'); cap('Транспортный спрос', 'Личные электромобили, корпоративный транспорт и транзитные автомобили', 'Транспортный спрос');
      await fly({ tx: hero.pos.x - 40, ty: 0, tz: hero.pos.z + 30, dist: 620, az: 0.3, pol: 0.9 }, 3.4, 900);
      // 4. Фактическое значение текущего модельного сценария
      A.setLayer('city'); setState({ selectedStation: 'ZIL-01', panelTab: 'passport' });
      const station=state.networkState?.byId['ZIL-01'];const load=station?Math.round(station.rho*100)+'%':'нет данных';cap('Модельная ЭЗС ZIL-01', `Пиковая нагрузка ${load} · средняя загрузка и мощность доступны в паспорте`, 'Зарядная сеть');
      await fly({ tx: hero.pos.x, ty: 0, tz: hero.pos.z, dist: 150, az: 0.9, pol: 0.95 }, 3.4, 1200);
      // 5. Под землю
      setState({ year: 2030 }); A.setLayer('grid');
      cap('Ограничение сети', 'Сравнение запрашиваемой мощности с условным лимитом', 'Проверка мощности');
      await fly({ tx: hero.pos.x - 40, ty: -10, tz: hero.pos.z + 40, dist: 260, az: 0.5, pol: 1.32 }, 3.6, 1500);
      // 6. Варианты
      setState({ year: 2027 }); A.setLayer('investment');
      cap('Восемь вариантов', 'Расширение · накопитель · усиление сети · новая станция · подготовка', 'Варианты развития');
      await fly({ tx: hero.pos.x, ty: 0, tz: hero.pos.z, dist: 300, az: 0.2, pol: 1.0 }, 3.2, 300);
      for (const id of ['expansion', 'storage', 'grid_upgrade', 'new_station', 'defer']) { A.hoverOption(id); await wait(1300); check(); }
      A.hoverOption(null);
      // 7. Выбор РАСШИРЕНИЕ + НАКОПИТЕЛЬ
      cap('Пример: расширение и накопитель', 'Поэтапно: посты и накопитель — без немедленного усиления сети', 'Пример решения 2027');
      A.setPackage('ZIL-01', 2027, ['expansion']); await wait(900); check();
      A.setPackage('ZIL-01', 2027, ['expansion', 'storage']); setState({ panelTab: 'decision' });
      await fly({ tx: hero.pos.x + 10, ty: 0, tz: hero.pos.z, dist: 130, az: 0.6, pol: 0.9 }, 3.2, 1600);
      // 8. 2027 → 2030 → 2035
      A.setLayer('city');
      cap('2030', 'Проверяем эффект введённых объектов', 'План по годам'); A.setYear(2030);
      await fly({ tx: hero.pos.x + 60, ty: 0, tz: hero.pos.z, dist: 520, az: 0.4, pol: 0.95 }, 3.0, 1800);
      cap('2035', 'Сравниваем результат сценарного плана', 'План по годам'); A.setYear(2035);
      planJob=createPlanJob({dataset:simulationDataset(ds),scenario:state.scenario});
      const rp=await planJob.promise;planJob=null;check();
      setState({ decisions: rp });
      await fly({ tx: hero.pos.x + 200, ty: 0, tz: hero.pos.z - 60, dist: 1300, az: 0.2, pol: 0.95 }, 3.6, 2000);
    } catch (e) { if (e.message !== 'skip' && e.name!=='AbortError') {console.error(e);A.ctx.toast('Автопоказ остановлен: '+e.message,6000);} }
    controls.remove();await finish(sk, it,runToken);
  }
  async function finish(sk, it,runToken) {
    if(runToken!==token||ending)return;ending=true;planJob?.cancel();planJob=null;clearTimeout(holdTimer);holdTimer=null;active?.controls.remove();active=null;
    hideCap(); $('#ui').appendChild($('#caption')); sk.remove(); it.remove(); A.hoverOption(null);
    for(const {el,inert} of background)el.inert=inert;background=[];
    setState({ ...saved, hoverOption:null, demo: false }, { sync: true });
    app.classList.remove('demoing');document.body.classList.remove('tour-running');
    twin.orbit.flyTo({ tx: 760, ty: 0, tz: 250, dist: 2100, az: -0.55, pol: 0.9 }, 2.2);
    running = false; aborted = true;
    if(saved.view==='map'&&returnFocus?.isConnected&&!returnFocus.closest('[inert]'))returnFocus.focus({preventScroll:true});
    A.ctx.toast('Управление ваше: выберите ЭЗС ZIL-01 или нажмите 6 — войти в город', 4500);
  }
  function skip() { if (running) {aborted = true;advance?.();twin.orbit.flyTo({...twin.orbit.cur},0);if(active)finish(active.sk,active.it,active.runToken);} }
  return { start: () => { if (!running) run(); }, skip, get running() { return running; } };
}
