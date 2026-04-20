import { updateProduction } from './buildings';
import { INSIGHTS, TICKS_PER_DAY } from './config';
import { checkEmergence, updateCustomers } from './customers';
import { updateEcon } from './econ';
import { solvePressure } from './pressure';
import { autoSave } from './save';
import { state } from './state';
import { showManifesto } from './ui';
import { updateWeather } from './weather';

export function setSpeed(s: number): void {
  if (s === 0) {
    state.paused = !state.paused;
  } else {
    state.paused = false;
    state.speed = s;
  }
}

export function togglePause(): void {
  state.paused = !state.paused;
}

export function tick(): void {
  const s = state;
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
  checkEmergence();
  updateCustomers();

  autoSave();

  // Occasional manifesto insights.
  if (s.gameDay > s.lastInsightDay + 120 && s.customers.filter(c => c.active).length > 0) {
    if (Math.random() < 0.005) {
      const insight = INSIGHTS[s.insightIndex % INSIGHTS.length];
      showManifesto(insight);
      s.insightIndex++;
      s.lastInsightDay = s.gameDay;
    }
  }
}
