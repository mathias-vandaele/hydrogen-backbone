import { BUILDINGS, REGIONS } from './config';
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
    showToast('Saved.');
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
  if (!Array.isArray(merged.caverns)) merged.caverns = [];
  if (!merged.milestones) merged.milestones = { ...fresh.milestones };
  for (const key of Object.keys(fresh.milestones)) {
    const milestone = key as keyof typeof fresh.milestones;
    if (typeof merged.milestones[milestone] !== 'boolean') merged.milestones[milestone] = fresh.milestones[milestone];
  }
  if (!merged.thresholdCrossings) merged.thresholdCrossings = { ...fresh.thresholdCrossings };
  for (const key of Object.keys(fresh.thresholdCrossings)) {
    const type = key as keyof typeof fresh.thresholdCrossings;
    if (!(type in merged.thresholdCrossings)) merged.thresholdCrossings[type] = fresh.thresholdCrossings[type];
  }
  if (!merged.research) merged.research = { ...fresh.research };
  if (typeof merged.research.solar?.tier !== 'number') merged.research.solar = { ...fresh.research.solar };
  if (typeof merged.research.wind?.tier !== 'number') merged.research.wind = { ...fresh.research.wind };
  if (typeof merged.research.nuclear?.tier !== 'number') merged.research.nuclear = { ...fresh.research.nuclear };
  if (typeof merged.research.electrolyzer?.tier !== 'number') merged.research.electrolyzer = { ...fresh.research.electrolyzer };
  if (typeof merged.lastSavedAt !== 'number') merged.lastSavedAt = 0;
  if (typeof merged.dailyRevenue !== 'number') merged.dailyRevenue = 0;
  if (typeof merged.dailyOpex !== 'number') merged.dailyOpex = 0;
  if (typeof merged.networkHydrogenStored !== 'number') merged.networkHydrogenStored = 0;
  if (!Array.isArray(merged.revenueSamples)) merged.revenueSamples = [];
  if (!Array.isArray(merged.opexSamples)) merged.opexSamples = [];
  if (typeof merged.financeSampleIndex !== 'number') merged.financeSampleIndex = 0;
  if (typeof merged.daysBelowBankruptcyThreshold !== 'number') merged.daysBelowBankruptcyThreshold = 0;
  if (typeof merged.gameOver === 'undefined') merged.gameOver = null;

  // Rolling 24h sample ring buffers (added after v4). Start empty — the
  // first game-day will refill them; don't try to reconstruct from history.
  if (!Array.isArray(merged.supplySamples)) merged.supplySamples = [];
  if (!Array.isArray(merged.demandSamples)) merged.demandSamples = [];
  if (typeof merged.supplyDemandSampleIndex !== 'number') merged.supplyDemandSampleIndex = 0;

  // Backfill per-region reliabilityDays (v3 addition) + sample buffers.
  for (const rc of REGIONS) {
    const rs = merged.regions[rc.id];
    if (rs && typeof rs.reliabilityDays !== 'number') rs.reliabilityDays = 0;
    if (rs && !Array.isArray(rs.supplySamples)) rs.supplySamples = [];
    if (rs && !Array.isArray(rs.demandSamples)) rs.demandSamples = [];
    if (rs && typeof rs.sampleIndex !== 'number') rs.sampleIndex = 0;
  }

  // v4: backfill per-building `cost` for old saves so the opex pass doesn't
  // treat NaN as a burn. Use BUILDINGS[type].baseCost as a best-effort
  // default; no better signal is available pre-migration.
  if (Array.isArray(merged.buildings)) {
    for (const b of merged.buildings) {
      if (typeof b.cost !== 'number' || !Number.isFinite(b.cost)) {
        const cfg = (BUILDINGS as unknown as Record<string, { baseCost?: number } | undefined>)[b.type];
        b.cost = Math.round(cfg?.baseCost ?? 50_000_000);
      }
    }
  }

  // Building-type migration: old saves had separate generators + electrolyzers.
  merged.buildings = migrateBuildings(merged.buildings as unknown as LegacyBuilding[]);

  // Seed the simplified single-network linepack model from any saved
  // network pressure so existing backbones don't reload as empty.
  if ((!raw.networkHydrogenStored || raw.networkHydrogenStored <= 0) && Array.isArray(merged.pipes) && merged.pipes.length > 0) {
    const totalCapacity = merged.pipes.reduce((sum, pipe) => sum + (pipe.linepackCapacity || 0), 0);
    const pressureRatio = Math.max(0, Math.min(1, (merged.networkPressure || 0) / 80));
    merged.networkHydrogenStored = totalCapacity * pressureRatio;
  }

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
    const fallbackCost = Math.round(cfg?.baseCost ?? 50_000_000);
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
