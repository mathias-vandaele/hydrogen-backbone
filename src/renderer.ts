import { canBuild } from './buildings';
import { drawBudgetChart, drawPriceChart } from './chart';
import {
  BUILDINGS,
  CUSTOMER_TYPES,
  MAX_PRESSURE,
  getRegionConfig,
  hslString,
  pipeColorHsl
} from './config';
import { drawGauge } from './gauge';
import { input } from './input';
import { distanceBetween, gasCorridorScreenPaths, getCenter, getRegionCentroidLL, mapView } from './map';
import { drawParticles } from './particles';
import { state } from './state';
import { fmtMoney } from './ui';
import { getSeasonalTint, getSunElevationAt, getWeatherAt } from './weather';

const render = {
  lastTime: 0,
  animPhase: 0
};

/**
 * Render one frame. Back-to-front order matters: backdrop, regions with
 * day/night shading, weather overlays (clouds, wind), seasonal tint,
 * existing gas corridors, region flashes, pipes, pipe preview, junction
 * glow, particles, buildings, customers, placement ghost, then the
 * foreground dashboard (gauge + chart). DOM tooltips live outside this
 * entirely.
 */
export function drawFrame(timestamp: number): void {
  const ctx = mapView.ctx;
  if (!ctx) return;
  const dt = timestamp - render.lastTime;
  render.lastTime = timestamp;
  render.animPhase += dt * 0.001;

  const w = mapView.width;
  const h = mapView.height;

  ctx.fillStyle = '#060a12';
  ctx.fillRect(0, 0, w, h);

  drawGrid(ctx, w, h);
  drawRegions(ctx);
  drawCloudShadows(ctx);
  drawWindStreaks(ctx);
  drawSeasonalTint(ctx, w, h);
  drawGasCorridors(ctx);
  drawRegionFlashes(ctx);
  drawPipes(ctx);
  drawPipePreview(ctx);
  drawJunctions(ctx);
  drawParticles(ctx);
  drawBuildings(ctx);
  drawCustomers(ctx);
  drawPlacementGhost(ctx);
  drawDashboard(ctx, w, h);
}

// ─── Region flashes (triggered when new customers emerge) ─────────────────
const regionFlashes = new Map<string, number>(); // regionId → start timestamp (ms)
const FLASH_MS = 1200;

/**
 * Kick off a cyan fade-out highlight over a region. Used by customers.ts
 * when a new customer materializes, so the player's eye is drawn to the
 * region even if it's off their current focus.
 */
export function triggerRegionFlash(regionId: string): void {
  regionFlashes.set(regionId, performance.now());
}

/**
 * Fill + stroke every actively-flashing region with an alpha that decays
 * to zero over FLASH_MS. Auto-evicts expired entries so the map stays O(1).
 */
function drawRegionFlashes(ctx: CanvasRenderingContext2D): void {
  const now = performance.now();
  for (const [id, start] of regionFlashes) {
    const age = now - start;
    if (age > FLASH_MS) { regionFlashes.delete(id); continue; }
    const t = 1 - age / FLASH_MS;
    const rp = mapView.regionPaths.find(p => p.id === id);
    if (!rp) continue;
    ctx.save();
    ctx.fillStyle = `rgba(6,214,160,${0.35 * t})`;
    ctx.fill(rp.path);
    ctx.shadowColor = `rgba(6,214,160,${0.8 * t})`;
    ctx.shadowBlur = 28 * t;
    ctx.lineWidth = 2 + t * 2;
    ctx.strokeStyle = `rgba(180,255,230,${0.9 * t})`;
    ctx.stroke(rp.path);
    ctx.restore();
  }
}

// ─── Dashboard: in-canvas gauge + chart (bottom-right) ───────────────────

/**
 * Anchor the pressure gauge and the price/pressure area chart in the
 * bottom-right of the canvas, above the DOM status bar. Sizes are fixed
 * (radius 60, chart 220×78) — if the canvas is narrower than that, they'll
 * overlap, but the HUD enforces a minimum useful window size.
 */
function drawDashboard(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const gaugeRadius = 60;
  const margin = 14;
  const bottomBar = 36;
  const gaugeCX = w - margin - gaugeRadius;
  const gaugeCY = h - bottomBar - margin - gaugeRadius;
  drawGauge(ctx, gaugeCX, gaugeCY, gaugeRadius, state.networkPressure, 0, MAX_PRESSURE);

  // Price trajectory chart — thresholds + projection (unchanged).
  const chartW = 340;
  const chartH = 110;
  const chartX = gaugeCX - gaugeRadius - 12 - chartW;
  const chartY = h - bottomBar - margin - chartH;
  drawPriceChart(ctx, chartX, chartY, chartW, chartH, 90, 120);

  // v4 Budget history chart — stacked above the price chart. Seeing the
  // budget line approach the red bankruptcy floor is the visceral
  // feedback loop scarcity needs.
  const budgetH = 70;
  const budgetY = chartY - budgetH - 8;
  drawBudgetChart(ctx, chartX, budgetY, chartW, budgetH, 180);
}

// ─── Placement ghost (floating icon while in build mode) ─────────────────

/**
 * Render a semi-transparent icon that follows the cursor while a building
 * is selected for placement. Snaps to the hovered region's centroid when
 * the placement is valid (green ring), stays at the mouse with a red
 * ring when not. No-op in pipeline mode — the pipe preview handles that.
 */
function drawPlacementGhost(ctx: CanvasRenderingContext2D): void {
  if (!input.buildMode || input.buildMode === 'pipeline') return;
  const type = input.buildMode;
  const cfg = BUILDINGS[type];
  const hoveredRegion = mapView.hoveredRegion;
  const valid = !!hoveredRegion && canBuild(type, hoveredRegion);

  ctx.save();
  ctx.globalAlpha = 0.8;

  // Snap the ghost to the hovered region's centroid when valid.
  let gx = input.mx;
  let gy = input.my;
  if (valid && hoveredRegion) {
    const c = getCenter(hoveredRegion);
    // Offset slightly so the icon doesn't obscure the label
    gx = c[0] + 16;
    gy = c[1] + 16;
    // Draw snap target ring on the centroid
    ctx.save();
    ctx.strokeStyle = 'rgba(6,214,160,0.65)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(c[0], c[1], 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Tint ring behind the ghost (green valid, red invalid)
  const ringColor = valid ? 'rgba(6,214,160,0.55)' : 'rgba(239,68,68,0.65)';
  ctx.fillStyle = valid ? 'rgba(6,214,160,0.12)' : 'rgba(239,68,68,0.15)';
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(gx, gy, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.shadowColor = ringColor;
  ctx.shadowBlur = 12;
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = valid ? '#e0e7ff' : '#fecaca';
  ctx.fillText(cfg.icon, gx, gy);

  ctx.restore();
}

// ─── Grid backdrop ────────────────────────────────────────────────────────

/**
 * Faint 40px grid over the entire canvas, drawn before regions so the
 * region fills sit on top. Pure decoration — gives the scene a scale
 * reference and an "industrial control room" feel.
 */
function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.strokeStyle = 'rgba(30,58,95,0.15)';
  ctx.lineWidth = 0.5;
  const spacing = 40;
  for (let x = 0; x < w; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

// ─── Regions (with per-region day/night darken) ──────────────────────────

/**
 * Render every region polygon with four composited layers per region:
 * base fill (dark steel, brighter if hovered/selected), supply-intensity
 * cyan tint, per-region day/night darkening from sun elevation, and
 * outline. Overlays the region's abbreviation label and a small
 * pressure-bar readout for connected regions.
 */
function drawRegions(ctx: CanvasRenderingContext2D): void {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  for (const rp of mapView.regionPaths) {
    const rs = state.regions[rp.id];
    const isHovered = mapView.hoveredRegion === rp.id;
    const isSelected = mapView.selectedRegion === rp.id;

    // Base fill
    if (isSelected) ctx.fillStyle = 'rgba(6,214,160,0.18)';
    else if (isHovered) ctx.fillStyle = 'rgba(6,214,160,0.09)';
    else ctx.fillStyle = rp.config.color;
    ctx.fill(rp.path);

    // Supply/demand tint
    if (rs.supply > 0 && rs.pipeConnections > 0) {
      const intensity = Math.min(0.15, rs.supply / 50000 * 0.15);
      ctx.fillStyle = `rgba(6,214,160,${intensity})`;
      ctx.fill(rp.path);
    }

    // Slot fill brighten (Priority 4): each customer in this region adds a
    // warm glow; a fully-saturated region visibly lights up at night.
    const fill = slotFillRatio(rp.id);
    if (fill > 0) {
      ctx.fillStyle = `rgba(251, 191, 36, ${0.04 + 0.18 * fill})`;
      ctx.fill(rp.path);
    }

    // Day/night: darken based on the region centroid's illumination
    const centroid = rp.region.centroid;
    // Find the centroid longitude from the raw feature. We don't have it
    // directly, but we can approximate from the centroid X vs map span;
    // weather module already computes sun elev from real lon, so we look it
    // up via getWeatherAt-style helper. However weather only exposes sample
    // fields, not lon. Instead, approximate lon by inverting the fit — but
    // that requires full unproject. Simpler: store lon on the region.
    const lon = regionLon(rp.id);
    const elev = getSunElevationAt(lon);
    // Map elev (-1..1) → darkness (0 daylight, ~0.55 midnight)
    const darkness = Math.max(0, Math.min(0.55, (0.25 - elev) * 0.7));
    if (darkness > 0.01) {
      ctx.fillStyle = `rgba(5,8,20,${darkness})`;
      ctx.fill(rp.path);
    }

    // Stroke
    ctx.strokeStyle = isSelected ? '#06d6a0' : isHovered ? 'rgba(6,214,160,0.6)' : 'rgba(30,58,95,0.55)';
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.stroke(rp.path);

    // Abbr label + pressure bar
    ctx.font = '10px Courier New';
    ctx.fillStyle = isHovered || isSelected ? '#06d6a0' : 'rgba(224,231,255,0.5)';
    ctx.textAlign = 'center';
    ctx.fillText(rp.config.abbr, centroid.x, centroid.y - 4);

    if (rs.pipeConnections > 0) {
      const pressureRatio = rs.pressure / MAX_PRESSURE;
      const barW = 26;
      const barH = 3;
      const bx = centroid.x - barW / 2;
      const by = centroid.y + 4;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(bx, by, barW, barH);
      const hsl = pipeColorHsl(pressureRatio);
      ctx.fillStyle = hslString(hsl, 0.8);
      ctx.fillRect(bx, by, barW * pressureRatio, barH);
    }
  }
}

/**
 * Returns the 0..1 occupancy of a region's customer slots (sum of all
 * slot kinds). Saturated regions visibly brighten in drawRegions.
 */
function slotFillRatio(regionId: string): number {
  const rc = getRegionConfig(regionId);
  if (!rc) return 0;
  const cap = rc.industrialSlots + rc.distributedSlots + rc.portSlots + rc.efuelSlots;
  if (cap <= 0) return 0;
  const live = state.customers.filter(c => c.active && c.regionId === regionId).length;
  return Math.min(1, live / cap);
}

// Cache region centroid longitudes — they don't change at runtime.
const regionLonCache = new Map<string, number>();

/**
 * Memoized centroid-longitude lookup so drawRegions doesn't call through
 * to the map module 13× per frame for a value that's fixed at init.
 */
function regionLon(id: string): number {
  const cached = regionLonCache.get(id);
  if (cached !== undefined) return cached;
  const ll = getRegionCentroidLL(id);
  const lon = ll ? ll.lon : 3;
  regionLonCache.set(id, lon);
  return lon;
}

// ─── Cloud shadows (drifting blurred blobs) ──────────────────────────────

/**
 * One soft dark blob per cloudy region, drifting downwind. Uses
 * `multiply` blend mode + canvas blur so the blobs darken the regions
 * beneath without leaking over the black backdrop. Skips regions with
 * cloud cover below 25% so clear weather reads as clear.
 */
function drawCloudShadows(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  // Soft shadows; the blur filter is cheap for a dozen circles.
  ctx.filter = 'blur(22px)';
  ctx.globalCompositeOperation = 'multiply';
  const drift = render.animPhase * 18;
  for (const rp of mapView.regionPaths) {
    const w = getWeatherAt(rp.id);
    if (w.clouds < 0.25) continue;
    const c = rp.region.centroid;
    const dx = Math.cos(w.windDirection) * drift;
    const dy = Math.sin(w.windDirection) * drift;
    const radius = 45 + w.clouds * 60;
    const alpha = 0.08 + w.clouds * 0.35;
    ctx.fillStyle = `rgba(10,14,28,${alpha})`;
    ctx.beginPath();
    ctx.arc(c.x + dx, c.y + dy, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ─── Wind streaks (per region with high wind) ────────────────────────────

/**
 * For each region with wind magnitude above 0.45, draw a handful of short
 * streaks oriented along its wind direction, animated by time so they
 * visibly flow. Stateless: the animation state comes entirely from
 * performance.now() — no per-streak bookkeeping needed.
 */
function drawWindStreaks(ctx: CanvasRenderingContext2D): void {
  const time = performance.now() * 0.001;
  ctx.save();
  for (const rp of mapView.regionPaths) {
    const w = getWeatherAt(rp.id);
    if (w.wind < 0.45) continue;
    const c = rp.region.centroid;
    const dirX = Math.cos(w.windDirection);
    const dirY = Math.sin(w.windDirection);
    const streakLen = 10 + w.wind * 18;
    const count = 2 + Math.floor(w.wind * 4);
    const speed = 30 + w.wind * 40;
    const alpha = Math.min(0.45, w.wind * 0.5);
    ctx.strokeStyle = `rgba(200,220,255,${alpha})`;
    ctx.lineWidth = 0.9;
    ctx.lineCap = 'round';
    for (let i = 0; i < count; i++) {
      const phase = ((time * speed + i * 50) % 80) / 80; // 0..1 cycle
      const offsetAlong = (phase - 0.5) * 70;
      // Stagger perpendicularly
      const perpX = -dirY;
      const perpY = dirX;
      const perpOffset = ((i * 19) % 40) - 20;
      const cx = c.x + dirX * offsetAlong + perpX * perpOffset;
      const cy = c.y + dirY * offsetAlong + perpY * perpOffset;
      ctx.beginPath();
      ctx.moveTo(cx - dirX * streakLen * 0.5, cy - dirY * streakLen * 0.5);
      ctx.lineTo(cx + dirX * streakLen * 0.5, cy + dirY * streakLen * 0.5);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ─── Seasonal tint (global low-alpha overlay) ────────────────────────────

/**
 * Paint the whole canvas with a very thin seasonal-tinted rectangle (blue
 * winter → green spring → amber summer → rust autumn). Sits between
 * regions/weather and pipes so the neon network isn't tinted.
 */
function drawSeasonalTint(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const tint = getSeasonalTint(state.dayOfYear);
  ctx.fillStyle = `rgba(${tint.r},${tint.g},${tint.b},0.06)`;
  ctx.fillRect(0, 0, w, h);
}

// ─── Real gas corridors (projected polylines, desaturated) ───────────────

/**
 * Stroke the hardcoded French natural-gas trunk corridors (projected to
 * screen space in map.ts). Rendered thin, dashed, desaturated — the
 * player's bright network grows visibly on top of this background.
 */
function drawGasCorridors(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(100,120,150,0.22)';
  ctx.lineWidth = 1.1;
  ctx.setLineDash([4, 6]);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const corridor of gasCorridorScreenPaths) {
    if (corridor.pts.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(corridor.pts[0].x, corridor.pts[0].y);
    for (let i = 1; i < corridor.pts.length; i++) ctx.lineTo(corridor.pts[i].x, corridor.pts[i].y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}

// ─── Pipes (3-pass bloom, HSL palette, pressure-scaled width) ────────────

/**
 * Render every pipe in three stacked strokes (wide blurred, medium
 * blurred, sharp core) so they read as glowing neon. Hue is driven by
 * pressure via the shared palette, so low-pressure pipes are red-orange
 * and high-pressure ones shift toward bright white-cyan. Midpoint
 * arrow indicates flow direction for pipes with meaningful throughput.
 */
function drawPipes(ctx: CanvasRenderingContext2D): void {
  for (const pipe of state.pipes) {
    const c1 = getCenter(pipe.fromId);
    const c2 = getCenter(pipe.toId);

    const pressureRatio = Math.max(0, Math.min(1, pipe.pressure / MAX_PRESSURE));
    const flowRatio = Math.min(1, Math.abs(pipe.flow) / pipe.maxFlow);
    const hsl = pipeColorHsl(pressureRatio);

    const baseWidth = 2 + pressureRatio * 2; // 2..4 px at full pressure

    ctx.save();
    ctx.lineCap = 'round';

    // Pass 1: wide outer glow
    ctx.shadowColor = hslString(hsl, 0.45 + pressureRatio * 0.3);
    ctx.shadowBlur = 20;
    ctx.strokeStyle = hslString(hsl, 0.12);
    ctx.lineWidth = baseWidth + 6;
    ctx.beginPath();
    ctx.moveTo(c1[0], c1[1]);
    ctx.lineTo(c2[0], c2[1]);
    ctx.stroke();

    // Pass 2: medium glow
    ctx.shadowBlur = 8;
    ctx.strokeStyle = hslString(hsl, 0.4);
    ctx.lineWidth = baseWidth + 2;
    ctx.beginPath();
    ctx.moveTo(c1[0], c1[1]);
    ctx.lineTo(c2[0], c2[1]);
    ctx.stroke();

    // Pass 3: sharp core
    ctx.shadowBlur = 0;
    const coreHsl = { h: hsl.h, s: hsl.s, l: Math.min(92, hsl.l + 18) };
    ctx.strokeStyle = hslString(coreHsl, 0.95);
    ctx.lineWidth = baseWidth;
    ctx.beginPath();
    ctx.moveTo(c1[0], c1[1]);
    ctx.lineTo(c2[0], c2[1]);
    ctx.stroke();
    ctx.restore();

    // Directional flow arrow at midpoint (only for meaningful flow)
    if (Math.abs(pipe.flow) > 10) {
      const mx = (c1[0] + c2[0]) / 2;
      const my = (c1[1] + c2[1]) / 2;
      const angle = Math.atan2(c2[1] - c1[1], c2[0] - c1[0]);
      const dir = pipe.flow > 0 ? 1 : -1;
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(angle * dir);
      ctx.fillStyle = hslString(coreHsl, 0.75);
      ctx.beginPath();
      ctx.moveTo(6 + flowRatio * 2, 0);
      ctx.lineTo(-3, -3);
      ctx.lineTo(-3, 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}

// ─── Junction glow (pulsing discs where ≥3 pipes meet) ───────────────────

/**
 * Draw a pulsing disc at any region that hosts 3+ pipe connections — the
 * topological hubs of the network. Hue tracks the local pressure color
 * so busy junctions read as hot, idle ones as cool.
 */
function drawJunctions(ctx: CanvasRenderingContext2D): void {
  for (const rp of mapView.regionPaths) {
    const rs = state.regions[rp.id];
    if (rs.pipeConnections < 3) continue;
    const c = rp.region.centroid;
    const pressureRatio = Math.max(0, Math.min(1, rs.pressure / MAX_PRESSURE));
    const hsl = pipeColorHsl(pressureRatio);
    const pulse = 0.6 + 0.4 * Math.sin(render.animPhase * 2.5);
    ctx.save();
    ctx.shadowColor = hslString(hsl, 0.7);
    ctx.shadowBlur = 18;
    ctx.fillStyle = hslString(hsl, 0.25 * pulse);
    ctx.beginPath();
    ctx.arc(c.x, c.y, 8 + pulse * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = hslString({ ...hsl, l: Math.min(95, hsl.l + 25) }, 0.85 * pulse);
    ctx.beginPath();
    ctx.arc(c.x, c.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ─── Pipe preview (dashed line while placing, with snap indicator) ───────

/**
 * While the player is mid-way through placing a pipeline (first endpoint
 * picked, second endpoint not yet), draw a dashed preview from the start
 * region's centroid to the mouse. When the cursor is over a different
 * region, snap the end to that region's centroid, draw a glowing target
 * disc, and label the midpoint with the computed length + cost.
 */
function drawPipePreview(ctx: CanvasRenderingContext2D): void {
  if (input.buildMode !== 'pipeline' || !input.pipeStart) return;

  const start = getCenter(input.pipeStart);
  const snapped = mapView.hoveredRegion && mapView.hoveredRegion !== input.pipeStart;
  const endX = snapped ? getCenter(mapView.hoveredRegion!)[0] : input.mx;
  const endY = snapped ? getCenter(mapView.hoveredRegion!)[1] : input.my;

  ctx.save();
  ctx.strokeStyle = snapped ? 'rgba(6,214,160,0.85)' : 'rgba(6,214,160,0.45)';
  ctx.lineWidth = snapped ? 2.5 : 2;
  ctx.setLineDash([8, 4]);
  ctx.beginPath();
  ctx.moveTo(start[0], start[1]);
  ctx.lineTo(endX, endY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Snap target ring on the hovered centroid
  if (snapped) {
    ctx.strokeStyle = 'rgba(6,214,160,0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(endX, endY, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowColor = 'rgba(6,214,160,0.6)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = 'rgba(6,214,160,0.9)';
    ctx.beginPath();
    ctx.arc(endX, endY, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Pulsing ring at the start
  const pulse = 0.6 + 0.4 * Math.sin(render.animPhase * 4);
  ctx.save();
  ctx.strokeStyle = `rgba(6,214,160,${0.4 + pulse * 0.4})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(start[0], start[1], 10 + pulse * 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  if (snapped) {
    const dist = distanceBetween(input.pipeStart, mapView.hoveredRegion!);
    const cfg = BUILDINGS.pipeline;
    const fromCfg = getRegionConfig(input.pipeStart);
    const toCfg = getRegionConfig(mapView.hoveredRegion!);
    if (!fromCfg || !toCfg) return;
    const infraDiscount = 1.0 - (Math.min(fromCfg.gasInfra, toCfg.gasInfra) * 0.4);
    const cost = Math.round(cfg.baseCostPerKm * dist * infraDiscount);

    const mx = (start[0] + endX) / 2;
    const my = (start[1] + endY) / 2;
    ctx.font = '11px Courier New';
    ctx.fillStyle = 'rgba(6,214,160,0.95)';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(dist)}km — €${fmtMoney(cost)}`, mx, my - 8);
  }
}

// ─── Buildings ───────────────────────────────────────────────────────────

/**
 * Render each placed Hydrogen Plant as a composite: the generator icon on
 * the left, a small internal "electrolyzer" bracket on the right, and a
 * pulsing electricity particle traveling from generator → electrolyzer
 * → hydrogen-output. This visually teaches that conversion is internal
 * and only hydrogen leaves the plant.
 */
function drawBuildings(ctx: CanvasRenderingContext2D): void {
  for (const b of state.buildings) {
    const cfg = BUILDINGS[b.type];

    // Per-plant palette
    let genColor = '#ffffff';
    let genGlow = 'rgba(255,255,255,0.1)';
    if (b.type === 'solarPlant') {
      genColor = '#fbbf24';
      genGlow = b.production > 0 ? 'rgba(251,191,36,0.4)' : 'rgba(251,191,36,0.1)';
    } else if (b.type === 'windPlant') {
      genColor = '#e2e8f0';
      genGlow = b.production > 0 ? 'rgba(226,232,240,0.3)' : 'rgba(226,232,240,0.1)';
    } else if (b.type === 'nuclearPlant') {
      genColor = '#a78bfa';
      genGlow = 'rgba(167,139,250,0.3)';
    }

    ctx.save();
    ctx.translate(b.x, b.y);

    // Generator icon (left half of the plant).
    if (b.production > 0) {
      ctx.shadowColor = genGlow;
      ctx.shadowBlur = 8;
    }
    ctx.fillStyle = genColor;
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cfg.icon, -8, 0);
    ctx.shadowBlur = 0;

    // Electrolyzer bracket (right half). Ring + internal dot hinting at
    // an electrolyzer stack. Bright when producing, dim when idle.
    const elGlow = b.production > 0 ? 'rgba(6,214,160,0.55)' : 'rgba(6,214,160,0.18)';
    ctx.strokeStyle = elGlow;
    ctx.fillStyle = b.production > 0 ? 'rgba(6,214,160,0.8)' : 'rgba(6,214,160,0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(8, 0, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(8, 0, 1.6, 0, Math.PI * 2);
    ctx.fill();

    // Internal electron pulse: a small dot traveling left→right from
    // generator to electrolyzer repeatedly. Only draw when producing so
    // idle plants read clearly as idle.
    if (b.production > 0) {
      const phase = (render.animPhase * 1.6 + (b.id * 0.17)) % 1; // 0..1
      const px = -6 + phase * 12;
      ctx.fillStyle = 'rgba(255,220,120,0.9)';
      ctx.shadowColor = 'rgba(255,220,120,0.8)';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(px, 0, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // H₂ output tick on the right edge, glows when producing.
    ctx.fillStyle = b.production > 0 ? 'rgba(6,214,160,0.9)' : 'rgba(6,214,160,0.3)';
    ctx.font = '7px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('H₂', 14, 0);
    ctx.restore();
  }
}

// ─── Customers ───────────────────────────────────────────────────────────

/**
 * Render each active customer as a pulsing circle with its archetype icon
 * and brand color. Pulse phase is salted by customer id so they pulse
 * asynchronously rather than all blinking in unison.
 */
function drawCustomers(ctx: CanvasRenderingContext2D): void {
  for (const c of state.customers) {
    if (!c.active) continue;
    const cfg = CUSTOMER_TYPES[c.type];
    const scale = c.scale || 1;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(scale, scale);
    const pulse = 0.8 + Math.sin(render.animPhase * 3 + c.id) * 0.2;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fillStyle = cfg.color + '30';
    ctx.fill();
    ctx.strokeStyle = cfg.color + (c.satisfaction > 0.5 ? '80' : '40');
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = cfg.color;
    ctx.globalAlpha = pulse;
    ctx.fillText(cfg.icon, 0, 0);
    ctx.restore();
  }
}

// (Canvas hover tooltip and sparkline replaced by DOM tooltip + in-canvas
// area chart and gauge; see ui.ts and drawDashboard above.)
