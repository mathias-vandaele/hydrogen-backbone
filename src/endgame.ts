// Three-act narrative arc (v4, Priority 1). Climactic triggers are
// gated behind hard day floors so a one-plant opening cannot fire the
// climax on Day 2. Structure:
//
//   Act 1 — Setup (days 1 .. ACT_2_MIN_DAY): no climactic triggers can
//     fire regardless of conditions. Tutorial / establishment phase.
//
//   Act 2 — Approaching parity (from ACT_2_MIN_DAY): Oil Parity can
//     fire when price EMA has sat ≤ OIL_PARITY_PRICE_THRESHOLD for
//     OIL_PARITY_SUSTAIN_DAYS consecutive days AND real production +
//     real customer count floors are cleared. Price alone is never
//     sufficient — a puddle can show €0 but does not reflect a market.
//
//   Act 3 — Flywheel (from ACT_3_MIN_DAY, Oil Parity already fired):
//     Escape Velocity per v3 conditions + the Act-3 floor.
//
// Bankruptcy (Priority 2) is a separate lose-state handled here so the
// end-screen UI has a single place to look.

import {
  ECONOMY,
  ESCAPE_VELOCITY_CONNECTED_REGIONS,
  ESCAPE_VELOCITY_CUSTOMERS,
  ESCAPE_VELOCITY_REQUIRED_DAYS,
  ESCAPE_VELOCITY_SUPPLY_RATIO,
  ESCAPE_VELOCITY_WRIGHT_SAVINGS,
  NARRATIVE,
  REGIONS,
  TICKS_PER_DAY
} from './config';
import { state } from './state';
import { showManifesto, showToast } from './ui';

const CINEMATIC_DURATION_MS = 10_000;

/**
 * Day-boundary tick — advance the narrative state machine and run the
 * cinematic timeout watchdog. Bankruptcy is handled separately in
 * sim.ts; by the time we get here, either we're still playing or the
 * game-over flag has already flipped.
 */
export function updateEndgame(): void {
  const s = state;
  if (s.gameOver?.triggered) return;

  // Act floors decide what can fire at all this tick.
  if (s.endgame.phase === 'pre' && s.gameDay >= NARRATIVE.ACT_2_MIN_DAY) advanceOilParity();
  if (s.endgame.phase === 'oilParity' && s.gameDay >= NARRATIVE.ACT_3_MIN_DAY) advanceEscapeVelocity();

  // Auto-dismiss cinematic after its duration.
  if (s.endgame.cinematicStage !== 'none') {
    const elapsed = performance.now() - s.endgame.cinematicStartedAt;
    if (elapsed > CINEMATIC_DURATION_MS) {
      if (s.endgame.cinematicStage === 'escapeVelocity') {
        s.endgame.endScreenVisible = true;
      }
      s.endgame.cinematicStage = 'none';
    }
  }
}

/**
 * Stage-1 advancement. Three conditions must hold together to grow the
 * streak: priceEMA ≤ parity threshold, national production ≥ minimum,
 * live customer count ≥ minimum. Missing any single condition zeroes
 * the streak — the streak represents sustained market conditions, not
 * transient lucky days.
 */
function advanceOilParity(): void {
  const s = state;
  const production = totalDailyProduction();
  const liveCustomers = s.customers.filter(c => c.active).length;
  const conditionsHold =
    s.priceEMA <= NARRATIVE.OIL_PARITY_PRICE_THRESHOLD &&
    production >= NARRATIVE.OIL_PARITY_MIN_PRODUCTION_KG &&
    liveCustomers >= NARRATIVE.OIL_PARITY_MIN_CUSTOMERS;
  if (conditionsHold) s.endgame.oilParityStreak++;
  else s.endgame.oilParityStreak = 0;
  if (s.endgame.oilParityStreak >= NARRATIVE.OIL_PARITY_SUSTAIN_DAYS) {
    fireOilParityCinematic(false);
  }
}

function advanceEscapeVelocity(): void {
  const s = state;
  const ok = escapeVelocityConditionsMet();
  if (ok) s.endgame.escapeVelocityStreak++;
  else s.endgame.escapeVelocityStreak = 0;
  if (s.endgame.escapeVelocityStreak >= ESCAPE_VELOCITY_REQUIRED_DAYS) {
    fireEscapeVelocityCinematic(false);
  }
}

/** Sum of H₂ being produced per day across every live plant. */
function totalDailyProduction(): number {
  let kg = 0;
  for (const b of state.buildings) kg += b.production;
  return kg;
}

/**
 * Predicate for the escape-velocity gate (exported so the HUD can paint
 * a "Path to Escape Velocity" progress bar using the same formula).
 * Adds the v4 Act-3 day floor on top of the v3 numeric conditions.
 */
export function escapeVelocityConditionsMet(): boolean {
  const s = state;
  if (s.endgame.oilParityReachedOnDay === null) return false;
  if (s.gameDay < NARRATIVE.ACT_3_MIN_DAY) return false;
  let supply = 0;
  let demand = 0;
  let connectedRegions = 0;
  for (const rc of REGIONS) {
    const rs = s.regions[rc.id];
    supply += rs.supply;
    demand += rs.demand;
    if (rs.pipeConnections > 0) connectedRegions++;
  }
  const ratio = demand > 0 ? supply / demand : (supply > 0 ? 99 : 0);
  const wrightSavings = 1 - (s.wright.solarPlant.mult + s.wright.windPlant.mult) / 2;
  const liveCustomers = s.customers.filter(c => c.active).length;
  return (
    ratio >= ESCAPE_VELOCITY_SUPPLY_RATIO &&
    wrightSavings >= ESCAPE_VELOCITY_WRIGHT_SAVINGS &&
    connectedRegions >= ESCAPE_VELOCITY_CONNECTED_REGIONS &&
    liveCustomers >= ESCAPE_VELOCITY_CUSTOMERS
  );
}

/**
 * Fraction of escape-velocity conditions currently met (averaged across
 * the four numeric axes). Used by the HUD progress bar.
 */
export function escapeVelocityProgress(): number {
  const s = state;
  if (s.endgame.oilParityReachedOnDay === null) return 0;
  let supply = 0;
  let demand = 0;
  let connectedRegions = 0;
  for (const rc of REGIONS) {
    const rs = s.regions[rc.id];
    supply += rs.supply;
    demand += rs.demand;
    if (rs.pipeConnections > 0) connectedRegions++;
  }
  const ratio = demand > 0 ? supply / demand : (supply > 0 ? 99 : 0);
  const wrightSavings = 1 - (s.wright.solarPlant.mult + s.wright.windPlant.mult) / 2;
  const liveCustomers = s.customers.filter(c => c.active).length;
  const parts = [
    Math.min(1, ratio / ESCAPE_VELOCITY_SUPPLY_RATIO),
    Math.min(1, wrightSavings / ESCAPE_VELOCITY_WRIGHT_SAVINGS),
    Math.min(1, connectedRegions / ESCAPE_VELOCITY_CONNECTED_REGIONS),
    Math.min(1, liveCustomers / ESCAPE_VELOCITY_CUSTOMERS)
  ];
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

/**
 * Fire the Stage-1 cinematic. Manual callers bypass the act floor and
 * phase guard (but we don't expose a manual button for Stage 1 today).
 */
export function fireOilParityCinematic(manual: boolean): void {
  const s = state;
  if (s.endgame.phase !== 'pre' && !manual) return;
  if (!manual && s.gameDay < NARRATIVE.ACT_2_MIN_DAY) return;
  s.endgame.phase = 'oilParity';
  s.endgame.oilParityReachedOnDay = s.gameDay;
  s.endgame.cinematicStage = 'oilParity';
  s.endgame.cinematicStartedAt = performance.now();
  s.endgame.manualTrigger = manual;
  showManifesto({
    title: 'Oil Parity',
    text: '"The moment e-fuel production cost falls below the market price of fossil crude, an arbitrageur will simply produce synthetic fuel instead of buying petroleum. This creates a hard ceiling on the price of oil — set not by OPEC, not by sanctions, not by policy, but by the cost of solar electricity and electrolysis."'
  });
  showToast('🟢 Oil parity reached.');
}

/**
 * Fire the Stage-2 cinematic. Enforces Act-3 day floor + Oil Parity
 * prerequisite + numeric conditions unless the caller passes manual=true
 * (which we only offer through the "Witness the flywheel" button).
 */
export function fireEscapeVelocityCinematic(manual: boolean): void {
  const s = state;
  if (!manual) {
    if (s.endgame.phase !== 'oilParity') return;
    if (s.gameDay < NARRATIVE.ACT_3_MIN_DAY) return;
    if (!escapeVelocityConditionsMet()) return;
  }
  s.endgame.phase = 'escapeVelocity';
  s.endgame.escapeVelocityReachedOnDay = s.gameDay;
  s.endgame.cinematicStage = 'escapeVelocity';
  s.endgame.cinematicStartedAt = performance.now();
  s.endgame.manualTrigger = manual;
  showManifesto({
    title: 'The Flywheel Ignites',
    text: '"You do not need hydrogen to be cheap before you build the backbone. You build the backbone to make hydrogen cheap."'
  });
}

/**
 * Whether the HUD should show the "Witness the flywheel" button — Stage-2
 * conditions met and no cinematic is running.
 */
export function canManuallyTriggerEscapeVelocity(): boolean {
  const s = state;
  return s.endgame.phase === 'oilParity'
    && escapeVelocityConditionsMet()
    && s.endgame.cinematicStage === 'none';
}

/**
 * End-screen stats for either a victory or a bankruptcy. Always safe to
 * call — the stats are just reads over current state.
 */
export function endScreenStats(): Array<{ label: string; value: string }> {
  const s = state;
  let supply = 0;
  let demand = 0;
  let connected = 0;
  for (const rc of REGIONS) {
    const rs = s.regions[rc.id];
    supply += rs.supply;
    demand += rs.demand;
    if (rs.pipeConnections > 0) connected++;
  }
  const wrightSavings = 1 - (s.wright.solarPlant.mult + s.wright.windPlant.mult) / 2;
  return [
    { label: 'Days elapsed', value: String(s.gameDay) },
    { label: 'Customers online', value: String(s.customers.filter(c => c.active).length) },
    { label: 'Peak network pressure', value: `${s.networkPressure.toFixed(1)} bar` },
    { label: 'Curtailment avoided', value: `${Math.round(s.totalCurtailed)} MWh` },
    { label: 'Wright savings', value: `${Math.round(wrightSavings * 100)}%` },
    { label: 'Oil ceiling at end', value: `€${(s.spotPrice * 42 + 30).toFixed(0)}/bbl` },
    { label: 'Connected regions', value: `${connected} / ${REGIONS.length}` },
    { label: 'Final spot price', value: `€${s.spotPrice.toFixed(2)}/kg` },
    { label: 'Final budget', value: `€${Math.round(s.money / 1e6)}M` }
  ];
}

/**
 * Flip the bankruptcy lose-state. sim.ts will stop ticking from its next
 * frame; ui.ts shows the somber game-over modal. `reason` is surfaced
 * verbatim to the UI.
 */
export function triggerGameOver(reason: string): void {
  const s = state;
  if (s.gameOver?.triggered) return;
  s.gameOver = { triggered: true, reason, day: s.gameDay };
  // Stop the bankruptcy heartbeat so the UI isn't noisy over the modal.
  s.paused = true;
  void ECONOMY; // keep the ECONOMY import live-bound for tooling.
}

/** Days per game-day for renderers that need wall-clock tempo. */
export const DAYS_PER_SEC_AT_1X = TICKS_PER_DAY;
