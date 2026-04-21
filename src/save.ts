import { REGIONS } from './config';
import { $ } from './dom';
import { createInitialState, replaceState, state } from './state';
import { initTutorial } from './tutorial';
import { showToast, updateBuildCosts, updateSaveTimestamp } from './ui';
import type { GameState } from './types';

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
 * Forward-migrate a possibly-old save: spread the raw payload over a
 * fresh state, then coerce fields we rely on to sane defaults. Must stay
 * forgiving — we never throw on load, since that would mean the player
 * can never get their game back.
 */
function migrateSave(raw: Partial<GameState>): GameState {
  const fresh = createInitialState();
  const merged: GameState = { ...fresh, ...raw } as GameState;
  if (!Array.isArray(merged.priceHistory)) merged.priceHistory = [];
  if (!Array.isArray(merged.pressureHistory)) merged.pressureHistory = [];
  if (!merged.milestones) merged.milestones = { ...fresh.milestones };
  if (typeof merged.lastSavedAt !== 'number') merged.lastSavedAt = 0;
  if (typeof merged.totalCurtailed !== 'number') merged.totalCurtailed = 0;
  if (typeof merged.dailyRevenue !== 'number') merged.dailyRevenue = 0;
  return merged;
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
