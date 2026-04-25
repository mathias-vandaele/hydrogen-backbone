import { playChaChing, playCustomer } from './audio';
import { noteThresholdCrossing } from './chart';
import {
  BIG_TIER_CAP,
  CUSTOMER_SUPPLY_BUFFER_MULTIPLIER,
  CUSTOMER_TYPES,
  EMERGENCE_LOGISTIC_CENTER,
  EMERGENCE_LOGISTIC_STEEPNESS,
  MAX_PRESSURE,
  MID_TIER_CAP,
  REGIONS,
  SMALL_TIER_CAP,
  TICKS_PER_DAY,
  getRegionConfig
} from './config';
import { getRollingAverageSupply } from './econ';
import { getCenter } from './map';
import { triggerRegionFlash } from './renderer';
import { state } from './state';
import { showToast } from './ui';
import type { CustomerTier, CustomerType, CustomerTypeConfig, SlotKind } from './types';

const TIER_CAPS: Record<CustomerTier, number> = {
  small: SMALL_TIER_CAP,
  mid: MID_TIER_CAP,
  big: BIG_TIER_CAP
};

export function checkEmergence(): void {
  evaluateEmergenceCandidates();
}

function evaluateEmergenceCandidates(): void {
  const s = state;
  const rollingSupply = getRollingAverageSupply(s);
  const totalDemand = getCurrentTotalDemand();
  const types = getEmergencePriorityOrder();

  for (const type of types) {
    const cfg = CUSTOMER_TYPES[type];
    const evalResult = evaluateType(cfg, rollingSupply, totalDemand);
    if (evalResult.priceRatio < 1 && s.thresholdCrossings[type] === null) {
      s.thresholdCrossings[type] = s.gameDay;
      noteThresholdCrossing(type);
    }
    if (!evalResult.tierOK || !evalResult.supplyOK || evalResult.dailyProbability <= 0) continue;

    for (const regionId of getEligibleRegions(cfg)) {
      if (evalResult.dailyProbability >= 1) {
        materializeCustomer(type, regionId, cfg.expectedDemand);
        return;
      }
      const perTickProbability = evalResult.dailyProbability / TICKS_PER_DAY;
      if (Math.random() >= perTickProbability) continue;
      materializeCustomer(type, regionId, cfg.expectedDemand);
      return;
    }
  }
}

function evaluateType(
  cfg: CustomerTypeConfig,
  rollingSupply: number,
  totalDemand: number
): {
  priceRatio: number;
  headroom: number;
  requiredHeadroom: number;
  supplyOK: boolean;
  tierOK: boolean;
  slotOK: boolean;
  dailyProbability: number;
} {
  const priceRatio = state.spotPrice / Math.max(0.001, cfg.priceThreshold);
  const headroom = rollingSupply - totalDemand;
  const requiredHeadroom = cfg.demandMin * CUSTOMER_SUPPLY_BUFFER_MULTIPLIER;
  const supplyOK = headroom >= requiredHeadroom;
  const tierOK = getReservedTierPopulation(cfg.tier) < getTierCap(cfg.tier);
  const slotOK = getEligibleRegions(cfg).length > 0;
  const dailyProbability = (!tierOK || !slotOK || !supplyOK)
    ? 0
    : emergenceDailyProbability(priceRatio);
  return { priceRatio, headroom, requiredHeadroom, supplyOK, tierOK, slotOK, dailyProbability };
}

function emergenceDailyProbability(priceRatio: number): number {
  if (state.networkPressure >= MAX_PRESSURE) return 1;
  if (priceRatio >= 1.0) return 0;
  return 1 / (1 + Math.exp(EMERGENCE_LOGISTIC_STEEPNESS * (priceRatio - EMERGENCE_LOGISTIC_CENTER)));
}

function getEligibleRegions(cfg: CustomerTypeConfig): string[] {
  const out: string[] = [];
  for (const rc of REGIONS) {
    const rs = state.regions[rc.id];
    if (rs.pipeConnections < cfg.minPipeConnections) continue;
    if (cfg.requiresPort && !rc.hasPort) continue;
    if (!hasFreeSlot(rc.id, cfg.slotKind)) continue;
    out.push(rc.id);
  }
  return out;
}

function getEmergencePriorityOrder(): CustomerType[] {
  const grouped: Record<CustomerTier, CustomerType[]> = { small: [], mid: [], big: [] };
  for (const type of Object.keys(CUSTOMER_TYPES) as CustomerType[]) {
    grouped[CUSTOMER_TYPES[type].tier].push(type);
  }
  return (['small', 'mid', 'big'] as CustomerTier[]).flatMap(tier =>
    grouped[tier].slice().sort(() => Math.random() - 0.5)
  );
}

export function hasFreeSlot(regionId: string, kind: SlotKind): boolean {
  const rc = getRegionConfig(regionId);
  if (!rc) return false;
  const cap = slotCapacity(rc, kind);
  if (cap <= 0) return false;
  return getSlotOccupancy(regionId, kind) < cap;
}

function slotCapacity(rc: ReturnType<typeof getRegionConfig> & object, kind: SlotKind): number {
  switch (kind) {
    case 'industrial': return rc.industrialSlots;
    case 'distributed': return rc.distributedSlots;
    case 'port': return rc.portSlots;
    case 'efuel': return rc.efuelSlots;
  }
}

function materializeCustomer(type: CustomerType, regionId: string, demand: number): void {
  const s = state;
  const cfg = CUSTOMER_TYPES[type];
  const rc = getRegionConfig(regionId);
  if (!rc) return;
  const center = getCenter(regionId);
  const angle = Math.random() * Math.PI * 2;
  const radius = 20 + Math.random() * 25;

  s.customers.push({
    id: s.nextCustomerId++,
    regionId,
    type,
    name: cfg.name,
    demand: Math.round(demand),
    maxPrice: cfg.priceThreshold,
    satisfaction: 1.0,
    x: center[0] + Math.cos(angle) * radius,
    y: center[1] + Math.sin(angle) * radius,
    appearedDay: s.gameDay,
    active: true,
    unsatisfiedDays: 0,
    scale: 0
  });

  playCustomer();
  playChaChing();
  triggerRegionFlash(regionId);
  showToast(`New ${cfg.name} in ${rc.name}.`);
}

export function updateCustomers(): void {
  const s = state;
  for (const c of s.customers) {
    if (!c.active) continue;
    if (c.scale < 1) c.scale = Math.min(1, c.scale + 0.05);
  }

  if (s.tick % TICKS_PER_DAY !== 0) return;

  for (const c of s.customers) {
    if (!c.active) continue;
    if (c.satisfaction < 0.3) c.unsatisfiedDays++;
    else c.unsatisfiedDays = Math.max(0, c.unsatisfiedDays - 1);
  }
}

export function spawnCustomer(regionId: string, type: CustomerType, demand: number): void {
  const cfg = CUSTOMER_TYPES[type];
  if (!hasFreeSlot(regionId, cfg.slotKind) || getReservedTierPopulation(cfg.tier) >= getTierCap(cfg.tier)) return;
  materializeCustomer(type, regionId, demand);
}

function getSlotOccupancy(regionId: string, kind: SlotKind): number {
  return state.customers.filter(c => c.active && c.regionId === regionId && CUSTOMER_TYPES[c.type].slotKind === kind).length;
}

export function getCurrentTotalDemand(): number {
  let total = 0;
  for (const c of state.customers) {
    if (!c.active) continue;
    total += c.currentDemand ?? c.demand;
  }
  return total;
}

export function getTierCap(tier: CustomerTier): number {
  return TIER_CAPS[tier];
}

export function getTierPopulation(tier: CustomerTier): number {
  return state.customers.filter(c => c.active && CUSTOMER_TYPES[c.type].tier === tier).length;
}

function getReservedTierPopulation(tier: CustomerTier): number {
  return state.customers.filter(c => c.active && CUSTOMER_TYPES[c.type].tier === tier).length;
}

export function getTierPopulationSummary(): Record<CustomerTier, { live: number; cap: number }> {
  return {
    small: { live: getTierPopulation('small'), cap: getTierCap('small') },
    mid: { live: getTierPopulation('mid'), cap: getTierCap('mid') },
    big: { live: getTierPopulation('big'), cap: getTierCap('big') }
  };
}

export function logCustomerSlotDiagnostics(): void {
  const totalBudget = REGIONS.reduce(
    (sum, rc) => sum + rc.industrialSlots + rc.distributedSlots + rc.portSlots + rc.efuelSlots,
    0
  );
  const totalOccupied = state.customers.filter(c => c.active).length;
  const activeByKind: Record<SlotKind, number> = {
    industrial: 0,
    distributed: 0,
    port: 0,
    efuel: 0
  };
  for (const c of state.customers) {
    if (!c.active) continue;
    activeByKind[CUSTOMER_TYPES[c.type].slotKind]++;
  }

  // eslint-disable-next-line no-console
  console.groupCollapsed(
    `[customer-slots] active ${totalOccupied}/${totalBudget} | industrial ${activeByKind.industrial}, distributed ${activeByKind.distributed}, port ${activeByKind.port}, efuel ${activeByKind.efuel}`
  );
  // eslint-disable-next-line no-console
  console.log(`Total customer slots budgeted across 13 regions: ${totalBudget}`);
  // eslint-disable-next-line no-console
  console.log(`Tier caps: small ${getTierPopulation('small')}/${SMALL_TIER_CAP}, mid ${getTierPopulation('mid')}/${MID_TIER_CAP}, big ${getTierPopulation('big')}/${BIG_TIER_CAP}`);
  for (const rc of REGIONS) {
    const occupied = {
      industrial: getSlotOccupancy(rc.id, 'industrial'),
      distributed: getSlotOccupancy(rc.id, 'distributed'),
      port: getSlotOccupancy(rc.id, 'port'),
      efuel: getSlotOccupancy(rc.id, 'efuel')
    };
    const remaining = {
      industrial: rc.industrialSlots - occupied.industrial,
      distributed: rc.distributedSlots - occupied.distributed,
      port: rc.portSlots - occupied.port,
      efuel: rc.efuelSlots - occupied.efuel
    };
    const active = {
      industrial: state.customers.filter(c => c.active && c.regionId === rc.id && CUSTOMER_TYPES[c.type].slotKind === 'industrial').length,
      distributed: state.customers.filter(c => c.active && c.regionId === rc.id && CUSTOMER_TYPES[c.type].slotKind === 'distributed').length,
      port: state.customers.filter(c => c.active && c.regionId === rc.id && CUSTOMER_TYPES[c.type].slotKind === 'port').length,
      efuel: state.customers.filter(c => c.active && c.regionId === rc.id && CUSTOMER_TYPES[c.type].slotKind === 'efuel').length
    };
    // eslint-disable-next-line no-console
    console.log(
      `${rc.name}: active ${active.industrial + active.distributed + active.port + active.efuel}, reserved ${occupied.industrial + occupied.distributed + occupied.port + occupied.efuel}`
      + ` | industrial ${occupied.industrial}/${rc.industrialSlots} (active ${active.industrial}, remaining ${remaining.industrial})`
      + ` | distributed ${occupied.distributed}/${rc.distributedSlots} (active ${active.distributed}, remaining ${remaining.distributed})`
      + ` | port ${occupied.port}/${rc.portSlots} (active ${active.port}, remaining ${remaining.port})`
      + ` | efuel ${occupied.efuel}/${rc.efuelSlots} (active ${active.efuel}, remaining ${remaining.efuel})`
    );
  }
  if (totalOccupied > totalBudget) {
    // eslint-disable-next-line no-console
    console.error(`[customer-slots] cap broken: active customers ${totalOccupied} exceed budgeted slots ${totalBudget}`);
  }
  // eslint-disable-next-line no-console
  console.groupEnd();
}
