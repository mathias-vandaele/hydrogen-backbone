import { REGIONS, START_MONEY } from './config';
import type { GameState, RegionState } from './types';

/**
 * Build a fresh, ready-to-play GameState. Called on boot when no save
 * exists, on "New Game", and by save-migration to source defaults for
 * fields missing from older saves.
 */
export function createInitialState(): GameState {
  const regions: Record<string, RegionState> = {};
  for (const r of REGIONS) {
    regions[r.id] = {
      supply: 0,
      demand: 0,
      electricity: 0,
      pressure: 30,
      localPrice: 6.0,
      satisfaction: 0,
      pipeConnections: 0
    };
  }
  return {
    tick: 0,
    gameDay: 1,
    timeOfDay: 0.25,
    dayOfYear: 80,
    speed: 1,
    paused: false,
    money: START_MONEY,
    totalRevenue: 0,
    dailyRevenue: 0,
    spotPrice: 6.0,
    priceHistory: [],
    pressureHistory: [],
    totalH2Produced: 0,
    totalH2Sold: 0,
    totalCurtailed: 0,
    networkPressure: 0,
    wright: {
      solar: { cum: 0, mult: 1.0 },
      wind: { cum: 0, mult: 1.0 },
      nuclear: { cum: 0, mult: 1.0 },
      electrolyzer: { cum: 0, mult: 1.0 },
      pipeline: { cum: 0, mult: 1.0 }
    },
    regions,
    buildings: [],
    pipes: [],
    customers: [],
    nextBuildingId: 1,
    nextPipeId: 1,
    nextCustomerId: 1,
    tutorialStep: 0,
    tutorialDone: false,
    insightIndex: 0,
    lastInsightDay: 0,
    milestones: {
      firstCustomer: false,
      curtailment100: false,
      priceBelow3: false,
      tenPipes: false
    },
    lastSavedAt: 0,
    version: 1
  };
}

// Live binding: importers get the current `state` reference on every read
// thanks to ESM live bindings. Reassigning via replaceState() is the only
// supported way to swap the whole state object (e.g. on load/new game).
export let state: GameState = createInitialState();

/**
 * Swap the entire game state. All modules observe the change immediately
 * via their imported `state` reference — do not cache `state` in a local
 * at module scope, or it will go stale after a load/reset.
 */
export function replaceState(next: GameState): void {
  state = next;
}
