import { MAX_PRESSURE, MIN_PRESSURE, REGIONS, TICKS_PER_DAY } from './config';
import { state } from './state';

const ITERATIONS = 6;
const RELAXATION = 0.4;

export function solvePressure(): void {
  const s = state;
  if (s.pipes.length === 0) {
    s.networkPressure = 0;
    return;
  }

  // Update region pressures based on local supply/demand
  for (const rc of REGIONS) {
    const rs = s.regions[rc.id];
    const netFlow = (rs.supply - rs.demand) / TICKS_PER_DAY;

    if (rs.pipeConnections > 0) {
      const pressureChange = netFlow * 0.0005 * RELAXATION;
      rs.pressure = Math.max(MIN_PRESSURE, Math.min(MAX_PRESSURE, rs.pressure + pressureChange));
    }
  }

  // Flow between regions through pipes
  for (let iter = 0; iter < ITERATIONS; iter++) {
    for (const pipe of s.pipes) {
      const rsFrom = s.regions[pipe.fromId];
      const rsTo = s.regions[pipe.toId];

      const dP = rsFrom.pressure - rsTo.pressure;
      const conductance = pipe.maxFlow / 40;
      const flow = conductance * dP * RELAXATION;

      const clampedFlow = Math.max(-pipe.maxFlow, Math.min(pipe.maxFlow, flow));
      pipe.flow = pipe.flow * 0.8 + clampedFlow * 0.2; // Smooth

      const transfer = Math.abs(pipe.flow) * 0.001;
      if (pipe.flow > 0) {
        rsFrom.pressure -= transfer;
        rsTo.pressure += transfer;
      } else {
        rsFrom.pressure += transfer;
        rsTo.pressure -= transfer;
      }

      // Line-pack storage (proportional to average pressure)
      pipe.pressure = (rsFrom.pressure + rsTo.pressure) / 2;
      pipe.linepackStored = pipe.linepackCapacity * (pipe.pressure / MAX_PRESSURE);

      rsFrom.pressure = Math.max(MIN_PRESSURE, Math.min(MAX_PRESSURE, rsFrom.pressure));
      rsTo.pressure = Math.max(MIN_PRESSURE, Math.min(MAX_PRESSURE, rsTo.pressure));
    }
  }

  let totalPressure = 0;
  let connectedRegions = 0;
  for (const rc of REGIONS) {
    const rs = s.regions[rc.id];
    if (rs.pipeConnections > 0) {
      totalPressure += rs.pressure;
      connectedRegions++;
    }
  }
  s.networkPressure = connectedRegions > 0 ? totalPressure / connectedRegions : 0;
}
