import {FINANCIAL_DEFAULTS, STATION_COSTS} from '../simulation/assumptions.js';
import {RESEARCH} from '../data/research-core.js';

export function sharedDemoSettings(settings) {
  const s=STATION_COSTS.new_station;
  return {...settings,...FINANCIAL_DEFAULTS,posts:s.addPosts,capex:s.capex*1e6,opex:s.opex*1e6,lead:s.lead,energy:RESEARCH.energy.kwhPerSession,sessionMinutes:RESEARCH.energy.sessionMinutes};
}
export function moduleComparison(p) {
  const daily=RESEARCH.district.cells.reduce((a,c)=>a+c.private+c.corporate+c.transit,0)/(365/12);
  return `<div class="evidence-note"><b>2D-скрининг и 3D-полигон используют разные постановки спроса.</b> Здесь задано ${Math.round(p.dailyDemand)} сессий/сутки; исследовательская база всего 3D-полигона — около ${Math.round(daily)} в 2026. В 2D применяется рост ${Math.round(p.growth*100)}% в год и выбранный часовой профиль; в 3D — три траектории роста и сегменты Хаффа. В 2D остаток активов не учитывается; в 3D базовый остаток — 40% CAPEX. Лимит новой площадки здесь ${Math.round(p.gridKW)} кВт; в 3D используются общие узлы. Совпадение территории не делает выводы сопоставимыми автоматически. Общие цены и сметы теста взяты из того же файла допущений; пользовательские параметры могут отличаться. <a href="./polygon3d.html?sec=07">Проверить исходные данные 3D</a></div>`;
}
