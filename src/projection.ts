// Lambert-93 (RGF93 / Lambert-93, EPSG:2154) — France's official conic
// conformal projection. Implemented from the IGN reference parameters so
// we don't need to pull in a PROJ.4 / d3-geo dependency for 13 polygons.

const DEG = Math.PI / 180;

// Official Lambert-93 parameters
const LON0 = 3 * DEG;         // central meridian: 3°E
const LAT0 = 46.5 * DEG;      // latitude of origin: 46.5°N
const LAT1 = 44 * DEG;        // standard parallel 1
const LAT2 = 49 * DEG;        // standard parallel 2
const X0 = 700_000;           // false easting (m)
const Y0 = 6_600_000;         // false northing (m)

// GRS80 ellipsoid (used by RGF93)
const A = 6_378_137;
const E2 = 0.00669437999014;
const E = Math.sqrt(E2);

/**
 * Isometric latitude — a conformal-latitude helper required by Lambert
 * conic conformal. Argument is in radians. The formula is the IGN
 * reference expression for an ellipsoidal projection.
 */
function isoLat(lat: number): number {
  const s = E * Math.sin(lat);
  return Math.log(Math.tan(Math.PI / 4 + lat / 2) * Math.pow((1 - s) / (1 + s), E / 2));
}

// Derived constants (computed once)
const M1 = Math.cos(LAT1) / Math.sqrt(1 - E2 * Math.sin(LAT1) ** 2);
const M2 = Math.cos(LAT2) / Math.sqrt(1 - E2 * Math.sin(LAT2) ** 2);
const T0 = Math.exp(-isoLat(LAT0));
const T1 = Math.exp(-isoLat(LAT1));
const T2 = Math.exp(-isoLat(LAT2));
const N = Math.log(M1 / M2) / Math.log(T1 / T2);
const F = M1 / (N * Math.pow(T1, N));
const RHO0 = A * F * Math.pow(T0, N);

export interface Point { x: number; y: number; }

/**
 * Project (longitude°, latitude°) WGS84/RGF93 → Lambert-93 planar metres.
 * Output units are metres in EPSG:2154. Works for any lon/lat but only
 * accurate over metropolitan France (its domain of definition).
 */
export function project(lon: number, lat: number): Point {
  const t = Math.exp(-isoLat(lat * DEG));
  const rho = A * F * Math.pow(t, N);
  const theta = N * (lon * DEG - LON0);
  const x = X0 + rho * Math.sin(theta);
  const y = Y0 + RHO0 - rho * Math.cos(theta);
  return { x, y };
}

/**
 * Inverse of {@link project}: Lambert-93 metres → (lon°, lat°). Isometric
 * latitude has no closed-form inverse, so we iterate (8 fixed-point steps
 * easily converges to sub-millimetre precision over France).
 */
export function unproject(x: number, y: number): { lon: number; lat: number; } {
  const dx = x - X0;
  const dy = RHO0 - (y - Y0);
  const rho = Math.sign(N) * Math.sqrt(dx * dx + dy * dy);
  const theta = Math.atan2(dx, dy);
  const t = Math.pow(rho / (A * F), 1 / N);

  let lat = Math.PI / 2 - 2 * Math.atan(t);
  for (let i = 0; i < 8; i++) {
    const s = E * Math.sin(lat);
    lat = Math.PI / 2 - 2 * Math.atan(t * Math.pow((1 - s) / (1 + s), -E / 2));
  }
  const lon = theta / N + LON0;
  return { lon: lon / DEG, lat: lat / DEG };
}

export interface FitTransform {
  scale: number;
  tx: number;
  ty: number;
  // Apply: sx = p.x * scale + tx ; sy = -p.y * scale + ty (Y flipped for canvas)
}

/**
 * Apply a precomputed fit transform to a single projected point. Y is
 * negated because canvas Y grows downward while Lambert-93 Y grows north.
 */
export function applyFit(p: Point, f: FitTransform): Point {
  return { x: p.x * f.scale + f.tx, y: -p.y * f.scale + f.ty };
}

/**
 * Walk every projected coordinate once to find a bounding box, then return
 * the uniform-scale + translate transform that fits it into the given
 * canvas rect (minus padding on each side). Used to re-place the map on
 * window resize without re-projecting every ring.
 */
export function fitToCanvas(
  projectedPolygons: Iterable<Point[]>,
  canvasX: number,
  canvasY: number,
  canvasW: number,
  canvasH: number,
  padding: number
): FitTransform {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const ring of projectedPolygons) {
    for (const p of ring) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  const w = maxX - minX;
  const h = maxY - minY;
  const availW = canvasW - padding * 2;
  const availH = canvasH - padding * 2;
  const scale = Math.min(availW / w, availH / h);
  const drawnW = w * scale;
  const drawnH = h * scale;
  const tx = canvasX + padding + (availW - drawnW) / 2 - minX * scale;
  // Canvas Y grows downward; Lambert Y grows north. Flip and re-anchor.
  const ty = canvasY + padding + (availH - drawnH) / 2 + maxY * scale;
  return { scale, tx, ty };
}
