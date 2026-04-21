import { playClick } from './audio';
import { getCost } from './buildings';
import { BUILDINGS, CUSTOMER_TYPES, REGIONS, getRegionConfig } from './config';
import { $, $$, $maybe } from './dom';
import { input } from './input';
import { mapView } from './map';
import { state } from './state';
import { getSeason, getWeatherAt } from './weather';
import type { BuildingType, Insight } from './types';

let toastTimer: number | undefined;

// ─── Oil price ceiling ────────────────────────────────────────────────────
// Fossil oil price per barrel at which e-fuel production breaks even, given
// the current H₂ spot price. Roughly: ~42 kg of H₂ to synthesize a barrel of
// e-fuel plus ~€30/bbl for CO₂ capture + Fischer-Tropsch opex. Pedagogical
// rather than exact, but aligned with published e-fuel breakeven studies.
export const H2_KG_PER_BBL = 42;
export const EFUEL_OVERHEAD_PER_BBL = 30;

/**
 * Compute the break-even oil price (€/bbl) implied by a given H₂ spot
 * price. This is the "oil-price ceiling" the manifesto talks about —
 * below this number e-fuels undercut crude, and the number falls
 * monotonically with H₂ cost.
 */
export function oilCeiling(h2Price: number): number {
  return h2Price * H2_KG_PER_BBL + EFUEL_OVERHEAD_PER_BBL;
}

/**
 * One-time UI wiring after DOM is ready: populate build costs, attach
 * click and hover handlers to every build button, and hook the
 * manifesto-popup close button.
 */
export function initUI(): void {
  updateBuildCosts();

  // Wire up build buttons (replaces inline onclick handlers).
  $$<HTMLButtonElement>('.build-btn').forEach(btn => {
    const type = btn.dataset.type as BuildingType | undefined;
    if (!type) return;
    btn.addEventListener('click', () => selectBuild(type));
    btn.addEventListener('mouseenter', () => showBuildQuote(btn, type));
    btn.addEventListener('mouseleave', hideBuildQuote);
  });

  $('#manifesto-close').addEventListener('click', closeManifesto);

  const hudMoney = $('#hud-money');
  hudMoney.addEventListener('click', () => {/* placeholder for future money breakdown */});
}

// ─── Build-btn manifesto quote tooltip ───────────────────────────────────

/**
 * Show the pop-up manifesto quote next to a build-menu button when
 * hovered. Anchored to the right of the button so it reads like a
 * margin-note rather than blocking the menu itself.
 */
function showBuildQuote(btn: HTMLButtonElement, type: BuildingType): void {
  const tip = $maybe('#build-tooltip');
  if (!tip) return;
  const cfg = BUILDINGS[type];
  tip.textContent = `"${cfg.quote.replace(/^"|"$/g, '')}"`;
  const r = btn.getBoundingClientRect();
  tip.style.display = 'block';
  tip.style.left = `${Math.round(r.right + 8)}px`;
  tip.style.top = `${Math.round(r.top + 4)}px`;
}
/** Hide the build-btn quote tooltip (mouseleave handler). */
function hideBuildQuote(): void {
  const tip = $maybe('#build-tooltip');
  if (tip) tip.style.display = 'none';
}

/**
 * Update every dynamic DOM element in the HUD from the current state:
 * top-bar numerics (budget, spot price, total H₂, customer count,
 * date/season), status-bar stats (supply, demand, curtailed, Wright
 * savings, revenue, oil ceiling), and speed-button active state.
 * Called at ~15 Hz by the main loop.
 */
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

  // Status bar (pressure gauge is now canvas-rendered)
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
  $('#stat-oil-ceiling').textContent = `€${oilCeiling(s.spotPrice).toFixed(0)}/bbl`;

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

// ─── DOM region tooltip (follows cursor on hover) ────────────────────────
/**
 * Show/update the DOM region tooltip at the cursor. Renders a rich
 * summary: name, bonus bars (solar/wind/nuclear/industry), port, current
 * weather sample, buildings count, pressure and local price (if
 * connected), and supply/demand. Pass regionId=null to hide. The
 * tooltip auto-flips to the left/above the cursor when it would overflow
 * the viewport.
 */
export function updateRegionTooltip(regionId: string | null, mx: number, my: number): void {
  const tip = $maybe('#region-tooltip');
  if (!tip) return;
  if (!regionId || input.buildMode === 'pipeline') {
    tip.style.display = 'none';
    return;
  }
  const rc = getRegionConfig(regionId);
  const rs = state.regions[regionId];
  if (!rc) { tip.style.display = 'none'; return; }
  const w = getWeatherAt(regionId);
  const buildingCount = state.buildings.filter(b => b.regionId === regionId).length;

  const bar = (label: string, v: number) => {
    const pct = Math.round(v * 100);
    return `<div class="bar-row"><span class="bar-label">${label}</span><span class="bar-wrap"><span class="bar-fill" style="width:${Math.min(100, pct)}%"></span></span><span class="bar-val">${pct}%</span></div>`;
  };

  let html = `<h4>${rc.name}</h4>`;
  html += bar('Solar', rc.solarBase);
  html += bar('Wind', rc.windBase);
  html += bar('Nuclear', Math.min(1, rc.nuclearBonus / 1.5));
  html += bar('Industry', Math.min(1, rc.industryDemand));
  if (rc.hasPort) html += `<div class="sub-line">🚢 Port: ${rc.portName}</div>`;

  html += `<div class="sub-section">`;
  html += `<div class="sub-line">☁ Cloud ${Math.round(w.clouds * 100)}% · 🌬 Wind ${(w.wind * 100).toFixed(0)}%</div>`;
  html += `<div class="sub-line">🏗 Buildings: ${buildingCount} / ${rc.maxSlots}</div>`;
  if (rs.pipeConnections > 0) {
    html += `<div class="sub-line">📊 Pressure: ${rs.pressure.toFixed(1)} bar · €${rs.localPrice.toFixed(2)}/kg</div>`;
    html += `<div class="sub-line">Supply ${Math.round(rs.supply)} / Demand ${Math.round(rs.demand)} kg/day</div>`;
  } else if (rs.supply > 0) {
    html += `<div class="sub-line">Supply ${Math.round(rs.supply)} kg/day (no pipe)</div>`;
  } else {
    html += `<div class="sub-line">Not connected to backbone</div>`;
  }
  html += `</div>`;

  tip.innerHTML = html;
  tip.style.display = 'block';
  // Flip to the left/top if it would overflow the viewport
  const pad = 14;
  const rect = tip.getBoundingClientRect();
  let x = mx + pad;
  let y = my + pad;
  if (x + rect.width > window.innerWidth - 4) x = mx - pad - rect.width;
  if (y + rect.height > window.innerHeight - 4) y = my - pad - rect.height;
  tip.style.left = `${Math.round(x)}px`;
  tip.style.top = `${Math.round(y)}px`;
}

/** Hide the cursor-following region tooltip (on mouseleave canvas). */
export function hideRegionTooltip(): void {
  const tip = $maybe('#region-tooltip');
  if (tip) tip.style.display = 'none';
}

/**
 * Recompute the cost label and enabled state for every build-menu button.
 * Called on build/sell, each time Wright's Law advances, and periodically
 * from updateHUD.
 */
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

/**
 * Enter build mode for the given type: flash the selected button, swap
 * the cursor to crosshair, clear any pipeline start, and toast a hint.
 */
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

/**
 * Populate the persistent #info-panel on the right when a region is
 * clicked (distinct from the cursor tooltip, which is hover-only).
 * Shows a deeper breakdown: bonuses, buildings, customers, and a
 * manifesto quote picked based on the region's dominant trait.
 */
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

/** Small HTML helper: render a left-label / right-value row. */
function row(label: string, value: string): string {
  return `<div class="info-row"><span class="label">${label}</span><span class="val">${value}</span></div>`;
}

/** Close the info panel (called when clicking the empty map). */
export function hideInfoPanel(): void {
  $('#info-panel').style.display = 'none';
}

/**
 * Show a brief floating message near the top of the screen and fade it
 * out after 2.5s. Used for ephemeral feedback: "Game saved ✓",
 * "Pipeline already exists", "New Steel DRI Plant in Hauts-de-France!".
 */
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

/**
 * Display a centered manifesto-insight modal with title + long text.
 * Player dismisses with the "Continue" button wired in initUI.
 */
export function showManifesto(insight: Insight): void {
  $('#mp-title').textContent = insight.title;
  $('#mp-text').textContent = insight.text;
  $('#manifesto-popup').style.display = 'block';
}

/** Close the manifesto modal. */
export function closeManifesto(): void {
  $('#manifesto-popup').style.display = 'none';
}

/**
 * Toggle the save menu drawer and refresh the "Last saved: …" footer
 * so the timestamp is always up-to-date when the menu opens.
 */
export function toggleSaveMenu(): void {
  const m = $('#save-menu');
  m.style.display = m.style.display === 'flex' ? 'none' : 'flex';
  updateSaveTimestamp();
}

/**
 * Refresh the "Last saved: …" footer in the save menu with a relative
 * time stamp (Xs/Xm/Xh ago, or an absolute date beyond a day).
 */
export function updateSaveTimestamp(): void {
  const el = $maybe('#save-menu-timestamp');
  if (!el) return;
  if (!state.lastSavedAt) { el.textContent = ''; return; }
  const diff = Math.floor((Date.now() - state.lastSavedAt) / 1000);
  let when: string;
  if (diff < 60) when = `${diff}s ago`;
  else if (diff < 3600) when = `${Math.floor(diff / 60)}m ago`;
  else if (diff < 86_400) when = `${Math.floor(diff / 3600)}h ago`;
  else when = new Date(state.lastSavedAt).toLocaleDateString();
  el.textContent = `Last saved: ${when}`;
}

// ─── Formatters ──────────────────────────────────────────────────

/** "€" budget-style, e.g., 1_234_567 → "1.2M". No currency symbol; caller adds one. */
export function fmtMoney(n: number): string {
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(Math.round(n));
}

/** Generic numeric formatter with SI suffixes (K / M), 1 decimal. */
export function fmtNum(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}

/** Mass formatter: kg → kg/t/Kt/Mt with a suffix attached. */
export function fmtTonnes(kg: number): string {
  const t = kg / 1000;
  if (t >= 1e6) return `${(t / 1e6).toFixed(1)}Mt`;
  if (t >= 1e3) return `${(t / 1e3).toFixed(1)}Kt`;
  if (t >= 1) return `${t.toFixed(1)}t`;
  return `${Math.round(kg)}kg`;
}
