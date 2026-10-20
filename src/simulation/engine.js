// Прединвестиционная модель: 24 часовых интервала типичного повторяющегося дня.
// Сессии/месяц -> почасовой спрос пяти сегментов -> посты -> общий узел -> переток.
// Это баланс активной энергии и пропускной способности, НЕ расчёт режимов электросети.
import { MODEL, OPTIONS, USER_TYPES, growthAt, ALL_YEARS } from './params.js';
import { allocateSpatial } from './spatial.js';

const EPS = 1e-9;
const TYPES = Object.keys(USER_TYPES);
const sum = a => a.reduce((s, v) => s + v, 0);
const nonnegative = v => Number.isFinite(v) ? Math.max(0, v) : 0;

/** Подготовка площадки применяется ровно к одному последующему капитальному шагу. */
export function collectAssets(decisions = [], year) {
  const built = [], pending = [], credits = new Map();
  const ordered = decisions.map((d, index) => ({ ...d, index })).sort((a, b) => a.year - b.year || a.index - b.index);
  for (const d of ordered) {
    if (!Number.isInteger(d.year)) throw new Error('Год решения должен быть целым числом.');
    for (const oid of [...new Set(d.options)]) {
      if (oid === 'none') continue;
      const o = OPTIONS[oid];
      if (!o) throw new Error(`Неизвестная опция: ${oid}`);
      const credit = credits.get(d.station);
      const prepared = ['new_station', 'expansion'].includes(oid) && credit != null && credit < d.year;
      if (prepared) credits.delete(d.station);
      const lead = Math.max(0, o.lead - (prepared ? OPTIONS.defer.nextLeadCut : 0));
      const item = { station: d.station, option: oid, decisionYear: d.year, effYear: d.year + lead, prepared, capex: o.capex * (prepared ? 1 - OPTIONS.defer.nextDiscount : 1) };
      if (oid === 'defer') credits.set(d.station, d.year);
      if (d.year <= year) (item.effYear <= year ? built : pending).push(item);
    }
  }
  return { built, pending };
}

/** Erlang C для M/M/c: приближённая стационарная оценка, не наблюдение очереди.
 * При rho>=1 конечной стационарной очереди НЕТ: wait — лишь предел для UI. */
export function queueMetrics(rho, servers, serviceMinutes) {
  const c = Math.max(0, Math.floor(servers));
  const r = nonnegative(rho);
  if (r === 0) return { wait: 0, cars: 0, stable: true, waitCapped: false, waitProbability: 0 };
  if (!c || r >= 1 - EPS) return { wait: MODEL.maxDisplayedWaitMin, cars: c ? c * 2 : 0, stable: false, waitCapped: true, waitProbability: 1 };
  const offered = c * r;
  let B = 1;
  for (let k = 1; k <= c; k++) B = offered * B / (k + offered * B);
  const C = B / (1 - r + r * B);
  const raw = C * serviceMinutes / (c * (1 - r));
  const arrivalPerMinute = c * r / serviceMinutes;
  return { wait: Math.min(MODEL.maxDisplayedWaitMin, raw), cars: raw * arrivalPerMinute, stable: true, waitCapped: raw > MODEL.maxDisplayedWaitMin, waitProbability: C };
}

/** Профиль сегмента нормирован: сумма 24 долей = 1, изменение пика не создаёт спрос. */
export function profileFor(type) {
  const t = USER_TYPES[type];
  if (!t) throw new Error(`Неизвестный сегмент: ${type}`);
  const raw = Array.from({ length: 24 }, (_, h) => {
    const middle = h + 0.5;
    return t.base + (t.peakHours.some(([a, b]) => middle >= a && middle < b) ? 1 : 0);
  });
  const total = sum(raw);
  return raw.map(x => x / total);
}
const PROFILES = Object.fromEntries(TYPES.map(t => [t, profileFor(t)]));

function demandProfile(def) {
  const total = sum(TYPES.map(t => nonnegative(def.mix?.[t])));
  const mix = Object.fromEntries(TYPES.map(t => [t, total ? nonnegative(def.mix?.[t]) / total : (t === 'private_ev' ? 1 : 0)]));
  return { mix, shares: Array.from({ length: 24 }, (_, h) => sum(TYPES.map(t => mix[t] * PROFILES[t][h]))) };
}

// Усреднённый день из сценарной годовой выработки. В тёмное время PV строго = 0.
const SOLAR_SHAPE = Array.from({ length: 24 }, (_, h) => Math.max(0, Math.sin(Math.PI * (h + 0.5 - 7) / 12)) * (h >= 7 && h < 19 ? 1 : 0));
const SOLAR_TOTAL = sum(SOLAR_SHAPE);

function stateFor(ds, year, scenario, decisions) {
  const F = growthAt(scenario, year), { built, pending } = collectAssets(decisions, year);
  const defs = ds.byId || Object.fromEntries(ds.stations.map(s => [s.id, s]));
  const counts = {}, addPosts = {}, newDefs = [], next = {};
  const nodes = Object.fromEntries(ds.nodes.map(n => [n.id, { id: n.id, def: n, base: nonnegative(n.headroom), H: nonnegative(n.headroom), storage: 0, upgrade: 0, gen: 0, storageMWh: 0, desired: 0, used: 0, util: 0, usedUtil: 0, status: 'ok', stations: [], hourly: [] }]));
  for (const a of built) {
    const d = defs[a.station];
    if (!d || !nodes[d.node]) throw new Error(`Неизвестная станция или узел: ${a.station}`);
    const o = OPTIONS[a.option], n = nodes[d.node];
    (counts[a.station] ||= {})[a.option] = (counts[a.station][a.option] || 0) + 1;
    if (['expansion', 'pilot'].includes(a.option)) addPosts[a.station] = (addPosts[a.station] || 0) + o.addPosts;
    if (a.option === 'storage') { n.storage += o.peakMW; n.storageMWh += o.capacityMWh * o.usableFraction; }
    if (a.option === 'grid_upgrade') { n.upgrade += o.addMW; n.H += o.addMW; }
    if (a.option === 'local_gen') n.gen += o.peakMW;
    if (a.option === 'new_station') {
      const i = next[a.station] = (next[a.station] || 0) + 1;
      newDefs.push({ ...d, id: `${a.station}-N${i > 1 ? i : ''}`, anchor: a.station, posts: o.addPosts, sessions: 0, pos: d.site ? { x: d.site.x, z: d.site.z } : d.pos, isNew: true, effYear: a.effYear });
    }
  }
  const stations = [...ds.stations, ...newDefs].map(def => {
    const posts = Math.max(0, Math.floor(def.posts + (addPosts[def.id] || 0)));
    const growth = Math.max(0, 1 + (F - 1) * (def.sens ?? 1));
    const { mix, shares } = demandProfile(def);
    const serviceHours = Math.max((ds.demandModel === 'huff-zil-v1' ? MODEL.kwhPerSession / MODEL.peakKWPerBusyPost * 60 : def.avgMin || 48) / 60, MODEL.kwhPerSession / MODEL.postKW);
    const capHourly = posts / serviceHours;
    const D0 = nonnegative(def.sessions) * growth;
    const s = { id: def.id, def, isNew: !!def.isNew, anchor: def.isNew ? def.anchor : null, node: def.node, posts, basePosts: def.posts,
      x: def.pos?.x ?? 0, z: def.pos?.z ?? 0, growth, mix, shares, serviceHours, capHourly,
      D0, D: D0, capPosts: capHourly * 24 * MODEL.daysPerMonth, capEff: 0, effPosts: posts,
      served: 0, unserved: 0, spillIn: 0, spillOut: 0, lost: 0, load: 0, rho: 0, wait: 0, queueCars: 0,
      queueRisk: 'low', status: 'low', limiter: 'none', built: counts[def.id] || {}, prepared: !!counts[def.id]?.defer,
      pending: pending.filter(a => a.station === def.id), hourly: [], queueUnstable: false, waitCapped: false, powerMW: 0 };
    if (!nodes[s.node]) throw new Error(`Нет узла ${s.node} для ${s.id}`);
    nodes[s.node].stations.push(s.id);
    s.dailyDemand = shares.map(v => D0 * v / MODEL.daysPerMonth);
    return s;
  });
  const byId = Object.fromEntries(stations.map(s => [s.id, s]));
  // Новые ЭЗС перераспределяют существующий спрос; индуцированного спроса нет.
  let spatial = null;
  if (ds.demandModel === 'huff-zil-v1') {
    const allocation = allocateSpatial(stations, ds.attractivenessExponent);
    const factor = F * (ds.demandScale ?? 1);
    spatial = { total: allocation.total * factor, own: allocation.own * factor, competitors: allocation.competitors * factor, outside: allocation.outside * factor };
    for (const s of stations) {
      const a = allocation.byId[s.id];
      s.mix = Object.fromEntries(TYPES.map(t => [t, a.sessions ? (a.segments[t] || 0) / a.sessions : 0]));
      s.shares = Array.from({length:24}, (_,h)=>sum(TYPES.map(t=>s.mix[t]*PROFILES[t][h])));
      s.dailyDemand = s.shares.map(v => a.sessions * factor * v / MODEL.daysPerMonth);
    }
  }
  for (const n of stations.filter(s => s.isNew && !spatial)) {
    for (const s of stations.filter(s => !s.isNew && (s.def.serviceClass || 'public') === (n.def.serviceClass || 'public'))) {
      const share = 0.14 * Math.exp(-Math.hypot(s.x - n.x, s.z - n.z) / 320);
      if (share < 0.004) continue;
      for (let h = 0; h < 24; h++) { const moved = s.dailyDemand[h] * share; s.dailyDemand[h] -= moved; n.dailyDemand[h] += moved; }
    }
  }
  for (const s of stations) { s.D0 = sum(s.dailyDemand) * MODEL.daysPerMonth; s.D = s.D0; }
  return { year, scenario, F, stations, byId, nodes, built, pending, spatial };
}

/** Один день с заданным SOC в начале. Выход позволяет проверить энергобаланс. */
function day(st, startingSOC, record) {
  const { stations, byId, nodes } = st;
  const soc = { ...startingSOC };
  const energy = MODEL.kwhPerSession / 1000; // МВт·ч / сессию; часовой шаг => МВт
  for (let h = 0; h < 24; h++) {
    const rows = Object.fromEntries(stations.map(s => [s.id, { hour: h, arrivals: s.dailyDemand[h], served: 0, spillIn: 0, spillOut: 0, lost: 0, capacity: s.capHourly }]));
    const nodeHour = {};
    for (const n of Object.values(nodes)) {
      const gridLimitMW = nonnegative(n.def.headroomByHour?.[h] ?? n.base) + n.upgrade;
      const solarMW = n.gen * OPTIONS.local_gen.annualYieldKWhPerKWp / MODEL.daysPerYear * SOLAR_SHAPE[h] / SOLAR_TOTAL;
      const availableDischarge = Math.min(n.storage, (soc[n.id] || 0) * OPTIONS.storage.dischargeEfficiency);
      const budget = gridLimitMW + solarMW + availableDischarge;
      const requests = sum(n.stations.map(id => Math.min(rows[id].arrivals, byId[id].capHourly))) * energy;
      const throttle = requests > EPS ? Math.min(1, budget / requests) : 1;
      for (const id of n.stations) {
        const s = byId[id], r = rows[id];
        r.served = Math.min(r.arrivals, s.capHourly) * throttle;
        r.capacity = s.capHourly * throttle;
      }
      nodeHour[n.id] = { hour: h, gridLimitMW, solarMW, budget, desiredMW: sum(n.stations.map(id => rows[id].arrivals)) * energy, provisionalMW: requests * throttle, socStartMWh: soc[n.id] || 0 };
    }
    // После каждого перетока свободный бюджет общего узла уменьшается.
    const sources = stations.filter(s => rows[s.id].arrivals - rows[s.id].served > EPS).sort((a, b) => (rows[b.id].arrivals - rows[b.id].served) - (rows[a.id].arrivals - rows[a.id].served));
    for (const s of sources) {
      const r = rows[s.id];
      let transferable = (r.arrivals - r.served) * (1 - MODEL.leak);
      const candidates = stations.filter(j => j.id !== s.id && (j.def.serviceClass || 'public') === (s.def.serviceClass || 'public') && Math.hypot(j.x - s.x, j.z - s.z) <= MODEL.spillMaxM)
        .sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z));
      for (const j of candidates) {
        if (transferable <= EPS) break;
        const target = rows[j.id], nh = nodeHour[j.node];
        const sparePosts = Math.max(0, j.capHourly - target.served);
        const sparePower = Math.max(0, nh.budget - nh.provisionalMW) / energy;
        const distance = Math.hypot(j.x - s.x, j.z - s.z);
        const accepted = Math.min(transferable * Math.exp(-distance / MODEL.spillDecayM), sparePosts, sparePower);
        target.served += accepted; target.spillIn += accepted;
        target.capacity = Math.max(target.capacity, target.served);
        r.spillOut += accepted; transferable -= accepted;
        nh.provisionalMW += accepted * energy;
      }
    }
    for (const n of Object.values(nodes)) {
      const r = nodeHour[n.id];
      const evMW = sum(n.stations.map(id => rows[id].served)) * energy;
      const directSolarMW = Math.min(evMW, r.solarMW);
      const dischargeMW = Math.max(0, evMW - directSolarMW - r.gridLimitMW);
      let chargeMW = 0, solarChargeMW = 0, gridChargeMW = 0;
      let nextSOC = r.socStartMWh - dischargeMW / OPTIONS.storage.dischargeEfficiency;
      if (dischargeMW <= EPS && n.storage > 0) {
        const freeGrid = Math.max(0, r.gridLimitMW - (evMW - directSolarMW));
        const spareSolar = Math.max(0, r.solarMW - directSolarMW);
        const room = Math.max(0, n.storageMWh - nextSOC) / OPTIONS.storage.chargeEfficiency;
        chargeMW = Math.min(n.storage, freeGrid + spareSolar, room);
        solarChargeMW = Math.min(chargeMW, spareSolar); gridChargeMW = chargeMW - solarChargeMW;
        nextSOC += chargeMW * OPTIONS.storage.chargeEfficiency;
      }
      soc[n.id] = Math.max(0, Math.min(n.storageMWh, nextSOC));
      const gridImportMW = Math.max(0, evMW - directSolarMW - dischargeMW) + gridChargeMW;
      Object.assign(r, { evMW, directSolarMW, chargeMW, solarChargeMW, gridChargeMW, dischargeMW, gridImportMW,
        curtailedSolarMW: Math.max(0, r.solarMW - directSolarMW - solarChargeMW), socEndMWh: soc[n.id] });
      if (record) n.hourly.push(r);
    }
    if (record) for (const s of stations) {
      const r = rows[s.id];
      const localServed = r.served - r.spillIn;
      r.lost = Math.max(0, r.arrivals - localServed - r.spillOut);
      r.unserved = Math.max(0, r.arrivals - localServed);
      // Offered pressure includes rejected attempts, not only admitted clients.
      const offeredDemand = Math.max(0, r.arrivals - r.spillOut + r.spillIn);
      r.rho = r.capacity > EPS ? offeredDemand / r.capacity : (offeredDemand > EPS ? 2 : 0);
      const serviceMinutes = r.capacity > EPS ? s.posts * 60 / r.capacity : s.serviceHours * 60;
      const q = queueMetrics(r.rho, s.posts, serviceMinutes);
      Object.assign(r, { wait: q.wait, queueCars: q.cars, queueStable: q.stable, waitCapped: q.waitCapped, powerMW: r.served * energy });
      s.hourly.push(r);
    }
  }
  return soc;
}

export function evaluate(ds, { year, scenario = 'base', decisions = [] }) {
  const st = stateFor(ds, year, scenario, decisions), { stations, nodes } = st;
  let soc = Object.fromEntries(Object.keys(nodes).map(id => [id, 0]));
  // Периодический SOC: повторяющийся день не получает бесплатную батарею.
  if (Object.values(nodes).some(n => n.storage > 0)) for (let k = 0; k < 50; k++) {
    const end = day(st, soc, false), delta = Math.max(0, ...Object.keys(soc).map(id => Math.abs(end[id] - soc[id])));
    soc = end;
    if (delta < 1e-8) break;
  }
  const end = day(st, soc, true);
  for (const s of stations) {
    const monthly = key => sum(s.hourly.map(r => r[key])) * MODEL.daysPerMonth;
    for (const key of ['served', 'unserved', 'spillIn', 'spillOut', 'lost']) s[key] = monthly(key);
    s.capEff = monthly('capacity');
    s.effPosts = s.posts * (s.capPosts ? s.capEff / s.capPosts : 0);
    s.throttle = s.posts ? s.effPosts / s.posts : 1;
    s.load = s.capEff ? Math.min(1, s.served / s.capEff) : 0;
    s.loadInstalled = s.capPosts ? s.served / s.capPosts : 0;
    s.rho = Math.max(...s.hourly.map(r => r.rho));
    s.wait = Math.max(...s.hourly.map(r => r.wait));
    s.queueCars = Math.ceil(Math.min(99, Math.max(...s.hourly.map(r => r.queueCars))));
    s.queueUnstable = s.hourly.some(r => !r.queueStable);
    s.waitCapped = s.hourly.some(r => r.waitCapped);
    s.queueRisk = s.rho < MODEL.loadMid ? 'low' : s.rho < MODEL.loadHigh ? 'mid' : 'high';
    s.limiter = s.unserved > EPS ? (s.throttle < 1 - EPS ? 'power' : 'posts') : 'none';
    s.powerMW = Math.max(...s.hourly.map(r => r.powerMW));
    s.segmentDemand = Object.fromEntries(TYPES.map(t => [t, s.D * s.mix[t]]));
  }
  for (const n of Object.values(nodes)) {
    n.connectedMW = sum(n.stations.map(id => st.byId[id].posts)) * MODEL.postKW / 1000;
    n.withinHourUpperMW = Math.max(...n.hourly.map((_,h) => sum(n.stations.map(id => {
      const s = st.byId[id];
      return Math.min(s.posts, s.hourly[h].arrivals * s.serviceHours) * MODEL.postKW / 1000;
    }))));
    n.desired = Math.max(...n.hourly.map(r => r.desiredMW));
    n.used = Math.max(...n.hourly.map(r => r.gridImportMW));
    n.util = Math.max(...n.hourly.map(r => r.gridLimitMW > EPS ? r.desiredMW / r.gridLimitMW : (r.desiredMW > EPS ? 2 : 0)));
    n.usedUtil = Math.max(...n.hourly.map(r => r.gridLimitMW > EPS ? r.gridImportMW / r.gridLimitMW : 0));
    n.constraintHours = n.hourly.filter(r => r.desiredMW > r.gridLimitMW + EPS).length;
    n.status = n.util >= MODEL.gridCrit ? 'constraint' : n.util >= MODEL.gridWarn ? 'warn' : 'ok';
    n.gridEnergyKWhDay = sum(n.hourly.map(r => r.gridImportMW)) * 1000;
    n.evEnergyKWhDay = sum(n.hourly.map(r => r.evMW)) * 1000;
    n.solarUsedKWhDay = sum(n.hourly.map(r => r.directSolarMW + r.solarChargeMW)) * 1000;
    n.storageLossKWhDay = sum(n.hourly.map(r => r.chargeMW - r.dischargeMW)) * 1000;
    n.socClosureErrorMWh = end[n.id] - soc[n.id];
  }
  for (const s of stations) {
    const n = nodes[s.node]; s.gridUtil = n.util;
    const load = Math.max(s.load, s.rho);
    s.status = n.status === 'constraint' ? 'constraint' : load >= MODEL.loadHigh ? 'high' : load >= MODEL.loadMid ? 'mid' : 'low';
  }
  const demand = sum(stations.map(s => s.D)), served = sum(stations.map(s => s.served));
  const posts = sum(stations.map(s => s.posts)), cap = sum(stations.map(s => s.capPosts));
  st.totals = { demand, served, lost: Math.max(0, demand - served), posts, util: cap ? served / cap : 0, availability: demand ? served / demand : 1,
    capexCum: sum([...st.built, ...st.pending].map(a => a.capex)), queuing: stations.filter(s => s.queueRisk === 'high').length,
    constrainedNodes: Object.values(nodes).filter(n => n.status === 'constraint').length,
    gridEnergyKWhDay: sum(Object.values(nodes).map(n => n.gridEnergyKWhDay)), evEnergyKWhDay: served / MODEL.daysPerMonth * MODEL.kwhPerSession,
    solarUsedKWhDay: sum(Object.values(nodes).map(n => n.solarUsedKWhDay)), storageLossKWhDay: sum(Object.values(nodes).map(n => n.storageLossKWhDay)),
    gridViolations: Object.values(nodes).reduce((a, n) => a + n.hourly.filter(r => r.gridImportMW > r.gridLimitMW + 1e-8).length, 0),
    hourly: Array.from({ length: 24 }, (_, h) => ({ hour: h, arrivals: sum(stations.map(s => s.hourly[h].arrivals)), served: sum(stations.map(s => s.hourly[h].served)), lost: sum(stations.map(s => s.hourly[h].lost)), gridImportMW: sum(Object.values(nodes).map(n => n.hourly[h].gridImportMW)) })) };
  st.methodology = {service:'hourly-rejection',queue:'counterfactual-erlang-c',power:'hourly-energy',peakIndicator:'hourly mean busy posts at nameplate; connectedMW is the full nameplate bound, not an engineering forecast'};
  return st;
}

export function evaluateSeries(ds, scenario, decisions, years = ALL_YEARS) {
  return years.map(year => evaluate(ds, { year, scenario, decisions }));
}

export function decisionsKey(decisions = []) {
  return decisions.map(d => `${d.station}@${d.year}:${[...d.options].sort().join('+')}`).sort().join('|');
}

/** Кэши привязаны к содержимому входных чисел, а не только к имени сценария. */
export function datasetKey(ds) {
  return JSON.stringify({ demandModel:ds.demandModel, demandScale:ds.demandScale, attractivenessExponent:ds.attractivenessExponent, stations: ds.stations.map(s => [s.id, s.posts, s.sessions, s.avgMin, s.sens, s.node, s.mix, s.pos, s.site, s.serviceClass]), nodes: ds.nodes.map(n => [n.id, n.headroom, n.headroomByHour]), model: MODEL, options: OPTIONS });
}
