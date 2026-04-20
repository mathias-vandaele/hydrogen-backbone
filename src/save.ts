import { REGIONS } from './config';
import { $ } from './dom';
import { createInitialState, replaceState, state } from './state';
import { initTutorial } from './tutorial';
import { showToast, updateBuildCosts } from './ui';
import type { GameState } from './types';

const KEY = 'hydrogen_backbone_save';

export function saveGame(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    showToast('Game saved!');
  } catch {
    showToast('Save failed!');
  }
  $('#save-menu').style.display = 'none';
}

export function loadGame(): boolean {
  try {
    const data = localStorage.getItem(KEY);
    if (!data) {
      showToast('No save found.');
      return false;
    }
    const parsed = JSON.parse(data) as GameState;
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

export function autoSave(): void {
  if (state.tick % 3000 === 0 && state.tick > 0) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // Storage full or disabled — ignore.
    }
  }
}

export function loadFromStorageIfPresent(): void {
  const saved = localStorage.getItem(KEY);
  if (!saved) return;
  try {
    const parsed = JSON.parse(saved) as GameState;
    // Ensure fields added in later versions exist.
    if (parsed.totalCurtailed === undefined) parsed.totalCurtailed = 0;
    if (parsed.dailyRevenue === undefined) parsed.dailyRevenue = 0;
    replaceState(parsed);
  } catch {
    // Corrupt save — keep the fresh initial state.
  }
}

export function rebuildPipeConnections(): void {
  for (const rc of REGIONS) state.regions[rc.id].pipeConnections = 0;
  for (const pipe of state.pipes) {
    if (state.regions[pipe.fromId]) state.regions[pipe.fromId].pipeConnections++;
    if (state.regions[pipe.toId]) state.regions[pipe.toId].pipeConnections++;
  }
}
