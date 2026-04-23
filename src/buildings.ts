import { playBuild } from './audio';
import {
  BUILDINGS,
  ELECTROLYZER_EFFICIENCY,
  KWH_PER_KG_H2,
  NUCLEAR_CYCLE_DAYS,
  NUCLEAR_FLEET_PHASE_OFFSET,
  NUCLEAR_OUTAGE_DAYS,
  OPEX_ANNUAL_FRACTION,
  REGIONS,
  TICKS_PER_DAY,
  getRegionConfig
} from './config';
import { distanceBetween, getCenter } from './map';
import { spawnPressurePulse } from './particles';
import { state } from './state';
import { fmtMoney, showToast, updateBuildCosts } from './ui';
import type {
  Building,
  BuildingType,
  HydrogenPlantConfig,
  PlaceableBuildingType
} from './types';

/**
 * Current effective build cost for a placeable type. Costs are fixed
 * base CAPEX values.
 */
export function getCost(type: PlaceableBuildingType): number {
  return Math.round(BUILDINGS[type].baseCost);
}

/**
 * Predicate for "can the player place this building in this region right
 * now?" — checks budget, region slot capacity, and region-type suitability.
 * Nuclear plants need a nuclear-friendly site (`nuclearBonus ≥ 0.5`).
 * Pipelines bypass this; they're validated in buildPipeline.
 */
export function canBuild(type: BuildingType, regionId: string): boolean {
  if (type === 'pipeline') return true;
  const cost = getCost(type);
  if (state.money < cost) return false;
  const rc = getRegionConfig(regionId);
  if (!rc) return false;
  const count = state.buildings.filter(b => b.regionId === regionId).length;
  if (count >= rc.maxSlots) return false;
  if (type === 'nuclearPlant' && rc.nuclearBonus < 0.5) return false;
  return true;
}

/**
 * Place a Hydrogen Plant in a region. Deducts the current cost, records
 * the building, fans out position around the region centroid so icons
 * don't overlap, and plays the construction sfx. Pipelines go through
 * buildPipeline.
 */
export function build(type: BuildingType, regionId: string): void {
  if (type === 'pipeline') return;
  if (!canBuild(type, regionId)) {
    showToast('Cannot build here!');
    return;
  }
  const cost = getCost(type);
  const rc = getRegionConfig(regionId);
  if (!rc) return;
  const center = getCenter(regionId);

  // Offset position around the centroid so multiple buildings don't overlap.
  const existing = state.buildings.filter(b => b.regionId === regionId);
  const angle = existing.length * (Math.PI * 2 / 8);
  const radius = 15 + existing.length * 3;
  const x = center[0] + Math.cos(angle) * radius;
  const y = center[1] + Math.sin(angle) * radius;

  state.money -= cost;
  const cfg = BUILDINGS[type];
  const capacity = 'capacity' in cfg ? cfg.capacity : 0;
  const b: Building = {
    id: state.nextBuildingId++,
    type,
    regionId,
    x,
    y,
    capacity,
    cost,
    builtDay: state.gameDay,
    production: 0,
    internalElectricity: 0
  };
  state.buildings.push(b);

  playBuild();
  showToast(`${cfg.name} built in ${rc.name}!`);
  updateBuildCosts();
}

/**
 * Place a pipeline between two regions. Cost is baseCostPerKm × distance,
 * discounted by the minimum of the two regions' gas-infra factors
 * (reusing old corridors is cheaper — the core "reuse what exists"
 * argument). Rejects duplicate connections. Updates both regions'
 * pipeConnections counters.
 */
export function buildPipeline(fromId: string, toId: string): void {
  const haveRootNetwork = state.pipes.length > 0;
  const fromConnected = (state.regions[fromId]?.pipeConnections ?? 0) > 0;
  const toConnected = (state.regions[toId]?.pipeConnections ?? 0) > 0;
  if (haveRootNetwork && !fromConnected && !toConnected) {
    showToast('New pipelines must connect to the existing backbone.');
    return;
  }

  const exists = state.pipes.find(p =>
    (p.fromId === fromId && p.toId === toId) ||
    (p.fromId === toId && p.toId === fromId)
  );
  if (exists) {
    showToast('Pipeline already exists between these regions!');
    return;
  }

  const dist = distanceBetween(fromId, toId);
  const cfg = BUILDINGS.pipeline;
  const fromCfg = getRegionConfig(fromId);
  const toCfg = getRegionConfig(toId);
  if (!fromCfg || !toCfg) return;

  const infraDiscount = 1.0 - (Math.min(fromCfg.gasInfra, toCfg.gasInfra) * 0.4);
  const cost = Math.round(cfg.baseCostPerKm * dist * infraDiscount);

  if (state.money < cost) {
    showToast(`Not enough money! Need €${fmtMoney(cost)}`);
    return;
  }

  state.money -= cost;

  state.pipes.push({
    id: state.nextPipeId++,
    fromId,
    toId,
    length: Math.round(dist),
    cost,
    maxFlow: cfg.maxFlow,
    flow: 0,
    pressure: state.networkPressure,
    linepackCapacity: Math.round(cfg.linepackPerKm * dist),
    linepackStored: 0,
    builtDay: state.gameDay
  });
  state.regions[fromId].pipeConnections = (state.regions[fromId].pipeConnections || 0) + 1;
  state.regions[toId].pipeConnections = (state.regions[toId].pipeConnections || 0) + 1;

  playBuild();
  showToast(`Pipeline: ${fromCfg.name} → ${toCfg.name} (${Math.round(dist)}km, €${fmtMoney(cost)})`);
  updateBuildCosts();
}

// ─── Production debug instrumentation (Shift+D) ──────────────────────────
// Off by default. Toggled from input.ts. When on, updateProduction()
// accumulates per-plant factors/MW/kg into `dailyStats` each tick, and
// logProductionDebugIfActive() dumps a one-line-per-plant report at each
// game-day boundary, plus rolls the plant's cumulative total forward so
// the "is production hitting 6,000 kg/day?" check is answerable from the
// browser console alone.

interface PlantDailyStats {
  factorSum: number;
  mwSum: number;
  kgSum: number;
  ticks: number;
}

export const productionDebug = {
  active: false,
  dailyStats: new Map<number, PlantDailyStats>(),
  cumulativeKg: new Map<number, number>()
};

export function toggleProductionDebug(): boolean {
  productionDebug.active = !productionDebug.active;
  if (!productionDebug.active) {
    productionDebug.dailyStats.clear();
  }
  return productionDebug.active;
}

/**
 * Emit one console line per plant summarising today's production. Also
 * folds the day's kg into each plant's cumulative counter. Only runs
 * when debug mode is on; called once per day-boundary from sim.tick.
 */
export function logProductionDebugIfActive(): void {
  if (!productionDebug.active) return;
  const s = state;
  for (const b of s.buildings) {
    if (b.type !== 'solarPlant' && b.type !== 'windPlant' && b.type !== 'nuclearPlant') continue;
    const stats = productionDebug.dailyStats.get(b.id);
    const rc = getRegionConfig(b.regionId);
    const cfg = BUILDINGS[b.type];
    const regionName = rc?.name ?? b.regionId;
    const factorLabel = b.type === 'solarPlant' ? 'solarFactor'
      : b.type === 'windPlant' ? 'windFactor'
      : 'availability';
    const avgFactor = stats && stats.ticks > 0 ? stats.factorSum / stats.ticks : 0;
    const avgMW = stats && stats.ticks > 0 ? stats.mwSum / stats.ticks : 0;
    const dailyKg = stats ? stats.kgSum : 0;
    const cumulative = (productionDebug.cumulativeKg.get(b.id) ?? 0) + dailyKg;
    productionDebug.cumulativeKg.set(b.id, cumulative);
    // eslint-disable-next-line no-console
    console.log(
      `[day ${s.gameDay}] ${cfg.name} #${b.id} @ ${regionName}\n` +
      `  nameplate: ${('capacity' in cfg ? cfg.capacity : 0)} MW\n` +
      `  ${factorLabel} (today avg): ${avgFactor.toFixed(3)}\n` +
      `  internalMW (today avg): ${avgMW.toFixed(1)}\n` +
      `  dailyKg: ${Math.round(dailyKg).toLocaleString()}\n` +
      `  cumulativeKg: ${Math.round(cumulative).toLocaleString()}`
    );
  }
  productionDebug.dailyStats.clear();
}

/**
 * Is a nuclear plant currently in its planned refuelling outage?
 * Each plant has a phase-offset so outages are spread across the fleet
 * (not all reactors offline at once). With 75-day outage in a 270-day
 * cycle → ~27.8% outage ≈ 72.2% availability, matching RTE's published
 * French reactor-fleet CF of ~0.72.
 */
function nuclearAvailability(b: Building, gameDay: number): number {
  const offset = (b.id * NUCLEAR_FLEET_PHASE_OFFSET) % NUCLEAR_CYCLE_DAYS;
  const cycleDay = (gameDay + offset) % NUCLEAR_CYCLE_DAYS;
  return cycleDay < NUCLEAR_OUTAGE_DAYS ? 0 : 1;
}

/**
 * Per-tick production pass — v5 instantaneous model. No capacity-factor
 * multiplier is applied; real CFs emerge from day/night, weather, and
 * the nuclear outage schedule.
 *
 * For each plant:
 *   Solar:   electricity_MW = nameplate × solarFactor
 *              where solarFactor = solarBase × seasonal × solarCurve × cloudMult
 *              (all four baked into rs.solarFactor by weather.ts).
 *              Peak Occitanie solar noon clear sky ≈ 100 × 1.25 = 125 MW.
 *              Midnight: 0 MW. Winter noon clear: ≈ 50-60 MW.
 *   Wind:    electricity_MW = min(nameplate, nameplate × windFactor)
 *              where windFactor = windBase × seasonal × windPower
 *              (all baked into rs.windFactor). Hard-capped at nameplate
 *              to reflect turbine electrical limits — the "coastal bonus"
 *              means the plant reaches cap more often, not that it
 *              exceeds it.
 *   Nuclear: electricity_MW = nameplate × nuclearAvailability
 *              0 during outage, nameplate otherwise. No weather.
 *
 * Hydrogen output uses the shared formula:
 *   h2_kg_per_day = electricity_MW × 24 × 1000 × EFFICIENCY / KWH_PER_KG_H2
 */
export function updateProduction(): void {
  const s = state;

  for (const rc of REGIONS) {
    s.regions[rc.id].electricity = 0;
    s.regions[rc.id].supply = 0;
  }

  for (const b of s.buildings) {
    const rs = s.regions[b.regionId];
    const rc = getRegionConfig(b.regionId);
    if (!rc) continue;

    if (b.type === 'solarPlant' || b.type === 'windPlant' || b.type === 'nuclearPlant') {
      const cfg = BUILDINGS[b.type] as HydrogenPlantConfig;
      const nameplate = cfg.baseOutput; // nameplate MW

      // v5.1: every multiplier in the chain (regional bonus, seasonal,
      // day/night, cloud/wind noise) is bounded [0, 1], so solarFactor
      // and windFactor are ≤ 1.0 by construction. Peak output is
      // therefore ≤ nameplate at the data level — no min() clip needed.
      let genFactor = 0;
      if (b.type === 'solarPlant') genFactor = rs.solarFactor ?? 0;
      else if (b.type === 'windPlant') genFactor = rs.windFactor ?? 0;
      else genFactor = nuclearAvailability(b, s.gameDay);
      const internalMW = nameplate * genFactor;
      b.internalElectricity = internalMW;

      const h2Produced = internalMW * 24 * 1000 * ELECTROLYZER_EFFICIENCY / KWH_PER_KG_H2;

      b.production = h2Produced;
      rs.supply += h2Produced;
      s.totalH2Produced += h2Produced / TICKS_PER_DAY;

      if (productionDebug.active) {
        const prev = productionDebug.dailyStats.get(b.id)
          ?? { factorSum: 0, mwSum: 0, kgSum: 0, ticks: 0 };
        prev.factorSum += genFactor;
        prev.mwSum += internalMW;
        prev.kgSum += h2Produced / TICKS_PER_DAY;
        prev.ticks += 1;
        productionDebug.dailyStats.set(b.id, prev);
      }

      if (rs.pipeConnections > 0 && Math.random() < 0.02) {
        spawnPressurePulse(b.regionId, 'inject', Math.min(1, h2Produced / 2000));
      }
    }
  }
}

/** Per-type daily OPEX fraction = annual fraction / 365. */
function dailyOpexFractionFor(type: PlaceableBuildingType): number {
  switch (type) {
    case 'solarPlant':   return OPEX_ANNUAL_FRACTION.SOLAR_PLANT / 365;
    case 'windPlant':    return OPEX_ANNUAL_FRACTION.WIND_PLANT / 365;
    case 'nuclearPlant': return OPEX_ANNUAL_FRACTION.NUCLEAR_PLANT / 365;
  }
}

/**
 * Sum of daily opex across every live building + pipeline. v5: buildings
 * use per-type annual OPEX fractions sourced from IRENA/IEA real-world
 * references. Pipelines use the same annual-fraction model.
 */
export function computeDailyOpex(): number {
  let opex = 0;
  for (const b of state.buildings) opex += b.cost * dailyOpexFractionFor(b.type);
  for (const p of state.pipes) opex += p.cost * (OPEX_ANNUAL_FRACTION.PIPELINE / 365);
  return opex;
}

/**
 * Per-tick opex pass: drain 1/TICKS_PER_DAY of today's total daily opex
 * from the budget. Idle assets still pay — this is the mechanism that
 * punishes overbuilding ahead of demand (v4 scarcity, Priority 2).
 */
export function applyOpex(): void {
  const daily = computeDailyOpex();
  state.dailyOpex = daily;
  state.money -= daily / TICKS_PER_DAY;
}
