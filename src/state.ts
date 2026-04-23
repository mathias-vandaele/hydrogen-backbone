import { REGIONS, START_MONEY } from './config';
import type { CustomerType, GameState, RegionState } from './types';

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
      pipeConnections: 0,
      reliabilityDays: 0
    };
  }
  const thresholdCrossings: Record<CustomerType, number | null> = {
    steel: null, ammonia: null, efuel: null, chemical: null, fuelcell: null, export: null
  };
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
    dailyOpex: 0,
    spotPrice: 6.0,
    priceHistory: [],
    pressureHistory: [],
    budgetHistory: [],
    daysBelowBankruptcyThreshold: 0,
    firstPipelineBuiltDay: null,
    gameOver: null,
    priceEMA: 6.0,
    lastCustomerEmergenceDay: -999,
    pendingCustomers: [],
    thresholdCrossings,
    surplusStreakDays: 0,
    totalH2Produced: 0,
    totalH2Sold: 0,
    totalCurtailed: 0,
    networkPressure: 0,
    wright: {
      solarPlant: { cum: 0, mult: 1.0 },
      windPlant: { cum: 0, mult: 1.0 },
      nuclearPlant: { cum: 0, mult: 1.0 },
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
    endgame: {
      phase: 'pre',
      oilParityStreak: 0,
      oilParityReachedOnDay: null,
      escapeVelocityStreak: 0,
      escapeVelocityReachedOnDay: null,
      cinematicStage: 'none',
      cinematicStartedAt: 0,
      endScreenVisible: false,
      manualTrigger: false
    },
    lastSavedAt: 0,
    version: 4
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
