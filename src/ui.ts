import { playClick, playResearchComplete } from './audio';
import { build, getCost, getRegionSaltCavern } from './buildings';
import {
  BIG_TIER_CAP,
  BUILDINGS,
  CUSTOMER_TYPES,
  MID_TIER_CAP,
  SALT_CAVERN_ELIGIBLE_REGIONS,
  SMALL_TIER_CAP,
  getRegionConfig
} from './config';
import { getCustomerSlotSummary, getTierPopulationSummary } from './customers';
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
  getElectrolyzerEfficiency,
  getNextTierCost,
  getResearchPrerequisite,
  getTotalResearchTiers,
  MAX_RESEARCH_TIER
} from './research';
import { iconSvg } from './icons';
import { createInitialState, replaceState, state } from './state';
import { getSeason, getWeatherAt } from './weather';
import type { BuildingType, Insight, ResearchTrackName } from './types';

/** Days of operation covered by current capital at the current burn rate. */
export function computeCapitalCoverageDays(): number {
  const burn = state.dailyOpex - state.dailyRevenue;
  if (burn <= 0) return Infinity;
  return state.money / burn;
}

let toastTimer: number | undefined;
let lastResearchPanelSignature = '';

function inlineIcon(icon: Parameters<typeof iconSvg>[0]): string {
  return iconSvg(icon, 'bb-icon inline-icon');
}

type SeasonName = ReturnType<typeof getSeason>;

const ENGLISH_MONTHS = [
  'JANUARY',
  'FEBRUARY',
  'MARCH',
  'APRIL',
  'MAY',
  'JUNE',
  'JULY',
  'AUGUST',
  'SEPTEMBER',
  'OCTOBER',
  'NOVEMBER',
  'DECEMBER'
];

const ENGLISH_SEASONS: Record<SeasonName, string> = {
  Winter: 'WINTER',
  Spring: 'SPRING',
  Summer: 'SUMMER',
  Autumn: 'AUTUMN'
};

function formatEnglishDate(year: number, dayOfYear: number): string {
  const currentDate = new Date(year, 0, dayOfYear);
  return `${currentDate.getDate()} ${ENGLISH_MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
}

function formatCurrency(n: number): string {
  return `${n < 0 ? '-€ ' : '€ '}${fmtMoney(Math.abs(n))}`;
}

function formatSignedCurrency(n: number): string {
  return `${n >= 0 ? '+€ ' : '-€ '}${fmtMoney(Math.abs(n))}`;
}

function formatPressure(n: number): string {
  return `${n.toFixed(2)} bar`;
}

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
  $('#manifesto-popup').addEventListener('click', closeManifesto);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && $('#manifesto-popup').style.display === 'flex') closeManifesto();
  });
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
    $('#gameover-screen').classList.remove('show', 'end-win', 'end-loss');
    updateBuildCosts();
    showToast('New run started.');
  });
  const gameoverSandbox = $maybe<HTMLButtonElement>('#gameover-sandbox');
  if (gameoverSandbox) gameoverSandbox.addEventListener('click', () => {
    state.gameOver = null;
    state.sandboxMode = true;
    state.paused = false;
    $('#gameover-screen').classList.remove('show', 'end-win', 'end-loss');
    updateBuildCosts();
    showToast('Sandbox mode enabled.');
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
    const srcIcon = type === 'solarPlant' ? 'solarPlant' : type === 'windPlant' ? 'windPlant' : 'nuclearPlant';
    const srcLabel = type === 'solarPlant' ? 'Sunlight'
                   : type === 'windPlant' ? 'Wind'
                   : 'Fission';
    const efficiency = (getElectrolyzerEfficiency(state) * 100).toFixed(0);
    html += `<div class="flow-diagram">${inlineIcon(srcIcon)} ${srcLabel} <span class="flow-arrow">-></span> internal <span class="flow-arrow">-></span> ${inlineIcon('electrolyzer')} ${efficiency}% <span class="flow-arrow">-></span> H₂ <em>to pipe</em></div>`;
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
  syncResearchAffordability();

  // Budget warns below €30M and turns critical at zero.
  const moneyEl = $('#hud-money');
  moneyEl.textContent = formatCurrency(s.money);
  moneyEl.className = `hud-value${s.money <= 0 ? ' danger' : s.money < 30_000_000 ? ' warn' : ''}`;
  $('#hud-price').textContent = `€ ${s.spotPrice.toFixed(2)}/kg`;
  $('#hud-produced').textContent = fmtTonnes(s.totalH2Produced);
  $('#hud-customers').textContent = String(s.customers.filter(c => c.active).length);

  // Date display follows the simulation's day-of-year so the visible
  // calendar stays aligned with weather and seasonality.
  const currentYear = 2025 + Math.floor((s.gameDay - 1) / 365);
  $('#hud-day').textContent = formatEnglishDate(currentYear, s.dayOfYear);
  $('#hud-season').textContent = ENGLISH_SEASONS[getSeason(s.dayOfYear)];

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
  revEl.textContent = `${formatSignedCurrency(avgRevenue)}/day`;
  opxEl.textContent = `${formatSignedCurrency(-avgOpex)}/day`;
  netEl.textContent = `${formatSignedCurrency(net)}/day`;
  netEl.classList.toggle('good', net > 0);
  netEl.classList.toggle('bad', net < 0);

  // Network group.
  const tierSummary = getTierPopulationSummary();
  const slotSummary = getCustomerSlotSummary();
  $('#stat-customers').textContent = `Slots ${slotSummary.occupied}/${slotSummary.total} · Small ${tierSummary.small.live}/${SMALL_TIER_CAP} · Mid ${tierSummary.mid.live}/${MID_TIER_CAP} · Big ${tierSummary.big.live}/${BIG_TIER_CAP}`;
  const storageEl = $maybe('#stat-storage-capacity');
  if (storageEl) storageEl.textContent = fmtTonnes(getNetworkStorageCapacityKg());

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
 * Populate + show the end-state modal when `state.gameOver` is set.
 * Idempotent — only re-renders the stats block once per flip.
 */
function updateGameOverScreen(): void {
  const root = $maybe('#gameover-screen');
  if (!root) return;
  const over = state.gameOver;
  if (!over?.triggered) {
    root.classList.remove('show', 'end-win', 'end-loss');
    return;
  }
  if (!root.classList.contains('show')) {
    const won = over.reason === 'marketComplete';
    root.classList.toggle('end-win', won);
    root.classList.toggle('end-loss', !won);
    const titleEl = $('#gameover-title');
    const reasonEl = $('#gameover-reason');
    const sandboxBtn = $maybe<HTMLButtonElement>('#gameover-sandbox');
    if (sandboxBtn) sandboxBtn.style.display = won ? 'inline-flex' : 'none';
    if (over.reason === 'capitalDepleted') {
      titleEl.textContent = 'Operation Failed';
      reasonEl.textContent =
        'The budget reached €0. The operation ran out of capital before the flywheel caught. Start a new run and build a market before cash runs dry.';
    } else if (over.reason === 'pressureDepleted') {
      titleEl.textContent = 'Operation Failed';
      reasonEl.textContent =
        'Network pressure fell to 0.00 bar. The backbone ran dry, customers lost supply, and the system could not recover. Start a new run and keep the pipe pressurized.';
    } else if (over.reason === 'marketComplete') {
      titleEl.textContent = 'Backbone Complete';
      reasonEl.textContent =
        'Every customer slot is filled. France has a working hydrogen backbone: producers, pipes, storage, and demand are all connected into one market.';
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
  const slotSummary = getCustomerSlotSummary();
  let connected = 0;
  for (const rc of Object.values(s.regions)) {
    if (rc.pipeConnections > 0) connected++;
  }
  return [
    { label: 'Days elapsed', value: String(s.gameDay) },
    { label: 'Customers online', value: String(s.customers.filter(c => c.active).length) },
    { label: 'Customer slots', value: `${slotSummary.occupied} / ${slotSummary.total}` },
    { label: 'Final network pressure', value: formatPressure(s.networkPressure) },
    { label: 'Connected regions', value: `${connected} / ${Object.keys(s.regions).length}` },
    { label: 'Final spot price', value: `€ ${s.spotPrice.toFixed(2)}/kg` },
    { label: 'Final budget', value: formatCurrency(s.money) }
  ];
}

// ─── DOM region tooltip (follows cursor on hover) ────────────────────────
/**
 * Show/update the DOM region tooltip at the cursor. Renders a rich
 * summary: name, bonus bars (solar/wind/industry), port, current
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
  html += bar('Industry', Math.min(1, rc.industryDemand));
  if (rc.hasPort) html += `<div class="sub-line">${inlineIcon('exportTerminal')} Port: ${rc.portName}</div>`;
  html += `<div class="sub-line">${inlineIcon('saltCavern')} Cavern geology: ${cavernEligible ? 'viable' : 'not suitable (no salt)'}</div>`;

  html += `<div class="sub-section">`;
  html += `<div class="sub-line">Cloud ${Math.round(w.clouds * 100)}% · Wind ${(w.wind * 100).toFixed(0)}%</div>`;
  html += `<div class="sub-line">Buildings: ${buildingCount} / ${rc.maxSlots}</div>`;
  if (cavern) {
    if (rs.pipeConnections > 0) html += `<div class="sub-line">Salt Cavern: online — contributing to network storage</div>`;
    else html += `<div class="sub-line">Salt Cavern: online — awaiting pipeline connection</div>`;
  }
  const avgRegionSupply = getRollingRegionSupply(state, regionId);
  const avgRegionDemand = getRollingRegionDemand(state, regionId);
  if (rs.pipeConnections > 0) {
    html += `<div class="sub-line">${inlineIcon('pressureGauge')} Pressure: ${formatPressure(rs.pressure)} · € ${rs.localPrice.toFixed(2)}/kg</div>`;
    html += `<div class="sub-line">Supply ${fmtWhole(avgRegionSupply)} / Demand ${fmtWhole(avgRegionDemand)} kg/day (24h avg)</div>`;
    html += `<div class="sub-line tooltip-now">now ${fmtWhole(rs.supply)} / ${fmtWhole(rs.demand)}</div>`;
  } else if (rs.supply > 0 || avgRegionSupply > 0) {
    html += `<div class="sub-line">Supply ${fmtWhole(avgRegionSupply)} kg/day (24h avg, no pipe)</div>`;
    html += `<div class="sub-line tooltip-now">now ${fmtWhole(rs.supply)}</div>`;
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
      costEl.textContent = `€ ${fmtMoney(pipeCfg.baseCostPerKm)}/km`;
      btn.classList.toggle('disabled', state.money < 5_000_000);
    } else {
      const cost = getCost(type as Exclude<BuildingType, 'pipeline'>);
      costEl.textContent = type === 'saltCavern'
        ? `€ ${fmtMoney(cost)} · 2 Mm³`
        : `€ ${fmtMoney(cost)}`;
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
  html += row('Nuclear Output', 'Site-independent');
  html += row('Industry Factor', `${(rc.industryDemand * 100).toFixed(0)}%`);
  if (rc.hasPort) html += row('Port', `${inlineIcon('exportTerminal')} ${rc.portName}`);
  html += row('Pipe Connections', String(rs.pipeConnections || 0));
  html += row('Local H₂ Price', `€ ${rs.localPrice.toFixed(2)}/kg`);
  html += row('Pressure', formatPressure(rs.pressure));
  html += row('Cavern Geology', SALT_CAVERN_ELIGIBLE_REGIONS[regionId] ? 'Viable' : 'Not suitable (no salt)');
  const infoAvgSupply = getRollingRegionSupply(state, regionId);
  const infoAvgDemand = getRollingRegionDemand(state, regionId);
  html += row('Supply (24h avg)', `${fmtWhole(infoAvgSupply)} kg/day · now ${fmtWhole(rs.supply)}`);
  html += row('Demand (24h avg)', `${fmtWhole(infoAvgDemand)} kg/day · now ${fmtWhole(rs.demand)}`);
  const cavern = getRegionSaltCavern(regionId);
  if (cavern) {
    if (rs.pipeConnections > 0) {
      html += row('Salt Cavern', 'Online — contributing to network storage');
    } else {
      html += row('Salt Cavern', 'Online — awaiting pipeline connection');
    }
  } else if (SALT_CAVERN_ELIGIBLE_REGIONS[regionId]) {
    html += `<div class="info-section"><h4>Salt Cavern</h4><button id="info-build-cavern" class="info-action-btn">Build Salt Cavern <span class="info-action-cost">€ ${fmtMoney(BUILDINGS.saltCavern.baseCost)}</span></button><div class="info-action-meta">2 Mm³ · ~15,000 tonnes H₂ · immediate backbone storage</div></div>`;
  }

  if (buildings.length > 0) {
    html += `<div class="info-section"><h4>Buildings (${buildings.length + (cavern ? 1 : 0)}/${rc.maxSlots})</h4>`;
    const counts: Record<string, number> = {};
    for (const b of buildings) counts[b.type] = (counts[b.type] || 0) + 1;
    for (const [type, count] of Object.entries(counts)) {
      const cfg = BUILDINGS[type as BuildingType];
      html += `<div class="icon-list-row">${inlineIcon(cfg.icon)} ${cfg.name} ×${count}</div>`;
    }
    if (cavern) {
      html += `<div class="icon-list-row">${inlineIcon(BUILDINGS.saltCavern.icon)} ${BUILDINGS.saltCavern.name} ×1</div>`;
    }
    html += '</div>';
  } else if (cavern) {
    html += `<div class="info-section"><h4>Buildings (1/${rc.maxSlots})</h4><div class="icon-list-row">${inlineIcon(BUILDINGS.saltCavern.icon)} ${BUILDINGS.saltCavern.name} ×1</div></div>`;
  }

  if (customers.length > 0) {
    html += `<div class="info-section"><h4>Customers (${customers.length})</h4>`;
    for (const c of customers) {
      const cfg = CUSTOMER_TYPES[c.type];
      html += `<div class="icon-list-row">${inlineIcon(cfg.icon)} ${c.name} (${fmtNum(c.demand)} kg/day)</div>`;
    }
    html += '</div>';
  }

  let quote = '';
  if (rc.solarBase >= 0.8) quote = '"Solar electricity in southern Europe costs 20 €/MWh today… This is not a projection."';
  else if (rc.windBase >= 0.8) quote = '"Every MWh of excess renewable generation can be converted to hydrogen."';
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
 * out after 2.5s. Used for ephemeral feedback: "Game saved",
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
  const ref = String(134 + state.insightIndex).padStart(3, '0');
  $('#mp-title').textContent = `OFFICE MEMO · Document Ref. 2027-M/${ref}`;
  $('#mp-text').textContent = `${insight.title}\n\n${insight.text}`;
  $('#manifesto-popup').style.display = 'flex';
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

function investInResearch(track: ResearchTrackName): void {
  const nextCost = getNextTierCost(state, track);
  if (nextCost === null) {
    showToast('Research already complete.');
    return;
  }
  const prerequisite = getResearchPrerequisite(state, track);
  if (!prerequisite.met) {
    showToast(`Need ${prerequisite.required} ${prerequisite.label} for the next ${labelResearchTrack(track)} tier.`);
    return;
  }
  if (!buyResearchTier(state, track)) {
    showToast(`Need € ${fmtMoney(nextCost)} for the next ${labelResearchTrack(track)} tier.`);
    return;
  }
  updateBuildCosts();
  updateResearchPanel();
  playResearchComplete();
  showToast(`${labelResearchTrack(track)} research advanced to tier ${state.research[track].tier}.`);
}

function updateResearchPanel(): void {
  const summary = $maybe('#research-summary');
  const cards = $maybe('#research-cards');
  if (!summary || !cards) return;
  const signature = JSON.stringify({
    solar: state.research.solar.tier,
    wind: state.research.wind.tier,
    nuclear: state.research.nuclear.tier,
    electrolyzer: state.research.electrolyzer.tier,
    solarPrereq: getResearchPrerequisite(state, 'solar').current,
    windPrereq: getResearchPrerequisite(state, 'wind').current,
    nuclearPrereq: getResearchPrerequisite(state, 'nuclear').current,
    electrolyzerPrereq: getResearchPrerequisite(state, 'electrolyzer').current
  });
  if (signature === lastResearchPanelSignature) return;
  lastResearchPanelSignature = signature;
  const tiers = getTotalResearchTiers(state);
  summary.innerHTML =
    `Wright-style learning cuts new plant CAPEX and steadily lowers the hydrogen price the network can sustain.` +
    `<br>Research progress: <strong>${tiers}/20 tiers</strong>.`;
  const tracks: ResearchTrackName[] = ['solar', 'wind', 'nuclear', 'electrolyzer'];
  cards.innerHTML = tracks.map(renderResearchCard).join('');
  syncResearchAffordability();
}

function renderResearchCard(track: ResearchTrackName): string {
  const tier = state.research[track].tier;
  const nextCost = getNextTierCost(state, track);
  const maxed = tier >= MAX_RESEARCH_TIER;
  const prerequisite = getResearchPrerequisite(state, track);
  const affordable = nextCost !== null && state.money >= nextCost;
  const unlocked = maxed || prerequisite.met;
  const canInvest = affordable && unlocked;
  const lines = getResearchCardLines(track, tier);
  const pips = Array.from({ length: MAX_RESEARCH_TIER }, (_, index) =>
    `<span class="research-pip${index < tier ? ' on' : ''}"></span>`
  ).join('');
  const prerequisiteLine = maxed
    ? ''
    : `<div class="research-line"><strong>Requires:</strong> ${prerequisite.current}/${prerequisite.required} ${prerequisite.label}</div>`;
  const action = maxed
    ? `<div class="research-maxed">Research complete</div>`
    : `<button class="research-buy" data-research-track="${track}"${canInvest ? '' : ' disabled'}>${getResearchButtonText(nextCost ?? 0, prerequisite)}</button>`;
  return `<div class="research-card${maxed ? ' research-card-complete' : ''}">
    <h4>${labelResearchTrack(track)} Research</h4>
    <div class="research-tier">Tier ${tier} of ${MAX_RESEARCH_TIER}</div>
    <div class="research-pips">${pips}</div>
    <div class="research-line"><strong>Current:</strong> ${lines.current}</div>
    <div class="research-line"><strong>Next:</strong> ${lines.next}</div>
    ${prerequisiteLine}
    ${action}
  </div>`;
}

function syncResearchAffordability(): void {
  const cards = $maybe('#research-cards');
  if (!cards) return;
  const buttons = cards.querySelectorAll<HTMLButtonElement>('[data-research-track]');
  buttons.forEach(btn => {
    const track = btn.dataset.researchTrack as ResearchTrackName | undefined;
    if (!track) return;
    const nextCost = getNextTierCost(state, track);
    if (nextCost === null) return;
    const prerequisite = getResearchPrerequisite(state, track);
    const affordable = state.money >= nextCost;
    btn.disabled = !affordable || !prerequisite.met;
    btn.textContent = getResearchButtonText(nextCost, prerequisite);
  });
}

function getResearchButtonText(cost: number, prerequisite: ReturnType<typeof getResearchPrerequisite>): string {
  if (!prerequisite.met) return `Need ${prerequisite.required} plants · € ${fmtMoney(cost)}`;
  return `${state.money >= cost ? 'Invest' : 'Insufficient budget'} · € ${fmtMoney(cost)}`;
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
  if (track === 'nuclear') {
    const current = tier === 0 ? 'baseline nuclear reactor CAPEX' : `-${tier * 10}% nuclear reactor CAPEX`;
    const next = tier >= MAX_RESEARCH_TIER ? 'maxed' : `-${(tier + 1) * 10}% nuclear reactor CAPEX`;
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
    case 'nuclear': return 'Nuclear';
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

/** Generic numeric formatter for readouts that should keep separators. */
export function fmtNum(n: number): string {
  return fmtWhole(n);
}

/** Whole-number formatter with thousands separators for instrument readouts. */
export function fmtWhole(n: number): string {
  return Math.round(n).toLocaleString('en-US');
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
  if (t >= 1e6) return `${(t / 1e6).toFixed(1)} Mt`;
  if (t >= 1e3) return `${(t / 1e3).toFixed(1)} Kt`;
  if (t >= 1) return `${t.toFixed(1)} t`;
  return `${fmtWhole(kg)} kg`;
}
