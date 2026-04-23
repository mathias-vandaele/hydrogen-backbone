// Shared types for state, config, and sim entities.

// Bundled Hydrogen Plants (generator + integrated electrolyzer) replace the
// v1/v2 separate solar/wind/nuclear farms + standalone electrolyzer. There
// is no standalone electrolyzer — conversion is always internal to a plant,
// so only molecules enter the pipe network.
export type BuildingType =
  | 'solarPlant'
  | 'windPlant'
  | 'nuclearPlant'
  | 'pipeline';
export type PlaceableBuildingType = Exclude<BuildingType, 'pipeline'>;
export type PlantKind = 'solar' | 'wind' | 'nuclear';
export type CustomerType = 'steel' | 'ammonia' | 'efuel' | 'chemical' | 'fuelcell' | 'export';

/**
 * Bundled Hydrogen Plant config — generator + integrated electrolyzer
 * built as one placement. Outputs hydrogen directly; the "electricity"
 * step is internal to the facility and visualized but not tracked as
 * regional supply.
 */
export interface HydrogenPlantConfig {
  name: string;
  icon: string;
  kind: PlantKind;
  capacity: number;      // generator nameplate MW (for display/Wright units)
  baseCost: number;
  baseOutput: number;    // nameplate electricity MW used internally
  capacityFactor: number;
  electrolyzerEfficiency: number;  // 0..1 (electron → molecule ratio)
  kwhPerKg: number;
  quote: string;
}

export interface PipelineConfig {
  name: string;
  icon: string;
  baseCostPerKm: number;
  maxFlow: number;
  linepackPerKm: number;
  maxPressure: number;
  quote: string;
}

export interface BuildingsConfigMap {
  solarPlant: HydrogenPlantConfig;
  windPlant: HydrogenPlantConfig;
  nuclearPlant: HydrogenPlantConfig;
  pipeline: PipelineConfig;
}

// ─── Emergence gates (Priority 2) ────────────────────────────────────────
// Each customer archetype embodies a distinct argument from the manifesto.
// `priceThreshold` = classic price-elastic industrial demand.
// `pressureRelief` = network-pressure-driven buffer consumption (e-fuel).
// `supplyReliability` = emerges where the backbone has proven reliable
//   (municipal fuel-cell stations, permissionless distributed demand).
// `domesticSurplus` = export terminal that only makes sense when domestic
//   supply reliably exceeds domestic demand.

export type EmergenceGate =
  | { kind: 'priceThreshold'; threshold: number }
  | { kind: 'pressureRelief'; minPressure: number }
  | { kind: 'supplyReliability'; minUptimeDays: number }
  | { kind: 'domesticSurplus'; minSurplusRatio: number; minSurplusDays: number };

// The slot-kind a customer consumes on its host region.
export type SlotKind = 'industrial' | 'distributed' | 'port' | 'efuel';

export interface CustomerTypeConfig {
  name: string;
  icon: string;
  color: string;
  /** Nominal price threshold used for chart annotation and local pricing.
   *  Actual emergence is driven by `emergenceGate`. */
  priceThreshold: number;
  demandMin: number;
  demandMax: number;
  weight: number;
  minPipeConnections: number;
  pressureRelief?: boolean;
  requiresPort?: boolean;
  slotKind: SlotKind;
  investmentLagDays: number;
  rampDurationDays: number;
  emergenceGate: EmergenceGate;
  quote: string;
}

export interface RegionConfig {
  id: string;
  code: string;
  name: string;
  abbr: string;
  capital: string;
  solarBase: number;
  windBase: number;
  nuclearBonus: number;
  industryDemand: number;
  hasPort: boolean;
  portName?: string;
  gasInfra: number;
  maxSlots: number;
  color: string;
  // Priority 4: finite customer slots per region per slot-kind.
  industrialSlots: number;
  distributedSlots: number;
  portSlots: number;
  efuelSlots: number;
}

export interface RegionBonuses {
  solar: number;
  wind: number;
  nuclear: number;
  industrial: number;
  port: number;
  landCapacity: number;
}

export interface Region {
  id: string;
  code: string;
  name: string;
  polygon: Array<{ x: number; y: number }>;
  rings: Array<Array<{ x: number; y: number }>>;
  bonuses: RegionBonuses;
  centroid: { x: number; y: number };
}

export interface Insight {
  title: string;
  text: string;
}

// ─── Runtime state ───────────────────────────────────────────────

export interface RegionState {
  supply: number;
  demand: number;
  electricity: number;
  pressure: number;
  localPrice: number;
  satisfaction: number;
  pipeConnections: number;
  solarFactor?: number;
  windFactor?: number;
  /** Consecutive days this region has been pipe-connected with positive
   *  supply — used by the `supplyReliability` emergence gate. */
  reliabilityDays: number;
}

export interface Building {
  id: number;
  type: PlaceableBuildingType;
  regionId: string;
  x: number;
  y: number;
  capacity: number;
  builtDay: number;
  production: number;
  /** Total CAPEX paid to place this building. Opex each day is a fraction
   *  of this amount (see config.ECONOMY.DAILY_OPEX_FRACTION). Populated at
   *  placement time in buildings.ts; backfilled from base cost for old saves. */
  cost: number;
  /** Internal electricity MW the plant is generating right now, used for
   *  the renderer's "electrons → molecules" pulse and the tooltip. Only
   *  meaningful for bundled Hydrogen Plants. */
  internalElectricity?: number;
}

export interface Pipe {
  id: number;
  fromId: string;
  toId: string;
  length: number;
  cost: number;
  maxFlow: number;
  flow: number;
  pressure: number;
  linepackCapacity: number;
  linepackStored: number;
  builtDay: number;
}

export interface Customer {
  id: number;
  regionId: string;
  type: CustomerType;
  name: string;
  /** Final target demand once ramp completes (kg/day). */
  demand: number;
  /** Live demand after ramping and any elasticity modifiers (kg/day). */
  currentDemand?: number;
  maxPrice: number;
  satisfaction: number;
  x: number;
  y: number;
  appearedDay: number;
  active: boolean;
  unsatisfiedDays: number;
  scale: number;
  /** 0..1 ramp factor applied to `demand` while the facility spins up. */
  ramp: number;
}

/**
 * A customer whose emergence gate has fired but which has not yet been
 * materialized. Models a committed-but-not-yet-operating project so the
 * price signal can propagate further before this customer's demand lands.
 * If the signal reverses (price climbs back above 110% of threshold)
 * while pending, the project is cancelled.
 */
export interface PendingCustomer {
  id: string;
  type: CustomerType;
  regionId: string;
  committedOnDay: number;
  commitsOnDay: number;
  cancelled: boolean;
  /** Pre-rolled target demand in kg/day so UI can show a "coming online" badge. */
  targetDemand: number;
}

export interface WrightCurve {
  cum: number;
  mult: number;
}

export interface WrightState {
  solarPlant: WrightCurve;
  windPlant: WrightCurve;
  nuclearPlant: WrightCurve;
  pipeline: WrightCurve;
}

export interface MilestoneFlags {
  firstCustomer: boolean;
  curtailment100: boolean;
  priceBelow3: boolean;
  tenPipes: boolean;
}

/** Two-stage narrative arc state (Priority 5). */
export type EndgamePhase = 'pre' | 'oilParity' | 'escapeVelocity' | 'ended';
export type CinematicStage = 'none' | 'oilParity' | 'escapeVelocity';

export interface EndgameState {
  phase: EndgamePhase;
  /** Rolling counter: consecutive days priceEMA <= e-fuel threshold. Fires
   *  oil-parity cinematic at 30. */
  oilParityStreak: number;
  oilParityReachedOnDay: number | null;
  /** Rolling counter: consecutive days all Stage 2 conditions hold. Fires
   *  escape-velocity cinematic at 20. */
  escapeVelocityStreak: number;
  escapeVelocityReachedOnDay: number | null;
  /** Which cinematic (if any) the renderer should overlay. */
  cinematicStage: CinematicStage;
  cinematicStartedAt: number;
  endScreenVisible: boolean;
  /** If true, the player clicked "Witness the flywheel" manually rather
   *  than letting the auto-trigger fire. */
  manualTrigger: boolean;
}

/** v4: bankruptcy lose-condition state. */
export interface GameOverState {
  triggered: boolean;
  reason: string;
  day: number;
}

export interface GameState {
  tick: number;
  gameDay: number;
  timeOfDay: number;
  dayOfYear: number;
  speed: number;
  paused: boolean;
  money: number;
  totalRevenue: number;
  dailyRevenue: number;
  /** Running daily opex total (computed in buildings.ts, read by UI). */
  dailyOpex: number;
  spotPrice: number;
  priceHistory: number[];
  pressureHistory: number[];
  /** Daily snapshot of `money` for the Budget history chart (Priority 3). */
  budgetHistory: number[];
  /** Days in a row the budget has sat below BANKRUPTCY_THRESHOLD. */
  daysBelowBankruptcyThreshold: number;
  /** Game-day when the player's first pipeline was placed (drives the
   *  first-customer grace window). */
  firstPipelineBuiltDay: number | null;
  /** Populated when bankruptcy grace expires; the game-over screen reads it. */
  gameOver: GameOverState | null;
  /** Exponentially weighted moving average of spot price, decay ~0.97/day.
   *  The lagged-commitment model uses this rather than the raw spot price
   *  so single-tick dips don't trigger investment commitments. */
  priceEMA: number;
  /** Day of the last pending-customer creation — enforces
   *  GLOBAL_EMERGENCE_COOLDOWN_DAYS across the whole map. */
  lastCustomerEmergenceDay: number;
  pendingCustomers: PendingCustomer[];
  thresholdCrossings: Record<CustomerType, number | null>;
  /** Rolling counter: consecutive days of national surplus ratio ≥
   *  export gate's minSurplusRatio. Feeds the `domesticSurplus` gate. */
  surplusStreakDays: number;
  totalH2Produced: number;
  totalH2Sold: number;
  totalCurtailed: number;
  networkPressure: number;
  wright: WrightState;
  regions: Record<string, RegionState>;
  buildings: Building[];
  pipes: Pipe[];
  customers: Customer[];
  nextBuildingId: number;
  nextPipeId: number;
  nextCustomerId: number;
  tutorialStep: number;
  tutorialDone: boolean;
  insightIndex: number;
  lastInsightDay: number;
  milestones: MilestoneFlags;
  endgame: EndgameState;
  lastSavedAt: number;
  version: number;
}
