import { BUILDINGS, ECONOMY, REGIONS } from './config';
import { $ } from './dom';
import { createInitialState, replaceState, state } from './state';
import { initTutorial } from './tutorial';
import { showToast, updateBuildCosts, updateSaveTimestamp } from './ui';
import type { Building, BuildingType, GameState, PlaceableBuildingType } from './types';

// Pre-v3 type names preserved here so we can detect old saves. Any save
// that still carries these types is migrated into the new Hydrogen Plant
// model by combining co-regional pairs or resetting cleanly.
type LegacyBuildingType = 'solar' | 'wind' | 'nuclear' | 'electrolyzer';

interface LegacyBuilding extends Omit<Building, 'type'> {
  type: BuildingType | LegacyBuildingType;
}

// localStorage key. Single-slot save; a future version could namespace
// multiple slots but the current UI exposes one.
const KEY = 'hydrogen_backbone_save';

/**
 * Persist the current GameState to localStorage. Stamps `lastSavedAt` so
 * the save-menu footer can show "Last saved: …m ago". Called from the
 * save button; auto-save is a separate path (see autoSave below).
 */
export function saveGame(): void {
  try {
    state.lastSavedAt = Date.now();
    localStorage.setItem(KEY, JSON.stringify(state));
    showToast('Saved ✓');
    updateSaveTimestamp();
  } catch {
    showToast('Save failed!');
  }
  $('#save-menu').style.display = 'none';
}

/**
 * Load a previously saved game in response to the "Load Game" button.
 * Runs save migration, replaces the live state, refreshes build costs,
 * rebuilds pipe-connection counters, and hides the tutorial if the
 * saved game had already dismissed it. Returns true on success.
 */
export function loadGame(): boolean {
  try {
    const data = localStorage.getItem(KEY);
    if (!data) {
      showToast('No save found.');
      return false;
    }
    const parsed = migrateSave(JSON.parse(data) as Partial<GameState>);
    replaceState(parsed);
    showToast(`Game loaded! Day ${parsed.gameDay}`);
    updateBuildCosts();
    rebuildPipeConnections();
    if (parsed.tutorialDone) $('#tutorial').classList.remove('show');
  } catch {
    showToast('Load failed!');
    return false;
  }
  $('#save-menu').style.display = 'none';
  return true;
}

/**
 * Wipe localStorage and replace state with a fresh game. Re-plays the
 * tutorial. Confirms first since it's destructive.
 */
export function resetGame(): void {
  if (confirm('Start a new game? Current progress will be lost.')) {
    localStorage.removeItem(KEY);
    replaceState(createInitialState());
    updateBuildCosts();
    initTutorial();
    showToast('New game started!');
  }
  $('#save-menu').style.display = 'none';
}

/**
 * Silent periodic save from the sim tick. Fires every 3000 ticks
 * (≈ 5 min at 1× / 3 s at 100×). Failures are swallowed so a full
 * storage quota never blocks gameplay.
 */
export function autoSave(): void {
  if (state.tick % 3000 === 0 && state.tick > 0) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // Storage full or disabled — ignore.
    }
  }
}

/**
 * Boot-time load: if a save exists and parses, restore it (via migration).
 * Corrupt JSON falls through silently and the player keeps the fresh
 * initial state rather than seeing a broken game.
 */
export function loadFromStorageIfPresent(): void {
  const saved = localStorage.getItem(KEY);
  if (!saved) return;
  try {
    const parsed = JSON.parse(saved) as Partial<GameState>;
    replaceState(migrateSave(parsed));
  } catch {
    // Corrupt save — keep the fresh initial state.
  }
}

/**
 * Forward-migrate a possibly-old save. Spreads the raw payload over a
 * fresh state, coerces nullable fields, and — critically — maps
 * pre-v3 building types (solar/wind/nuclear + electrolyzer pairs) into
 * the new Hydrogen Plant model. Must stay forgiving: we never throw on
 * load, since that would mean the player can never get their game back.
 */
function migrateSave(raw: Partial<GameState>): GameState {
  const fresh = createInitialState();
  const merged: GameState = { ...fresh, ...raw } as GameState;

  // Array + object fallbacks
  if (!Array.isArray(merged.priceHistory)) merged.priceHistory = [];
  if (!Array.isArray(merged.pressureHistory)) merged.pressureHistory = [];
  if (!Array.isArray(merged.budgetHistory)) merged.budgetHistory = [];
  if (!Array.isArray(merged.pendingCustomers)) merged.pendingCustomers = [];
  if (!merged.milestones) merged.milestones = { ...fresh.milestones };
  if (!merged.endgame) merged.endgame = { ...fresh.endgame };
  if (!merged.thresholdCrossings) merged.thresholdCrossings = { ...fresh.thresholdCrossings };
  if (typeof merged.lastSavedAt !== 'number') merged.lastSavedAt = 0;
  if (typeof merged.totalCurtailed !== 'number') merged.totalCurtailed = 0;
  if (typeof merged.dailyRevenue !== 'number') merged.dailyRevenue = 0;
  if (typeof merged.dailyOpex !== 'number') merged.dailyOpex = 0;
  if (typeof merged.priceEMA !== 'number') merged.priceEMA = merged.spotPrice ?? 6.0;
  if (typeof merged.lastCustomerEmergenceDay !== 'number') merged.lastCustomerEmergenceDay = -999;
  if (typeof merged.surplusStreakDays !== 'number') merged.surplusStreakDays = 0;
  if (typeof merged.daysBelowBankruptcyThreshold !== 'number') merged.daysBelowBankruptcyThreshold = 0;
  if (typeof merged.firstPipelineBuiltDay !== 'number' && merged.firstPipelineBuiltDay !== null) {
    merged.firstPipelineBuiltDay = Array.isArray(merged.pipes) && merged.pipes.length > 0
      ? merged.pipes.reduce((m, p) => Math.min(m, p.builtDay), Infinity)
      : null;
  }
  if (typeof merged.gameOver === 'undefined') merged.gameOver = null;

  // Backfill per-region reliabilityDays (v3 addition).
  for (const rc of REGIONS) {
    const rs = merged.regions[rc.id];
    if (rs && typeof rs.reliabilityDays !== 'number') rs.reliabilityDays = 0;
  }

  // Backfill ramp field on existing live customers.
  if (Array.isArray(merged.customers)) {
    for (const c of merged.customers) {
      if (typeof c.ramp !== 'number') c.ramp = 1;
    }
  }

  // Backfill wright table for v3 keys (if loading a v2 save, the old
  // WrightState had `solar/wind/nuclear/electrolyzer/pipeline` keys; we
  // transplant those curves into the new keys that best match).
  const w = merged.wright as unknown as Record<string, { cum: number; mult: number }>;
  if (w && (w.solar || w.wind || w.nuclear || w.electrolyzer)) {
    merged.wright = {
      solarPlant: w.solarPlant ?? w.solar ?? { cum: 0, mult: 1 },
      windPlant: w.windPlant ?? w.wind ?? { cum: 0, mult: 1 },
      nuclearPlant: w.nuclearPlant ?? w.nuclear ?? { cum: 0, mult: 1 },
      pipeline: w.pipeline ?? { cum: 0, mult: 1 }
    };
  }

  // v4: backfill per-building `cost` for old saves so the opex pass doesn't
  // treat NaN as a burn. Use BUILDINGS[type].baseCost × v4 CAPEX multiplier
  // as a best-effort default; no better signal is available pre-migration.
  if (Array.isArray(merged.buildings)) {
    for (const b of merged.buildings) {
      if (typeof b.cost !== 'number' || !Number.isFinite(b.cost)) {
        const cfg = (BUILDINGS as unknown as Record<string, { baseCost?: number } | undefined>)[b.type];
        b.cost = Math.round((cfg?.baseCost ?? 50_000_000) * ECONOMY.BUILDING_COST_MULTIPLIER);
      }
    }
  }

  // Building-type migration: old saves had separate generators + electrolyzers.
  merged.buildings = migrateBuildings(merged.buildings as unknown as LegacyBuilding[]);

  return merged;
}

/**
 * Collapse pre-v3 building entries into the new model. Rule: if a region
 * had at least one generator (solar/wind/nuclear) AND at least one
 * electrolyzer, each generator is upgraded in place to its bundled plant
 * equivalent, and the electrolyzers are dropped (their function is now
 * internal to the plant). Orphan generators without a co-regional
 * electrolyzer are also upgraded (they now produce hydrogen directly —
 * the most permissive interpretation, so no player work is lost). Orphan
 * electrolyzers are dropped.
 */
function migrateBuildings(raw: LegacyBuilding[] | undefined): Building[] {
  if (!raw || raw.length === 0) return [];
  const kindMap: Record<string, PlaceableBuildingType> = {
    solar: 'solarPlant',
    wind: 'windPlant',
    nuclear: 'nuclearPlant',
    solarPlant: 'solarPlant',
    windPlant: 'windPlant',
    nuclearPlant: 'nuclearPlant'
  };
  const out: Building[] = [];
  for (const b of raw) {
    const mapped = kindMap[b.type as string];
    if (!mapped) continue; // Drops legacy 'electrolyzer' + anything unknown.
    const preserved = (b as { cost?: number }).cost;
    const cfg = BUILDINGS[mapped];
    const fallbackCost = Math.round((cfg?.baseCost ?? 50_000_000) * ECONOMY.BUILDING_COST_MULTIPLIER);
    out.push({
      id: b.id,
      type: mapped,
      regionId: b.regionId,
      x: b.x,
      y: b.y,
      capacity: b.capacity,
      cost: typeof preserved === 'number' && Number.isFinite(preserved) ? preserved : fallbackCost,
      builtDay: b.builtDay,
      production: 0,
      internalElectricity: 0
    });
  }
  return out;
}

/**
 * Regenerate the per-region `pipeConnections` counter from the authoritative
 * `state.pipes` list. Cheaper than maintaining it incrementally on every
 * load, and keeps the counter correct regardless of how the state arrived
 * (save load, new game, migration).
 */
export function rebuildPipeConnections(): void {
  for (const rc of REGIONS) state.regions[rc.id].pipeConnections = 0;
  for (const pipe of state.pipes) {
    if (state.regions[pipe.fromId]) state.regions[pipe.fromId].pipeConnections++;
    if (state.regions[pipe.toId]) state.regions[pipe.toId].pipeConnections++;
  }
}
