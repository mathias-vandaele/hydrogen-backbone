import { playBuild } from './audio';
import {
  BUILDINGS,
  ECONOMY,
  LEARNING,
  REGIONS,
  TICKS_PER_DAY,
  WRIGHT_SAVINGS_CAP,
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
 * Current effective build cost for a placeable type, with Wright's Law
 * multiplier AND the v4 global BUILDING_COST_MULTIPLIER applied. Drives
 * both the HUD cost readout and actual spend at placement time.
 */
export function getCost(type: PlaceableBuildingType): number {
  const base = BUILDINGS[type].baseCost;
  const mult = state.wright[type].mult;
  return Math.round(base * mult * ECONOMY.BUILDING_COST_MULTIPLIER);
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
 * don't overlap, advances the Wright's Law curve (cost drops with each
 * doubling of cumulative capacity, floored by WRIGHT_SAVINGS_CAP), and
 * plays the construction sfx. Pipelines go through buildPipeline.
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

  // Wright's Law: each doubling of cumulative units trims cost by the
  // learning rate, down to a floor of (1 - WRIGHT_SAVINGS_CAP).
  const w = state.wright[type];
  w.cum += capacity || 1;
  const lr = LEARNING[type];
  const unitSize = capacity || 1;
  const units = w.cum / unitSize;
  if (units > 1) {
    const exp = Math.log2(1 - lr);
    w.mult = Math.max(1 - WRIGHT_SAVINGS_CAP, Math.pow(units, exp));
  }

  playBuild();
  showToast(`${cfg.name} built in ${rc.name}!`);
  updateBuildCosts();
}

/**
 * Place a pipeline between two regions. Cost is baseCostPerKm × distance,
 * discounted by the minimum of the two regions' gas-infra factors (reusing
 * old corridors is cheaper — the core "reuse what exists" argument), and
 * scaled by the pipeline Wright's Law multiplier. Rejects duplicate
 * connections. Updates both regions' pipeConnections counters.
 */
export function buildPipeline(fromId: string, toId: string): void {
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
  const wMult = state.wright.pipeline.mult;
  const cost = Math.round(cfg.baseCostPerKm * dist * infraDiscount * wMult);

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
    pressure: 30,
    linepackCapacity: Math.round(cfg.linepackPerKm * dist),
    linepackStored: 0,
    builtDay: state.gameDay
  });

  // First-pipeline-built tracker drives the Priority 4 grace window.
  if (state.firstPipelineBuiltDay === null) state.firstPipelineBuiltDay = state.gameDay;

  state.regions[fromId].pipeConnections = (state.regions[fromId].pipeConnections || 0) + 1;
  state.regions[toId].pipeConnections = (state.regions[toId].pipeConnections || 0) + 1;

  const w = state.wright.pipeline;
  w.cum += dist;
  const lr = LEARNING.pipeline;
  const pipeUnits = w.cum / 200;
  if (pipeUnits > 1) {
    const exp = Math.log2(1 - lr);
    w.mult = Math.max(1 - WRIGHT_SAVINGS_CAP, Math.pow(pipeUnits, exp));
  }

  playBuild();
  showToast(`Pipeline: ${fromCfg.name} → ${toCfg.name} (${Math.round(dist)}km, €${fmtMoney(cost)})`);
  updateBuildCosts();
}

/**
 * Per-tick production pass for Hydrogen Plants. Each plant:
 *  1. Computes internal electricity generation from its weather-adjusted
 *     factor (solar/wind) or capacity-factor × nuclear bonus (nuclear).
 *  2. Passes that electricity through its integrated electrolyzer at
 *     ~70% efficiency to get kg/day of hydrogen.
 *  3. Adds the hydrogen to the region's supply. Only molecules leave the
 *     plant; `internalElectricity` is exposed for the renderer's
 *     electrons-to-molecules animation and the hover flow diagram.
 *
 * There is no separate curtailment step — any unused electricity stays
 * inside the plant and is simply wasted there, counted as lost production.
 */
export function updateProduction(): void {
  const s = state;

  for (const rc of REGIONS) {
    s.regions[rc.id].electricity = 0;
    s.regions[rc.id].supply = 0;
  }

  let totalCurtailed = 0;

  for (const b of s.buildings) {
    const rs = s.regions[b.regionId];
    const rc = getRegionConfig(b.regionId);
    if (!rc) continue;

    if (b.type === 'solarPlant' || b.type === 'windPlant' || b.type === 'nuclearPlant') {
      const cfg = BUILDINGS[b.type] as HydrogenPlantConfig;
      // Internal generator output in MW-equivalent
      let genFactor = 0;
      if (b.type === 'solarPlant') genFactor = rs.solarFactor ?? 0;
      else if (b.type === 'windPlant') genFactor = rs.windFactor ?? 0;
      else genFactor = cfg.capacityFactor * (rc.nuclearBonus ?? 1);

      const internalMW = cfg.baseOutput * genFactor;
      b.internalElectricity = internalMW;

      // Max electrolyzer throughput is the plant's own generator cap.
      const internalMWh = internalMW * 24;
      const h2Produced = (internalMWh * 1000 / cfg.kwhPerKg) * cfg.electrolyzerEfficiency;

      b.production = h2Produced;
      rs.supply += h2Produced;
      s.totalH2Produced += h2Produced / TICKS_PER_DAY;
      rs.electricity += 0; // Hydrogen plants contribute no grid electricity.

      if (rs.pipeConnections > 0 && Math.random() < 0.02) {
        spawnPressurePulse(b.regionId, 'inject', Math.min(1, h2Produced / 2000));
      }
    }
  }

  // Any residual region-level electricity (none, since plants consume
  // internally) would count here; keep the counter wired for v2 saves.
  for (const rc of REGIONS) {
    const rs = s.regions[rc.id];
    if (rs.electricity > 0) totalCurtailed += rs.electricity;
  }
  s.totalCurtailed += totalCurtailed / TICKS_PER_DAY;
}

/**
 * Sum of daily opex across every live building + pipeline. Stored on
 * `state.dailyOpex` so the HUD can read a stable number without
 * recomputing inside the render loop.
 */
export function computeDailyOpex(): number {
  let opex = 0;
  for (const b of state.buildings) opex += b.cost * ECONOMY.DAILY_OPEX_FRACTION;
  for (const p of state.pipes) opex += p.cost * ECONOMY.DAILY_OPEX_FRACTION;
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
