import {
  CUSTOMER_TYPES,
  DEMAND_PRICE_RESPONSE,
  MAX_PRESSURE,
  MIN_PRESSURE,
  PRESSURE_PRICE_CURVE,
  PRESSURE_PRICE_MAX,
  PRESSURE_PRICE_MIN,
  REGIONS,
  TICKS_PER_DAY
} from './config';
import type { GameState } from './types';
import { spawnPressurePulse } from './particles';
import { state } from './state';

/**
 * Per-tick economy step:
 *
 *  1. Roll up each customer's effective demand this tick using one simple
 *     price-response multiplier plus the existing e-fuel pressure scaling.
 *  2. Compute H₂ price directly from pipe pressure using a smooth sigmoid:
 *     low pressure is expensive, full pressure is cheap.
 *  3. Apply the same pressure-price curve regionally so local prices are
 *     easy to read: each region is priced by its own pressure.
 *  4. Distribute revenue from active customers, emit an occasional
 *     withdraw pulse for visual feedback.
 *  5. On day boundaries, push the current spot + pressure onto the
 *     history ring buffers (retained ≤ 365 samples each).
 */
export function updateEcon(): void {
  const s = state;

  // Reset region demand and add up live customers' effective demands.
  for (const rc of REGIONS) s.regions[rc.id].demand = 0;
  for (const c of s.customers) {
    if (!c.active) continue;
    const cfg = CUSTOMER_TYPES[c.type];
    const rs = s.regions[c.regionId];
    const localPrice = Math.max(0.5, rs.localPrice || s.spotPrice);
    let effective = demandFromPrice(localPrice, cfg.demandMin, cfg.demandMax, cfg.priceThreshold);

    // Pressure-relief customers (e-fuel) scale their intake with pressure.
    if (cfg?.pressureRelief) {
      const pressureFactor = Math.max(0.3, Math.min(2.0, rs.pressure / 40));
      effective *= pressureFactor;
    }
    c.currentDemand = effective;
    s.regions[c.regionId].demand += effective;
  }

  // Simple pressure-price model: fuller pipe = cheaper hydrogen.
  s.spotPrice = priceFromPressure(s.networkPressure);

  // Connected regions share one network pressure, so they also share one
  // network-clearing price. Disconnected regions stay at the scarcity cap.
  for (const rc of REGIONS) {
    const rs = s.regions[rc.id];
    rs.localPrice = rs.pipeConnections > 0
      ? s.spotPrice
      : PRESSURE_PRICE_MAX;
    rs.localPrice = Math.max(PRESSURE_PRICE_MIN, Math.min(PRESSURE_PRICE_MAX, rs.localPrice));
  }

  let networkSupply = 0;
  let networkDemand = 0;
  for (const rc of REGIONS) {
    const rs = s.regions[rc.id];
    if (rs.pipeConnections <= 0) continue;
    networkSupply += rs.supply;
    networkDemand += rs.demand;
  }
  const networkSupplyRatio = networkDemand > 0
    ? Math.min(1, networkSupply / networkDemand)
    : (networkSupply > 0 ? 1 : 0);

  // Revenue distribution.
  let tickRevenue = 0;
  for (const c of s.customers) {
    if (!c.active) continue;
    const rs = s.regions[c.regionId];
    // Customers buy from the connected backbone, not only from generation
    // built inside their own region. Pressure equalization is the transport
    // model, so revenue should clear against connected-network availability.
    const supplyRatio = rs.pipeConnections > 0
      ? networkSupplyRatio
      : (rs.demand > 0 ? Math.min(1, rs.supply / rs.demand) : (rs.supply > 0 ? 1 : 0));
    const currentDemand = c.currentDemand ?? c.demand;
    const servedPerTick = (currentDemand * supplyRatio) / TICKS_PER_DAY;
    const revenue = servedPerTick * rs.localPrice * 1.8;
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

  // Day-boundary bookkeeping: histories.
  if (s.tick % TICKS_PER_DAY === 0) {
    s.priceHistory.push(s.spotPrice);
    if (s.priceHistory.length > 365) s.priceHistory.shift();
    s.pressureHistory.push(s.networkPressure);
    if (s.pressureHistory.length > 365) s.pressureHistory.shift();
    // v4 budget chart: daily snapshot of the running budget.
    s.budgetHistory.push(s.money);
    if (s.budgetHistory.length > 365) s.budgetHistory.shift();
  }
}

function priceFromPressure(pressure: number): number {
  const clamped = Math.max(MIN_PRESSURE, Math.min(MAX_PRESSURE, pressure));
  const minNorm = sigmoid(-PRESSURE_PRICE_CURVE / 2);
  const maxNorm = sigmoid(PRESSURE_PRICE_CURVE / 2);
  const x = ((clamped - MIN_PRESSURE) / Math.max(1, MAX_PRESSURE - MIN_PRESSURE) - 0.5) * PRESSURE_PRICE_CURVE;
  const curved = (sigmoid(x) - minNorm) / Math.max(1e-6, maxNorm - minNorm);
  return PRESSURE_PRICE_MAX - curved * (PRESSURE_PRICE_MAX - PRESSURE_PRICE_MIN);
}

function demandFromPrice(price: number, demandMin: number, demandMax: number, threshold: number): number {
  const safeThreshold = Math.max(0.5, threshold);
  const x = (safeThreshold - price) / safeThreshold * DEMAND_PRICE_RESPONSE;
  const curved = sigmoid(x);
  return demandMin + curved * (demandMax - demandMin);
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Instantaneous network-wide supply and demand at this tick (kg/day rate).
 * `supply` is what the generator fleet is physically producing right now;
 * `demand` is what live customers are asking for right now. Both swing
 * with day/night and pressure-relief elasticity — don't present them as
 * the strategic state of the network.
 */
export function instantaneousTotals(s: GameState): { supply: number; demand: number } {
  let supply = 0;
  let demand = 0;
  for (const rc of REGIONS) {
    supply += s.regions[rc.id].supply;
    demand += s.regions[rc.id].demand;
  }
  return { supply, demand };
}

/**
 * Push this tick's instantaneous supply/demand into the rolling ring
 * buffers — one network-wide pair on `state`, plus one pair per region
 * so the tooltip can display its own local 24h average. Each buffer's
 * length is TICKS_PER_DAY, so once full it spans exactly one game-day.
 */
export function sampleSupplyDemand(): void {
  const s = state;
  const cap = TICKS_PER_DAY;
  const { supply, demand } = instantaneousTotals(s);
  pushRing(s.supplySamples, supply, cap, s.supplyDemandSampleIndex);
  pushRing(s.demandSamples, demand, cap, s.supplyDemandSampleIndex);
  s.supplyDemandSampleIndex = advanceIndex(s.supplyDemandSampleIndex, s.supplySamples.length, cap);

  for (const rc of REGIONS) {
    const rs = s.regions[rc.id];
    if (!rs.supplySamples) rs.supplySamples = [];
    if (!rs.demandSamples) rs.demandSamples = [];
    const idx = rs.sampleIndex ?? 0;
    pushRing(rs.supplySamples, rs.supply, cap, idx);
    pushRing(rs.demandSamples, rs.demand, cap, idx);
    rs.sampleIndex = advanceIndex(idx, rs.supplySamples.length, cap);
  }
}

/** Push this tick's current day-rate revenue/opex into rolling HUD buffers. */
export function sampleFinance(): void {
  const s = state;
  const cap = TICKS_PER_DAY;
  pushRing(s.revenueSamples, s.dailyRevenue, cap, s.financeSampleIndex);
  pushRing(s.opexSamples, s.dailyOpex, cap, s.financeSampleIndex);
  s.financeSampleIndex = advanceIndex(s.financeSampleIndex, s.revenueSamples.length, cap);
}

function pushRing(buf: number[], v: number, cap: number, idx: number): void {
  if (buf.length < cap) buf.push(v);
  else buf[idx % cap] = v;
}

function advanceIndex(idx: number, len: number, cap: number): number {
  if (len < cap) return len % cap;
  return (idx + 1) % cap;
}

/**
 * Average of whatever samples are currently present. Returns 0 for an
 * empty buffer — early-game, before the first tick, the HUD still wants
 * a number rather than NaN.
 */
function averageSamples(samples: number[] | undefined): number {
  if (!samples || samples.length === 0) return 0;
  let sum = 0;
  for (const v of samples) sum += v;
  return sum / samples.length;
}

/** Rolling average of recent total supply (kg/day). See sampleSupplyDemand. */
export function getRollingAverageSupply(s: GameState): number {
  return averageSamples(s.supplySamples);
}

/** Rolling average of recent total demand (kg/day). */
export function getRollingAverageDemand(s: GameState): number {
  return averageSamples(s.demandSamples);
}

/** Rolling average of a single region's supply (kg/day). */
export function getRollingRegionSupply(s: GameState, regionId: string): number {
  return averageSamples(s.regions[regionId]?.supplySamples);
}

/** Rolling average of a single region's demand (kg/day). */
export function getRollingRegionDemand(s: GameState, regionId: string): number {
  return averageSamples(s.regions[regionId]?.demandSamples);
}

export function getRollingAverageRevenue(s: GameState): number {
  return averageSamples(s.revenueSamples);
}

export function getRollingAverageOpex(s: GameState): number {
  return averageSamples(s.opexSamples);
}
