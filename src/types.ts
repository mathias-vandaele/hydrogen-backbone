// Shared types for state, config, and sim entities.

export type BuildingType = 'solar' | 'wind' | 'nuclear' | 'electrolyzer' | 'pipeline';
export type PlaceableBuildingType = Exclude<BuildingType, 'pipeline'>;
export type CustomerType = 'steel' | 'ammonia' | 'efuel' | 'chemical' | 'fuelcell' | 'export';

export interface GeneratorBuildingConfig {
  name: string;
  icon: string;
  capacity: number;
  baseCost: number;
  baseOutput: number;
  capacityFactor: number;
  quote: string;
}

export interface ElectrolyzerConfig {
  name: string;
  icon: string;
  capacity: number;
  baseCost: number;
  efficiency: number;
  kwhPerKg: number;
  maxH2PerDay: number;
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
  solar: GeneratorBuildingConfig;
  wind: GeneratorBuildingConfig;
  nuclear: GeneratorBuildingConfig;
  electrolyzer: ElectrolyzerConfig;
  pipeline: PipelineConfig;
}

export interface CustomerTypeConfig {
  name: string;
  icon: string;
  color: string;
  priceThreshold: number;
  demandMin: number;
  demandMax: number;
  weight: number;
  minPipeConnections: number;
  pressureRelief?: boolean;
  requiresPort?: boolean;
  quote: string;
}

export interface RegionConfig {
  id: string;
  name: string;
  abbr: string;
  capital: string;
  capitalCoord: [number, number];
  solarBase: number;
  windBase: number;
  nuclearBonus: number;
  industryDemand: number;
  hasPort: boolean;
  portName?: string;
  gasInfra: number;
  maxSlots: number;
  color: string;
  polygon: Array<[number, number]>;
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
  demand: number;
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

export interface WrightCurve {
  cum: number;
  mult: number;
}

export interface WrightState {
  solar: WrightCurve;
  wind: WrightCurve;
  nuclear: WrightCurve;
  electrolyzer: WrightCurve;
  pipeline: WrightCurve;
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
  spotPrice: number;
  priceHistory: number[];
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
  version: number;
}
