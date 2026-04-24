import { playWhoosh } from './audio';
import { BUILDINGS } from './config';
import { getConnectedOperationalCavernCapacityKg } from './buildings';
import { MAX_PRESSURE, REGIONS, TICKS_PER_DAY } from './config';
import { state } from './state';

// Whoosh when network pressure crosses these thresholds (rising edge only).
const WHOOSH_THRESHOLDS = [25, 50, 70];
let prevNetworkPressure = 0;

/**
 * Solve one tick of the backbone pressure model.
 *
 * Simplified design:
 * 1. There is only one connected backbone at a time.
 * 2. The network stores one global hydrogen inventory in pipeline linepack.
 * 3. Pressure is derived from total stored hydrogen / total pipeline capacity.
 * 4. All connected regions and pipes share that one pressure value.
 */
export function solvePressure(): void {
  const s = state;
  if (s.pipes.length === 0) {
    s.networkHydrogenStored = 0;
    s.networkPressure = 0;
    for (const rc of REGIONS) {
      s.regions[rc.id].pressure = 0;
    }
    return;
  }

  let totalCapacity = 0;
  let connectedSupplyRate = 0;
  let connectedDemandRate = 0;
  for (const rc of REGIONS) {
    const rs = s.regions[rc.id];
    if (rs.pipeConnections > 0) {
      connectedSupplyRate += rs.supply;
      connectedDemandRate += rs.demand;
    }
  }
  for (const pipe of s.pipes) totalCapacity += pipe.linepackCapacity;
  totalCapacity += getConnectedOperationalCavernCapacityKg();

  const injectedThisTick = connectedSupplyRate / TICKS_PER_DAY;
  const withdrawnThisTick = connectedDemandRate / TICKS_PER_DAY;
  s.networkHydrogenStored = Math.max(
    0,
    Math.min(totalCapacity, s.networkHydrogenStored + injectedThisTick - withdrawnThisTick)
  );

  const pressureRatio = totalCapacity > 0 ? s.networkHydrogenStored / totalCapacity : 0;
  s.networkPressure = pressureRatio * MAX_PRESSURE;

  for (const rc of REGIONS) {
    const rs = s.regions[rc.id];
    rs.pressure = rs.pipeConnections > 0 ? s.networkPressure : 0;
  }

  const perPipeFlow = s.pipes.length > 0
    ? Math.min(connectedSupplyRate, connectedDemandRate) / s.pipes.length
    : 0;
  for (const pipe of s.pipes) {
    pipe.flow = Math.min(pipe.maxFlow, perPipeFlow);
    pipe.pressure = s.networkPressure;
    pipe.linepackStored = pipe.linepackCapacity * pressureRatio;
  }

  for (const cavern of s.caverns) {
    const rs = s.regions[cavern.regionId];
    const connected = cavern.operational && rs?.pipeConnections > 0;
    cavern.storedH2Kg = connected ? BUILDINGS.saltCavern.storageKg * pressureRatio : 0;
  }

  // Rising-edge threshold crossings → play a whoosh so the player feels it.
  for (const thr of WHOOSH_THRESHOLDS) {
    if (prevNetworkPressure < thr && s.networkPressure >= thr) playWhoosh();
  }
  prevNetworkPressure = s.networkPressure;
}

export function getNetworkStorageCapacityKg(): number {
  let total = 0;
  for (const pipe of state.pipes) total += pipe.linepackCapacity;
  total += getConnectedOperationalCavernCapacityKg();
  return total;
}
