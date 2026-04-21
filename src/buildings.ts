import { playBubble, playBuild } from './audio';
import { BUILDINGS, LEARNING, REGIONS, TICKS_PER_DAY, getRegionConfig } from './config';
import { distanceBetween, getCenter } from './map';
import { spawnPressurePulse } from './particles';
import { state } from './state';
import { fmtMoney, showToast, updateBuildCosts } from './ui';
import type {
  Building,
  BuildingType,
  ElectrolyzerConfig,
  GeneratorBuildingConfig,
  PlaceableBuildingType
} from './types';

/**
 * Current effective build cost for a placeable type, with Wright's Law
 * multiplier applied. Drives both the HUD cost readout and actual spend.
 */
export function getCost(type: PlaceableBuildingType): number {
  const base = BUILDINGS[type].baseCost;
  const mult = state.wright[type].mult;
  return Math.round(base * mult);
}

/**
 * Predicate for "can the player place this building in this region right
 * now?" — checks budget, region slot capacity, and nuclear sites (only
 * regions with `nuclearBonus ≥ 0.5` are nuclear-friendly). Pipelines
 * bypass all of this; they're validated in buildPipeline.
 */
export function canBuild(type: BuildingType, regionId: string): boolean {
  if (type === 'pipeline') return true;
  const cost = getCost(type);
  if (state.money < cost) return false;
  const rc = getRegionConfig(regionId);
  if (!rc) return false;
  const count = state.buildings.filter(b => b.regionId === regionId).length;
  if (count >= rc.maxSlots) return false;
  if (type === 'nuclear' && rc.nuclearBonus < 0.5) return false;
  return true;
}

/**
 * Place a building (non-pipeline) in a region. Deducts the current cost,
 * records the building, fans out position around the region centroid so
 * icons don't overlap, advances the Wright's Law curve (cost drops with
 * each doubling of cumulative installed capacity), and plays the type-
 * appropriate sfx. Pipelines go through buildPipeline instead.
 */
export function build(type: BuildingType, regionId: string): void {
  if (type === 'pipeline') return; // pipelines go through buildPipeline
  if (!canBuild(type, regionId)) {
    showToast('Cannot build here!');
    return;
  }
  const cost = getCost(type);
  const rc = getRegionConfig(regionId);
  if (!rc) return;
  const center = getCenter(regionId);

  // Offset position slightly so buildings don't overlap
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
    builtDay: state.gameDay,
    production: 0
  };
  state.buildings.push(b);

  // Update Wright's Law: each doubling of units reduces cost by learning rate.
  const w = state.wright[type];
  w.cum += capacity || 1;
  const lr = LEARNING[type];
  const unitSize = capacity || 1;
  const units = w.cum / unitSize;
  if (units > 1) {
    const exp = Math.log2(1 - lr); // negative exponent
    w.mult = Math.max(0.3, Math.pow(units, exp));
  }

  if (type === 'electrolyzer') playBubble();
  else playBuild();
  showToast(`${cfg.name} built in ${rc.name}!`);
  updateBuildCosts();
}

/**
 * Place a pipeline between two regions. Cost is baseCostPerKm × distance,
 * further discounted by the minimum of the two regions' gas-infra factors
 * (reusing old corridors is cheaper — the core "reuse what exists"
 * argument), and scaled by the pipeline Wright's Law multiplier. Rejects
 * duplicate connections. Updates both regions' pipeConnections counters.
 */
export function buildPipeline(fromId: string, toId: string): void {
  // Check if pipe already exists
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

  // Discount for existing gas infrastructure
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

  state.regions[fromId].pipeConnections = (state.regions[fromId].pipeConnections || 0) + 1;
  state.regions[toId].pipeConnections = (state.regions[toId].pipeConnections || 0) + 1;

  // Wright's Law for pipeline (200 km = 1 "unit" for the learning curve).
  const w = state.wright.pipeline;
  w.cum += dist;
  const lr = LEARNING.pipeline;
  const pipeUnits = w.cum / 200;
  if (pipeUnits > 1) {
    const exp = Math.log2(1 - lr);
    w.mult = Math.max(0.4, Math.pow(pipeUnits, exp));
  }

  playBuild();
  showToast(`Pipeline: ${fromCfg.name} → ${toCfg.name} (${Math.round(dist)}km, €${fmtMoney(cost)})`);
  updateBuildCosts();
}

/**
 * Per-tick production pass. Run in two stages:
 *
 * 1. Reset region totals, then walk every generator (solar/wind/nuclear)
 *    and add its output to its region's electricity pool. Solar and wind
 *    use weather-adjusted factors computed earlier in updateWeather;
 *    nuclear is flat multiplied by the region's nuclearBonus.
 * 2. Walk electrolyzers: each consumes up to its MW-day cap from the
 *    local electricity pool, converts to H₂ via the efficiency formula,
 *    and pushes the H₂ into regional supply. Emit occasional injection
 *    pulses for visual feedback.
 *
 * Leftover regional electricity after all electrolyzers have run counts
 * as curtailment — the "scandal" metric the manifesto argues disappears
 * once the backbone exists.
 */
export function updateProduction(): void {
  const s = state;

  for (const rc of REGIONS) {
    s.regions[rc.id].electricity = 0;
    s.regions[rc.id].supply = 0;
  }

  let totalCurtailed = 0;

  // Calculate electricity production per region.
  for (const b of s.buildings) {
    const rs = s.regions[b.regionId];
    if (b.type === 'solar') {
      const cfg = BUILDINGS.solar as GeneratorBuildingConfig;
      b.production = cfg.baseOutput * (rs.solarFactor ?? 0);
      rs.electricity += b.production;
    } else if (b.type === 'wind') {
      const cfg = BUILDINGS.wind as GeneratorBuildingConfig;
      b.production = cfg.baseOutput * (rs.windFactor ?? 0);
      rs.electricity += b.production;
    } else if (b.type === 'nuclear') {
      const cfg = BUILDINGS.nuclear as GeneratorBuildingConfig;
      const rc = getRegionConfig(b.regionId);
      b.production = cfg.baseOutput * cfg.capacityFactor * (rc?.nuclearBonus ?? 1);
      rs.electricity += b.production;
    }
  }

  // Electrolyzers consume electricity and produce H₂.
  const eCfg = BUILDINGS.electrolyzer as ElectrolyzerConfig;
  for (const b of s.buildings) {
    if (b.type !== 'electrolyzer') continue;
    const rs = s.regions[b.regionId];

    const maxElectricity = eCfg.capacity * 24; // MWh/day at full load
    const available = rs.electricity;
    const consumed = Math.min(maxElectricity, available);

    if (consumed > 0) {
      rs.electricity -= consumed;
      // Convert to H₂: (MWh → kWh) / kwhPerKg, then apply efficiency.
      const h2Produced = (consumed * 1000 / eCfg.kwhPerKg) * eCfg.efficiency;
      b.production = h2Produced;
      rs.supply += h2Produced;
      s.totalH2Produced += h2Produced / TICKS_PER_DAY;
      // Occasional injection pulse if the region is connected to the network.
      if (rs.pipeConnections > 0 && Math.random() < 0.03) {
        spawnPressurePulse(b.regionId, 'inject', Math.min(1, h2Produced / 2000));
      }
    } else {
      b.production = 0;
    }
  }

  // Track curtailment (unused electricity).
  for (const rc of REGIONS) {
    const rs = s.regions[rc.id];
    if (rs.electricity > 0) totalCurtailed += rs.electricity;
  }
  s.totalCurtailed += totalCurtailed / TICKS_PER_DAY;
}
