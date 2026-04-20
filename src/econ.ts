import { CUSTOMER_TYPES, REGIONS, TICKS_PER_DAY } from './config';
import { state } from './state';

const BASE_PRICE = 6.0;

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
  }

  s.money += tickRevenue;
  s.totalRevenue += tickRevenue;
  s.dailyRevenue = tickRevenue * TICKS_PER_DAY;

  // Record price history once per day.
  if (s.tick % TICKS_PER_DAY === 0) {
    s.priceHistory.push(s.spotPrice);
    if (s.priceHistory.length > 365) s.priceHistory.shift();
  }
}
