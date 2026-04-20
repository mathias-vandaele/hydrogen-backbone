import { updateParticles } from './particles';
import { drawFrame } from './renderer';
import { state } from './state';
import { tick } from './sim';
import { updateHUD } from './ui';

const SIM_INTERVAL = 100; // ms per sim tick (10 Hz)

let lastTime = 0;
let simAccum = 0;

function frame(timestamp: number): void {
  const dt = Math.min(100, timestamp - lastTime);
  lastTime = timestamp;

  if (!state.paused) {
    simAccum += dt * state.speed;
    const maxTicks = Math.min(50, Math.floor(simAccum / SIM_INTERVAL));
    for (let i = 0; i < maxTicks; i++) tick();
    simAccum -= maxTicks * SIM_INTERVAL;
    if (simAccum > SIM_INTERVAL * 10) simAccum = 0;
  }

  // Particles always tick at render rate for smooth visuals.
  updateParticles(dt);

  drawFrame(timestamp);

  // UI refresh throttled to ~15 fps.
  if (timestamp % 4 < 2) updateHUD();

  requestAnimationFrame(frame);
}

export function startLoop(): void {
  lastTime = performance.now();
  requestAnimationFrame(frame);
}
