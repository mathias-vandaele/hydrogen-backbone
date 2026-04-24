// Shared types for state, config, and sim entities.

// Bundled Hydrogen Plants (generator + integrated electrolyzer) replace the
// v1/v2 separate solar/wind/nuclear farms + standalone electrolyzer. There
// is no standalone electrolyzer — conversion is always internal to a plant,
// so only molecules enter the pipe network.
export type BuildingType =
  | 'solarPlant'
  | 'windPlant'
  | 'nuclearPlant'
  | 'saltCavern'
  | 'pipeline';
export type PlaceableBuildingType = Exclude<BuildingType, 'pipeline'>;
export type PlantKind = 'solar' | 'wind' | 'nuclear';
export type CustomerArchetype = 'steel' | 'ammonia' | 'efuel' | 'chemical' | 'fuelcell' | 'export';
export type CustomerTier = 'small' | 'mid' | 'big';
export type CustomerType =
  | 'steel_small' | 'steel_mid' | 'steel_big'
  | 'ammonia_small' | 'ammonia_mid' | 'ammonia_big'
  | 'efuel_small' | 'efuel_mid' | 'efuel_big'
  | 'chemical_small' | 'chemical_mid' | 'chemical_big'
  | 'fuelcell_small' | 'fuelcell_mid' | 'fuelcell_big'
  | 'export_small' | 'export_mid' | 'export_big';

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
  capacity: number;      // generator nameplate MW
  baseCost: number;
  baseOutput: number;    // nameplate electricity MW used internally
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

export interface SaltCavernConfig {
  name: string;
  icon: string;
  baseCost: number;
  volumeM3: number;
  storageKg: number;
  constructionDays: number;
  quote: string;
}

export interface BuildingsConfigMap {
  solarPlant: HydrogenPlantConfig;
  windPlant: HydrogenPlantConfig;
  nuclearPlant: HydrogenPlantConfig;
  saltCavern: SaltCavernConfig;
  pipeline: PipelineConfig;
}

// The slot-kind a customer consumes on its host region.
export type SlotKind = 'industrial' | 'distributed' | 'port' | 'efuel';

export interface CustomerTypeConfig {
  archetype: CustomerArchetype;
  tier: CustomerTier;
  name: string;
  icon: string;
  color: string;
  /** Nominal price threshold used for chart annotation and emergence. */
  priceThreshold: number;
  demandMin: number;
  demandMax: number;
  expectedDemand: number;
  minPipeConnections: number;
  pressureRelief?: boolean;
  requiresPort?: boolean;
  slotKind: SlotKind;
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
  /** Rolling 24h ring buffer of this region's instantaneous supply (kg/day
   *  rate) — shares the same tick boundary and length as the network-wide
   *  buffers on GameState. */
  supplySamples?: number[];
  demandSamples?: number[];
  sampleIndex?: number;
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
   *  of this amount (see config.OPEX_ANNUAL_FRACTION). Populated at
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

export interface SaltCavern {
  regionId: string;
  storedH2Kg: number;
  builtDay: number;
  onlineDay: number;
  operational: boolean;
  cost: number;
}

export interface Customer {
  id: number;
  regionId: string;
  type: CustomerType;
  name: string;
  /** Reference demand shown in UI / summaries (kg/day). */
  demand: number;
  /** Live price-shaped demand after ramping and elasticity modifiers (kg/day). */
  currentDemand?: number;
  maxPrice: number;
  satisfaction: number;
  x: number;
  y: number;
  appearedDay: number;
  active: boolean;
  unsatisfiedDays: number;
  scale: number;
}

export interface MilestoneFlags {
  firstCustomer: boolean;
  priceBelow3: boolean;
  tenPipes: boolean;
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
  /** Rolling 24h samples of day-rate revenue and opex for HUD smoothing. */
  revenueSamples: number[];
  opexSamples: number[];
  financeSampleIndex: number;
  spotPrice: number;
  priceHistory: number[];
  pressureHistory: number[];
  /** Daily snapshot of `money` for the Budget history chart (Priority 3). */
  budgetHistory: number[];
  /** Days in a row the budget has sat below BANKRUPTCY_THRESHOLD. */
  daysBelowBankruptcyThreshold: number;
  /** Populated when bankruptcy grace expires; the game-over screen reads it. */
  gameOver: GameOverState | null;
  thresholdCrossings: Record<CustomerType, number | null>;
  totalH2Produced: number;
  totalH2Sold: number;
  networkHydrogenStored: number;
  networkPressure: number;
  /** Ring buffer of recent total-supply samples (kg/day rate), one per sim
   *  tick. Length equals TICKS_PER_DAY, so when full it covers exactly
   *  24 game-hours — the rolling window behind the HUD's averaged readout. */
  supplySamples: number[];
  /** Matching buffer for total demand, sampled at the same tick boundary. */
  demandSamples: number[];
  /** Write position into both sample buffers; wraps at their length. */
  supplyDemandSampleIndex: number;
  regions: Record<string, RegionState>;
  buildings: Building[];
  pipes: Pipe[];
  caverns: SaltCavern[];
  customers: Customer[];
  nextBuildingId: number;
  nextPipeId: number;
  nextCustomerId: number;
  tutorialStep: number;
  tutorialDone: boolean;
  insightIndex: number;
  lastInsightDay: number;
  milestones: MilestoneFlags;
  lastSavedAt: number;
  version: number;
}
