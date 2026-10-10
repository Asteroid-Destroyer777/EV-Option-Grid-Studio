import { evaluate } from './engine.js';
import { economics } from './economics.js';
import { MODEL, OPTIONS, SCENARIOS, YEAR_MIN, YEAR_MAX } from './params.js';
import { RESEARCH } from '../data/research-bundle.js';

const check = (ok, message) => { if (!ok) throw new Error(message); };
const number = (v, min, max) => Number.isFinite(v) && v >= min && v <= max;
const identifier = v => typeof v === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(v) && !['constructor','prototype','__proto__'].includes(v);
export function calculateRequest(input) {
  check(input && typeof input === 'object', 'Ожидается объект запроса.');
  const { dataset: ds, year, scenario, decisions = [] } = input;
  check(Number.isInteger(year) && number(year, YEAR_MIN, YEAR_MAX), 'Год вне горизонта 2026–2035.');
  check(Object.hasOwn(SCENARIOS, scenario), 'Неизвестный сценарий.');
  check(ds && Array.isArray(ds.stations) && ds.stations.length > 0 && ds.stations.length <= 50, 'Нужно от 1 до 50 станций.');
  check(Array.isArray(ds.nodes) && ds.nodes.length > 0 && ds.nodes.length <= 50, 'Нужно от 1 до 50 узлов.');
  const ids = new Set(), nodes = new Set();
  for (const n of ds.nodes) {
    check(identifier(n.id) && !nodes.has(n.id) && number(n.headroom, 0, 100), 'Некорректный узел или повтор идентификатора.');
    if (n.headroomByHour) check(n.headroomByHour.length === 24 && n.headroomByHour.every(v => number(v, 0, 100)), 'Нужно 24 неотрицательных значения мощности.');
    nodes.add(n.id);
  }
  for (const s of ds.stations) {
    check(identifier(s.id) && !ids.has(s.id) && nodes.has(s.node), 'Некорректная станция или ссылка на узел.');
    check(Number.isInteger(s.posts) && number(s.posts, 0, 200) && number(s.sessions, 0, 1e6) && number(s.avgMin, 1, 1440) && number(s.sens, 0, 10), 'Неверные параметры станции.');
    check(s.pos && number(s.pos.x, -1e7, 1e7) && number(s.pos.z, -1e7, 1e7), 'Неверные координаты.');
    if (s.site) check(number(s.site.x, -1e7, 1e7) && number(s.site.z, -1e7, 1e7), 'Неверные координаты площадки.');
    check(s.mix && Object.values(s.mix).every(v => number(v, 0, 1)), 'Доли транспорта должны быть от 0 до 1.');
    ids.add(s.id);
  }
  check(Array.isArray(decisions) && decisions.length <= 40, 'Не более 40 шагов плана.');
  for (const d of decisions) {
    check(ids.has(d.station) && Number.isInteger(d.year) && number(d.year, YEAR_MIN, YEAR_MAX), 'Некорректный шаг плана.');
    check(Array.isArray(d.options) && d.options.length <= 5 && new Set(d.options).size === d.options.length && d.options.every(o => Object.hasOwn(OPTIONS, o)), 'Неизвестные или повторяющиеся действия.');
    check(d.options.length <= 1 || !d.options.some(o => ['none', 'pilot', 'defer'].includes(o)), 'Пилот, подготовка и отказ задаются отдельными шагами.');
  }
  check(!ds.demandModel || ds.demandModel === 'huff-zil-v1', 'Неизвестная модель спроса.');
  check(ds.demandScale == null || number(ds.demandScale, 0.25, 2), 'Множитель спроса от 0,25 до 2.');
  const clean = { demandModel:ds.demandModel, demandScale:ds.demandScale, stations: ds.stations, nodes: ds.nodes, byId: Object.fromEntries(ds.stations.map(s => [s.id, s])) };
  return { modelVersion: '0.3.0', assumptions: MODEL, options: OPTIONS, year, scenario, decisions,
    researchVersion: RESEARCH.version, sourceFiles: RESEARCH.sourceFiles,
    provenance: 'Сценарные параметры, не измерения оператора',
    simulation: evaluate(clean, { year, scenario, decisions }), economics: economics(clean, scenario, decisions, []) };
}
