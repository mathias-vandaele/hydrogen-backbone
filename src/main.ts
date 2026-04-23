// The Backbone — Hydrogen Economy Simulator.
// "Build the pipe. The rest follows."

import { initAudio, toggleAudio } from './audio';
import { $, $$, installRoundRectPolyfill } from './dom';
import { initInput } from './input';
import { startLoop } from './loop';
import { initMap } from './map';
import { initParticles } from './particles';
import { logCustomerSlotDiagnostics } from './customers';
import { loadFromStorageIfPresent, loadGame, rebuildPipeConnections, resetGame, saveGame } from './save';
import { setSpeed } from './sim';
import { initTutorial } from './tutorial';
import { initUI, toggleSaveMenu } from './ui';

/**
 * Attach click handlers for the static HUD top bar: save/sound toggles,
 * speed-control buttons (0/1/10/100×), and the save-menu actions. Called
 * once from boot after the DOM is ready.
 */
function wireTopBar(): void {
  $('#save-toggle').addEventListener('click', toggleSaveMenu);
  $('#sound-toggle').addEventListener('click', toggleAudio);

  $$<HTMLButtonElement>('#speed-controls button').forEach(btn => {
    btn.addEventListener('click', () => {
      const speed = Number(btn.dataset.speed);
      setSpeed(speed);
    });
  });

  $('#save-btn').addEventListener('click', saveGame);
  $('#load-btn').addEventListener('click', loadGame);
  $('#reset-btn').addEventListener('click', resetGame);
}

/**
 * Application entry point. Order matters: map/audio/particles/input/UI
 * must be initialized before the main loop starts ticking, and load-from-
 * storage must run before initUI so the HUD reflects the loaded state.
 */
function boot(): void {
  installRoundRectPolyfill();
  loadFromStorageIfPresent();

  initMap();
  initAudio();
  initParticles();
  initInput();
  initUI();
  initTutorial();
  wireTopBar();

  rebuildPipeConnections();
  logCustomerSlotDiagnostics();

  startLoop();

  // eslint-disable-next-line no-console
  console.log('%c⚡ The Backbone — Hydrogen Economy Simulator', 'color:#06d6a0;font-size:16px;font-weight:bold');
  // eslint-disable-next-line no-console
  console.log('%c"Build the pipe. The rest follows."', 'color:#64748b;font-style:italic');
}

boot();
