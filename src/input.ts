import { build, buildPipeline } from './buildings';
import { $$ } from './dom';
import { hitTest, mapView } from './map';
import { setSpeed, togglePause } from './sim';
import { getRegionConfig } from './config';
import { hideInfoPanel, showRegionInfo, showToast } from './ui';
import type { BuildingType } from './types';

export const input = {
  mx: 0,
  my: 0,
  buildMode: null as BuildingType | null,
  pipeStart: null as string | null
};

export function initInput(): void {
  const canvas = mapView.canvas;
  if (!canvas) throw new Error('Map not initialized');

  canvas.addEventListener('mousemove', e => {
    input.mx = e.clientX;
    input.my = e.clientY;
    mapView.hoveredRegion = hitTest(input.mx, input.my);
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

export function cancelBuild(): void {
  input.buildMode = null;
  input.pipeStart = null;
  $$('.build-btn').forEach(b => b.classList.remove('active'));
  if (mapView.canvas) mapView.canvas.style.cursor = 'default';
}
