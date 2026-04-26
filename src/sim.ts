import { applyOpex, logProductionDebugIfActive, updateProduction } from './buildings';
import { TICKS_PER_DAY } from './config';
import { areAllCustomerSlotsFilled, checkEmergence, updateCustomers } from './customers';
import { sampleFinance, sampleSupplyDemand, updateEcon } from './econ';
import { checkInsights } from './insights';
import { solvePressure } from './pressure';
import { autoSave } from './save';
import { failIfCapitalDepleted, state, triggerGameOver } from './state';
import { updateWeather } from './weather';

const VISIBLE_ZERO_PRESSURE_BAR = 0.005;

/**
 * Set simulation speed (1/10/100), or pass 0 to toggle pause. Called from
 * the top-bar speed buttons and the numeric hotkeys (1/2/3).
 */
export function setSpeed(s: number): void {
  if (s === 0) {
    state.paused = !state.paused;
  } else {
    state.paused = false;
    state.speed = s;
  }
}

/** Flip the pause flag (bound to the Space key). */
export function togglePause(): void {
  state.paused = !state.paused;
}

/**
 * One simulation tick. Runs at 10 Hz of wall time per speed unit (so 100
 * sim ticks/sec at 10× speed). Order matters: advance time, resample
 * weather, run generators/electrolyzers, solve the pressure network,
 * settle the economy, consider new customers, update existing ones,
 * then check insights/auto-save on day boundaries.
 */
export function tick(): void {
  const s = state;
  // Hard stop once the game-over screen is up — no further sim progress.
  if (s.gameOver?.triggered) return;
  s.tick++;

  const dayFrac = 1 / TICKS_PER_DAY;
  s.timeOfDay += dayFrac;
  if (s.timeOfDay >= 1) {
    s.timeOfDay -= 1;
    s.gameDay++;
    s.dayOfYear++;
    if (s.dayOfYear > 365) s.dayOfYear = 1;
  }

  updateWeather();
  updateProduction();
  const pressureBeforeSolve = s.networkPressure;
  solvePressure();
  if (
    !s.sandboxMode &&
    s.pipes.length > 0 &&
    pressureBeforeSolve >= VISIBLE_ZERO_PRESSURE_BAR &&
    s.networkPressure < VISIBLE_ZERO_PRESSURE_BAR
  ) {
    triggerGameOver(s, 'pressureDepleted');
    return;
  }
  updateEcon();
  applyOpex();
  if (failIfCapitalDepleted(s)) return;
  checkEmergence();
  if (!s.sandboxMode && areAllCustomerSlotsFilled()) {
    triggerGameOver(s, 'marketComplete');
    return;
  }
  updateCustomers();
  sampleSupplyDemand();
  sampleFinance();

  // Day-boundary bookkeeping: insights + autosave.
  if (s.tick % TICKS_PER_DAY === 0) {
    checkInsights();
    logProductionDebugIfActive();
  }

  autoSave();
}
