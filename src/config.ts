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

export const BOUNDS = { minLat: 41.3, maxLat: 51.1, minLon: -5.2, maxLon: 9.6 };

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
    id: 'hauts-de-france', name: 'Hauts-de-France', abbr: 'HdF',
    capital: 'Lille', capitalCoord: [50.63, 3.06],
    solarBase: 0.55, windBase: 0.85, nuclearBonus: 1.3, industryDemand: 1.4,
    hasPort: true, portName: 'Dunkirk/Calais',
    gasInfra: 0.8, maxSlots: 12,
    color: '#1a2535',
    polygon: [[51.08,1.56],[50.96,1.56],[50.95,1.85],[51.05,2.55],[50.81,3.15],[50.48,3.60],[50.10,4.05],[49.85,4.02],[49.50,3.60],[49.18,3.40],[49.18,2.80],[49.18,2.15],[49.45,1.72],[49.95,1.38],[50.35,1.56]]
  },
  {
    id: 'grand-est', name: 'Grand Est', abbr: 'GE',
    capital: 'Strasbourg', capitalCoord: [48.57, 7.75],
    solarBase: 0.55, windBase: 0.70, nuclearBonus: 1.4, industryDemand: 1.2,
    hasPort: false, gasInfra: 0.7, maxSlots: 14,
    color: '#1a2840',
    polygon: [[50.10,4.05],[49.50,5.90],[49.10,6.40],[49.05,7.60],[48.97,8.22],[48.30,7.60],[47.58,7.55],[47.42,7.02],[47.15,6.68],[46.92,6.02],[47.05,5.30],[47.25,4.65],[47.68,4.22],[48.10,3.72],[48.62,3.40],[49.18,3.40],[49.50,3.60],[49.85,4.02]]
  },
  {
    id: 'normandie', name: 'Normandy', abbr: 'NOR',
    capital: 'Rouen', capitalCoord: [49.44, 1.10],
    solarBase: 0.50, windBase: 0.80, nuclearBonus: 1.2, industryDemand: 0.9,
    hasPort: true, portName: 'Le Havre/Rouen',
    gasInfra: 0.6, maxSlots: 10,
    color: '#152535',
    polygon: [[49.95,1.38],[49.45,1.72],[49.18,2.15],[49.18,2.80],[48.95,2.72],[48.62,2.30],[48.45,1.80],[48.20,1.32],[48.20,0.42],[48.45,-0.15],[48.50,-0.78],[48.62,-1.18],[48.90,-1.18],[49.30,-0.30],[49.70,0.20]]
  },
  {
    id: 'bretagne', name: 'Brittany', abbr: 'BRE',
    capital: 'Rennes', capitalCoord: [48.11, -1.68],
    solarBase: 0.50, windBase: 0.90, nuclearBonus: 0.0, industryDemand: 0.6,
    hasPort: true, portName: 'Brest',
    gasInfra: 0.4, maxSlots: 8,
    color: '#12253a',
    polygon: [[48.90,-1.18],[48.62,-1.18],[48.50,-1.65],[48.60,-2.80],[48.45,-3.60],[48.38,-4.72],[47.80,-4.30],[47.50,-3.15],[47.28,-2.50],[47.30,-1.95],[47.60,-1.35],[47.75,-1.18],[48.05,-1.18]]
  },
  {
    id: 'ile-de-france', name: 'Île-de-France', abbr: 'IdF',
    capital: 'Paris', capitalCoord: [48.86, 2.35],
    solarBase: 0.55, windBase: 0.50, nuclearBonus: 0.3, industryDemand: 1.5,
    hasPort: false, gasInfra: 0.9, maxSlots: 8,
    color: '#1e2845',
    polygon: [[49.18,2.15],[49.18,2.80],[49.18,3.40],[48.90,3.40],[48.62,3.40],[48.38,3.10],[48.30,2.65],[48.30,2.00],[48.45,1.80],[48.62,2.30],[48.95,2.72]]
  },
  {
    id: 'centre-val-de-loire', name: 'Centre-Val de Loire', abbr: 'CVL',
    capital: 'Orléans', capitalCoord: [47.90, 1.91],
    solarBase: 0.60, windBase: 0.55, nuclearBonus: 1.3, industryDemand: 0.7,
    hasPort: false, gasInfra: 0.5, maxSlots: 12,
    color: '#162535',
    polygon: [[48.45,1.80],[48.30,2.00],[48.30,2.65],[48.38,3.10],[48.62,3.40],[48.10,3.72],[47.68,4.22],[47.25,3.60],[47.05,2.90],[46.75,2.60],[46.60,2.20],[46.65,1.60],[46.78,1.10],[47.05,0.68],[47.45,0.20],[47.85,0.00],[48.20,0.42],[48.20,1.32]]
  },
  {
    id: 'pays-de-la-loire', name: 'Pays de la Loire', abbr: 'PdL',
    capital: 'Nantes', capitalCoord: [47.22, -1.55],
    solarBase: 0.58, windBase: 0.75, nuclearBonus: 0.5, industryDemand: 0.7,
    hasPort: true, portName: 'Nantes-Saint-Nazaire',
    gasInfra: 0.5, maxSlots: 10,
    color: '#142530',
    polygon: [[48.05,-1.18],[47.75,-1.18],[47.60,-1.35],[47.30,-1.95],[47.28,-2.50],[47.10,-2.25],[46.90,-1.85],[46.68,-1.85],[46.35,-1.20],[46.35,-0.52],[46.58,0.05],[47.05,0.20],[47.05,0.68],[47.45,0.20],[47.85,0.00],[48.20,0.42]]
  },
  {
    id: 'bourgogne-franche-comte', name: 'Bourgogne-Franche-Comté', abbr: 'BFC',
    capital: 'Dijon', capitalCoord: [47.32, 5.04],
    solarBase: 0.58, windBase: 0.55, nuclearBonus: 0.8, industryDemand: 0.8,
    hasPort: false, gasInfra: 0.6, maxSlots: 12,
    color: '#182840',
    polygon: [[48.62,3.40],[48.10,3.72],[47.68,4.22],[47.25,4.65],[47.05,5.30],[46.92,6.02],[46.60,5.80],[46.30,5.60],[46.10,5.10],[46.18,4.55],[46.15,3.85],[46.30,3.25],[46.75,2.60],[47.25,2.95],[47.65,3.35]]
  },
  {
    id: 'nouvelle-aquitaine', name: 'Nouvelle-Aquitaine', abbr: 'NAQ',
    capital: 'Bordeaux', capitalCoord: [44.84, -0.58],
    solarBase: 0.68, windBase: 0.55, nuclearBonus: 0.8, industryDemand: 0.8,
    hasPort: true, portName: 'Bordeaux/La Rochelle',
    gasInfra: 0.7, maxSlots: 16,
    color: '#152030',
    polygon: [[47.05,0.68],[46.78,1.10],[46.65,1.60],[46.60,2.20],[46.75,2.60],[46.30,3.25],[46.15,3.85],[46.18,4.55],[45.80,4.22],[45.45,3.60],[45.05,3.20],[44.85,2.80],[44.62,2.60],[44.20,2.15],[43.92,1.80],[43.55,1.48],[43.30,1.30],[43.10,0.72],[43.30,0.35],[43.30,-0.10],[43.50,-1.10],[43.48,-1.52],[44.00,-1.25],[44.42,-1.22],[44.72,-1.10],[45.25,-1.20],[46.18,-1.22],[46.35,-1.20],[46.35,-0.52],[46.58,0.05],[47.05,0.20]]
  },
  {
    id: 'auvergne-rhone-alpes', name: 'Auvergne-Rhône-Alpes', abbr: 'ARA',
    capital: 'Lyon', capitalCoord: [45.76, 4.83],
    solarBase: 0.65, windBase: 0.50, nuclearBonus: 1.5, industryDemand: 1.3,
    hasPort: false, gasInfra: 0.8, maxSlots: 14,
    color: '#1a2840',
    polygon: [[46.18,4.55],[46.10,5.10],[46.30,5.60],[46.60,5.80],[46.92,6.02],[46.45,6.45],[46.10,6.82],[45.80,7.12],[45.45,6.85],[45.18,6.62],[44.85,6.50],[44.65,6.25],[44.42,5.82],[44.38,5.42],[44.20,5.05],[44.12,4.62],[44.12,4.22],[44.20,3.80],[44.50,3.10],[44.85,2.80],[45.05,3.20],[45.45,3.60],[45.80,4.22]]
  },
  {
    id: 'occitanie', name: 'Occitanie', abbr: 'OCC',
    capital: 'Toulouse', capitalCoord: [43.60, 1.44],
    solarBase: 0.82, windBase: 0.65, nuclearBonus: 0.6, industryDemand: 0.9,
    hasPort: false, gasInfra: 0.6, maxSlots: 14,
    color: '#1a2030',
    polygon: [[44.85,2.80],[44.62,2.60],[44.20,2.15],[43.92,1.80],[43.55,1.48],[43.30,1.30],[43.10,0.72],[42.80,1.15],[42.45,1.50],[42.42,1.95],[42.60,2.45],[42.55,3.05],[43.08,3.05],[43.25,3.52],[43.38,3.88],[43.62,4.22],[44.12,4.22],[44.50,3.10]]
  },
  {
    id: 'provence-alpes-cote-dazur', name: "Provence-Alpes-Côte d'Azur", abbr: 'PACA',
    capital: 'Marseille', capitalCoord: [43.30, 5.37],
    solarBase: 0.92, windBase: 0.60, nuclearBonus: 0.7, industryDemand: 1.0,
    hasPort: true, portName: 'Marseille-Fos',
    gasInfra: 0.7, maxSlots: 12,
    color: '#1e2535',
    polygon: [[44.65,6.25],[44.85,6.50],[45.18,6.62],[45.45,6.85],[45.80,7.12],[45.85,7.50],[44.80,7.50],[44.12,7.38],[43.78,7.50],[43.50,6.95],[43.18,6.15],[43.12,5.55],[43.25,5.10],[43.25,4.55],[43.25,3.88],[43.38,3.88],[43.62,4.22],[44.12,4.22],[44.12,4.62],[44.20,5.05],[44.38,5.42],[44.42,5.82]]
  },
  {
    id: 'corse', name: 'Corsica', abbr: 'COR',
    capital: 'Ajaccio', capitalCoord: [41.93, 8.74],
    solarBase: 0.88, windBase: 0.70, nuclearBonus: 0.0, industryDemand: 0.3,
    hasPort: true, portName: 'Ajaccio/Bastia',
    gasInfra: 0.1, maxSlots: 4,
    color: '#182535',
    polygon: [[43.01,9.40],[42.95,9.55],[42.58,9.48],[42.20,9.20],[41.92,9.28],[41.38,9.22],[41.42,8.58],[41.72,8.62],[42.02,8.55],[42.40,8.60],[42.58,8.72],[42.80,8.85],[43.01,9.18]]
  }
];

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

export function getRegionConfig(id: string): RegionConfig | undefined {
  return REGIONS_BY_ID.get(id);
}
