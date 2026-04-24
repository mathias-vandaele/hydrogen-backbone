// Science investment system — the in-game representation of Wright's Law.
// The player spends money to reduce CAPEX and (for electrolyzer) raise
// efficiency, across four tracks: solar, wind, nuclear, electrolyzer. Each track
// has 5 tiers with doubling cost: 10% CAPEX reduction per tier up to 50%.
// Electrolyzer adds +5% efficiency per tier on top, to a 95% ceiling.
//
// Every tier purchased also contracts the pressure-driven price band by
// 1/20 of its total delta, so the spot-price envelope compresses visibly
// as research advances.
//
// Design invariants:
//  - Available from turn 1; no tech-tree gating.
//  - Retroactive OPEX (OPEX = annual fraction × current CAPEX), but not
//    retroactive CAPEX — prior spend is not refunded.
//  - Pure functions of GameState; deterministic; save/load-safe.

import {
  CAPEX,
  ELECTROLYZER_EFFICIENCY,
  PRESSURE_PRICE_MAX,
  PRESSURE_PRICE_MIN
} from './config';
import type { GameState, PlaceableBuildingType, ResearchTrackName } from './types';

/** Doubling cost ladder for Solar research: €100M → €1.6B. Total €3.1B. */
export const SOLAR_RESEARCH_COSTS: readonly number[] = [
  100_000_000,
  200_000_000,
  400_000_000,
  800_000_000,
  1_600_000_000
];

/** Same shape as solar — wind learning curve mirrors PV. */
export const WIND_RESEARCH_COSTS: readonly number[] = SOLAR_RESEARCH_COSTS;

/**
 * Nuclear modularization / construction learning curve. Intentionally more
 * expensive than the renewable tracks because reactor programs are capital-
 * intensive and slower to industrialize. Total €9.92B.
 */
export const NUCLEAR_RESEARCH_COSTS: readonly number[] = [
  320_000_000,
  640_000_000,
  1_280_000_000,
  2_560_000_000,
  5_120_000_000
];

/**
 * Electrolyzer costs are higher per tier because the purchase couples two
 * improvements: CAPEX reduction AND efficiency gain. Total €4.96B.
 */
export const ELECTROLYZER_RESEARCH_COSTS: readonly number[] = [
  160_000_000,
  320_000_000,
  640_000_000,
  1_280_000_000,
  2_560_000_000
];

export const MAX_RESEARCH_TIER = 5;
export const CAPEX_REDUCTION_PER_TIER = 0.10;
export const BASE_ELECTROLYZER_EFFICIENCY = 0.70;
export const EFFICIENCY_GAIN_PER_TIER = 0.05;
export const MAX_ELECTROLYZER_EFFICIENCY =
  BASE_ELECTROLYZER_EFFICIENCY + EFFICIENCY_GAIN_PER_TIER * MAX_RESEARCH_TIER;

/**
 * Pressure-price band target once every track is maxed. The band
 * contracts linearly from `PRESSURE_PRICE_MIN`/`PRESSURE_PRICE_MAX`
 * (see `config.ts`) toward these values as tiers are purchased.
 */
export const PRICE_BAND_MIN_TARGET = 1.0;
export const PRICE_BAND_MAX_TARGET = 4.0;
export const TOTAL_PRICE_BAND_TIERS = 4 * MAX_RESEARCH_TIER; // 20

export function getResearchCosts(track: ResearchTrackName): readonly number[] {
  switch (track) {
    case 'solar':        return SOLAR_RESEARCH_COSTS;
    case 'wind':         return WIND_RESEARCH_COSTS;
    case 'nuclear':      return NUCLEAR_RESEARCH_COSTS;
    case 'electrolyzer': return ELECTROLYZER_RESEARCH_COSTS;
  }
}

/** The cost of the next tier on `track`, or null if already maxed. */
export function getNextTierCost(s: GameState, track: ResearchTrackName): number | null {
  const tier = s.research[track].tier;
  if (tier >= MAX_RESEARCH_TIER) return null;
  return getResearchCosts(track)[tier];
}

/** CAPEX multiplier (1.0 baseline → 0.5 at tier 5) for `track`. */
export function getCapexMultiplier(s: GameState, track: ResearchTrackName): number {
  return Math.max(
    0,
    1 - CAPEX_REDUCTION_PER_TIER * Math.min(MAX_RESEARCH_TIER, s.research[track].tier)
  );
}

export function getSolarCapexMultiplier(s: GameState): number        { return getCapexMultiplier(s, 'solar'); }
export function getWindCapexMultiplier(s: GameState): number         { return getCapexMultiplier(s, 'wind'); }
export function getNuclearCapexMultiplier(s: GameState): number      { return getCapexMultiplier(s, 'nuclear'); }
export function getElectrolyzerCapexMultiplier(s: GameState): number { return getCapexMultiplier(s, 'electrolyzer'); }

/** Current electrolyzer efficiency (0.70 baseline → 0.95 at tier 5). */
export function getElectrolyzerEfficiency(s: GameState): number {
  const tier = Math.min(MAX_RESEARCH_TIER, s.research.electrolyzer.tier);
  return BASE_ELECTROLYZER_EFFICIENCY + EFFICIENCY_GAIN_PER_TIER * tier;
}

export function getTotalResearchTiers(s: GameState): number {
  return s.research.solar.tier + s.research.wind.tier + s.research.nuclear.tier + s.research.electrolyzer.tier;
}

/**
 * The research-adjusted CAPEX of building `type` today. Used both as the
 * upfront cost when placing a new plant AND as the "would-cost-now" basis
 * for retroactive OPEX on existing plants (see buildings.ts).
 *
 * Nuclear research reduces the reactor-side CAPEX; electrolyzer research
 * still reduces only the electrolyzer portion. Together they can halve the
 * full nuclear plant cost at max tier.
 */
export function getCurrentPlantCapex(s: GameState, type: PlaceableBuildingType): number {
  const elecMult = getElectrolyzerCapexMultiplier(s);
  switch (type) {
    case 'solarPlant':
      return CAPEX.SOLAR_GENERATOR * getSolarCapexMultiplier(s)
           + CAPEX.SOLAR_ELECTROLYZER * elecMult;
    case 'windPlant':
      return CAPEX.WIND_GENERATOR * getWindCapexMultiplier(s)
           + CAPEX.WIND_ELECTROLYZER * elecMult;
    case 'nuclearPlant':
      return CAPEX.NUCLEAR_REACTOR * getNuclearCapexMultiplier(s)
           + CAPEX.NUCLEAR_ELECTROLYZER * elecMult;
    case 'saltCavern':
      // Caverns are civil/geological — not Wright's-Law-driven.
      return 360_000_000;
  }
}

/**
 * The pressure-driven spot-price envelope, contracted by total tiers
 * purchased. At 0 tiers: equal to config's `PRESSURE_PRICE_MIN` /
 * `PRESSURE_PRICE_MAX`. At 20 tiers: equal to
 * `PRICE_BAND_MIN_TARGET` / `PRICE_BAND_MAX_TARGET` (1.0 / 4.0).
 */
export function getCurrentPriceBand(s: GameState): { min: number; max: number } {
  const tiers = Math.min(TOTAL_PRICE_BAND_TIERS, getTotalResearchTiers(s));
  const minDelta = PRESSURE_PRICE_MIN - PRICE_BAND_MIN_TARGET;
  const maxDelta = PRESSURE_PRICE_MAX - PRICE_BAND_MAX_TARGET;
  return {
    min: PRESSURE_PRICE_MIN - (minDelta / TOTAL_PRICE_BAND_TIERS) * tiers,
    max: PRESSURE_PRICE_MAX - (maxDelta / TOTAL_PRICE_BAND_TIERS) * tiers
  };
}

/**
 * Attempt to purchase the next tier on `track`. Returns true on success
 * and atomically deducts the cost; returns false if the track is already
 * maxed or the player cannot afford it. Pure over GameState — no UI
 * side-effects here; callers handle toasts/sfx.
 */
export function buyResearchTier(s: GameState, track: ResearchTrackName): boolean {
  const cost = getNextTierCost(s, track);
  if (cost === null) return false;
  if (s.money < cost) return false;
  s.money -= cost;
  s.research[track].tier += 1;
  return true;
}

/** Is every research track at the maximum tier? */
export function isResearchMaxed(s: GameState): boolean {
  return s.research.solar.tier >= MAX_RESEARCH_TIER
    && s.research.wind.tier >= MAX_RESEARCH_TIER
    && s.research.nuclear.tier >= MAX_RESEARCH_TIER
    && s.research.electrolyzer.tier >= MAX_RESEARCH_TIER;
}
