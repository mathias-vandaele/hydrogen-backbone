import type {
  BuildingsConfigMap,
  CustomerArchetype,
  CustomerTier,
  CustomerType,
  CustomerTypeConfig,
  Insight,
  RegionConfig
} from './types';

export const TICKS_PER_SEC = 24;
export const TICKS_PER_DAY = 24;
export const MAX_PRESSURE = 100;
export const MIN_PRESSURE = 5;
export const MAP_PADDING = 60;

// ═══════════════════════════════════════════════════════════════════════
// ECONOMIC PARAMETERS — REAL-WORLD SOURCES (v5)
// ═══════════════════════════════════════════════════════════════════════
// This game is a rhetorical artifact demonstrating the arguments of
// "The Missing Protocol Layer" manifesto. Every economic parameter below
// traces to a published source and can be defended against external
// scrutiny by energy researchers, journalists, or policymakers.
//
// Primary sources:
//   - IEA World Energy Outlook 2024
//   - IRENA Renewable Power Generation Costs 2023
//   - RTE Futurs Énergétiques 2050 (French grid projections)
//   - RTE Bilan Électrique annual reports (French capacity factors)
//   - Fraunhofer ISE Levelized Cost of Electricity / Hydrogen studies 2024
//   - EDF/Framatome Nuward SMR cost estimates
//   - Hydrogen Council 2030 cost projections
//   - IEA Hydrogen in Industry reports (for demand scales)
//
// Design note: instantaneous output uses nameplate capacity modified by
// day/night and weather. Annual capacity factors (~15% solar, ~25% wind,
// ~72% nuclear) emerge from the simulation. No hardcoded CF multipliers
// appear in output formulas.
// ═══════════════════════════════════════════════════════════════════════

// CAPEX per bundled plant. Each Hydrogen Plant bundles a generator with
// a matched-capacity electrolyzer stack (1:1). Breakdown:
//   Solar:   100 MW PV @ €800/kW (IRENA 2023)      + 100 MW electrolyzer @ €1.8M/MW
//   Wind:    100 MW onshore @ €1.4M/MW (IEA WEO24) + 100 MW electrolyzer @ €1.8M/MW
//   Nuclear: 300 MW SMR @ €7M/MW (EDF/Nuward est.) + 300 MW electrolyzer @ €1.8M/MW
export const CAPEX = {
  SOLAR_HYDROGEN_PLANT: 260_000_000,    // €260M
  WIND_HYDROGEN_PLANT: 320_000_000,     // €320M
  NUCLEAR_HYDROGEN_PLANT: 2_640_000_000 // €2.64B
};

// Nameplate generator capacity (peak MW under ideal conditions).
// Instantaneous output varies tick-by-tick with day/night, clouds, wind,
// and planned nuclear outages. Annual CFs emerge from integration.
export const NAMEPLATE_MW = {
  SOLAR_HYDROGEN_PLANT: 100,
  WIND_HYDROGEN_PLANT: 100,
  NUCLEAR_HYDROGEN_PLANT: 300  // reactor side; electrolyzer matches
};

// Annual OPEX as fraction of CAPEX. Each tick subtracts CAPEX × fraction ÷ 365.
// Sources: IEA WEO 2024 / IRENA LCOE decomposition 2023 / RTE reference costs.
export const OPEX_ANNUAL_FRACTION = {
  SOLAR_PLANT: 0.020,   // 2.0%/yr of CAPEX
  WIND_PLANT: 0.030,    // 3.0%/yr of CAPEX
  NUCLEAR_PLANT: 0.025, // 2.5%/yr of CAPEX
  PIPELINE: 0.020        // 2%/yr of CAPEX
};

// Alkaline electrolyzer, LHV basis. PEM sits at 60-68%; SOEC approaches
// 80% but is not yet mass-deployed. 70% is a defensible 2024 benchmark.
// Source: Fraunhofer ISE hydrogen cost studies.
export const ELECTROLYZER_EFFICIENCY = 0.70;

// 33.3 kWh/kg (LHV of H₂) / 0.70 = 47.6 kWh/kg → rounded to 50.
// Formula: h2_kg_per_day = MW × 24 × 1000 × ELECTROLYZER_EFFICIENCY / KWH_PER_KG_H2
export const KWH_PER_KG_H2 = 50;

// Nuclear availability schedule. 75-day refuelling outage per 270-day
// cycle ≈ 27.8% outage ≈ 72.2% availability — matching the published
// RTE French reactor-fleet CF of ~0.72. Plants are staggered by id so
// outages are distributed across the fleet rather than simultaneous.
export const NUCLEAR_OUTAGE_DAYS = 75;
export const NUCLEAR_CYCLE_DAYS = 270;
export const NUCLEAR_FLEET_PHASE_OFFSET = 40; // days between successive plants

// ─── v4 Economy + v5 real-world CAPEX ────────────────────────────────────
// STARTING_BUDGET raised to €400M so the player can afford exactly one
// Solar Hydrogen Plant (€260M) plus a short pipeline plus an opex buffer
// for the first few weeks — the exact design-intent described in the v5
// brief. Scarcity pressure remains: the second plant is not affordable
// until early customer revenue flows.
export const ECONOMY = {
  STARTING_BUDGET: 400_000_000,
  BANKRUPTCY_THRESHOLD: -50_000_000,     // -€50M
  BANKRUPTCY_GRACE_DAYS: 90
};

// Legacy alias — `state.ts` still imports this name; point at the new knob.
export const START_MONEY = ECONOMY.STARTING_BUDGET;

// ─── Economy tuning ───────────────────────────────────────────────────────
export const PRESSURE_PRICE_MIN = 2.0;
export const PRESSURE_PRICE_MAX = 8.0;
export const PRESSURE_PRICE_CURVE = 8.0;
export const PRICE_RESPONSE_SPEED = 0.2;
export const DEMAND_PRICE_RESPONSE = 3.5;
export const DEMAND_PRICE_MIN = 0.35;
export const DEMAND_PRICE_MAX = 1.75;
export const CUSTOMER_SUPPLY_BUFFER_MULTIPLIER = 1.2;
export const EMERGENCE_LOGISTIC_STEEPNESS = 12;
export const EMERGENCE_LOGISTIC_CENTER = 0.7;
export const SMALL_TIER_CAP = 24;
export const MID_TIER_CAP = 12;
export const BIG_TIER_CAP = 6;

// v5: bundled plant CAPEX and nameplate from real 2024 benchmarks
// (see CAPEX/NAMEPLATE_MW constants + source block above). `baseOutput`
// is nameplate MW; real capacity factors emerge from day/night + weather
// + nuclear outage scheduling in buildings.ts.
export const BUILDINGS: BuildingsConfigMap = {
  solarPlant: {
    name: 'Solar Hydrogen Plant',
    icon: '☀️',
    kind: 'solar',
    capacity: NAMEPLATE_MW.SOLAR_HYDROGEN_PLANT,
    baseCost: CAPEX.SOLAR_HYDROGEN_PLANT,
    baseOutput: NAMEPLATE_MW.SOLAR_HYDROGEN_PLANT, // nameplate MW
    electrolyzerEfficiency: ELECTROLYZER_EFFICIENCY,
    kwhPerKg: KWH_PER_KG_H2,
    quote: '"Solar electricity in southern Europe costs 20 €/MWh today. Co-locate electrolysis; only molecules leave."'
  },
  windPlant: {
    name: 'Wind Hydrogen Plant',
    icon: '💨',
    kind: 'wind',
    capacity: NAMEPLATE_MW.WIND_HYDROGEN_PLANT,
    baseCost: CAPEX.WIND_HYDROGEN_PLANT,
    baseOutput: NAMEPLATE_MW.WIND_HYDROGEN_PLANT,
    electrolyzerEfficiency: ELECTROLYZER_EFFICIENCY,
    kwhPerKg: KWH_PER_KG_H2,
    quote: '"Every MWh of excess wind converts to hydrogen on the spot. There is no such thing as excess."'
  },
  nuclearPlant: {
    name: 'Nuclear Hydrogen Plant',
    icon: '⚛️',
    kind: 'nuclear',
    capacity: NAMEPLATE_MW.NUCLEAR_HYDROGEN_PLANT,
    baseCost: CAPEX.NUCLEAR_HYDROGEN_PLANT,
    baseOutput: NAMEPLATE_MW.NUCLEAR_HYDROGEN_PLANT,
    electrolyzerEfficiency: ELECTROLYZER_EFFICIENCY,
    kwhPerKg: KWH_PER_KG_H2,
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

const TIER_LAG_DAYS: Record<CustomerTier, { min: number; max: number; ramp: number }> = {
  small: { min: 15, max: 25, ramp: 10 },
  mid: { min: 45, max: 60, ramp: 15 },
  big: { min: 90, max: 120, ramp: 20 }
};

function makeCustomerTier(
  archetype: CustomerArchetype,
  tier: CustomerTier,
  label: string,
  icon: string,
  color: string,
  slotKind: CustomerTypeConfig['slotKind'],
  demandMin: number,
  demandMax: number,
  priceThreshold: number,
  quote: string,
  options: { minPipeConnections?: number; requiresPort?: boolean; pressureRelief?: boolean } = {}
): CustomerTypeConfig {
  const lag = TIER_LAG_DAYS[tier];
  return {
    archetype,
    tier,
    name: `${label} (${tier})`,
    icon,
    color,
    priceThreshold,
    demandMin,
    demandMax,
    expectedDemand: (demandMin + demandMax) / 2,
    minPipeConnections: options.minPipeConnections ?? 1,
    pressureRelief: options.pressureRelief,
    requiresPort: options.requiresPort,
    slotKind,
    investmentLagMinDays: lag.min,
    investmentLagMaxDays: lag.max,
    rampDurationDays: lag.ramp,
    quote
  };
}

export const CUSTOMER_TYPES: Record<CustomerType, CustomerTypeConfig> = {
  steel_small: makeCustomerTier('steel', 'small', 'Steel Fabricator', '🏭', '#ef4444', 'industrial', 8_000, 25_000, 6.5, '"A small steelworks can switch long before a flagship DRI complex does."'),
  steel_mid: makeCustomerTier('steel', 'mid', 'Steel Mill', '🏭', '#ef4444', 'industrial', 25_000, 80_000, 5.8, '"Mid-scale steel plants move when hydrogen is credible at industrial volume."'),
  steel_big: makeCustomerTier('steel', 'big', 'Steel DRI Plant', '🏭', '#ef4444', 'industrial', 80_000, 250_000, 5.0, '"A single DRI plant consumes roughly 70,000 tonnes of H₂ per year. Connect it to the pipe."'),

  ammonia_small: makeCustomerTier('ammonia', 'small', 'Fertilizer Blending Plant', '🧪', '#8b5cf6', 'industrial', 5_000, 15_000, 6.0, '"Smaller ammonia users pay for reliability before mega-plants do."'),
  ammonia_mid: makeCustomerTier('ammonia', 'mid', 'Ammonia Plant', '🧪', '#8b5cf6', 'industrial', 15_000, 50_000, 5.4, '"Mid-scale Haber-Bosch capacity follows once hydrogen is consistently available."'),
  ammonia_big: makeCustomerTier('ammonia', 'big', 'Ammonia Factory', '🧪', '#8b5cf6', 'industrial', 50_000, 180_000, 4.8, '"The Haber-Bosch process consumes 1.8% of global energy, almost all from grey hydrogen."'),

  efuel_small: makeCustomerTier('efuel', 'small', 'Synthetic Fuel Pilot', '⛽', '#f59e0b', 'efuel', 3_000, 30_000, 5.5, '"Small e-fuel pilots prove the process before refinery-scale capital arrives."', { pressureRelief: true }),
  efuel_mid: makeCustomerTier('efuel', 'mid', 'E-Fuel Plant', '⛽', '#f59e0b', 'efuel', 30_000, 100_000, 4.9, '"A regional e-fuel plant soaks up surplus only when the pipe can really feed it."', { pressureRelief: true }),
  efuel_big: makeCustomerTier('efuel', 'big', 'E-Fuel Refinery', '⛽', '#f59e0b', 'efuel', 100_000, 350_000, 4.3, '"E-fuel refineries only pencil out when hydrogen is abundant enough to look structural."', { pressureRelief: true }),

  chemical_small: makeCustomerTier('chemical', 'small', 'Specialty Chemical Works', '⚗️', '#3b82f6', 'industrial', 2_000, 12_000, 5.0, '"Specialty chemicals are often the first industrial molecules to switch."'),
  chemical_mid: makeCustomerTier('chemical', 'mid', 'Chemical Plant', '⚗️', '#3b82f6', 'industrial', 12_000, 40_000, 4.5, '"Chemical demand scales in layers, not all at once."'),
  chemical_big: makeCustomerTier('chemical', 'big', 'Integrated Chemical Complex', '⚗️', '#3b82f6', 'industrial', 40_000, 120_000, 4.0, '"The entire petrochemical value chain has hydrogen-fed alternatives."'),

  fuelcell_small: makeCustomerTier('fuelcell', 'small', 'Fuel Cell Depot', '🔋', '#06d6a0', 'distributed', 500, 3_000, 4.5, '"Small fuel-cell loads appear where the network already feels dependable."'),
  fuelcell_mid: makeCustomerTier('fuelcell', 'mid', 'Fuel Cell Station', '🔋', '#06d6a0', 'distributed', 3_000, 15_000, 4.0, '"Municipal fuel-cell projects arrive once hydrogen supply looks routine."'),
  fuelcell_big: makeCustomerTier('fuelcell', 'big', 'Dispatchable Fuel Cell Hub', '🔋', '#06d6a0', 'distributed', 15_000, 50_000, 3.5, '"A municipality installs a fuel cell. It now has a dispatchable local power plant with no emissions."'),

  export_small: makeCustomerTier('export', 'small', 'Coastal Bunkering Node', '🚢', '#06b6d4', 'port', 15_000, 60_000, 4.0, '"Portside hydrogen starts with bunkering and early offtake, not mega-terminals."', { minPipeConnections: 2, requiresPort: true }),
  export_mid: makeCustomerTier('export', 'mid', 'Export Hub', '🚢', '#06b6d4', 'port', 60_000, 200_000, 3.5, '"Regional export hubs move only after domestic supply looks comfortably overbuilt."', { minPipeConnections: 2, requiresPort: true }),
  export_big: makeCustomerTier('export', 'big', 'Export Terminal', '🚢', '#06b6d4', 'port', 200_000, 600_000, 3.0, '"France\'s port infrastructure is positioned for e-fuel export to global shipping and aviation markets."', { minPipeConnections: 2, requiresPort: true })
};

// Slot distribution roughly tracks industryDemand, population, port status,
// and suitability for e-fuel refining. Total across all 13 regions ≈ 27
// (industrial 11, distributed 9, port 4, efuel 6) so later-game demand
// only appears after the player has lit a recognisable portion of the map.
export const REGIONS: RegionConfig[] = [
  // v5.1 Physical invariant: solarBase and windBase are bounded [0, 1].
  // A plant can never produce more than its installed nameplate capacity —
  // the bonus is the "fraction of ideal conditions" a region's resource
  // supports, not a multiplier above unity. Peak output is nameplate ×
  // 1.0 bonus × 1.0 seasonal × 1.0 curve × 1.0 weather = nameplate.
  // Southern regions (Occitanie, PACA) and coastal wind regions
  // (Bretagne, Normandie, HdF) reach 1.0 — their resource lets them hit
  // nameplate on a perfect day. Interior / northern regions score lower:
  // even on their clearest days, latitude or typical haze prevents full
  // nameplate output. Annual CF emerges from the simulation, not a
  // hardcoded multiplier.
  {
    id: 'hauts-de-france', code: '32', name: 'Hauts-de-France', abbr: 'HdF',
    capital: 'Lille',
    solarBase: 0.60, windBase: 1.00, nuclearBonus: 1.3, industryDemand: 1.4,
    hasPort: true, portName: 'Dunkirk/Calais',
    gasInfra: 0.8, maxSlots: 12,
    color: '#1a2535',
    industrialSlots: 2, distributedSlots: 1, portSlots: 1, efuelSlots: 1
  },
  {
    id: 'grand-est', code: '44', name: 'Grand Est', abbr: 'GE',
    capital: 'Strasbourg',
    solarBase: 0.70, windBase: 0.90, nuclearBonus: 1.4, industryDemand: 1.2,
    hasPort: false, gasInfra: 0.7, maxSlots: 14,
    color: '#1a2840',
    industrialSlots: 2, distributedSlots: 1, portSlots: 0, efuelSlots: 1
  },
  {
    id: 'normandie', code: '28', name: 'Normandy', abbr: 'NOR',
    capital: 'Rouen',
    solarBase: 0.60, windBase: 1.00, nuclearBonus: 1.2, industryDemand: 0.9,
    hasPort: true, portName: 'Le Havre/Rouen',
    gasInfra: 0.6, maxSlots: 10,
    color: '#152535',
    industrialSlots: 1, distributedSlots: 1, portSlots: 1, efuelSlots: 1
  },
  {
    id: 'bretagne', code: '53', name: 'Brittany', abbr: 'BRE',
    capital: 'Rennes',
    solarBase: 0.60, windBase: 1.00, nuclearBonus: 0.0, industryDemand: 0.6,
    hasPort: true, portName: 'Brest',
    gasInfra: 0.4, maxSlots: 8,
    color: '#12253a',
    industrialSlots: 0, distributedSlots: 1, portSlots: 0, efuelSlots: 0
  },
  {
    id: 'ile-de-france', code: '11', name: 'Île-de-France', abbr: 'IdF',
    capital: 'Paris',
    solarBase: 0.70, windBase: 0.60, nuclearBonus: 0.3, industryDemand: 1.5,
    hasPort: false, gasInfra: 0.9, maxSlots: 8,
    color: '#1e2845',
    industrialSlots: 1, distributedSlots: 2, portSlots: 0, efuelSlots: 0
  },
  {
    id: 'centre-val-de-loire', code: '24', name: 'Centre-Val de Loire', abbr: 'CVL',
    capital: 'Orléans',
    solarBase: 0.80, windBase: 0.70, nuclearBonus: 1.3, industryDemand: 0.7,
    hasPort: false, gasInfra: 0.5, maxSlots: 12,
    color: '#162535',
    industrialSlots: 1, distributedSlots: 1, portSlots: 0, efuelSlots: 1
  },
  {
    id: 'pays-de-la-loire', code: '52', name: 'Pays de la Loire', abbr: 'PdL',
    capital: 'Nantes',
    solarBase: 0.75, windBase: 0.90, nuclearBonus: 0.5, industryDemand: 0.7,
    hasPort: true, portName: 'Nantes-Saint-Nazaire',
    gasInfra: 0.5, maxSlots: 10,
    color: '#142530',
    industrialSlots: 1, distributedSlots: 1, portSlots: 1, efuelSlots: 0
  },
  {
    id: 'bourgogne-franche-comte', code: '27', name: 'Bourgogne-Franche-Comté', abbr: 'BFC',
    capital: 'Dijon',
    solarBase: 0.75, windBase: 0.70, nuclearBonus: 0.8, industryDemand: 0.8,
    hasPort: false, gasInfra: 0.6, maxSlots: 12,
    color: '#182840',
    industrialSlots: 1, distributedSlots: 0, portSlots: 0, efuelSlots: 0
  },
  {
    id: 'nouvelle-aquitaine', code: '75', name: 'Nouvelle-Aquitaine', abbr: 'NAQ',
    capital: 'Bordeaux',
    solarBase: 0.90, windBase: 0.75, nuclearBonus: 0.8, industryDemand: 0.8,
    hasPort: true, portName: 'Bordeaux/La Rochelle',
    gasInfra: 0.7, maxSlots: 16,
    color: '#152030',
    industrialSlots: 1, distributedSlots: 1, portSlots: 1, efuelSlots: 1
  },
  {
    id: 'auvergne-rhone-alpes', code: '84', name: 'Auvergne-Rhône-Alpes', abbr: 'ARA',
    capital: 'Lyon',
    solarBase: 0.80, windBase: 0.60, nuclearBonus: 1.5, industryDemand: 1.3,
    hasPort: false, gasInfra: 0.8, maxSlots: 14,
    color: '#1a2840',
    industrialSlots: 1, distributedSlots: 1, portSlots: 0, efuelSlots: 1
  },
  {
    id: 'occitanie', code: '76', name: 'Occitanie', abbr: 'OCC',
    capital: 'Toulouse',
    solarBase: 1.00, windBase: 0.75, nuclearBonus: 0.6, industryDemand: 0.9,
    hasPort: false, gasInfra: 0.6, maxSlots: 14,
    color: '#1a2030',
    industrialSlots: 1, distributedSlots: 1, portSlots: 0, efuelSlots: 1
  },
  {
    id: 'provence-alpes-cote-dazur', code: '93', name: "Provence-Alpes-Côte d'Azur", abbr: 'PACA',
    capital: 'Marseille',
    solarBase: 1.00, windBase: 0.60, nuclearBonus: 0.7, industryDemand: 1.0,
    hasPort: true, portName: 'Marseille-Fos',
    gasInfra: 0.7, maxSlots: 12,
    color: '#1e2535',
    industrialSlots: 0, distributedSlots: 1, portSlots: 1, efuelSlots: 1
  },
  {
    id: 'corse', code: '94', name: 'Corsica', abbr: 'COR',
    capital: 'Ajaccio',
    solarBase: 1.00, windBase: 0.85, nuclearBonus: 0.0, industryDemand: 0.3,
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
  { title: 'The Protocol Layer', text: 'A hydrogen pipeline network is TCP/IP for energy. The pipe does not care who injects hydrogen or who withdraws it. Pressure is the only signal, and pressure is self-regulating.' },
  { title: 'The Flywheel', text: 'Cheap solar → cheap hydrogen → guaranteed demand for renewable electricity → more solar built → cheaper solar → cheaper hydrogen. Cost declines compound as the network scales.' },
  { title: 'Permissionless Production', text: 'Anyone with an electrolyzer and a grid connection can produce hydrogen and inject it. No dispatch coordination. No frequency regulation. Connect, inject, meter, settle.' },
  { title: 'Automatic Storage', text: 'The pipeline itself stores energy through line-packing. One thousand kilometers of pipeline stores approximately 110 GWh — enough to buffer daily demand fluctuations.' },
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
