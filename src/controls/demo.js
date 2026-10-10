// Вводная демонстрация (8 сцен) — автоматически запускается при старте; после неё пользователь получает управление.
import { state, setState } from '../state.js';
import * as A from '../actions.js';
import { dataset as ds } from '../data/dataset.js';

const wait = (ms) => new Promise(r => setTimeout(r, ms));
const $ = (s) => document.querySelector(s);

export function createDemo(twin) {
  let running = false, aborted = false, saved;
  const app = document.getElementById('app');
  const cap = (title, sub, tag) => { const c = $('#caption'); c.hidden = false; c.innerHTML = `<div class="cap"><b>${title}</b>${sub ? `<span>${sub}</span>` : ''}${tag ? `<i>${tag}</i>` : ''}</div>`; };
  const hideCap = () => { $('#caption').hidden = true; };
  const check = () => { if (aborted) throw new Error('skip'); };

  async function run() {
    saved = { decisions: structuredClone(state.decisions), year: state.year, scenario: state.scenario };
    running = true; aborted = false;
    app.classList.add('demoing');
    const sk = document.createElement('button'); sk.className = 'btn skip'; sk.textContent = 'Пропустить · Esc'; sk.onclick = () => skip(); $('#ui').appendChild(sk);
    const it = document.createElement('div'); it.className = 'intro-title'; it.innerHTML = `<div class="it"><small>Международные транспортные проектные соревнования · Проблема № 03</small><h1>ПЛАН ЗАРЯДНОЙ СЕТИ</h1><p>Инвестиционное планирование зарядной инфраструктуры</p><div class="q">Как развивать зарядную сеть?</div></div>`;
    document.body.appendChild(it);
    setState({ demo: true, year: 2026, activeLayer: 'city', decisions: [], selectedStation: null, selectedNode: null, selectedFlow: null, view: 'map', walkMode: false }, { sync: true });
    const o = twin.orbit; const hero = ds.byId['ZIL-01'];
    // полёт камеры + минимальная выдержка сцены; ждём завершения полёта (не таймера), чтобы кадры и подписи не расходились
    const fly = async (to, dur, hold = 0) => { await Promise.all([o.flyTo(to, dur), wait(hold)]); check(); };
    try {
      // 1. Общий вид
      o.snap({ tx: 500, ty: 0, tz: 200, dist: 5200, az: -0.9, pol: 0.5 });
      await wait(400);
      await fly({ tx: 640, ty: 0, tz: 260, dist: 2500, az: -0.55, pol: 0.86 }, 8.5, 1200);
      it.style.opacity = 0;
      // 2. Приближение к району с высокой нагрузкой
      cap('Автозаводская · ЗИЛ', 'Реальная география, сценарные параметры спроса', 'Сцена 2 / 8');
      await fly({ tx: hero.pos.x, ty: 0, tz: hero.pos.z, dist: 900, az: -0.2, pol: 0.95 }, 3.6, 400);
      // 3. Потоки спроса
      A.setLayer('demand'); cap('Транспортный спрос', 'Личные электромобили, такси, корпоративный транспорт и коммунальная техника', 'ТРАНСПОРТНЫЙ СПРОС');
      await fly({ tx: hero.pos.x - 40, ty: 0, tz: hero.pos.z + 30, dist: 620, az: 0.3, pol: 0.9 }, 3.4, 900);
      // 4. Станция с загрузкой 91%
      A.setLayer('city'); setState({ selectedStation: 'ZIL-01', panelTab: 'passport' });
      cap('Модельная ЭЗС ZIL-01', 'Очередь в пик · спрос выше ёмкости станции', 'ЗАРЯДНАЯ СЕТЬ');
      await fly({ tx: hero.pos.x, ty: 0, tz: hero.pos.z, dist: 150, az: 0.9, pol: 0.95 }, 3.4, 1200);
      // 5. Под землю
      setState({ year: 2030 }); A.setLayer('grid');
      cap('ОГРАНИЧЕНИЕ СЕТИ', 'Сравнение запрашиваемой мощности с условным лимитом', 'ПРОВЕРКА МОЩНОСТИ');
      await fly({ tx: hero.pos.x - 40, ty: -10, tz: hero.pos.z + 40, dist: 260, az: 0.5, pol: 1.32 }, 3.6, 1500);
      // 6. Варианты
      setState({ year: 2027 }); A.setLayer('investment');
      cap('Восемь вариантов', 'РАСШИРЕНИЕ · НАКОПИТЕЛЬ · УСИЛЕНИЕ СЕТИ · НОВАЯ СТАНЦИЯ · ПОДГОТОВКА …', 'ВАРИАНТЫ РАЗВИТИЯ');
      await fly({ tx: hero.pos.x, ty: 0, tz: hero.pos.z, dist: 300, az: 0.2, pol: 1.0 }, 3.2, 300);
      for (const id of ['expansion', 'storage', 'grid_upgrade', 'new_station', 'defer']) { A.hoverOption(id); await wait(520); check(); }
      A.hoverOption(null);
      // 7. Выбор РАСШИРЕНИЕ + НАКОПИТЕЛЬ
      cap('Пример: РАСШИРЕНИЕ + НАКОПИТЕЛЬ', 'Поэтапно: посты и накопитель — без немедленного усиления сети', 'ПРИМЕР РЕШЕНИЯ 2027');
      A.setPackage('ZIL-01', 2027, ['expansion']); await wait(900); check();
      A.setPackage('ZIL-01', 2027, ['expansion', 'storage']); setState({ panelTab: 'decision' });
      await fly({ tx: hero.pos.x + 10, ty: 0, tz: hero.pos.z, dist: 130, az: 0.6, pol: 0.9 }, 3.2, 1600);
      // 8. 2027 → 2030 → 2035
      A.setLayer('city');
      cap('2030', 'Проверяем эффект введённых объектов', 'ПЛАН ПО ГОДАМ'); A.setYear(2030);
      await fly({ tx: hero.pos.x + 60, ty: 0, tz: hero.pos.z, dist: 520, az: 0.4, pol: 0.95 }, 3.0, 1800);
      cap('2035', 'Сравниваем результат сценарного плана', 'ПЛАН ПО ГОДАМ'); A.setYear(2035);
      const rp = (await import('../simulation/policies.js')).recommendedPlan(ds, state.scenario);
      setState({ decisions: rp });
      await fly({ tx: hero.pos.x + 200, ty: 0, tz: hero.pos.z - 60, dist: 1300, az: 0.2, pol: 0.95 }, 3.6, 2000);
    } catch (e) { if (e.message !== 'skip') console.error(e); }
    await finish(sk, it);
  }
  async function finish(sk, it) {
    hideCap(); sk.remove(); it.remove(); A.hoverOption(null);
    setState({ ...saved, activeLayer: 'city', selectedStation: null, selectedNode: null, panelTab: 'passport', investmentOption: null, focusOption: null, demo: false }, { sync: true });
    app.classList.remove('demoing');
    twin.orbit.flyTo({ tx: 760, ty: 0, tz: 250, dist: 2100, az: -0.55, pol: 0.9 }, 2.2);
    running = false; aborted = false;
    A.ctx.toast('Управление ваше: выберите ЭЗС ZIL-01 или нажмите 6 — войти в город', 4500);
  }
  function skip() { if (running) aborted = true; }
  return { start: () => { if (!running) run(); }, skip, get running() { return running; } };
}
