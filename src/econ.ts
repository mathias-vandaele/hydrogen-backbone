import { CUSTOMER_TYPES, REGIONS, TICKS_PER_DAY } from './config';
import { spawnPressurePulse } from './particles';
import { state } from './state';

// Anchor price used as the "dear" reference — no-supply and no-demand
// regions drift toward it, and the global spot price is normalized against it.
const BASE_PRICE = 6.0;

/**
 * Per-tick economy step:
 *
 * 1. Roll up each customer's demand for this tick (pressure-relief customers
 *    like e-fuel refineries scale their intake with local pressure, which is
 *    exactly the "auto-pressure-relief valve" property the manifesto argues
 *    for).
 * 2. Compute the global H₂ spot price from overall supply/demand ratio,
 *    smoothed into the existing price to avoid flicker, and clamped to a
 *    sensible range.
 * 3. Per-region local price drifts toward the spot price (divided by local
 *    pressure factor — cheap pipes mean cheap gas) or toward a "dear"
 *    default if the region is disconnected.
 * 4. Distribute revenue: each active customer pays for the H₂ it actually
 *    received, proportional to local supply/demand satisfaction. Occasionally
 *    emit a "withdraw" pressure pulse for visual feedback.
 * 5. Append today's spot price and network pressure to the history ring
 *    buffers (one sample per game day, retained ≤365 samples).
 */
export function updateEcon(): void {
  const s = state;

  // Calculate demand from active customers each tick.
  for (const rc of REGIONS) s.regions[rc.id].demand = 0;
  for (const c of s.customers) {
    if (!c.active) continue;
    const cfg = CUSTOMER_TYPES[c.type];
    if (cfg?.pressureRelief) {
      const rs = s.regions[c.regionId];
      const pressureFactor = Math.max(0.3, Math.min(2.0, rs.pressure / 40));
      c.currentDemand = c.demand * pressureFactor;
    } else {
      c.currentDemand = c.demand;
    }
    s.regions[c.regionId].demand += c.currentDemand;
  }

  let totalSupply = 0;
  let totalDemand = 0;
  for (const rc of REGIONS) {
    totalSupply += s.regions[rc.id].supply;
    totalDemand += s.regions[rc.id].demand;
  }

  // Spot price based on supply/demand ratio.
  if (totalSupply > 0) {
    const ratio = totalDemand > 0 ? totalSupply / totalDemand : 2.5;
    const targetPrice = BASE_PRICE / Math.pow(Math.max(0.1, ratio), 0.4);
    s.spotPrice += (targetPrice - s.spotPrice) * 0.03;
  }
  s.spotPrice = Math.max(0.50, Math.min(12.0, s.spotPrice));

  // Regional prices (influenced by network pressure + distance from supply).
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

  // Revenue from customers.
  let tickRevenue = 0;
  for (const c of s.customers) {
    if (!c.active) continue;
    const rs = s.regions[c.regionId];
    const supplyRatio = rs.demand > 0
      ? Math.min(1, rs.supply / rs.demand)
      : (rs.supply > 0 ? 1 : 0);
    const currentDemand = c.currentDemand ?? c.demand;
    const servedPerTick = (currentDemand * supplyRatio) / TICKS_PER_DAY;
    const revenue = servedPerTick * rs.localPrice;
    tickRevenue += revenue;
    c.satisfaction = supplyRatio;
    s.totalH2Sold += servedPerTick;
    // Occasional withdraw pulse when the customer is actually served.
    if (servedPerTick > 0 && rs.pipeConnections > 0 && Math.random() < 0.015) {
      spawnPressurePulse(c.regionId, 'withdraw', Math.min(1, servedPerTick / 500));
    }
  }

  s.money += tickRevenue;
  s.totalRevenue += tickRevenue;
  s.dailyRevenue = tickRevenue * TICKS_PER_DAY;

  // Record daily histories (ring-buffered at 365 samples ≈ one year).
  if (s.tick % TICKS_PER_DAY === 0) {
    s.priceHistory.push(s.spotPrice);
    if (s.priceHistory.length > 365) s.priceHistory.shift();
    s.pressureHistory.push(s.networkPressure);
    if (s.pressureHistory.length > 365) s.pressureHistory.shift();
  }
}
