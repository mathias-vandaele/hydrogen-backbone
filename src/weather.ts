import { createNoise3D } from 'simplex-noise';
import { REGIONS } from './config';
import { getRegionCentroidLL } from './map';
import { state } from './state';
import type { RegionConfig } from './types';

// Simplex-noise fields sampled in (lon, lat, time). Seeded from a fixed
// PRNG so the weather is the same across reloads — reproducible but still
// spatially correlated between neighbouring regions.

/**
 * Linear-congruential PRNG producing uniform [0, 1). Used to seed
 * simplex-noise deterministically per field.
 */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
}

const cloudNoise = createNoise3D(seeded(0x5eed1));
const windMagNoise = createNoise3D(seeded(0xabc12));
const windDirNoise = createNoise3D(seeded(0x7a511));

export interface WeatherSample {
  clouds: number;        // 0..1, cloud cover
  wind: number;          // 0..1+, wind strength normalized to region base
  windDirection: number; // radians, 0 = east, π/2 = south (screen convention)
}

const weatherByRegion = new Map<string, WeatherSample>();

// Lon/lat come in as roughly (-5..10, 41..51). Scale so adjacent regions see
// noticeably different values but neighbors are correlated.
const LON_SCALE = 0.25;
const LAT_SCALE = 0.4;

/**
 * Return the Z-axis we feed into the 3D simplex fields. Mixes day-of-year
 * with time-of-day so clouds drift within a day and weather systems evolve
 * across days without syncing exactly to the sun cycle.
 */
function weatherTime(): number {
  return state.dayOfYear * 0.04 + state.timeOfDay * 0.6;
}

/**
 * Per-tick weather update: sample cloud/wind for each region and compute
 * this tick's solarFactor and windFactor (used downstream by the production
 * code). Cloud cover scales solar linearly (heavy cloud → ~30% solar).
 * Wind output follows a ~v^2.5 power curve up to nominal wind, then
 * saturates — real turbines cap out above their rated wind speed.
 */
export function updateWeather(): void {
  const s = state;
  const doy = s.dayOfYear;
  const t = s.timeOfDay;

  // v5.1 seasonal multipliers: peak 1.0, floor lifted so annual-average
  // solar/wind output for a bonus-1.0 region lands on real French CFs
  // (solar ~18%, wind ~32%) WITHOUT any factor of the formula needing to
  // exceed 1.0 at peak. Every multiplier in the chain is bounded ≤ 1.0,
  // so plant output is bounded by nameplate at the data level — no
  // downstream clipping required.
  const seasonalSolar = 0.6 + 0.4 * Math.max(0, Math.sin((doy - 80) * 2 * Math.PI / 365));
  const seasonalWind = 0.65 + 0.35 * Math.max(0, Math.sin((doy - 350) * 2 * Math.PI / 365 + Math.PI));

  // v5.1 day/night curve: properly zero during the night half of the day.
  // t in [0.25, 0.75] is daylight (dawn to dusk); a half-sine peaks at
  // noon. Outside that window the plant produces nothing. Previous
  // formula `max(0, sin(t×π))` had solar active for all 24 hours and
  // roughly doubled the real CF.
  const solarCurve = t >= 0.25 && t <= 0.75
    ? Math.sin((t - 0.25) / 0.5 * Math.PI)
    : 0;

  const wt = weatherTime();

  for (const rc of REGIONS) {
    const sample = sampleWeather(rc, wt);
    weatherByRegion.set(rc.id, sample);

    const rs = s.regions[rc.id];

    // v5.1 cloud impact: heavy-cloud day drops solar to 60% (1 − 0.4).
    // Reduced from the old 0.7 coefficient so avg cloudMult ≈ 0.8 —
    // the stronger "clouds kill solar" model was over-penalising the
    // fleet-average relative to published CFs (real cloud attenuation
    // is site-dependent; 0.4 is the empirical sweet spot for French
    // annual CFs in this sim).
    const cloudMult = 1 - 0.4 * sample.clouds;
    rs.solarFactor = rc.solarBase * seasonalSolar * solarCurve * cloudMult;

    // v5.1 wind: `sample.wind` is fraction of rated output, capped at 1.0
    // (turbines never exceed their electrical nameplate). `windBase`,
    // `seasonalWind`, and `sample.wind` are all ≤ 1.0, so the product is
    // ≤ 1.0 and the downstream `nameplate × windFactor` formula in
    // buildings.ts automatically respects the installed ceiling — no
    // min() clip needed.
    rs.windFactor = rc.windBase * seasonalWind * Math.min(1.0, sample.wind);
  }
}

/**
 * Read all three noise fields at the region's real centroid. Returns
 * normalized cloud cover (0..1), wind magnitude (0..~1.5, so windy regions
 * can exceed nominal), and wind direction in radians (screen convention).
 */
function sampleWeather(rc: RegionConfig, t: number): WeatherSample {
  // Use the region's real centroid lon/lat for noise indexing so neighbors
  // share correlated weather.
  const ll = getRegionCentroidLL(rc.id);
  const lon = ll ? ll.lon : 3;
  const lat = ll ? ll.lat : 46.5;

  const raw = cloudNoise(lon * LON_SCALE, lat * LAT_SCALE, t);
  const clouds = Math.max(0, Math.min(1, (raw + 1) * 0.5));

  const wraw = windMagNoise(lon * LON_SCALE * 1.3, lat * LAT_SCALE * 1.3, t * 1.1);
  // v5.1 wind amplitude bumped so mean(sample.wind) ≈ 0.42, capped at 1.0.
  // Combined with the [0, 1] regional bonus rescale, a windBase=1.0 region
  // (Bretagne / Normandie / HdF) now averages windFactor ≈ 0.32 → 32% CF,
  // matching RTE published French wind-fleet capacity factors. The cap
  // at 1.0 enforces the physical nameplate ceiling at the noise-field
  // level rather than needing a clip in buildings.ts.
  const wind = Math.max(0, Math.min(1.0, (wraw + 0.5) * 0.85));

  const draw = windDirNoise(lon * LON_SCALE * 0.6, lat * LAT_SCALE * 0.6, t * 0.4);
  const windDirection = (draw + 1) * Math.PI;

  return { clouds, wind, windDirection };
}

/**
 * Read the last-computed weather for a region. Returns zeroes before the
 * first sim tick has run (i.e. on the very first render frame). Safe to
 * call every render frame — just a Map lookup.
 */
export function getWeatherAt(regionId: string): WeatherSample {
  return weatherByRegion.get(regionId) ?? { clouds: 0, wind: 0, windDirection: 0 };
}

/**
 * Simplified sun-elevation model for day/night shading. timeOfDay=0 is
 * midnight, 0.5 is solar noon. Returns a value in [-1, 1] where >0 means
 * illuminated; the sun sweeps east→west across France so eastern regions
 * see dawn and dusk earlier than western ones.
 */
export function getSunElevationAt(lon: number): number {
  // At timeOfDay=0.5, sun is over France's central meridian (≈3°E).
  // sunLon (in degrees) sweeps +180 at midnight → 0 at noon → -180 next midnight.
  const sunLon = 180 - 360 * state.timeOfDay;
  const d = ((lon - 3) - sunLon) * Math.PI / 180;
  return Math.cos(d);
}

/**
 * Meteorological season from day-of-year (1..365). Boundaries match the
 * astronomical equinoxes/solstices rather than calendar-month boundaries.
 */
export function getSeason(doy: number): 'Winter' | 'Spring' | 'Summer' | 'Autumn' {
  if (doy < 80 || doy >= 355) return 'Winter';
  if (doy < 172) return 'Spring';
  if (doy < 264) return 'Summer';
  return 'Autumn';
}

// Seasonal tint anchors (very low alpha will be applied by the renderer).
// Hue progresses around the year; we return a CSS rgb triplet 0..255.
interface RGB { r: number; g: number; b: number; }
const SEASON_ANCHORS: Array<{ doy: number; rgb: RGB }> = [
  { doy: 15,  rgb: { r: 100, g: 140, b: 200 } }, // mid-winter: cool blue
  { doy: 105, rgb: { r: 110, g: 200, b: 140 } }, // mid-spring: fresh green
  { doy: 196, rgb: { r: 240, g: 200, b: 110 } }, // mid-summer: warm amber
  { doy: 288, rgb: { r: 210, g: 130, b:  80 } }  // mid-autumn: rust
];

/**
 * Interpolate between the four seasonal anchor colors for the given day.
 * The renderer paints a canvas-wide overlay at very low alpha (~0.06),
 * giving the map a subtly shifting chromatic mood across the year.
 */
export function getSeasonalTint(doy: number): RGB {
  const anchors = SEASON_ANCHORS;
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    const b = anchors[(i + 1) % anchors.length];
    const aDay = a.doy;
    const bDay = b.doy > a.doy ? b.doy : b.doy + 365;
    const d = doy < a.doy ? doy + 365 : doy;
    if (d >= aDay && d <= bDay) {
      const t = (d - aDay) / (bDay - aDay);
      return {
        r: Math.round(a.rgb.r + (b.rgb.r - a.rgb.r) * t),
        g: Math.round(a.rgb.g + (b.rgb.g - a.rgb.g) * t),
        b: Math.round(a.rgb.b + (b.rgb.b - a.rgb.b) * t)
      };
    }
  }
  return anchors[0].rgb;
}
