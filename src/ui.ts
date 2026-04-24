import { playClick } from './audio';
import { build, getCost, getRegionSaltCavern } from './buildings';
import {
  BIG_TIER_CAP,
  BUILDINGS,
  CUSTOMER_TYPES,
  CUSTOMER_SUPPLY_BUFFER_MULTIPLIER,
  MID_TIER_CAP,
  SALT_CAVERN_ELIGIBLE_REGIONS,
  SMALL_TIER_CAP,
  getRegionConfig
} from './config';
import { getCurrentTotalDemand, getTierPopulationSummary } from './customers';
import { $, $$, $maybe } from './dom';
import {
  getRollingAverageDemand,
  getRollingAverageOpex,
  getRollingAverageRevenue,
  getRollingAverageSupply,
  getRollingRegionDemand,
  getRollingRegionSupply,
  instantaneousTotals
} from './econ';
import { input } from './input';
import { mapView } from './map';
import { getNetworkStorageCapacityKg } from './pressure';
import {
  buyResearchTier,
  getCurrentPriceBand,
  getElectrolyzerEfficiency,
  getNextTierCost,
  getTotalResearchTiers,
  MAX_RESEARCH_TIER
} from './research';
import { createInitialState, replaceState, state } from './state';
import { getSeason, getWeatherAt } from './weather';
import type { BuildingType, Insight, ResearchTrackName } from './types';

/**
 * v4 Runway: how many days of operation remain at the current burn rate.
 * Positive burn = losing money; negative burn = net profitable → ∞.
 * Return NaN for "effectively infinite" so callers can render it as ∞.
 */
export function computeRunwayDays(): number {
  const burn = state.dailyOpex - state.dailyRevenue;
  if (burn <= 0) return Infinity;
  return state.money / burn;
}

let toastTimer: number | undefined;

/**
 * One-time UI wiring after DOM is ready: populate build costs, attach
 * click and hover handlers to every build button, and hook the
 * manifesto-popup close button.
 */
export function initUI(): void {
  updateBuildCosts();
  updateResearchPanel();

  // Wire up build buttons (replaces inline onclick handlers).
  $$<HTMLButtonElement>('.build-btn').forEach(btn => {
    const type = btn.dataset.type as BuildingType | undefined;
    if (!type) return;
    btn.addEventListener('click', () => selectBuild(type));
    btn.addEventListener('mouseenter', () => showBuildQuote(btn, type));
    btn.addEventListener('mouseleave', hideBuildQuote);
  });

  $('#manifesto-close').addEventListener('click', closeManifesto);
  const researchToggle = $maybe('#research-toggle');
  if (researchToggle) researchToggle.addEventListener('click', toggleResearchPanel);
  const researchCards = $maybe('#research-cards');
  if (researchCards) {
    researchCards.addEventListener('click', ev => {
      const target = ev.target as HTMLElement | null;
      const btn = target?.closest<HTMLButtonElement>('[data-research-track]');
      if (!btn) return;
      const track = btn.dataset.researchTrack as ResearchTrackName | undefined;
      if (!track) return;
      investInResearch(track);
    });
  }

  const hudMoney = $('#hud-money');
  hudMoney.addEventListener('click', () => {/* placeholder for future money breakdown */});

  const gameoverNew = $maybe<HTMLButtonElement>('#gameover-newgame');
  if (gameoverNew) gameoverNew.addEventListener('click', () => {
    replaceState(createInitialState());
    $('#gameover-screen').classList.remove('show');
    updateBuildCosts();
    showToast('New run started.');
  });
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
  // For Hydrogen Plants, prepend the electrons-to-molecules flow diagram
  // so the player can *see* that only hydrogen leaves the facility.
  let html = '';
  if (type === 'solarPlant' || type === 'windPlant' || type === 'nuclearPlant') {
    const srcIcon = type === 'solarPlant' ? '☀️' : type === 'windPlant' ? '💨' : '⚛️';
    const srcLabel = type === 'solarPlant' ? 'Sunlight'
                   : type === 'windPlant' ? 'Wind'
                   : 'Fission';
    html += `<div class="flow-diagram">${srcIcon} ${srcLabel} <span class="flow-arrow">→</span> ⚡ internal <span class="flow-arrow">→</span> 🔬 70% <span class="flow-arrow">→</span> 💧 H₂ <em>to pipe</em></div>`;
  }
  html += `<div class="quote-body">"${cfg.quote.replace(/^"|"$/g, '')}"</div>`;
  tip.innerHTML = html;
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
 * date/season), status-bar stats (supply, demand, revenue), and
 * speed-button active state.
 * Called at ~15 Hz by the main loop.
 */
export function updateHUD(): void {
  const s = state;
  updateResearchPanel();

  // Budget now shown as signed — can go negative in v4. `warn` below €30M,
  // `danger` when negative.
  const moneyEl = $('#hud-money');
  moneyEl.textContent = `${s.money < 0 ? '-€' : '€'}${fmtMoney(Math.abs(s.money))}`;
  moneyEl.className = `hud-value${s.money < 0 ? ' danger' : s.money < 30_000_000 ? ' warn' : ''}`;
  $('#hud-price').textContent = `€${s.spotPrice.toFixed(2)}/kg`;
  $('#hud-produced').textContent = fmtTonnes(s.totalH2Produced);
  $('#hud-customers').textContent = String(s.customers.filter(c => c.active).length);

  // Date display follows the simulation's day-of-year so the visible
  // calendar stays aligned with weather and seasonality.
  const currentYear = 2025 + Math.floor((s.gameDay - 1) / 365);
  const currentDate = new Date(currentYear, 0, s.dayOfYear);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  $('#hud-day').textContent = `${months[currentDate.getMonth()]} ${currentDate.getDate()}, ${currentDate.getFullYear()}`;
  $('#hud-season').textContent = getSeason(s.dayOfYear);

  // Status bar: show rolling 24h averages as the strategic number, with
  // the instantaneous value as dim "now:" context so the player can
  // still see day/night swings driving pressure in real time.
  const { supply: nowSupply, demand: nowDemand } = instantaneousTotals(s);
  const avgSupply = getRollingAverageSupply(s);
  const avgDemand = getRollingAverageDemand(s);
  let nowPower = 0;
  for (const b of s.buildings) nowPower += b.internalElectricity ?? 0;
  $('#stat-power-now').textContent = fmtMw(nowPower);
  $('#stat-supply').textContent = `${fmtNum(avgSupply)}`;
  $('#stat-demand').textContent = `${fmtNum(avgDemand)}`;
  const supplyNowEl = $maybe('#stat-supply-now');
  if (supplyNowEl) supplyNowEl.textContent = `· now: ${fmtNum(nowSupply)}`;
  const demandNowEl = $maybe('#stat-demand-now');
  if (demandNowEl) demandNowEl.textContent = `· now: ${fmtNum(nowDemand)}`;

  // Economy group: revenue / opex / net.
  const avgRevenue = getRollingAverageRevenue(s);
  const avgOpex = getRollingAverageOpex(s);
  const net = avgRevenue - avgOpex;
  const revEl = $('#stat-revenue');
  const opxEl = $('#stat-opex');
  const netEl = $('#stat-net');
  revEl.textContent = `+€${fmtMoney(avgRevenue)}/day`;
  opxEl.textContent = `-€${fmtMoney(avgOpex)}/day`;
  netEl.textContent = `${net >= 0 ? '+' : '-'}€${fmtMoney(Math.abs(net))}/day`;
  netEl.classList.toggle('good', net > 0);
  netEl.classList.toggle('bad', net < 0);

  // Network group.
  const ratio = avgDemand > 0 ? avgSupply / avgDemand : (avgSupply > 0 ? Infinity : 0);
  const priceBand = getCurrentPriceBand(s);
  const totalResearchTiers = getTotalResearchTiers(s);
  const priceBandEl = $('#stat-price-band');
  priceBandEl.textContent = `€${priceBand.min.toFixed(1)} – €${priceBand.max.toFixed(1)}/kg (${totalResearchTiers}/15 tiers)`;
  const ratioEl = $('#stat-supply-ratio');
  const ratioText = Number.isFinite(ratio) ? ratio.toFixed(2) : '∞';
  const tierSummary = getTierPopulationSummary();
  const smallestTierHeadroom = Math.min(
    ...Object.values(CUSTOMER_TYPES)
      .filter(cfg => cfg.tier === 'small')
      .map(cfg => cfg.expectedDemand * CUSTOMER_SUPPLY_BUFFER_MULTIPLIER)
  );
  const headroom = avgSupply - getCurrentTotalDemand();
  const ratioStatus = headroom >= smallestTierHeadroom
    ? `headroom open (${fmtNum(headroom)} kg/day)`
    : `headroom low (${fmtNum(headroom)} kg/day)`;
  ratioEl.textContent = `${ratioText} (${ratioStatus})`;
  ratioEl.classList.toggle('good', headroom >= smallestTierHeadroom);
  ratioEl.classList.toggle('bad', headroom < smallestTierHeadroom);
  $('#stat-customers').textContent = `Small ${tierSummary.small.live}/${SMALL_TIER_CAP} · Mid ${tierSummary.mid.live}/${MID_TIER_CAP} · Big ${tierSummary.big.live}/${BIG_TIER_CAP}`;
  const storageEl = $maybe('#stat-storage-capacity');
  if (storageEl) storageEl.textContent = fmtTonnes(getNetworkStorageCapacityKg());

  // Runway indicator — the single most important v4 HUD element.
  updateRunwayIndicator();

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

  updateGameOverScreen();
}

/**
 * Keep the Runway HUD cell in sync. Translates a numeric runway to a
 * color-coded string (safe/warn/danger/critical/profitable). ∞ is used
 * whenever burn is net-negative, which is the flywheel's steady state.
 */
function updateRunwayIndicator(): void {
  const el = $maybe('#hud-runway');
  if (!el) return;
  const runway = computeRunwayDays();
  // Strip old state classes before applying the new one.
  el.classList.remove('runway-safe', 'runway-warn', 'runway-danger', 'runway-critical', 'runway-profit');
  if (!Number.isFinite(runway)) {
    el.textContent = '∞';
    el.classList.add('runway-profit');
    return;
  }
  const days = Math.max(0, Math.floor(runway));
  el.textContent = `${days}d`;
  if (days < 30) el.classList.add('runway-critical');
  else if (days < 60) el.classList.add('runway-danger');
  else if (days < 120) el.classList.add('runway-warn');
  else el.classList.add('runway-safe');
}

/**
 * Populate + show the somber Game Over modal when `state.gameOver` is
 * set. Idempotent — only re-renders the stats block once per flip.
 */
function updateGameOverScreen(): void {
  const root = $maybe('#gameover-screen');
  if (!root) return;
  const over = state.gameOver;
  if (!over?.triggered) {
    root.classList.remove('show');
    return;
  }
  if (!root.classList.contains('show')) {
    const reasonEl = $('#gameover-reason');
    if (over.reason === 'bankruptcy') {
      reasonEl.textContent =
        'The budget sat below €-50M for 90 consecutive days. The operation ran out of runway before the flywheel caught — your capital was exhausted before a large enough market formed.';
    } else {
      reasonEl.textContent = over.reason;
    }
    const rows = summaryStats();
    const el = $('#gameover-stats');
    el.innerHTML = rows
      .map(r => `<div class="label">${r.label}</div><div class="val">${r.value}</div>`)
      .join('');
    root.classList.add('show');
  }
}

function summaryStats(): Array<{ label: string; value: string }> {
  const s = state;
  let connected = 0;
  for (const rc of Object.values(s.regions)) {
    if (rc.pipeConnections > 0) connected++;
  }
  return [
    { label: 'Days elapsed', value: String(s.gameDay) },
    { label: 'Customers online', value: String(s.customers.filter(c => c.active).length) },
    { label: 'Peak network pressure', value: `${s.networkPressure.toFixed(1)} bar` },
    { label: 'Connected regions', value: `${connected} / ${Object.keys(s.regions).length}` },
    { label: 'Final spot price', value: `€${s.spotPrice.toFixed(2)}/kg` },
    { label: 'Final budget', value: `€${Math.round(s.money / 1e6)}M` }
  ];
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
  const buildingCount = state.buildings.filter(b => b.regionId === regionId).length
    + state.caverns.filter(c => c.regionId === regionId).length;
  const cavern = getRegionSaltCavern(regionId);
  const cavernEligible = !!SALT_CAVERN_ELIGIBLE_REGIONS[regionId];

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
  html += `<div class="sub-line">🧂 Cavern geology: ${cavernEligible ? 'viable' : 'not suitable (no salt)'}</div>`;

  html += `<div class="sub-section">`;
  html += `<div class="sub-line">☁ Cloud ${Math.round(w.clouds * 100)}% · 🌬 Wind ${(w.wind * 100).toFixed(0)}%</div>`;
  html += `<div class="sub-line">🏗 Buildings: ${buildingCount} / ${rc.maxSlots}</div>`;
  if (cavern) {
    if (rs.pipeConnections > 0) html += `<div class="sub-line">Salt Cavern: online — contributing to network storage</div>`;
    else html += `<div class="sub-line">Salt Cavern: online — awaiting pipeline connection</div>`;
  }
  const avgRegionSupply = getRollingRegionSupply(state, regionId);
  const avgRegionDemand = getRollingRegionDemand(state, regionId);
  if (rs.pipeConnections > 0) {
    html += `<div class="sub-line">📊 Pressure: ${rs.pressure.toFixed(1)} bar · €${rs.localPrice.toFixed(2)}/kg</div>`;
    html += `<div class="sub-line">Supply ${Math.round(avgRegionSupply)} / Demand ${Math.round(avgRegionDemand)} kg/day (24h avg)</div>`;
    html += `<div class="sub-line tooltip-now">now ${Math.round(rs.supply)} / ${Math.round(rs.demand)}</div>`;
  } else if (rs.supply > 0 || avgRegionSupply > 0) {
    html += `<div class="sub-line">Supply ${Math.round(avgRegionSupply)} kg/day (24h avg, no pipe)</div>`;
    html += `<div class="sub-line tooltip-now">now ${Math.round(rs.supply)}</div>`;
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
 * Called on build/sell and periodically from updateHUD.
 */
export function updateBuildCosts(): void {
  for (const [type, cfg] of Object.entries(BUILDINGS)) {
    const btn = document.querySelector<HTMLButtonElement>(`.build-btn[data-type="${type}"]`);
    if (!btn) continue;
    const costEl = btn.querySelector<HTMLElement>('.cost');
    if (!costEl) continue;
    if (type === 'pipeline') {
      const pipeCfg = cfg as typeof BUILDINGS.pipeline;
      costEl.textContent = `~€${fmtMoney(pipeCfg.baseCostPerKm)}/km`;
      btn.classList.toggle('disabled', state.money < 5_000_000);
    } else {
      const cost = getCost(type as Exclude<BuildingType, 'pipeline'>);
      costEl.textContent = type === 'saltCavern'
        ? `€${fmtMoney(cost)} · 2 Mm³`
        : `€${fmtMoney(cost)}`;
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
  html += row('Cavern Geology', SALT_CAVERN_ELIGIBLE_REGIONS[regionId] ? 'Viable' : 'Not suitable (no salt)');
  const infoAvgSupply = getRollingRegionSupply(state, regionId);
  const infoAvgDemand = getRollingRegionDemand(state, regionId);
  html += row('Supply (24h avg)', `${Math.round(infoAvgSupply)} kg/day · now ${Math.round(rs.supply)}`);
  html += row('Demand (24h avg)', `${Math.round(infoAvgDemand)} kg/day · now ${Math.round(rs.demand)}`);
  const cavern = getRegionSaltCavern(regionId);
  if (cavern) {
    if (rs.pipeConnections > 0) {
      html += row('Salt Cavern', 'Online — contributing to network storage');
    } else {
      html += row('Salt Cavern', 'Online — awaiting pipeline connection');
    }
  } else if (SALT_CAVERN_ELIGIBLE_REGIONS[regionId]) {
    html += `<div class="info-section"><h4>Salt Cavern</h4><button id="info-build-cavern" class="tut-btn" style="width:100%">Build Salt Cavern (€${fmtMoney(BUILDINGS.saltCavern.baseCost)})</button><div style="margin-top:6px;font-size:11px;color:#94a3b8">2 Mm³ · ~15,000 tonnes H₂ · immediate backbone storage</div></div>`;
  }

  if (buildings.length > 0) {
    html += `<div class="info-section"><h4>Buildings (${buildings.length + (cavern ? 1 : 0)}/${rc.maxSlots})</h4>`;
    const counts: Record<string, number> = {};
    for (const b of buildings) counts[b.type] = (counts[b.type] || 0) + 1;
    for (const [type, count] of Object.entries(counts)) {
      const cfg = BUILDINGS[type as BuildingType];
      html += `<div style="padding:2px 0;font-size:11px">${cfg.icon} ${cfg.name} ×${count}</div>`;
    }
    if (cavern) {
      html += `<div style="padding:2px 0;font-size:11px">${BUILDINGS.saltCavern.icon} ${BUILDINGS.saltCavern.name} ×1</div>`;
    }
    html += '</div>';
  } else if (cavern) {
    html += `<div class="info-section"><h4>Buildings (1/${rc.maxSlots})</h4><div style="padding:2px 0;font-size:11px">${BUILDINGS.saltCavern.icon} ${BUILDINGS.saltCavern.name} ×1</div></div>`;
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
  const buildCavernBtn = $maybe<HTMLButtonElement>('#info-build-cavern');
  if (buildCavernBtn) {
    buildCavernBtn.addEventListener('click', () => {
      build('saltCavern', regionId);
      showRegionInfo(regionId);
    });
  }
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

export function toggleResearchPanel(): void {
  const panel = $('#research-panel');
  panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
  if (panel.style.display === 'block') updateResearchPanel();
}

function investInResearch(track: ResearchTrackName): void {
  const nextCost = getNextTierCost(state, track);
  if (nextCost === null) {
    showToast('Research already complete.');
    return;
  }
  if (!buyResearchTier(state, track)) {
    showToast(`Need €${fmtMoney(nextCost)} for the next ${labelResearchTrack(track)} tier.`);
    return;
  }
  updateBuildCosts();
  updateResearchPanel();
  playClick();
  showToast(`${labelResearchTrack(track)} research advanced to tier ${state.research[track].tier}.`);
}

function updateResearchPanel(): void {
  const summary = $maybe('#research-summary');
  const cards = $maybe('#research-cards');
  if (!summary || !cards) return;
  const band = getCurrentPriceBand(state);
  const tiers = getTotalResearchTiers(state);
  summary.innerHTML =
    `Wright-style learning cuts new plant CAPEX and compresses the market price band.` +
    `<br>Current band: <strong>€${band.min.toFixed(1)} – €${band.max.toFixed(1)}/kg</strong> · Research progress: <strong>${tiers}/15 tiers</strong>.`;
  const tracks: ResearchTrackName[] = ['solar', 'wind', 'electrolyzer'];
  cards.innerHTML = tracks.map(renderResearchCard).join('');
}

function renderResearchCard(track: ResearchTrackName): string {
  const tier = state.research[track].tier;
  const nextCost = getNextTierCost(state, track);
  const maxed = tier >= MAX_RESEARCH_TIER;
  const affordable = nextCost !== null && state.money >= nextCost;
  const lines = getResearchCardLines(track, tier);
  const action = maxed
    ? `<div class="research-maxed">Research complete</div>`
    : `<button class="research-buy" data-research-track="${track}"${affordable ? '' : ' disabled'}>${affordable ? 'Invest' : 'Insufficient budget'} · €${fmtMoney(nextCost ?? 0)}</button>`;
  return `<div class="research-card">
    <h4>${labelResearchTrack(track)} Research</h4>
    <div class="research-tier">Tier ${tier} of ${MAX_RESEARCH_TIER}</div>
    <div class="research-line"><strong>Current:</strong> ${lines.current}</div>
    <div class="research-line"><strong>Next:</strong> ${lines.next}</div>
    ${action}
  </div>`;
}

function getResearchCardLines(track: ResearchTrackName, tier: number): { current: string; next: string } {
  if (track === 'solar') {
    const current = tier === 0 ? 'baseline solar generator CAPEX' : `-${tier * 10}% solar generator CAPEX`;
    const next = tier >= MAX_RESEARCH_TIER ? 'maxed' : `-${(tier + 1) * 10}% solar generator CAPEX`;
    return { current, next };
  }
  if (track === 'wind') {
    const current = tier === 0 ? 'baseline wind generator CAPEX' : `-${tier * 10}% wind generator CAPEX`;
    const next = tier >= MAX_RESEARCH_TIER ? 'maxed' : `-${(tier + 1) * 10}% wind generator CAPEX`;
    return { current, next };
  }
  const current = tier === 0
    ? `baseline electrolyzer CAPEX · ${(getElectrolyzerEfficiency(state) * 100).toFixed(0)}% efficiency`
    : `-${tier * 10}% electrolyzer CAPEX · ${(getElectrolyzerEfficiency(state) * 100).toFixed(0)}% efficiency`;
  const next = tier >= MAX_RESEARCH_TIER
    ? 'maxed'
    : `-${(tier + 1) * 10}% electrolyzer CAPEX · ${(75 + tier * 5).toFixed(0)}% efficiency`;
  return { current, next };
}

function labelResearchTrack(track: ResearchTrackName): string {
  switch (track) {
    case 'solar': return 'Solar';
    case 'wind': return 'Wind';
    case 'electrolyzer': return 'Electrolyzer';
  }
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

/** Power formatter in MW, keeping a little precision at small values. */
export function fmtMw(n: number): string {
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}GW`;
  if (n >= 100) return String(Math.round(n));
  if (n >= 10) return n.toFixed(1);
  return n.toFixed(2);
}

/** Mass formatter: kg → kg/t/Kt/Mt with a suffix attached. */
export function fmtTonnes(kg: number): string {
  const t = kg / 1000;
  if (t >= 1e6) return `${(t / 1e6).toFixed(1)}Mt`;
  if (t >= 1e3) return `${(t / 1e3).toFixed(1)}Kt`;
  if (t >= 1) return `${t.toFixed(1)}t`;
  return `${Math.round(kg)}kg`;
}
