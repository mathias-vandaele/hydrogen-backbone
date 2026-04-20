import { BOUNDS, MAP_PADDING, REGIONS, getRegionConfig } from './config';
import { $ } from './dom';
import type { RegionConfig } from './types';

export interface RegionPath {
  id: string;
  path: Path2D;
  pts: Array<[number, number]>;
  config: RegionConfig;
}

export const mapView = {
  canvas: null as HTMLCanvasElement | null,
  ctx: null as CanvasRenderingContext2D | null,
  width: 0,
  height: 0,
  mapX: 0,
  mapY: 0,
  mapW: 0,
  mapH: 0,
  regionPaths: [] as RegionPath[],
  hoveredRegion: null as string | null,
  selectedRegion: null as string | null
};

export function initMap(): void {
  mapView.canvas = $<HTMLCanvasElement>('#gameCanvas');
  const ctx = mapView.canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to obtain 2D canvas context');
  mapView.ctx = ctx;
  resizeMap();
  window.addEventListener('resize', resizeMap);
}

export function resizeMap(): void {
  const canvas = mapView.canvas;
  const ctx = mapView.ctx;
  if (!canvas || !ctx) return;

  const dpr = window.devicePixelRatio || 1;
  mapView.width = window.innerWidth;
  mapView.height = window.innerHeight;
  canvas.width = mapView.width * dpr;
  canvas.height = mapView.height * dpr;
  canvas.style.width = `${mapView.width}px`;
  canvas.style.height = `${mapView.height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const pad = MAP_PADDING;
  mapView.mapX = 220 + pad;
  mapView.mapY = 58 + pad;
  mapView.mapW = mapView.width - 220 - 280 - pad * 2;
  mapView.mapH = mapView.height - 58 - 36 - pad * 2;

  // Maintain aspect ratio of France (corrected for Mercator at 46°N)
  const franceAspect = 1.05;
  if (mapView.mapW / mapView.mapH > franceAspect) {
    mapView.mapW = mapView.mapH * franceAspect;
  } else {
    mapView.mapH = mapView.mapW / franceAspect;
  }

  buildPaths();
}

export function project(lat: number, lon: number): [number, number] {
  const x = mapView.mapX + ((lon - BOUNDS.minLon) / (BOUNDS.maxLon - BOUNDS.minLon)) * mapView.mapW;
  const y = mapView.mapY + ((BOUNDS.maxLat - lat) / (BOUNDS.maxLat - BOUNDS.minLat)) * mapView.mapH;
  return [x, y];
}

export function unproject(px: number, py: number): [number, number] {
  const lon = BOUNDS.minLon + ((px - mapView.mapX) / mapView.mapW) * (BOUNDS.maxLon - BOUNDS.minLon);
  const lat = BOUNDS.maxLat - ((py - mapView.mapY) / mapView.mapH) * (BOUNDS.maxLat - BOUNDS.minLat);
  return [lat, lon];
}

export function buildPaths(): void {
  mapView.regionPaths = [];
  for (const r of REGIONS) {
    const path = new Path2D();
    const pts = r.polygon.map(p => project(p[0], p[1]));
    if (pts.length > 0) {
      path.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        path.lineTo(pts[i][0], pts[i][1]);
      }
      path.closePath();
    }
    mapView.regionPaths.push({ id: r.id, path, pts, config: r });
  }
}

export function hitTest(mx: number, my: number): string | null {
  const ctx = mapView.ctx;
  if (!ctx) return null;
  for (const rp of mapView.regionPaths) {
    if (ctx.isPointInPath(rp.path, mx, my)) return rp.id;
  }
  return null;
}

export function getCenter(regionId: string): [number, number] {
  const r = getRegionConfig(regionId);
  if (!r) return [0, 0];
  return project(r.capitalCoord[0], r.capitalCoord[1]);
}

export function distanceBetween(id1: string, id2: string): number {
  const c1 = getCenter(id1);
  const c2 = getCenter(id2);
  const dx = c1[0] - c2[0];
  const dy = c1[1] - c2[1];
  const pxDist = Math.sqrt(dx * dx + dy * dy);
  // Full bounds span ~1090 km north-south (41.3°N to 51.1°N).
  const kmPerPx = 1090 / mapView.mapH;
  return pxDist * kmPerPx;
}
