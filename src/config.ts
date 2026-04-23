import type {
  BuildingType,
  BuildingsConfigMap,
  CustomerType,
  CustomerTypeConfig,
  Insight,
  RegionConfig
} from './types';

export const TICKS_PER_SEC = 10;
export const TICKS_PER_DAY = 10;
export const MAX_PRESSURE = 80;
export const MIN_PRESSURE = 5;
export const MAP_PADDING = 60;

// ─── v4 Economy (Priority 2: scarcity-first tuning) ──────────────────────
// Central knobs for the scarcity model. Tune these after playing 15 min.
// STARTING_BUDGET: headroom for Act 1 builds. Too high and there's no
//   urgency; too low and the player can't reach their first revenue event.
// BUILDING_COST_MULTIPLIER: applied when resolving `getCost` so capital
//   weighs more than v3 without rewriting every BUILDINGS entry.
// DAILY_OPEX_FRACTION: running cost per live asset per day, scales with
//   that asset's CAPEX. Idle assets still pay — this is the mechanism
//   that punishes overbuilding ahead of demand.
// BANKRUPTCY_* : soft lose condition. Below threshold for GRACE_DAYS
//   triggers a Game Over screen.
// CUSTOMER_REVENUE_MULTIPLIER: uplift on per-kg payments so the flywheel
//   still reliably rescues a player who reaches the mid-game.
export const ECONOMY = {
  STARTING_BUDGET: 200_000_000,
  BUILDING_COST_MULTIPLIER: 1.5,
  // OPEX ratio: 0.03%/day ≈ 11%/year of CAPEX. Aligns with real renewable-
  // plant OPEX (5-15%/yr). Earlier 0.1%/day = 37%/yr made even a fully-
  // utilized plant unprofitable — customers couldn't cover it because
  // the 1.4× revenue markup was far too thin against the burn rate.
  DAILY_OPEX_FRACTION: 0.0003,
  BANKRUPTCY_THRESHOLD: -50_000_000, // -€50M
  BANKRUPTCY_GRACE_DAYS: 90,
  // Customers pay wholesale × this markup. 1.8× leaves a realistic
  // gross margin once OPEX is subtracted — a served plant should be
  // clearly profitable, an unserved plant should still clearly burn.
  CUSTOMER_REVENUE_MULTIPLIER: 1.8
};

// Legacy alias — `state.ts` still imports this name; point at the new knob.
export const START_MONEY = ECONOMY.STARTING_BUDGET;

// ─── v4 Narrative acts (Priority 1: fix early-firing climax) ─────────────
// The entire story is gated behind act-entry days. ACT_2_MIN_DAY is the
// earliest any climactic trigger can fire; before then the game is Act 1
// (setup). ACT_3_MIN_DAY is the earliest Escape Velocity can fire, AND
// Oil Parity must have fired already.
// OIL_PARITY_PRICE_THRESHOLD is €1.30/kg — realistic e-fuel parity with
// fossil crude. Price + production-floor + customer-floor together
// guarantee the climax reflects a real market, not a puddle.
export const NARRATIVE = {
  ACT_2_MIN_DAY: 180,
  ACT_3_MIN_DAY: 360,
  OIL_PARITY_SUSTAIN_DAYS: 30,
  OIL_PARITY_PRICE_THRESHOLD: 1.3,
  OIL_PARITY_MIN_PRODUCTION_KG: 5000,
  OIL_PARITY_MIN_CUSTOMERS: 3
};

// ─── Economic arc tuning (carried from v3) ───────────────────────────────
export const GLOBAL_EMERGENCE_COOLDOWN_DAYS = 5;
export const PRICE_EMA_DECAY = 0.97;
export const WRIGHT_SAVINGS_CAP = 0.45;
export const CHURN_DAILY_PROBABILITY = 0.0002;
export const EFUEL_SURGE_PRESSURE = 0.85;
export const EFUEL_SURGE_MULTIPLIER = 1.5;

// Escape Velocity gates (unchanged from v3 apart from Act-3 floor).
export const ESCAPE_VELOCITY_REQUIRED_DAYS = 20;
export const ESCAPE_VELOCITY_SUPPLY_RATIO = 1.2;
export const ESCAPE_VELOCITY_WRIGHT_SAVINGS = 0.3;
export const ESCAPE_VELOCITY_CONNECTED_REGIONS = 8;
export const ESCAPE_VELOCITY_CUSTOMERS = 12;

// Aliases so chart.ts / ui.ts can read the canonical oil-parity threshold
// without importing the whole NARRATIVE block.
export const OIL_PARITY_THRESHOLD = NARRATIVE.OIL_PARITY_PRICE_THRESHOLD;
export const OIL_PARITY_REQUIRED_DAYS = NARRATIVE.OIL_PARITY_SUSTAIN_DAYS;

// Priority 4: grace window so the first customer can reliably emerge
// before scarcity bankrupts a reasonable opening build.
export const FIRST_CUSTOMER_GRACE_MIN_DAYS = 45;
export const FIRST_CUSTOMER_GRACE_MAX_DAYS = 75;

// Wright's Law learning rates (cost reduction per doubling of cumulative capacity).
export const LEARNING: Record<BuildingType, number> = {
  solarPlant: 0.20,
  windPlant: 0.15,
  nuclearPlant: 0.05,
  pipeline: 0.10
};

// Bundled plant cost = old-generator-cost + old-electrolyzer-cost × 0.9
// (10% bundling discount to reward integrated placement, per v3 brief).
// baseOutput stays tied to the generator side; the plant pipes its
// electricity through an integrated 70%-efficient electrolyzer stack.
export const BUILDINGS: BuildingsConfigMap = {
  solarPlant: {
    name: 'Solar Hydrogen Plant',
    icon: '☀️',
    kind: 'solar',
    capacity: 100,
    baseCost: 90_000_000, // (55M + 45M) × 0.9
    baseOutput: 600,
    capacityFactor: 0.22,
    electrolyzerEfficiency: 0.70,
    kwhPerKg: 55,
    quote: '"Solar electricity in southern Europe costs 20 €/MWh today. Co-locate electrolysis; only molecules leave."'
  },
  windPlant: {
    name: 'Wind Hydrogen Plant',
    icon: '💨',
    kind: 'wind',
    capacity: 100,
    baseCost: 108_000_000, // (75M + 45M) × 0.9
    baseOutput: 800,
    capacityFactor: 0.28,
    electrolyzerEfficiency: 0.70,
    kwhPerKg: 55,
    quote: '"Every MWh of excess wind converts to hydrogen on the spot. There is no such thing as excess."'
  },
  nuclearPlant: {
    name: 'Nuclear Hydrogen Plant',
    icon: '⚛️',
    kind: 'nuclear',
    capacity: 1000,
    baseCost: 900_000_000, // (180M + 45M) × 0.9
    baseOutput: 4200,
    capacityFactor: 0.90,
    electrolyzerEfficiency: 0.70,
    kwhPerKg: 55,
    quote: '"Baseload nuclear, electrolysed on-site, 24/7. Raises reactor load factors; only hydrogen enters the pipe."'
  },
  pipeline: {
    name: 'Pipeline',
    icon: '🔗',
    baseCostPerKm: 180_000,
    maxFlow: 80_000,
    linepackPerKm: 50,
    maxPressure: 80,
    quote: '"A hydrogen pipeline network is TCP/IP for energy. The pipe does not care who injects hydrogen or who withdraws it."'
  }
};

// Each customer type now has a differentiated emergence gate (Priority 2),
// an investment lag (Priority 1 — the delay between price crossing and
// actual commitment), a ramp duration (Priority 1 — demand starts small
// and grows), and a slot-kind (Priority 4 — finite regional capacity).
export const CUSTOMER_TYPES: Record<CustomerType, CustomerTypeConfig> = {
  steel: {
    name: 'Steel DRI Plant', icon: '🏭', color: '#ef4444',
    priceThreshold: 5.5, demandMin: 8000, demandMax: 25_000,
    weight: 0.25, minPipeConnections: 1,
    slotKind: 'industrial',
    investmentLagDays: 45,
    rampDurationDays: 20,
    emergenceGate: { kind: 'priceThreshold', threshold: 5.5 },
    quote: '"A single DRI plant consumes roughly 70,000 tonnes of H₂ per year. Connect it to the pipe."'
  },
  ammonia: {
    name: 'Ammonia Factory', icon: '🧪', color: '#8b5cf6',
    priceThreshold: 5.0, demandMin: 5000, demandMax: 18_000,
    weight: 0.25, minPipeConnections: 1,
    slotKind: 'industrial',
    investmentLagDays: 30,
    rampDurationDays: 15,
    emergenceGate: { kind: 'priceThreshold', threshold: 5.0 },
    quote: '"The Haber-Bosch process consumes 1.8% of global energy, almost all from grey hydrogen."'
  },
  efuel: {
    name: 'E-Fuel Refinery', icon: '⛽', color: '#f59e0b',
    priceThreshold: 4.5, demandMin: 3000, demandMax: 35_000,
    weight: 0.3, minPipeConnections: 1, pressureRelief: true,
    slotKind: 'efuel',
    investmentLagDays: 35,
    rampDurationDays: 15,
    emergenceGate: { kind: 'pressureRelief', minPressure: 0.7 },
    quote: '"E-fuel producers are the backbone\'s natural pressure relief valve. Plants ramp up automatically when pressure is high."'
  },
  chemical: {
    name: 'Chemical Plant', icon: '⚗️', color: '#3b82f6',
    priceThreshold: 4.0, demandMin: 2000, demandMax: 12_000,
    weight: 0.2, minPipeConnections: 1,
    slotKind: 'industrial',
    investmentLagDays: 25,
    rampDurationDays: 12,
    emergenceGate: { kind: 'priceThreshold', threshold: 4.0 },
    quote: '"The entire petrochemical value chain has hydrogen-fed alternatives."'
  },
  fuelcell: {
    name: 'Fuel Cell Station', icon: '🔋', color: '#06d6a0',
    priceThreshold: 3.5, demandMin: 500, demandMax: 5000,
    weight: 0.3, minPipeConnections: 1,
    slotKind: 'distributed',
    investmentLagDays: 15,
    rampDurationDays: 10,
    emergenceGate: { kind: 'supplyReliability', minUptimeDays: 30 },
    quote: '"A municipality installs a fuel cell. It now has a dispatchable local power plant with no emissions."'
  },
  export: {
    name: 'Export Terminal', icon: '🚢', color: '#06b6d4',
    priceThreshold: 3.0, demandMin: 15_000, demandMax: 60_000,
    weight: 0.15, minPipeConnections: 2, requiresPort: true,
    slotKind: 'port',
    investmentLagDays: 60,
    rampDurationDays: 20,
    emergenceGate: { kind: 'domesticSurplus', minSurplusRatio: 1.25, minSurplusDays: 20 },
    quote: '"France\'s port infrastructure is positioned for e-fuel export to global shipping and aviation markets."'
  }
};

// Slot distribution roughly tracks industryDemand, population, port status,
// and suitability for e-fuel refining. Total across all 13 regions ≈ 27
// (industrial 11, distributed 9, port 4, efuel 6) so the endgame arrives
// after the player has lit a recognisable portion of the map.
export const REGIONS: RegionConfig[] = [
  {
    id: 'hauts-de-france', code: '32', name: 'Hauts-de-France', abbr: 'HdF',
    capital: 'Lille',
    solarBase: 0.55, windBase: 0.85, nuclearBonus: 1.3, industryDemand: 1.4,
    hasPort: true, portName: 'Dunkirk/Calais',
    gasInfra: 0.8, maxSlots: 12,
    color: '#1a2535',
    industrialSlots: 2, distributedSlots: 1, portSlots: 1, efuelSlots: 1
  },
  {
    id: 'grand-est', code: '44', name: 'Grand Est', abbr: 'GE',
    capital: 'Strasbourg',
    solarBase: 0.55, windBase: 0.70, nuclearBonus: 1.4, industryDemand: 1.2,
    hasPort: false, gasInfra: 0.7, maxSlots: 14,
    color: '#1a2840',
    industrialSlots: 2, distributedSlots: 1, portSlots: 0, efuelSlots: 1
  },
  {
    id: 'normandie', code: '28', name: 'Normandy', abbr: 'NOR',
    capital: 'Rouen',
    solarBase: 0.50, windBase: 0.80, nuclearBonus: 1.2, industryDemand: 0.9,
    hasPort: true, portName: 'Le Havre/Rouen',
    gasInfra: 0.6, maxSlots: 10,
    color: '#152535',
    industrialSlots: 1, distributedSlots: 1, portSlots: 1, efuelSlots: 1
  },
  {
    id: 'bretagne', code: '53', name: 'Brittany', abbr: 'BRE',
    capital: 'Rennes',
    solarBase: 0.50, windBase: 0.90, nuclearBonus: 0.0, industryDemand: 0.6,
    hasPort: true, portName: 'Brest',
    gasInfra: 0.4, maxSlots: 8,
    color: '#12253a',
    industrialSlots: 0, distributedSlots: 1, portSlots: 0, efuelSlots: 0
  },
  {
    id: 'ile-de-france', code: '11', name: 'Île-de-France', abbr: 'IdF',
    capital: 'Paris',
    solarBase: 0.55, windBase: 0.50, nuclearBonus: 0.3, industryDemand: 1.5,
    hasPort: false, gasInfra: 0.9, maxSlots: 8,
    color: '#1e2845',
    industrialSlots: 1, distributedSlots: 2, portSlots: 0, efuelSlots: 0
  },
  {
    id: 'centre-val-de-loire', code: '24', name: 'Centre-Val de Loire', abbr: 'CVL',
    capital: 'Orléans',
    solarBase: 0.60, windBase: 0.55, nuclearBonus: 1.3, industryDemand: 0.7,
    hasPort: false, gasInfra: 0.5, maxSlots: 12,
    color: '#162535',
    industrialSlots: 1, distributedSlots: 1, portSlots: 0, efuelSlots: 1
  },
  {
    id: 'pays-de-la-loire', code: '52', name: 'Pays de la Loire', abbr: 'PdL',
    capital: 'Nantes',
    solarBase: 0.58, windBase: 0.75, nuclearBonus: 0.5, industryDemand: 0.7,
    hasPort: true, portName: 'Nantes-Saint-Nazaire',
    gasInfra: 0.5, maxSlots: 10,
    color: '#142530',
    industrialSlots: 1, distributedSlots: 1, portSlots: 1, efuelSlots: 0
  },
  {
    id: 'bourgogne-franche-comte', code: '27', name: 'Bourgogne-Franche-Comté', abbr: 'BFC',
    capital: 'Dijon',
    solarBase: 0.58, windBase: 0.55, nuclearBonus: 0.8, industryDemand: 0.8,
    hasPort: false, gasInfra: 0.6, maxSlots: 12,
    color: '#182840',
    industrialSlots: 1, distributedSlots: 0, portSlots: 0, efuelSlots: 0
  },
  {
    id: 'nouvelle-aquitaine', code: '75', name: 'Nouvelle-Aquitaine', abbr: 'NAQ',
    capital: 'Bordeaux',
    solarBase: 0.68, windBase: 0.55, nuclearBonus: 0.8, industryDemand: 0.8,
    hasPort: true, portName: 'Bordeaux/La Rochelle',
    gasInfra: 0.7, maxSlots: 16,
    color: '#152030',
    industrialSlots: 1, distributedSlots: 1, portSlots: 1, efuelSlots: 1
  },
  {
    id: 'auvergne-rhone-alpes', code: '84', name: 'Auvergne-Rhône-Alpes', abbr: 'ARA',
    capital: 'Lyon',
    solarBase: 0.65, windBase: 0.50, nuclearBonus: 1.5, industryDemand: 1.3,
    hasPort: false, gasInfra: 0.8, maxSlots: 14,
    color: '#1a2840',
    industrialSlots: 1, distributedSlots: 1, portSlots: 0, efuelSlots: 1
  },
  {
    id: 'occitanie', code: '76', name: 'Occitanie', abbr: 'OCC',
    capital: 'Toulouse',
    solarBase: 0.82, windBase: 0.65, nuclearBonus: 0.6, industryDemand: 0.9,
    hasPort: false, gasInfra: 0.6, maxSlots: 14,
    color: '#1a2030',
    industrialSlots: 1, distributedSlots: 1, portSlots: 0, efuelSlots: 1
  },
  {
    id: 'provence-alpes-cote-dazur', code: '93', name: "Provence-Alpes-Côte d'Azur", abbr: 'PACA',
    capital: 'Marseille',
    solarBase: 0.92, windBase: 0.60, nuclearBonus: 0.7, industryDemand: 1.0,
    hasPort: true, portName: 'Marseille-Fos',
    gasInfra: 0.7, maxSlots: 12,
    color: '#1e2535',
    industrialSlots: 0, distributedSlots: 1, portSlots: 1, efuelSlots: 1
  },
  {
    id: 'corse', code: '94', name: 'Corsica', abbr: 'COR',
    capital: 'Ajaccio',
    solarBase: 0.88, windBase: 0.70, nuclearBonus: 0.0, industryDemand: 0.3,
    hasPort: true, portName: 'Ajaccio/Bastia',
    gasInfra: 0.1, maxSlots: 4,
    color: '#182535',
    industrialSlots: 0, distributedSlots: 1, portSlots: 0, efuelSlots: 0
  }
];

// Real French natural-gas trunk corridors (approximate waypoints in lon/lat).
// Rendered as desaturated underlay so the player's hydrogen network visibly
// grows on top of pre-existing infrastructure.
export interface GasCorridor { name: string; waypoints: Array<[number, number]>; }
export const GAS_CORRIDORS: GasCorridor[] = [
  { name: 'Dunkerque → Paris → Marseille', waypoints: [[2.38,51.05],[3.07,50.63],[2.35,48.86],[4.83,45.76],[4.95,44.35],[5.37,43.30]] },
  { name: 'Le Havre → Rouen → Lyon',       waypoints: [[0.11,49.49],[1.10,49.44],[2.35,48.86],[4.38,48.00],[5.04,47.32],[4.83,45.76]] },
  { name: 'Bordeaux → Toulouse',            waypoints: [[-0.58,44.84],[0.62,44.20],[1.44,43.60]] },
  { name: 'Paris → Strasbourg',             waypoints: [[2.35,48.86],[4.03,49.26],[6.17,49.12],[7.75,48.57]] },
  { name: 'Fos → Montpellier → Perpignan',  waypoints: [[5.0,43.44],[3.88,43.61],[2.89,42.70]] },
  { name: 'Bordeaux → Bayonne',             waypoints: [[-0.58,44.84],[-1.17,43.69],[-1.47,43.49]] }
];

// Pressure-to-color palette for the pipe network. HSL stops interpolated by
// pressure ratio. At 0: dim red-orange; at 1: bright white-cyan.
export interface HSL { h: number; s: number; l: number; }
export const PIPE_PALETTE: Array<{ t: number; hsl: HSL }> = [
  { t: 0.00, hsl: { h:  15, s: 70, l: 35 } }, // dim red-orange
  { t: 0.35, hsl: { h:  35, s: 85, l: 50 } }, // amber
  { t: 0.65, hsl: { h: 175, s: 80, l: 55 } }, // cyan
  { t: 1.00, hsl: { h: 180, s: 95, l: 85 } }  // bright white-cyan
];

/**
 * Interpolate the pipe color palette for a normalized 0..1 pressure ratio.
 * Returns an HSL triplet; use {@link hslString} to render as an alpha-aware
 * CSS string. Clamped to [0,1] to keep the palette stable at extremes.
 */
export function pipeColorHsl(pressureRatio: number): HSL {
  const t = Math.max(0, Math.min(1, pressureRatio));
  for (let i = 0; i < PIPE_PALETTE.length - 1; i++) {
    const a = PIPE_PALETTE[i];
    const b = PIPE_PALETTE[i + 1];
    if (t >= a.t && t <= b.t) {
      const k = (t - a.t) / (b.t - a.t);
      return {
        h: a.hsl.h + (b.hsl.h - a.hsl.h) * k,
        s: a.hsl.s + (b.hsl.s - a.hsl.s) * k,
        l: a.hsl.l + (b.hsl.l - a.hsl.l) * k
      };
    }
  }
  return PIPE_PALETTE[PIPE_PALETTE.length - 1].hsl;
}

/**
 * Format an HSL color as a CSS `hsla()` string with the given alpha. Kept
 * here (rather than in a render module) so sim/data code can share a
 * palette without importing rendering concerns.
 */
export function hslString(c: HSL, alpha = 1): string {
  return `hsla(${c.h.toFixed(1)}, ${c.s.toFixed(1)}%, ${c.l.toFixed(1)}%, ${alpha})`;
}

const REGIONS_BY_CODE = new Map(REGIONS.map(r => [r.code, r]));

/**
 * Look up a region's config by its INSEE numeric code (e.g., '32' for
 * Hauts-de-France). Used when joining GeoJSON features to gameplay bonuses.
 */
export function getRegionConfigByCode(code: string): RegionConfig | undefined {
  return REGIONS_BY_CODE.get(code);
}

export const ADJACENCIES: Array<[string, string]> = [
  ['hauts-de-france','grand-est'],
  ['hauts-de-france','normandie'],
  ['hauts-de-france','ile-de-france'],
  ['grand-est','ile-de-france'],
  ['grand-est','bourgogne-franche-comte'],
  ['normandie','ile-de-france'],
  ['normandie','bretagne'],
  ['normandie','pays-de-la-loire'],
  ['normandie','centre-val-de-loire'],
  ['ile-de-france','centre-val-de-loire'],
  ['ile-de-france','bourgogne-franche-comte'],
  ['bretagne','pays-de-la-loire'],
  ['pays-de-la-loire','centre-val-de-loire'],
  ['pays-de-la-loire','nouvelle-aquitaine'],
  ['centre-val-de-loire','bourgogne-franche-comte'],
  ['centre-val-de-loire','nouvelle-aquitaine'],
  ['centre-val-de-loire','auvergne-rhone-alpes'],
  ['bourgogne-franche-comte','auvergne-rhone-alpes'],
  ['nouvelle-aquitaine','auvergne-rhone-alpes'],
  ['nouvelle-aquitaine','occitanie'],
  ['auvergne-rhone-alpes','occitanie'],
  ['auvergne-rhone-alpes','provence-alpes-cote-dazur'],
  ['occitanie','provence-alpes-cote-dazur']
];

export const INSIGHTS: Insight[] = [
  { title: 'The Price Argument', text: 'Clean, dispatchable, storable energy from solar + hydrogen is already cheaper than coal. Not in 2035. Now. And every year, the input price falls further while the fossil alternative gets more expensive.' },
  { title: 'The Curtailment Scandal', text: 'When a solar farm produces electricity and the grid throws it away, we label it "curtailment." But it is waste. It is 100% waste. The hydrogen backbone eliminates this by making curtailment structurally impossible.' },
  { title: 'The Protocol Layer', text: 'A hydrogen pipeline network is TCP/IP for energy. The pipe does not care who injects hydrogen or who withdraws it. Pressure is the only signal, and pressure is self-regulating.' },
  { title: 'The Flywheel', text: 'Cheap solar → cheap hydrogen → guaranteed demand for renewable electricity → more solar built → cheaper solar → cheaper hydrogen. This is Wright\'s Law in action.' },
  { title: 'Permissionless Production', text: 'Anyone with an electrolyzer and a grid connection can produce hydrogen and inject it. No dispatch coordination. No frequency regulation. Connect, inject, meter, settle.' },
  { title: 'Automatic Storage', text: 'The pipeline itself stores energy through line-packing. One thousand kilometers of pipeline stores approximately 110 GWh — enough to buffer daily demand fluctuations.' },
  { title: 'The Oil Price Ceiling', text: 'The moment e-fuel production cost falls below the market price of fossil crude, the fossil fuel industry does not get banned. It gets priced out. Quietly, permanently.' },
  { title: 'Build The Backbone', text: 'You do not need hydrogen to be cheap before you build the backbone. You build the backbone to make hydrogen cheap.' }
];

const REGIONS_BY_ID = new Map(REGIONS.map(r => [r.id, r]));

/**
 * Look up a region's config by its gameplay id (slug: 'hauts-de-france',
 * 'corse', etc.). The primary accessor used by sim + UI code.
 */
export function getRegionConfig(id: string): RegionConfig | undefined {
  return REGIONS_BY_ID.get(id);
}
