import { applyOpex, updateProduction } from './buildings';
import { ECONOMY, TICKS_PER_DAY } from './config';
import { checkEmergence, updateCustomers } from './customers';
import { updateEcon } from './econ';
import { triggerGameOver, updateEndgame } from './endgame';
import { checkInsights } from './insights';
import { solvePressure } from './pressure';
import { autoSave } from './save';
import { state } from './state';
import { updateWeather } from './weather';

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
  solvePressure();
  updateEcon();
  applyOpex();
  checkEmergence();
  updateCustomers();

  // v4 bankruptcy watchdog: track consecutive days in the red; trigger
  // game over after the grace period expires.
  if (s.tick % TICKS_PER_DAY === 0) {
    if (s.money < ECONOMY.BANKRUPTCY_THRESHOLD) {
      s.daysBelowBankruptcyThreshold++;
      if (s.daysBelowBankruptcyThreshold >= ECONOMY.BANKRUPTCY_GRACE_DAYS) {
        triggerGameOver('bankruptcy');
      }
    } else {
      s.daysBelowBankruptcyThreshold = 0;
    }
  }

  // Day-boundary bookkeeping: milestone insights + narrative arc + autosave.
  if (s.tick % TICKS_PER_DAY === 0) {
    checkInsights();
    updateEndgame();
  }
  // updateEndgame also ticks each frame's cinematic timeout when the
  // day boundary hasn't hit — cheap enough to always call.
  if (state.endgame.cinematicStage !== 'none') updateEndgame();

  autoSave();
}
