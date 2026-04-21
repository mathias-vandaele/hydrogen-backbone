import { build, buildPipeline } from './buildings';
import { $$ } from './dom';
import { hitTest, mapView } from './map';
import { setSpeed, togglePause } from './sim';
import { getRegionConfig } from './config';
import { hideInfoPanel, hideRegionTooltip, showRegionInfo, showToast, updateRegionTooltip } from './ui';
import type { BuildingType } from './types';

export const input = {
  mx: 0,
  my: 0,
  buildMode: null as BuildingType | null,
  pipeStart: null as string | null
};

/**
 * Attach all canvas and keyboard event handlers. Pointer moves update the
 * cursor-region hit test and the DOM tooltip; clicks drive both "place
 * building" and "draw pipeline" flows (the pipeline flow is a two-click
 * picker persisted via `input.pipeStart`). Keys 1/2/3 set sim speed and
 * Space toggles pause. Right-click or Escape cancel any active build mode.
 */
export function initInput(): void {
  const canvas = mapView.canvas;
  if (!canvas) throw new Error('Map not initialized');

  canvas.addEventListener('mousemove', e => {
    input.mx = e.clientX;
    input.my = e.clientY;
    mapView.hoveredRegion = hitTest(input.mx, input.my);
    updateRegionTooltip(mapView.hoveredRegion, input.mx, input.my);
  });

  canvas.addEventListener('mouseleave', () => {
    mapView.hoveredRegion = null;
    hideRegionTooltip();
  });

  canvas.addEventListener('click', e => {
    input.mx = e.clientX;
    input.my = e.clientY;
    handleClick();
  });

  canvas.addEventListener('contextmenu', e => {
    e.preventDefault();
    cancelBuild();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') cancelBuild();
    if (e.key === ' ') { e.preventDefault(); togglePause(); }
    if (e.key === '1') setSpeed(1);
    if (e.key === '2') setSpeed(10);
    if (e.key === '3') setSpeed(100);
  });
}

/**
 * Dispatch a left-click. Three branches, in priority order:
 *  - In pipeline build mode: first click captures the start region, second
 *    click on a different region places the pipe. Clicks outside a region
 *    are ignored (no half-pipes in mid-air).
 *  - Any other build mode on a region: place the building there.
 *  - No build mode: treat as a region selection, showing/hiding the info
 *    panel accordingly.
 */
function handleClick(): void {
  const region = hitTest(input.mx, input.my);

  if (input.buildMode === 'pipeline') {
    if (region) {
      if (!input.pipeStart) {
        input.pipeStart = region;
        const cfg = getRegionConfig(region);
        showToast(`Pipeline start: ${cfg?.name ?? region}. Click destination region.`);
      } else if (region !== input.pipeStart) {
        buildPipeline(input.pipeStart, region);
        input.pipeStart = null;
      }
    }
    return;
  }

  if (input.buildMode && region) {
    build(input.buildMode, region);
    return;
  }

  if (region) {
    mapView.selectedRegion = region;
    showRegionInfo(region);
  } else {
    mapView.selectedRegion = null;
    hideInfoPanel();
  }
}

/**
 * Leave any active build mode and reset the build UI (deactivates the
 * build-menu button, restores the default cursor, clears any partial
 * pipeline start).
 */
export function cancelBuild(): void {
  input.buildMode = null;
  input.pipeStart = null;
  $$('.build-btn').forEach(b => b.classList.remove('active'));
  if (mapView.canvas) mapView.canvas.style.cursor = 'default';
}
