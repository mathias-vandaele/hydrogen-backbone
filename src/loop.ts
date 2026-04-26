import { updateFinancialAudio } from './audio';
import { drawFrame } from './renderer';
import { state } from './state';
import { tick } from './sim';
import { computeCapitalCoverageDays, updateHUD } from './ui';

// Fixed sim timestep: one sim tick every 100 ms of wall time at 1× speed
// (10 Hz). Rendering is always rAF-driven so visuals stay smooth regardless
// of sim speed. State.speed multiplies wall time: 10× = 10 sim ticks per
// 100 ms of wall time.
const SIM_INTERVAL = 100;
const RENDER_INTERVAL = 1000 / 60;
const HUD_INTERVAL = 1000 / 15;

let lastTime = 0;
let simAccum = 0;
let lastRenderTime = 0;
let lastHudTime = 0;

/**
 * One animation frame: accumulate wall-time into simAccum, drain it in
 * fixed 100 ms chunks (capped at 50 per frame to avoid spiral-of-death
 * after a long tab-background), draw the frame, and refresh the HUD at
 * ~15 Hz.
 */
function frame(timestamp: number): void {
  const dt = Math.min(100, timestamp - lastTime);
  lastTime = timestamp;

  if (!state.paused) {
    simAccum += dt * state.speed;
    const maxTicks = Math.min(50, Math.floor(simAccum / SIM_INTERVAL));
    for (let i = 0; i < maxTicks; i++) tick();
    simAccum -= maxTicks * SIM_INTERVAL;
    // If we're way behind (e.g., after tab-hide), drop the backlog rather
    // than run hundreds of sim ticks at once.
    if (simAccum > SIM_INTERVAL * 10) simAccum = 0;
  }

  if (lastRenderTime === 0 || timestamp - lastRenderTime >= RENDER_INTERVAL) {
    drawFrame(timestamp);
    lastRenderTime = timestamp;
  }

  // UI refresh throttled to ~15 fps; DOM updates are the expensive part.
  if (timestamp - lastHudTime >= HUD_INTERVAL) {
    updateHUD();
    lastHudTime = timestamp;
  }

  // Financial-stress heartbeat. Cheap no-op while capital coverage is healthy.
  updateFinancialAudio(computeCapitalCoverageDays());

  requestAnimationFrame(frame);
}

/**
 * Kick off the main animation loop. Call once after all init* functions
 * have run.
 */
export function startLoop(): void {
  lastTime = performance.now();
  lastRenderTime = 0;
  lastHudTime = 0;
  requestAnimationFrame(frame);
}
