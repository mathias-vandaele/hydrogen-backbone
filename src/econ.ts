import {
  CUSTOMER_TYPES,
  ECONOMY,
  EFUEL_SURGE_MULTIPLIER,
  EFUEL_SURGE_PRESSURE,
  MAX_PRESSURE,
  PRICE_EMA_DECAY,
  REGIONS,
  TICKS_PER_DAY
} from './config';
import { spawnPressurePulse } from './particles';
import { state } from './state';

// Anchor price used as the "dear" reference — no-supply and no-demand
// regions drift toward it, and the global spot price is normalized against it.
const BASE_PRICE = 6.0;

/**
 * Per-tick economy step:
 *
 *  1. Roll up each customer's effective demand this tick (ramped toward
 *     their target demand, with an e-fuel surge boost at high pressure,
 *     and an older pressure-relief elasticity for e-fuel customers).
 *  2. Compute the global H₂ spot price from supply/demand ratio and a
 *     smoothing step. Update priceEMA on day boundaries.
 *  3. Per-region local prices drift toward the spot price scaled by local
 *     pressure, with a more-expensive default for disconnected regions.
 *  4. Distribute revenue from active customers, emit an occasional
 *     withdraw pulse for visual feedback.
 *  5. On day boundaries, push the current spot + pressure onto the
 *     history ring buffers (retained ≤ 365 samples each).
 */
export function updateEcon(): void {
  const s = state;

  // Compute pressure-relief surge multiplier once per tick.
  const pressureNorm = s.networkPressure / MAX_PRESSURE;
  const surgeActive = pressureNorm >= EFUEL_SURGE_PRESSURE;

  // Reset region demand and add up live customers' effective demands.
  for (const rc of REGIONS) s.regions[rc.id].demand = 0;
  for (const c of s.customers) {
    if (!c.active) continue;
    const cfg = CUSTOMER_TYPES[c.type];
    // Ramped base demand: customers spin up gradually.
    const rampFactor = 0.1 + 0.9 * Math.max(0, Math.min(1, c.ramp));
    let effective = c.demand * rampFactor;

    // Pressure-relief customers (e-fuel) scale their intake with pressure.
    if (cfg?.pressureRelief) {
      const rs = s.regions[c.regionId];
      const pressureFactor = Math.max(0.3, Math.min(2.0, rs.pressure / 40));
      effective *= pressureFactor;
      // Surge boost: when network is near capacity, e-fuel visibly ramps.
      if (surgeActive) effective *= EFUEL_SURGE_MULTIPLIER;
    }
    c.currentDemand = effective;
    s.regions[c.regionId].demand += effective;
  }

  let totalSupply = 0;
  let totalDemand = 0;
  for (const rc of REGIONS) {
    totalSupply += s.regions[rc.id].supply;
    totalDemand += s.regions[rc.id].demand;
  }

  // Spot price from supply/demand ratio, smoothed.
  if (totalSupply > 0) {
    const ratio = totalDemand > 0 ? totalSupply / totalDemand : 2.5;
    const targetPrice = BASE_PRICE / Math.pow(Math.max(0.1, ratio), 0.4);
    s.spotPrice += (targetPrice - s.spotPrice) * 0.03;
  }
  s.spotPrice = Math.max(0.50, Math.min(12.0, s.spotPrice));

  // Regional prices drift toward the spot price, modulated by pressure.
  for (const rc of REGIONS) {
    const rs = s.regions[rc.id];
    if (rs.pipeConnections > 0) {
      const pressureFactor = Math.max(0.5, rs.pressure / 40);
      rs.localPrice += (s.spotPrice / pressureFactor - rs.localPrice) * 0.08;
    } else if (rs.supply > 0) {
      rs.localPrice += (s.spotPrice * 1.1 - rs.localPrice) * 0.08;
    } else {
      rs.localPrice += (BASE_PRICE * 1.5 - rs.localPrice) * 0.02;
    }
    rs.localPrice = Math.max(0.50, Math.min(15.0, rs.localPrice));
  }

  // Revenue distribution.
  let tickRevenue = 0;
  for (const c of s.customers) {
    if (!c.active) continue;
    const rs = s.regions[c.regionId];
    const supplyRatio = rs.demand > 0
      ? Math.min(1, rs.supply / rs.demand)
      : (rs.supply > 0 ? 1 : 0);
    const currentDemand = c.currentDemand ?? c.demand;
    const servedPerTick = (currentDemand * supplyRatio) / TICKS_PER_DAY;
    // v4: CUSTOMER_REVENUE_MULTIPLIER boosts effective per-kg payments so
    // the flywheel still reliably rescues a player who reaches mid-game
    // despite the tighter starting budget and daily opex burn.
    const revenue = servedPerTick * rs.localPrice * ECONOMY.CUSTOMER_REVENUE_MULTIPLIER;
    tickRevenue += revenue;
    c.satisfaction = supplyRatio;
    s.totalH2Sold += servedPerTick;
    if (servedPerTick > 0 && rs.pipeConnections > 0 && Math.random() < 0.015) {
      spawnPressurePulse(c.regionId, 'withdraw', Math.min(1, servedPerTick / 500));
    }
  }

  s.money += tickRevenue;
  s.totalRevenue += tickRevenue;
  s.dailyRevenue = tickRevenue * TICKS_PER_DAY;

  // Day-boundary bookkeeping: histories + priceEMA update.
  if (s.tick % TICKS_PER_DAY === 0) {
    s.priceHistory.push(s.spotPrice);
    if (s.priceHistory.length > 365) s.priceHistory.shift();
    s.pressureHistory.push(s.networkPressure);
    if (s.pressureHistory.length > 365) s.pressureHistory.shift();
    // v4 budget chart: daily snapshot of the running budget.
    s.budgetHistory.push(s.money);
    if (s.budgetHistory.length > 365) s.budgetHistory.shift();
    // EMA: today's priceEMA = decay * yesterday + (1 - decay) * today's spot.
    s.priceEMA = PRICE_EMA_DECAY * s.priceEMA + (1 - PRICE_EMA_DECAY) * s.spotPrice;
  }
}
