import franceRegionsData from './assets/france-regions.json';
import { GAS_CORRIDORS, MAP_PADDING, REGIONS, type GasCorridor } from './config';
import { $ } from './dom';
import { applyFit, fitToCanvas, project as lambertProject, type FitTransform, type Point } from './projection';
import type { Region, RegionBonuses, RegionConfig } from './types';

interface GeoFeature {
  type: 'Feature';
  geometry:
    | { type: 'Polygon'; coordinates: number[][][] }
    | { type: 'MultiPolygon'; coordinates: number[][][][] };
  properties: { code: string; nom: string; centroid: [number, number] };
}
interface GeoCollection { type: 'FeatureCollection'; features: GeoFeature[]; }

const franceRegions = franceRegionsData as GeoCollection;

// Projected (Lambert-93) lon/lat → raw metric coords. Cached once; the
// canvas fit transform is re-applied cheaply on every resize.
interface RawRegion {
  id: string;
  code: string;
  name: string;
  config: RegionConfig;
  rawRings: Point[][];         // all rings across all polygons, raw Lambert-93
  rawCentroid: Point;
  centroidLL: { lon: number; lat: number }; // original lon/lat for weather etc.
  largestPolyOuter: Point[];   // outer ring of the single largest polygon (for Region.polygon)
}

export interface RegionPath {
  id: string;
  path: Path2D;
  rings: Array<Array<{ x: number; y: number }>>;
  config: RegionConfig;
  region: Region;
}

export const mapView = {
  canvas: null as HTMLCanvasElement | null,
  ctx: null as CanvasRenderingContext2D | null,
  dpr: 1,
  width: 0,
  height: 0,
  mapX: 0,
  mapY: 0,
  mapW: 0,
  mapH: 0,
  regionPaths: [] as RegionPath[],
  regionsById: new Map<string, Region>(),
  fitTransform: { scale: 1, tx: 0, ty: 0 } as FitTransform,
  kmPerPx: 1,
  hoveredRegion: null as string | null,
  selectedRegion: null as string | null
};

let rawRegions: RawRegion[] = [];

// Retina and ProMotion displays can make a full-screen canvas unexpectedly
// expensive: DPR 2 is four times the pixels of DPR 1 before refresh rate is
// considered. Keep the backing buffer near a 1080p external display budget
// while preserving the same CSS layout and input coordinates.
const MAX_CANVAS_DPR = 1.5;
const MAX_CANVAS_BACKING_PIXELS = 3_000_000;

// Gas corridors: raw Lambert coords computed once; screen coords rebuilt on resize.
interface RawCorridor { name: string; rawPts: Point[]; }
let rawGasCorridors: RawCorridor[] = [];
export let gasCorridorScreenPaths: Array<{ name: string; pts: Point[] }> = [];

/**
 * Translate the legacy RegionConfig bonus fields into the newer
 * RegionBonuses shape exposed on `Region`. Kept as a cheap adapter so
 * future code can use the structured type without rewriting the config.
 */
function configToBonuses(c: RegionConfig): RegionBonuses {
  return {
    solar: c.solarBase,
    wind: c.windBase,
    industrial: c.industryDemand,
    port: c.hasPort ? 1 : 0,
    landCapacity: c.maxSlots
  };
}

/**
 * Flatten a GeoJSON feature into a plain list of rings in (lon, lat).
 * Polygons get their rings wrapped into one list; MultiPolygons' rings
 * are concatenated. Used for both projection and rendering setup.
 */
function collectRings(feature: GeoFeature): number[][][] {
  // Normalize Polygon vs MultiPolygon → array of rings (each an array of [lon,lat])
  const out: number[][][] = [];
  if (feature.geometry.type === 'Polygon') {
    for (const r of feature.geometry.coordinates) out.push(r);
  } else {
    for (const poly of feature.geometry.coordinates) for (const r of poly) out.push(r);
  }
  return out;
}

/**
 * Pick the outer ring of the largest polygon in a feature — that's the
 * "main body" of the region (e.g., mainland Normandy, not its Channel
 * Islands sub-polygons). Used to populate `Region.polygon` for callers
 * that need a single simple shape.
 */
function largestOuterRing(feature: GeoFeature): number[][] {
  // In a GeoJSON MultiPolygon, each polygon's first ring is its outer. Find the
  // largest-area one — that's the mainland body of the region.
  const polys: number[][][][] =
    feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  let bestArea = 0;
  let best: number[][] = polys[0][0];
  for (const poly of polys) {
    const outer = poly[0];
    let a = 0;
    for (let i = 0; i < outer.length - 1; i++) {
      a += outer[i][0] * outer[i + 1][1] - outer[i + 1][0] * outer[i][1];
    }
    a = Math.abs(a / 2);
    if (a > bestArea) { bestArea = a; best = outer; }
  }
  return best;
}

/**
 * One-time init: for each configured region, find its matching GeoJSON
 * feature by INSEE code and eagerly project every ring into Lambert-93
 * metres. The raw (metric) coordinates are cached so window resizes just
 * re-apply the fit transform — no re-projection needed.
 */
function buildRawRegions(): void {
  rawRegions = [];
  for (const cfg of REGIONS) {
    const feature = franceRegions.features.find(f => f.properties.code === cfg.code);
    if (!feature) {
      // eslint-disable-next-line no-console
      console.warn(`No GeoJSON feature for region code ${cfg.code} (${cfg.id})`);
      continue;
    }
    const rawRings = collectRings(feature).map(ring =>
      ring.map(([lon, lat]) => lambertProject(lon, lat))
    );
    const largestOuter = largestOuterRing(feature).map(([lon, lat]) => lambertProject(lon, lat));
    const [clon, clat] = feature.properties.centroid;
    const rawCentroid = lambertProject(clon, clat);
    rawRegions.push({
      id: cfg.id,
      code: cfg.code,
      name: cfg.name,
      config: cfg,
      rawRings,
      rawCentroid,
      centroidLL: { lon: clon, lat: clat },
      largestPolyOuter: largestOuter
    });
  }
}

/**
 * One-time init for the projected gas-corridor polylines. Same pattern as
 * buildRawRegions: project once, re-fit on every resize.
 */
function buildRawGasCorridors(): void {
  rawGasCorridors = GAS_CORRIDORS.map((c: GasCorridor) => ({
    name: c.name,
    rawPts: c.waypoints.map(([lon, lat]) => lambertProject(lon, lat))
  }));
}

/**
 * Grab the #gameCanvas element, set up its 2D context, compute raw
 * projected geometry for regions and gas corridors, lay it all out once,
 * and wire the window-resize handler.
 */
export function initMap(): void {
  mapView.canvas = $<HTMLCanvasElement>('#gameCanvas');
  const ctx = mapView.canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to obtain 2D canvas context');
  mapView.ctx = ctx;
  buildRawRegions();
  buildRawGasCorridors();
  resizeMap();
  window.addEventListener('resize', resizeMap);
}

/**
 * Resize handler (and initial layout). Sets up the backing canvas at the
 * device pixel ratio, recomputes the map's usable rect (accounting for
 * HUD, side panels, and status bar), derives a fit transform so the whole
 * country fits with padding, and computes km-per-pixel for distance costs.
 * Finally rebuilds all screen-space paths.
 */
export function resizeMap(): void {
  const canvas = mapView.canvas;
  const ctx = mapView.ctx;
  if (!canvas || !ctx) return;

  mapView.width = window.innerWidth;
  mapView.height = window.innerHeight;
  const dpr = getCanvasDpr(mapView.width, mapView.height);
  mapView.dpr = dpr;
  canvas.width = Math.max(1, Math.ceil(mapView.width * dpr));
  canvas.height = Math.max(1, Math.ceil(mapView.height * dpr));
  canvas.style.width = `${mapView.width}px`;
  canvas.style.height = `${mapView.height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const layout = computeResponsiveMapRect();
  const pad = Math.min(MAP_PADDING, 24);
  mapView.mapX = layout.x;
  mapView.mapY = layout.y;
  mapView.mapW = layout.w;
  mapView.mapH = layout.h;

  // Fit all raw ring points into the allotted canvas rect, uniform scale.
  const allRings: Point[][] = [];
  for (const r of rawRegions) allRings.push(...r.rawRings);
  mapView.fitTransform = fitToCanvas(allRings, mapView.mapX, mapView.mapY, mapView.mapW, mapView.mapH, pad);

  // Lambert-93 is in meters; scale converts meters → screen px, so screen px
  // per km is 1000*scale and km per screen px is 1/(1000*scale).
  mapView.kmPerPx = 1 / (mapView.fitTransform.scale * 1000);

  rebuildPaths();
}

function getCanvasDpr(cssWidth: number, cssHeight: number): number {
  const nativeDpr = window.devicePixelRatio || 1;
  const cssPixels = Math.max(1, cssWidth * cssHeight);
  const budgetDpr = Math.sqrt(MAX_CANVAS_BACKING_PIXELS / cssPixels);
  return Math.max(1, Math.min(nativeDpr, MAX_CANVAS_DPR, budgetDpr));
}

function computeResponsiveMapRect(): { x: number; y: number; w: number; h: number } {
  const topBarH = 58;
  const statusBarH = 36;
  const edge = 10;
  const buildMenu = document.querySelector<HTMLElement>('#build-menu');
  const infoPanel = document.querySelector<HTMLElement>('#info-panel');
  const buildW = buildMenu?.offsetWidth ?? 200;
  const infoVisible = infoPanel && infoPanel.style.display !== 'none';
  const infoW = infoVisible ? (infoPanel?.offsetWidth ?? 260) : 0;
  const availableW = mapView.width;

  const stacked = availableW < 1280;
  const x = stacked ? edge : buildW + edge * 2;
  const y = topBarH;
  const rightInset = stacked ? edge : infoW + edge * 2;
  const w = Math.max(320, availableW - x - rightInset);
  const h = Math.max(240, mapView.height - topBarH - statusBarH);
  return { x, y, w, h };
}

/**
 * Apply the current fit transform to every cached raw ring, producing
 * Path2D objects for rendering, per-region screen-ring lists for
 * secondary overlays (flashes, snap indicators), and screen-space gas
 * corridors. Called on resize.
 */
function rebuildPaths(): void {
  const fit = mapView.fitTransform;
  mapView.regionPaths = [];
  mapView.regionsById = new Map();

  for (const raw of rawRegions) {
    const path = new Path2D();
    const screenRings: Array<Array<{ x: number; y: number }>> = [];
    for (const ring of raw.rawRings) {
      const screenRing = ring.map(p => applyFit(p, fit));
      screenRings.push(screenRing);
      if (screenRing.length === 0) continue;
      path.moveTo(screenRing[0].x, screenRing[0].y);
      for (let i = 1; i < screenRing.length; i++) path.lineTo(screenRing[i].x, screenRing[i].y);
      path.closePath();
    }

    const outer = raw.largestPolyOuter.map(p => applyFit(p, fit));
    const centroid = applyFit(raw.rawCentroid, fit);

    const region: Region = {
      id: raw.id,
      code: raw.code,
      name: raw.name,
      polygon: outer,
      rings: screenRings,
      bonuses: configToBonuses(raw.config),
      centroid
    };

    mapView.regionPaths.push({ id: raw.id, path, rings: screenRings, config: raw.config, region });
    mapView.regionsById.set(raw.id, region);
  }

  gasCorridorScreenPaths = rawGasCorridors.map(c => ({
    name: c.name,
    pts: c.rawPts.map(p => applyFit(p, fit))
  }));
}

/**
 * Hit-test the given screen coordinate against all region Path2Ds using
 * the browser's non-zero winding rule. Returns the first matching region
 * id or null. Cheap enough to call on every mousemove.
 */
export function hitTest(mx: number, my: number): string | null {
  const ctx = mapView.ctx;
  if (!ctx) return null;
  const px = mx * mapView.dpr;
  const py = my * mapView.dpr;
  for (const rp of mapView.regionPaths) {
    if (ctx.isPointInPath(rp.path, px, py)) return rp.id;
  }
  return null;
}

/** Named alias matching the brief's `hitTestRegion` signature. */
export function hitTestRegion(mx: number, my: number): string | null {
  return hitTest(mx, my);
}

/** Look up a full projected Region by id (used by UI/renderer code). */
export function getRegion(regionId: string): Region | undefined {
  return mapView.regionsById.get(regionId);
}

/**
 * Expose the real (lon, lat) centroid read from GeoJSON. Needed by the
 * weather and day/night models which work in real-world coordinates.
 */
export function getRegionCentroidLL(regionId: string): { lon: number; lat: number } | null {
  const raw = rawRegions.find(r => r.id === regionId);
  return raw ? raw.centroidLL : null;
}

/** Stable ordering used by anything that wants to iterate all regions. */
export function getAllRegionIds(): string[] {
  return rawRegions.map(r => r.id);
}

/**
 * Screen-space centroid of a region, used as the "one point" of the
 * region for pipe endpoints, build positions, particle origins, etc.
 * Returns [0,0] for unknown ids rather than throwing.
 */
export function getCenter(regionId: string): [number, number] {
  const r = mapView.regionsById.get(regionId);
  if (!r) return [0, 0];
  return [r.centroid.x, r.centroid.y];
}

/**
 * Distance between two region centroids, expressed in kilometres. Uses
 * the current fit scale to convert screen pixels back to metres, so the
 * result stays stable across window sizes and drives consistent pipe
 * costs regardless of zoom.
 */
export function distanceBetween(id1: string, id2: string): number {
  const c1 = getCenter(id1);
  const c2 = getCenter(id2);
  const dx = c1[0] - c2[0];
  const dy = c1[1] - c2[1];
  const pxDist = Math.sqrt(dx * dx + dy * dy);
  return pxDist * mapView.kmPerPx;
}
