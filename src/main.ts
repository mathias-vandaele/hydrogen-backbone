// The Backbone — Hydrogen Economy Simulator.
// "Build the pipe. The rest follows."

import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';

import { initAudio, toggleAudio } from './audio';
import { COLOR, TYPE, installDesignSystemTokens } from './design-system';
import { $, $$, installRoundRectPolyfill } from './dom';
import { hydrateDomIcons } from './icons';
import { initInput } from './input';
import { startLoop } from './loop';
import { initMap } from './map';
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
 * Application entry point. Order matters: map/audio/input/UI
 * must be initialized before the main loop starts ticking, and load-from-
 * storage must run before initUI so the HUD reflects the loaded state.
 */
function boot(): void {
  installDesignSystemTokens();
  hydrateDomIcons();
  installRoundRectPolyfill();
  loadFromStorageIfPresent();

  initMap();
  initAudio();
  initInput();
  initUI();
  initTutorial();
  wireTopBar();

  rebuildPipeConnections();
  logCustomerSlotDiagnostics();

  startLoop();

  // eslint-disable-next-line no-console
  console.log(
    '%cThe Backbone — Hydrogen Economy Simulator',
    `color:${COLOR.AMBER_BASE};font-family:${TYPE.DISPLAY};font-size:${TYPE.SIZE.LARGE};font-weight:${TYPE.WEIGHT.BOLD}`
  );
  // eslint-disable-next-line no-console
  console.log(
    '%c"Build the pipe. The rest follows."',
    `color:${COLOR.TYPE_SECONDARY};font-family:${TYPE.DISPLAY};font-size:${TYPE.SIZE.SMALL}`
  );
}

boot();
