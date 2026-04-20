import { playClick } from './audio';
import { getCost } from './buildings';
import { BUILDINGS, CUSTOMER_TYPES, REGIONS, getRegionConfig } from './config';
import { $, $$ } from './dom';
import { input } from './input';
import { mapView } from './map';
import { state } from './state';
import { getSeason } from './weather';
import type { BuildingType, Insight } from './types';

let toastTimer: number | undefined;

export function initUI(): void {
  updateBuildCosts();

  // Wire up build buttons (replaces inline onclick handlers).
  $$<HTMLButtonElement>('.build-btn').forEach(btn => {
    const type = btn.dataset.type as BuildingType | undefined;
    if (!type) return;
    btn.addEventListener('click', () => selectBuild(type));
  });

  $('#manifesto-close').addEventListener('click', closeManifesto);

  const hudMoney = $('#hud-money');
  hudMoney.addEventListener('click', () => {/* placeholder for future money breakdown */});
}

export function updateHUD(): void {
  const s = state;

  $('#hud-money').textContent = `€${fmtMoney(s.money)}`;
  $('#hud-money').className = `hud-value${s.money < 10_000_000 ? ' warn' : ''}`;
  $('#hud-price').textContent = `€${s.spotPrice.toFixed(2)}/kg`;
  $('#hud-produced').textContent = fmtTonnes(s.totalH2Produced);
  $('#hud-customers').textContent = String(s.customers.filter(c => c.active).length);

  // Date display (starting Jan 1, 2025)
  const startDate = new Date(2025, 0, 1);
  const currentDate = new Date(startDate.getTime() + (s.gameDay - 1) * 86_400_000);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  $('#hud-day').textContent = `${months[currentDate.getMonth()]} ${currentDate.getDate()}, ${currentDate.getFullYear()}`;
  $('#hud-season').textContent = getSeason(s.dayOfYear);

  // Pressure gauge with dynamic glow
  const gv = $('#gauge-val');
  const gauge = $('#pressure-gauge');
  gv.textContent = s.networkPressure.toFixed(1);
  let gaugeColor: string;
  if (s.networkPressure > 60) gaugeColor = '#00ff88';
  else if (s.networkPressure > 30) gaugeColor = '#06d6a0';
  else if (s.networkPressure > 10) gaugeColor = '#f59e0b';
  else gaugeColor = s.networkPressure > 0 ? '#ef4444' : '#1e3a5f';
  gv.style.color = gaugeColor;
  gauge.style.borderColor = gaugeColor;
  gauge.style.boxShadow = s.networkPressure > 5
    ? `0 0 ${Math.min(20, s.networkPressure / 3)}px ${gaugeColor}40`
    : 'none';

  // Status bar
  let totalSupply = 0;
  let totalDemand = 0;
  for (const rc of REGIONS) {
    totalSupply += s.regions[rc.id].supply;
    totalDemand += s.regions[rc.id].demand;
  }
  $('#stat-supply').textContent = fmtNum(totalSupply);
  $('#stat-demand').textContent = fmtNum(totalDemand);
  $('#stat-curtail').textContent = fmtNum(s.totalCurtailed);
  const avgWright = (s.wright.solar.mult + s.wright.electrolyzer.mult) / 2;
  $('#stat-wright').textContent = `${Math.round((1 - avgWright) * 100)}%`;
  $('#stat-revenue').textContent = `€${fmtMoney(s.dailyRevenue)}/day`;

  // Periodic refreshes (~1 s)
  if (s.tick % 10 === 0) {
    updateBuildCosts();
    if (mapView.selectedRegion) showRegionInfo(mapView.selectedRegion);
  }

  // Speed buttons
  $$('#speed-controls button').forEach(btn => btn.classList.remove('active'));
  const speedMap: Record<number, number> = { 0: 0, 1: 1, 10: 2, 100: 3 };
  const idx = s.paused ? 0 : (speedMap[s.speed] ?? 1);
  const btns = $$<HTMLButtonElement>('#speed-controls button');
  btns[idx]?.classList.add('active');
}

export function updateBuildCosts(): void {
  for (const [type, cfg] of Object.entries(BUILDINGS)) {
    const btn = document.querySelector<HTMLButtonElement>(`.build-btn[data-type="${type}"]`);
    if (!btn) continue;
    const costEl = btn.querySelector<HTMLElement>('.cost');
    if (!costEl) continue;
    if (type === 'pipeline') {
      const pipeCfg = cfg as typeof BUILDINGS.pipeline;
      costEl.textContent = `~€${fmtMoney(pipeCfg.baseCostPerKm * state.wright.pipeline.mult)}/km`;
      btn.classList.toggle('disabled', state.money < 5_000_000);
    } else {
      const cost = getCost(type as Exclude<BuildingType, 'pipeline'>);
      costEl.textContent = `€${fmtMoney(cost)}`;
      btn.classList.toggle('disabled', state.money < cost);
    }
  }
}

export function selectBuild(type: BuildingType): void {
  input.buildMode = type;
  input.pipeStart = null;
  $$('.build-btn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector<HTMLButtonElement>(`.build-btn[data-type="${type}"]`);
  btn?.classList.add('active');
  if (mapView.canvas) mapView.canvas.style.cursor = 'crosshair';
  playClick();

  if (type === 'pipeline') {
    showToast('Click a region to start the pipeline.');
  } else {
    showToast(`Click a region to build ${BUILDINGS[type].name}`);
  }
}

export function showRegionInfo(regionId: string): void {
  const rc = getRegionConfig(regionId);
  const rs = state.regions[regionId];
  if (!rc) return;

  const panel = $('#info-panel');
  panel.style.display = 'block';
  $('#info-title').textContent = rc.name;

  const buildings = state.buildings.filter(b => b.regionId === regionId);
  const customers = state.customers.filter(c => c.active && c.regionId === regionId);

  let html = '';
  html += row('Capital', rc.capital);
  html += row('Solar Potential', `${(rc.solarBase * 100).toFixed(0)}%`);
  html += row('Wind Potential', `${(rc.windBase * 100).toFixed(0)}%`);
  html += row('Nuclear', rc.nuclearBonus > 0.5 ? `⚛️ Yes (×${rc.nuclearBonus.toFixed(1)})` : 'No');
  html += row('Industry Factor', `${(rc.industryDemand * 100).toFixed(0)}%`);
  if (rc.hasPort) html += row('Port', `🚢 ${rc.portName}`);
  html += row('Gas Infrastructure', `${(rc.gasInfra * 100).toFixed(0)}%`);
  html += row('Pipe Connections', String(rs.pipeConnections || 0));
  html += row('Local H₂ Price', `€${rs.localPrice.toFixed(2)}/kg`);
  html += row('Pressure', `${rs.pressure.toFixed(1)} bar`);
  html += row('Supply', `${Math.round(rs.supply)} kg/day`);
  html += row('Demand', `${Math.round(rs.demand)} kg/day`);

  if (buildings.length > 0) {
    html += `<div class="info-section"><h4>Buildings (${buildings.length}/${rc.maxSlots})</h4>`;
    const counts: Record<string, number> = {};
    for (const b of buildings) counts[b.type] = (counts[b.type] || 0) + 1;
    for (const [type, count] of Object.entries(counts)) {
      const cfg = BUILDINGS[type as BuildingType];
      html += `<div style="padding:2px 0;font-size:11px">${cfg.icon} ${cfg.name} ×${count}</div>`;
    }
    html += '</div>';
  }

  if (customers.length > 0) {
    html += `<div class="info-section"><h4>Customers (${customers.length})</h4>`;
    for (const c of customers) {
      const cfg = CUSTOMER_TYPES[c.type];
      html += `<div style="padding:2px 0;font-size:11px">${cfg.icon} ${c.name} (${fmtNum(c.demand)} kg/day)</div>`;
    }
    html += '</div>';
  }

  let quote = '';
  if (rc.solarBase >= 0.8) quote = '"Solar electricity in southern Europe costs 20 €/MWh today… This is not a projection."';
  else if (rc.windBase >= 0.8) quote = '"Every MWh of excess renewable generation can be converted to hydrogen."';
  else if (rc.nuclearBonus >= 1.3) quote = '"Nuclear excels at constant output… Electrolysis absorbs off-peak nuclear power."';
  else if (rc.hasPort) quote = '"France\'s port infrastructure is positioned for e-fuel export."';
  else if (rc.industryDemand >= 1.3) quote = '"A single DRI plant consumes roughly 70,000 tonnes of H₂ per year. Connect it to the pipe."';
  if (quote) html += `<div class="manifesto-quote">${quote}</div>`;

  $('#info-content').innerHTML = html;
}

function row(label: string, value: string): string {
  return `<div class="info-row"><span class="label">${label}</span><span class="val">${value}</span></div>`;
}

export function hideInfoPanel(): void {
  $('#info-panel').style.display = 'none';
}

export function showToast(msg: string): void {
  const t = $('#toast');
  t.textContent = msg;
  t.style.display = 'block';
  t.style.opacity = '1';
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    t.style.opacity = '0';
    window.setTimeout(() => (t.style.display = 'none'), 300);
  }, 2500);
}

export function showManifesto(insight: Insight): void {
  $('#mp-title').textContent = insight.title;
  $('#mp-text').textContent = insight.text;
  $('#manifesto-popup').style.display = 'block';
}

export function closeManifesto(): void {
  $('#manifesto-popup').style.display = 'none';
}

export function toggleSaveMenu(): void {
  const m = $('#save-menu');
  m.style.display = m.style.display === 'flex' ? 'none' : 'flex';
}

// ─── Formatters ──────────────────────────────────────────────────

export function fmtMoney(n: number): string {
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(Math.round(n));
}

export function fmtNum(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}

export function fmtTonnes(kg: number): string {
  const t = kg / 1000;
  if (t >= 1e6) return `${(t / 1e6).toFixed(1)}Mt`;
  if (t >= 1e3) return `${(t / 1e3).toFixed(1)}Kt`;
  if (t >= 1) return `${t.toFixed(1)}t`;
  return `${Math.round(kg)}kg`;
}
