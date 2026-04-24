import { CUSTOMER_TYPES, REGIONS, START_MONEY } from './config';
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
      reliabilityDays: 0,
      supplySamples: [],
      demandSamples: [],
      sampleIndex: 0
    };
  }
  const customerTypes = Object.keys(CUSTOMER_TYPES) as CustomerType[];
  const thresholdCrossings = Object.fromEntries(customerTypes.map(type => [type, null])) as Record<CustomerType, number | null>;
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
    revenueSamples: [],
    opexSamples: [],
    financeSampleIndex: 0,
    spotPrice: 6.0,
    priceHistory: [],
    pressureHistory: [],
    budgetHistory: [],
    daysBelowBankruptcyThreshold: 0,
    gameOver: null,
    thresholdCrossings,
    totalH2Produced: 0,
    totalH2Sold: 0,
    networkHydrogenStored: 0,
    networkPressure: 0,
    supplySamples: [],
    demandSamples: [],
    supplyDemandSampleIndex: 0,
    regions,
    buildings: [],
    pipes: [],
    caverns: [],
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
      priceBelow3: false,
      tenPipes: false,
      researchBreakthrough: false,
      researchComplete: false
    },
    research: {
      solar: { tier: 0 },
      wind: { tier: 0 },
      electrolyzer: { tier: 0 }
    },
    lastSavedAt: 0,
    version: 5
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
