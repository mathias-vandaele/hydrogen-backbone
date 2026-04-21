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
export const START_MONEY = 500_000_000;
export const MAX_PRESSURE = 80;
export const MIN_PRESSURE = 5;
export const MAP_PADDING = 60;

// Wright's Law learning rates (cost reduction per doubling of cumulative capacity).
export const LEARNING: Record<BuildingType, number> = {
  solar: 0.20,
  wind: 0.15,
  nuclear: 0.05,
  electrolyzer: 0.18,
  pipeline: 0.10
};

export const BUILDINGS: BuildingsConfigMap = {
  solar: {
    name: 'Solar Farm',
    icon: '☀️',
    capacity: 100,
    baseCost: 55_000_000,
    baseOutput: 600,
    capacityFactor: 0.22,
    quote: '"Solar electricity in southern Europe costs 20 €/MWh today… This is not a projection. It is a market price."'
  },
  wind: {
    name: 'Wind Farm',
    icon: '💨',
    capacity: 100,
    baseCost: 75_000_000,
    baseOutput: 800,
    capacityFactor: 0.28,
    quote: '"Every MWh of excess renewable generation can be converted to hydrogen… There is no such thing as excess."'
  },
  nuclear: {
    name: 'Nuclear Plant',
    icon: '⚛️',
    capacity: 200,
    baseCost: 180_000_000,
    baseOutput: 4200,
    capacityFactor: 0.90,
    quote: '"Nuclear excels at constant output… Electrolysis absorbs off-peak nuclear power, raising reactor load factors and revenue."'
  },
  electrolyzer: {
    name: 'Electrolyzer',
    icon: '🔬',
    capacity: 50,
    baseCost: 45_000_000,
    efficiency: 0.70,
    kwhPerKg: 55,
    maxH2PerDay: 22_000,
    quote: '"An electrolyzer converts electricity to hydrogen at roughly 70% efficiency."'
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

export const CUSTOMER_TYPES: Record<CustomerType, CustomerTypeConfig> = {
  steel: {
    name: 'Steel DRI Plant', icon: '🏭', color: '#ef4444',
    priceThreshold: 5.5, demandMin: 8000, demandMax: 25_000,
    weight: 0.25, minPipeConnections: 1,
    quote: '"A single DRI plant consumes roughly 70,000 tonnes of H₂ per year. Connect it to the pipe."'
  },
  ammonia: {
    name: 'Ammonia Factory', icon: '🧪', color: '#8b5cf6',
    priceThreshold: 5.0, demandMin: 5000, demandMax: 18_000,
    weight: 0.25, minPipeConnections: 1,
    quote: '"The Haber-Bosch process consumes 1.8% of global energy, almost all from grey hydrogen."'
  },
  efuel: {
    name: 'E-Fuel Refinery', icon: '⛽', color: '#f59e0b',
    priceThreshold: 4.5, demandMin: 3000, demandMax: 35_000,
    weight: 0.3, minPipeConnections: 1, pressureRelief: true,
    quote: '"E-fuel producers are the backbone\'s natural pressure relief valve… Plants ramp up automatically when pressure is high."'
  },
  chemical: {
    name: 'Chemical Plant', icon: '⚗️', color: '#3b82f6',
    priceThreshold: 4.0, demandMin: 2000, demandMax: 12_000,
    weight: 0.2, minPipeConnections: 1,
    quote: '"The entire petrochemical value chain has hydrogen-fed alternatives."'
  },
  fuelcell: {
    name: 'Fuel Cell Station', icon: '🔋', color: '#06d6a0',
    priceThreshold: 3.5, demandMin: 500, demandMax: 5000,
    weight: 0.3, minPipeConnections: 1,
    quote: '"A municipality installs a fuel cell… It now has a dispatchable local power plant with no emissions."'
  },
  export: {
    name: 'Export Terminal', icon: '🚢', color: '#06b6d4',
    priceThreshold: 3.0, demandMin: 15_000, demandMax: 60_000,
    weight: 0.15, minPipeConnections: 2, requiresPort: true,
    quote: '"France\'s port infrastructure is positioned for e-fuel export to global shipping and aviation markets."'
  }
};

export const REGIONS: RegionConfig[] = [
  {
    id: 'hauts-de-france', code: '32', name: 'Hauts-de-France', abbr: 'HdF',
    capital: 'Lille',
    solarBase: 0.55, windBase: 0.85, nuclearBonus: 1.3, industryDemand: 1.4,
    hasPort: true, portName: 'Dunkirk/Calais',
    gasInfra: 0.8, maxSlots: 12,
    color: '#1a2535'
  },
  {
    id: 'grand-est', code: '44', name: 'Grand Est', abbr: 'GE',
    capital: 'Strasbourg',
    solarBase: 0.55, windBase: 0.70, nuclearBonus: 1.4, industryDemand: 1.2,
    hasPort: false, gasInfra: 0.7, maxSlots: 14,
    color: '#1a2840'
  },
  {
    id: 'normandie', code: '28', name: 'Normandy', abbr: 'NOR',
    capital: 'Rouen',
    solarBase: 0.50, windBase: 0.80, nuclearBonus: 1.2, industryDemand: 0.9,
    hasPort: true, portName: 'Le Havre/Rouen',
    gasInfra: 0.6, maxSlots: 10,
    color: '#152535'
  },
  {
    id: 'bretagne', code: '53', name: 'Brittany', abbr: 'BRE',
    capital: 'Rennes',
    solarBase: 0.50, windBase: 0.90, nuclearBonus: 0.0, industryDemand: 0.6,
    hasPort: true, portName: 'Brest',
    gasInfra: 0.4, maxSlots: 8,
    color: '#12253a'
  },
  {
    id: 'ile-de-france', code: '11', name: 'Île-de-France', abbr: 'IdF',
    capital: 'Paris',
    solarBase: 0.55, windBase: 0.50, nuclearBonus: 0.3, industryDemand: 1.5,
    hasPort: false, gasInfra: 0.9, maxSlots: 8,
    color: '#1e2845'
  },
  {
    id: 'centre-val-de-loire', code: '24', name: 'Centre-Val de Loire', abbr: 'CVL',
    capital: 'Orléans',
    solarBase: 0.60, windBase: 0.55, nuclearBonus: 1.3, industryDemand: 0.7,
    hasPort: false, gasInfra: 0.5, maxSlots: 12,
    color: '#162535'
  },
  {
    id: 'pays-de-la-loire', code: '52', name: 'Pays de la Loire', abbr: 'PdL',
    capital: 'Nantes',
    solarBase: 0.58, windBase: 0.75, nuclearBonus: 0.5, industryDemand: 0.7,
    hasPort: true, portName: 'Nantes-Saint-Nazaire',
    gasInfra: 0.5, maxSlots: 10,
    color: '#142530'
  },
  {
    id: 'bourgogne-franche-comte', code: '27', name: 'Bourgogne-Franche-Comté', abbr: 'BFC',
    capital: 'Dijon',
    solarBase: 0.58, windBase: 0.55, nuclearBonus: 0.8, industryDemand: 0.8,
    hasPort: false, gasInfra: 0.6, maxSlots: 12,
    color: '#182840'
  },
  {
    id: 'nouvelle-aquitaine', code: '75', name: 'Nouvelle-Aquitaine', abbr: 'NAQ',
    capital: 'Bordeaux',
    solarBase: 0.68, windBase: 0.55, nuclearBonus: 0.8, industryDemand: 0.8,
    hasPort: true, portName: 'Bordeaux/La Rochelle',
    gasInfra: 0.7, maxSlots: 16,
    color: '#152030'
  },
  {
    id: 'auvergne-rhone-alpes', code: '84', name: 'Auvergne-Rhône-Alpes', abbr: 'ARA',
    capital: 'Lyon',
    solarBase: 0.65, windBase: 0.50, nuclearBonus: 1.5, industryDemand: 1.3,
    hasPort: false, gasInfra: 0.8, maxSlots: 14,
    color: '#1a2840'
  },
  {
    id: 'occitanie', code: '76', name: 'Occitanie', abbr: 'OCC',
    capital: 'Toulouse',
    solarBase: 0.82, windBase: 0.65, nuclearBonus: 0.6, industryDemand: 0.9,
    hasPort: false, gasInfra: 0.6, maxSlots: 14,
    color: '#1a2030'
  },
  {
    id: 'provence-alpes-cote-dazur', code: '93', name: "Provence-Alpes-Côte d'Azur", abbr: 'PACA',
    capital: 'Marseille',
    solarBase: 0.92, windBase: 0.60, nuclearBonus: 0.7, industryDemand: 1.0,
    hasPort: true, portName: 'Marseille-Fos',
    gasInfra: 0.7, maxSlots: 12,
    color: '#1e2535'
  },
  {
    id: 'corse', code: '94', name: 'Corsica', abbr: 'COR',
    capital: 'Ajaccio',
    solarBase: 0.88, windBase: 0.70, nuclearBonus: 0.0, industryDemand: 0.3,
    hasPort: true, portName: 'Ajaccio/Bastia',
    gasInfra: 0.1, maxSlots: 4,
    color: '#182535'
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
