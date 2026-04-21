import { playCustomer } from './audio';
import { CUSTOMER_TYPES, REGIONS, TICKS_PER_DAY, getRegionConfig } from './config';
import { getCenter } from './map';
import { triggerRegionFlash } from './renderer';
import { state } from './state';
import { showToast } from './ui';
import type { CustomerType } from './types';

/**
 * Daily roll for spontaneous customer emergence: walks every region, and
 * for each customer archetype with a price threshold that is currently met,
 * samples a probability based on how far local price has dropped below the
 * threshold, region bias (industrial factor, port requirement), and a soft
 * saturation penalty for duplicates. This is the mechanic that embodies
 * the manifesto's "permissionless consumption" claim.
 */
export function checkEmergence(): void {
  const s = state;
  if (s.tick % TICKS_PER_DAY !== 0) return; // Once per day

  for (const rc of REGIONS) {
    const rs = s.regions[rc.id];
    if (rs.pipeConnections <= 0 && rs.supply <= 0) continue;

    for (const [type, cfg] of Object.entries(CUSTOMER_TYPES) as Array<[CustomerType, typeof CUSTOMER_TYPES[CustomerType]]>) {
      if (rs.localPrice >= cfg.priceThreshold) continue;
      if (cfg.requiresPort && !rc.hasPort) continue;
      if (rs.pipeConnections < cfg.minPipeConnections) continue;

      // Probability increases as price drops below threshold.
      const priceRatio = rs.localPrice / cfg.priceThreshold;
      const priceFactor = 1 - priceRatio;
      const demandFactor = rc.industryDemand || 1.0;
      const existingOfType = s.customers.filter(c => c.active && c.regionId === rc.id && c.type === type).length;
      const saturationPenalty = 1 / (1 + existingOfType * 0.4);

      const probability = priceFactor * cfg.weight * demandFactor * saturationPenalty * 0.15;

      if (Math.random() < probability) {
        const demand = cfg.demandMin + Math.random() * (cfg.demandMax - cfg.demandMin);
        spawnCustomer(rc.id, type, demand);
      }
    }
  }
}

/**
 * Materialize a new customer in a region: positions it randomly inside
 * the region's centroid radius, scales in from 0 via `updateCustomers`
 * animation, emits a region flash + arpeggio ping, and toasts a name.
 */
export function spawnCustomer(regionId: string, type: CustomerType, demand: number): void {
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
  triggerRegionFlash(regionId);
  showToast(`${cfg.icon} New ${cfg.name} in ${rc.name}!`);
}

/**
 * Per-tick customer bookkeeping: advance the pop-in scale animation every
 * tick, then on day boundaries evaluate churn — customers whose satisfaction
 * stays below 30% for too many days leave, freeing up demand for others.
 */
export function updateCustomers(): void {
  const s = state;

  // Pop-in animation every tick.
  for (const c of s.customers) {
    if (!c.active) continue;
    if (c.scale < 1) c.scale = Math.min(1, c.scale + 0.05);
  }

  // Daily churn checks.
  if (s.tick % TICKS_PER_DAY !== 0) return;

  for (const c of s.customers) {
    if (!c.active) continue;

    if (c.satisfaction < 0.3) {
      c.unsatisfiedDays++;
      if (c.unsatisfiedDays > 60) {
        c.active = false;
        const rc = getRegionConfig(c.regionId);
        showToast(`⚠️ ${c.name} left ${rc?.name ?? c.regionId} (unsatisfied)`);
      }
    } else {
      c.unsatisfiedDays = Math.max(0, c.unsatisfiedDays - 1);
    }
  }
}
