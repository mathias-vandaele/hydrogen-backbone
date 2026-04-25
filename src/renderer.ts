import { canBuild } from './buildings';
import {
  BUILDINGS,
  CUSTOMER_TYPES,
  MAX_PRESSURE,
  getRegionConfig
} from './config';
import { COLOR, GLOW, TEXTURE, TYPE, canvasFont, generateNoiseDataURL, pressureColor, withAlpha } from './design-system';
import { drawGauge } from './gauge';
import { drawIcon } from './icons';
import { input } from './input';
import { distanceBetween, gasCorridorScreenPaths, getCenter, mapView } from './map';
import { applyFit, project as lambertProject } from './projection';
import { state } from './state';
import { fmtMoney } from './ui';

const render = {
  lastTime: 0,
  animPhase: 0
};

let noiseImage: HTMLImageElement | null = null;
let noisePattern: CanvasPattern | null = null;
let noiseReady = false;

/**
 * Render one frame. Back-to-front order matters: backdrop, seasonal
 * atmosphere, regions, existing gas corridors, region flashes, pipes,
 * pipe preview, junction glow, buildings, customers, placement ghost,
 * then the foreground dashboard (gauge + chart). DOM tooltips live
 * outside this entirely.
 */
export function drawFrame(timestamp: number): void {
  const ctx = mapView.ctx;
  if (!ctx) return;
  const dt = timestamp - render.lastTime;
  render.lastTime = timestamp;
  render.animPhase += dt * 0.001;

  const w = mapView.width;
  const h = mapView.height;

  ctx.fillStyle = COLOR.SURFACE_DEEP;
  ctx.fillRect(0, 0, w, h);

  drawSeasonAtmosphere(ctx, w, h);
  drawMapPlate(ctx);
  drawGrid(ctx);
  drawRegions(ctx);
  drawGasCorridors(ctx);
  drawRegionFlashes(ctx);
  drawPipes(ctx);
  drawPipePreview(ctx);
  drawJunctions(ctx);
  drawBuildings(ctx);
  drawSaltCaverns(ctx);
  drawCustomers(ctx);
  drawPlacementGhost(ctx);
  drawMapFurniture(ctx, w, h);
  drawDashboard(ctx, w, h);
  drawTextureOverlay(ctx, w, h);
}

// ─── Seasonal atmosphere ─────────────────────────────────────────────────

/**
 * Slow-moving material light wash behind the map. This keeps the world
 * breathing without returning to the old sci-fi cyan weather tint.
 */
function drawSeasonAtmosphere(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const phase = render.animPhase * 0.06;
  const driftX = Math.sin(phase) * w * 0.08;
  const driftY = Math.cos(phase * 0.7) * h * 0.06;

  ctx.save();

  const primary = ctx.createRadialGradient(
    w * 0.26 + driftX,
    h * 0.22 + driftY,
    0,
    w * 0.26 + driftX,
    h * 0.22 + driftY,
    Math.max(w, h) * 0.7
  );
  primary.addColorStop(0, withAlpha(COLOR.AMBER_DIM, 0.09));
  primary.addColorStop(0.55, withAlpha(COLOR.AMBER_BASE, 0.04));
  primary.addColorStop(1, withAlpha(COLOR.SURFACE_DEEP, 0));
  ctx.fillStyle = primary;
  ctx.fillRect(0, 0, w, h);

  const secondary = ctx.createRadialGradient(
    w * 0.78 - driftX * 0.6,
    h * 0.78 - driftY * 0.5,
    0,
    w * 0.78 - driftX * 0.6,
    h * 0.78 - driftY * 0.5,
    Math.max(w, h) * 0.62
  );
  secondary.addColorStop(0, withAlpha(COLOR.TEAL_DIM, 0.045));
  secondary.addColorStop(0.7, withAlpha(COLOR.SURFACE_RAISED, 0.035));
  secondary.addColorStop(1, withAlpha(COLOR.SURFACE_DEEP, 0));
  ctx.fillStyle = secondary;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = withAlpha(COLOR.SURFACE_BASE, 0.08);
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// ─── Map plate ───────────────────────────────────────────────────────────

/**
 * The geography sits on a distinct drafting plate instead of dissolving
 * into the app background. This is not a floating card; it is the map's
 * physical substrate, giving the land mass enough value contrast to read.
 */
function drawMapPlate(ctx: CanvasRenderingContext2D): void {
  const { mapX: x, mapY: y, mapW: w, mapH: h } = mapView;
  if (w <= 0 || h <= 0) return;

  ctx.save();
  ctx.fillStyle = withAlpha(COLOR.SURFACE_BASE, 0.82);
  ctx.fillRect(x, y, w, h);

  const wash = ctx.createLinearGradient(x, y, x + w, y + h);
  wash.addColorStop(0, withAlpha(COLOR.SURFACE_RAISED, 0.18));
  wash.addColorStop(0.48, withAlpha(COLOR.SURFACE_BASE, 0.02));
  wash.addColorStop(1, withAlpha(COLOR.SURFACE_DEEP, 0.24));
  ctx.fillStyle = wash;
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = withAlpha(COLOR.SURFACE_BORDER, 0.95);
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  ctx.strokeStyle = withAlpha(COLOR.TYPE_TERTIARY, 0.18);
  ctx.lineWidth = 0.5;
  const tick = 8;
  for (let tx = x + 24; tx < x + w - 24; tx += 48) {
    ctx.beginPath();
    ctx.moveTo(tx, y);
    ctx.lineTo(tx, y + tick);
    ctx.moveTo(tx, y + h);
    ctx.lineTo(tx, y + h - tick);
    ctx.stroke();
  }
  for (let ty = y + 24; ty < y + h - 24; ty += 48) {
    ctx.beginPath();
    ctx.moveTo(x, ty);
    ctx.lineTo(x + tick, ty);
    ctx.moveTo(x + w, ty);
    ctx.lineTo(x + w - tick, ty);
    ctx.stroke();
  }

  ctx.restore();
}

// ─── Region flashes (triggered when new customers emerge) ─────────────────
const regionFlashes = new Map<string, number>(); // regionId → start timestamp (ms)
const FLASH_MS = 1200;

/**
 * Kick off an amber fade-out highlight over a region. Used by customers.ts
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
    ctx.fillStyle = withAlpha(COLOR.AMBER_BASE, 0.28 * t);
    ctx.fill(rp.path);
    ctx.shadowColor = withAlpha(COLOR.AMBER_BRIGHT, 0.7 * t);
    ctx.shadowBlur = GLOW.MEDIUM.blur * 2.2 * t;
    ctx.lineWidth = 2 + t * 2;
    ctx.strokeStyle = withAlpha(COLOR.AMBER_GLOW, 0.9 * t);
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
}

// ─── Placement ghost (floating icon while in build mode) ─────────────────

/**
 * Render a semi-transparent icon that follows the cursor while a building
 * is selected for placement. Snaps to the hovered region's centroid when
 * the placement is valid, stays at the mouse with a rust ring when not.
 * No-op in pipeline mode — the pipe preview handles that.
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
    ctx.strokeStyle = withAlpha(COLOR.AMBER_BASE, 0.65);
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(c[0], c[1], 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Tint ring behind the ghost (amber valid, rust invalid)
  const ringColor = valid ? withAlpha(COLOR.AMBER_BASE, 0.55) : withAlpha(COLOR.RUST_BASE, 0.65);
  ctx.fillStyle = valid ? withAlpha(COLOR.AMBER_BASE, 0.12) : withAlpha(COLOR.RUST_BASE, 0.15);
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(gx, gy, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.shadowColor = ringColor;
  ctx.shadowBlur = 12;
  drawIcon(ctx, cfg.icon, gx, gy, 18, valid ? COLOR.TYPE_PRIMARY : COLOR.RUST_BRIGHT);

  ctx.restore();
}

// ─── Grid backdrop ────────────────────────────────────────────────────────

/**
 * Faint 40px grid over the entire canvas, drawn before regions so the
 * region fills sit on top. Pure decoration — gives the scene a scale
 * reference and an "industrial control room" feel.
 */
function drawGrid(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(mapView.mapX, mapView.mapY, mapView.mapW, mapView.mapH);
  ctx.clip();
  ctx.strokeStyle = withAlpha(COLOR.SURFACE_BORDER, 0.28);
  ctx.lineWidth = 0.5;
  const spacing = 40;
  for (let x = mapView.mapX; x < mapView.mapX + mapView.mapW; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, mapView.mapY);
    ctx.lineTo(x, mapView.mapY + mapView.mapH);
    ctx.stroke();
  }
  for (let y = mapView.mapY; y < mapView.mapY + mapView.mapH; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(mapView.mapX, y);
    ctx.lineTo(mapView.mapX + mapView.mapW, y);
    ctx.stroke();
  }
  ctx.restore();
}

// ─── Regions ──────────────────────────────────────────────────────────────

/**
 * Render every region polygon with base fill, supply-intensity amber tint,
 * slot-fill warm tint, and outline. Overlays the region's abbreviation
 * label and a small pressure-bar readout for connected regions.
 */
function drawRegions(ctx: CanvasRenderingContext2D): void {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  for (const rp of mapView.regionPaths) {
    const rs = state.regions[rp.id];
    const isHovered = mapView.hoveredRegion === rp.id;
    const isSelected = mapView.selectedRegion === rp.id;

    // Base fill: land is deliberately raised above the drafting plate so
    // the map reads at a glance even before any network is built.
    ctx.save();
    ctx.shadowColor = withAlpha(COLOR.SURFACE_DEEP, 0.55);
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = withAlpha(COLOR.SURFACE_RAISED, isHovered ? 1 : 0.9);
    ctx.fill(rp.path);
    ctx.restore();

    if (isSelected || isHovered) {
      ctx.fillStyle = isSelected ? withAlpha(COLOR.AMBER_BASE, 0.24) : withAlpha(COLOR.TYPE_PRIMARY, 0.04);
      ctx.fill(rp.path);
    }

    // Supply/demand tint
    if (rs.supply > 0 && rs.pipeConnections > 0) {
      const intensity = Math.min(0.15, rs.supply / 50000 * 0.15);
      ctx.fillStyle = withAlpha(COLOR.AMBER_BASE, intensity);
      ctx.fill(rp.path);
    }

    // Slot fill brighten (Priority 4): each customer in this region adds a
    // warm glow; a fully-saturated region visibly lights up at night.
    const fill = slotFillRatio(rp.id);
    if (fill > 0) {
      ctx.fillStyle = withAlpha(COLOR.AMBER_BASE, 0.04 + 0.18 * fill);
      ctx.fill(rp.path);
    }

    const centroid = rp.region.centroid;

    // Stroke
    ctx.strokeStyle = withAlpha(COLOR.SURFACE_DEEP, 0.85);
    ctx.lineWidth = isSelected ? 3.2 : 2.4;
    ctx.stroke(rp.path);
    ctx.strokeStyle = isSelected
      ? COLOR.AMBER_BRIGHT
      : isHovered ? withAlpha(COLOR.AMBER_BASE, 0.8) : withAlpha(COLOR.TYPE_TERTIARY, 0.7);
    ctx.lineWidth = isSelected ? 1.6 : 0.9;
    ctx.stroke(rp.path);

    // Region label + pressure bar
    drawRegionLabel(ctx, rp.config.name, centroid.x, centroid.y - 6, isHovered || isSelected);

    if (rs.pipeConnections > 0) {
      const pressureRatio = rs.pressure / MAX_PRESSURE;
      const barW = 26;
      const barH = 3;
      const bx = centroid.x - barW / 2;
      const by = centroid.y + 4;
      ctx.fillStyle = withAlpha(COLOR.SURFACE_DEEP, 0.72);
      ctx.fillRect(bx, by, barW, barH);
      ctx.fillStyle = pressureColor(pressureRatio, 0.85);
      ctx.fillRect(bx, by, barW * pressureRatio, barH);
    }
  }
}

function drawRegionLabel(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, active: boolean): void {
  const labelBreaks: Record<string, string[]> = {
    'Auvergne-Rhône-Alpes': ['Auvergne-Rhône', 'Alpes'],
    'Bourgogne-Franche-Comté': ['Bourgogne', 'Franche-Comté'],
    'Centre-Val de Loire': ['Centre-Val', 'de Loire'],
    'Nouvelle-Aquitaine': ['Nouvelle', 'Aquitaine'],
    "Provence-Alpes-Côte d'Azur": ['Provence-Alpes', "Côte d'Azur"]
  };
  const lines = labelBreaks[name] ?? [name];
  const longest = Math.max(...lines.map(line => line.length));
  const lineHeight = longest > 17 ? 9 : 10;

  ctx.save();
  ctx.font = canvasFont(longest > 17 ? '9px' : TYPE.SIZE.MICRO, 'mono', 'MEDIUM');
  ctx.fillStyle = active ? COLOR.AMBER_BASE : withAlpha(COLOR.TYPE_SECONDARY, 0.62);
  ctx.strokeStyle = withAlpha(COLOR.SURFACE_DEEP, 0.72);
  ctx.lineWidth = 3;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((line, index) => {
    const ly = y + (index - (lines.length - 1) / 2) * lineHeight;
    ctx.strokeText(line, x, ly);
    ctx.fillText(line, x, ly);
  });
  ctx.restore();
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

// ─── Real gas corridors (projected polylines, desaturated) ───────────────

/**
 * Stroke the hardcoded French natural-gas trunk corridors (projected to
 * screen space in map.ts). Rendered thin, dashed, desaturated — the
 * player's bright network grows visibly on top of this background.
 */
function drawGasCorridors(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.strokeStyle = withAlpha(COLOR.SURFACE_BORDER, 0.35);
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

// ─── Pipes (3-pass bloom, token palette, pressure-scaled width) ──────────

/**
 * Render every pipe in three stacked strokes (wide blurred, medium
 * blurred, sharp core). Color is driven by pressure via the design system,
 * so low-pressure pipes rust toward starvation and healthy ones glow amber.
 * Midpoint
 * arrow indicates flow direction for pipes with meaningful throughput.
 */
function drawPipes(ctx: CanvasRenderingContext2D): void {
  for (const pipe of state.pipes) {
    const c1 = getCenter(pipe.fromId);
    const c2 = getCenter(pipe.toId);

    const pressureRatio = Math.max(0, Math.min(1, pipe.pressure / MAX_PRESSURE));
    const flowRatio = Math.min(1, Math.abs(pipe.flow) / pipe.maxFlow);
    const pipeColor = pressureColor(pressureRatio);

    const baseWidth = 2 + pressureRatio * 2; // 2..4 px at full pressure

    ctx.save();
    ctx.lineCap = 'round';

    // Pass 1: wide outer glow
    ctx.shadowColor = pressureColor(pressureRatio, 0.35 + pressureRatio * 0.35);
    ctx.shadowBlur = 10 + pressureRatio * 10;
    ctx.strokeStyle = pressureColor(pressureRatio, 0.12);
    ctx.lineWidth = baseWidth + 6;
    ctx.beginPath();
    ctx.moveTo(c1[0], c1[1]);
    ctx.lineTo(c2[0], c2[1]);
    ctx.stroke();

    // Pass 2: medium glow
    ctx.shadowBlur = 8;
    ctx.strokeStyle = pressureColor(pressureRatio, 0.4);
    ctx.lineWidth = baseWidth + 2;
    ctx.beginPath();
    ctx.moveTo(c1[0], c1[1]);
    ctx.lineTo(c2[0], c2[1]);
    ctx.stroke();

    // Pass 3: sharp core
    ctx.shadowBlur = 0;
    ctx.strokeStyle = pipeColor;
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
      ctx.fillStyle = pressureColor(pressureRatio, 0.75);
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
    const pulse = 0.6 + 0.4 * Math.sin(render.animPhase * 2.5);
    ctx.save();
    ctx.shadowColor = pressureColor(pressureRatio, 0.7);
    ctx.shadowBlur = 18;
    ctx.fillStyle = pressureColor(pressureRatio, 0.25 * pulse);
    ctx.beginPath();
    ctx.arc(c.x, c.y, 8 + pulse * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = pressureColor(pressureRatio, 0.85 * pulse);
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
  ctx.strokeStyle = snapped ? withAlpha(COLOR.AMBER_BASE, 0.85) : withAlpha(COLOR.AMBER_BASE, 0.45);
  ctx.lineWidth = snapped ? 2.5 : 2;
  ctx.setLineDash([8, 4]);
  ctx.beginPath();
  ctx.moveTo(start[0], start[1]);
  ctx.lineTo(endX, endY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Snap target ring on the hovered centroid
  if (snapped) {
    ctx.strokeStyle = withAlpha(COLOR.AMBER_BASE, 0.85);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(endX, endY, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowColor = withAlpha(COLOR.AMBER_BASE, 0.6);
    ctx.shadowBlur = 10;
    ctx.fillStyle = withAlpha(COLOR.AMBER_BASE, 0.9);
    ctx.beginPath();
    ctx.arc(endX, endY, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Pulsing ring at the start
  const pulse = 0.6 + 0.4 * Math.sin(render.animPhase * 4);
  ctx.save();
  ctx.strokeStyle = withAlpha(COLOR.AMBER_BASE, 0.4 + pulse * 0.4);
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
    ctx.font = canvasFont('11px', 'mono');
    ctx.fillStyle = withAlpha(COLOR.AMBER_BASE, 0.95);
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(dist)} km — € ${fmtMoney(cost)}`, mx, my - 8);
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
    let genColor: string = COLOR.TYPE_PRIMARY;
    let genGlow: string = withAlpha(COLOR.TYPE_PRIMARY, 0.1);
    if (b.type === 'solarPlant') {
      genColor = COLOR.AMBER_BRIGHT;
      genGlow = b.production > 0 ? withAlpha(COLOR.AMBER_BRIGHT, 0.4) : withAlpha(COLOR.AMBER_BRIGHT, 0.1);
    } else if (b.type === 'windPlant') {
      genColor = COLOR.TYPE_PRIMARY;
      genGlow = b.production > 0 ? withAlpha(COLOR.TYPE_PRIMARY, 0.3) : withAlpha(COLOR.TYPE_PRIMARY, 0.1);
    } else if (b.type === 'nuclearPlant') {
      genColor = COLOR.AMBER_BASE;
      genGlow = withAlpha(COLOR.AMBER_BASE, 0.3);
    }

    ctx.save();
    ctx.translate(b.x, b.y);

    // Generator icon (left half of the plant).
    if (b.production > 0) {
      ctx.shadowColor = genGlow;
      ctx.shadowBlur = 8;
    }
    drawIcon(ctx, cfg.icon, -8, 0, 17, genColor);
    ctx.shadowBlur = 0;

    // Electrolyzer bracket (right half). Ring + internal dot hinting at
    // an electrolyzer stack. Bright when producing, dim when idle.
    const elGlow = b.production > 0 ? withAlpha(COLOR.AMBER_BASE, 0.55) : withAlpha(COLOR.AMBER_BASE, 0.18);
    ctx.strokeStyle = elGlow;
    ctx.fillStyle = b.production > 0 ? withAlpha(COLOR.AMBER_BASE, 0.8) : withAlpha(COLOR.AMBER_BASE, 0.28);
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
      ctx.fillStyle = withAlpha(COLOR.AMBER_GLOW, 0.9);
      ctx.shadowColor = withAlpha(COLOR.AMBER_GLOW, 0.8);
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(px, 0, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // H₂ output tick on the right edge, glows when producing.
    ctx.fillStyle = b.production > 0 ? withAlpha(COLOR.AMBER_BASE, 0.9) : withAlpha(COLOR.AMBER_BASE, 0.3);
    ctx.font = canvasFont('7px', 'mono', 'MEDIUM');
    ctx.textAlign = 'left';
    ctx.fillText('H₂', 14, 0);
    ctx.restore();
  }
}

/**
 * Render salt caverns as grounded storage nodes: a hex ring plus the salt
 * icon, visually distinct from generators. Connected caverns glow a bit
 * brighter because they are contributing to backbone storage.
 */
function drawSaltCaverns(ctx: CanvasRenderingContext2D): void {
  for (const cavern of state.caverns) {
    const center = getCenter(cavern.regionId);
    const rs = state.regions[cavern.regionId];
    const connected = (rs?.pipeConnections ?? 0) > 0;
    const x = center[0] - 18;
    const y = center[1] + 18;

    ctx.save();
    ctx.translate(x, y);

    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = -Math.PI / 2 + i * (Math.PI / 3);
      const px = Math.cos(angle) * 11;
      const py = Math.sin(angle) * 11;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();

    ctx.fillStyle = connected ? withAlpha(COLOR.TEAL_DIM, 0.22) : withAlpha(COLOR.SURFACE_BORDER, 0.18);
    ctx.fill();
    ctx.strokeStyle = connected ? withAlpha(COLOR.TEAL_BRIGHT, 0.95) : withAlpha(COLOR.TYPE_SECONDARY, 0.8);
    ctx.lineWidth = 1.4;
    ctx.stroke();

    if (connected) {
      ctx.shadowColor = withAlpha(COLOR.TEAL_BRIGHT, 0.55);
      ctx.shadowBlur = 10;
    }
    drawIcon(ctx, 'saltCavern', 0, 0, 16, connected ? COLOR.TEAL_BRIGHT : COLOR.TYPE_SECONDARY);
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
    ctx.fillStyle = withAlpha(cfg.color, 0.18);
    ctx.fill();
    ctx.strokeStyle = withAlpha(cfg.color, c.satisfaction > 0.5 ? 0.5 : 0.25);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = pulse;
    drawIcon(ctx, cfg.icon, 0, 0, 14, cfg.color);
    ctx.restore();
  }
}

// ─── Map furniture: reticle, scale, compass ──────────────────────────────

function drawMapFurniture(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  drawCoordinateReticle(ctx);
  drawScaleBar(ctx);
  drawCompassRose(ctx, w, h);
}

function screenPoint(lon: number, lat: number): { x: number; y: number } {
  return applyFit(lambertProject(lon, lat), mapView.fitTransform);
}

function drawCoordinateReticle(ctx: CanvasRenderingContext2D): void {
  const left = mapView.mapX;
  const top = mapView.mapY;
  const bottom = mapView.mapY + mapView.mapH;

  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, mapView.mapW, mapView.mapH);
  ctx.clip();
  ctx.strokeStyle = withAlpha(COLOR.SURFACE_BORDER, 0.2);
  ctx.lineWidth = 0.5;
  ctx.setLineDash([2, 8]);

  for (let lon = -4; lon <= 10; lon += 2) {
    ctx.beginPath();
    let first = true;
    for (let lat = 41; lat <= 52; lat += 0.5) {
      const p = screenPoint(lon, lat);
      if (first) { ctx.moveTo(p.x, p.y); first = false; }
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }

  for (let lat = 42; lat <= 52; lat += 2) {
    ctx.beginPath();
    let first = true;
    for (let lon = -6; lon <= 11; lon += 0.5) {
      const p = screenPoint(lon, lat);
      if (first) { ctx.moveTo(p.x, p.y); first = false; }
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }

  ctx.restore();

  ctx.save();
  ctx.fillStyle = withAlpha(COLOR.TYPE_TERTIARY, 0.72);
  ctx.font = canvasFont('9px', 'mono', 'MEDIUM');
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (let lat = 42; lat <= 52; lat += 2) {
    const p = screenPoint(-5, lat);
    if (p.y < top || p.y > bottom) continue;
    ctx.fillText(`${lat}°N`, left + 6, p.y);
  }
  ctx.restore();
}

function drawScaleBar(ctx: CanvasRenderingContext2D): void {
  const lengthKm = 100;
  const barW = lengthKm / mapView.kmPerPx;
  const x = mapView.mapX + 20;
  const y = mapView.mapY + mapView.mapH - 24;

  ctx.save();
  ctx.strokeStyle = withAlpha(COLOR.TYPE_SECONDARY, 0.75);
  ctx.fillStyle = withAlpha(COLOR.TYPE_SECONDARY, 0.8);
  ctx.lineWidth = 1;
  ctx.font = canvasFont('10px', 'mono', 'MEDIUM');
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + barW, y);
  ctx.moveTo(x, y - 4);
  ctx.lineTo(x, y + 4);
  ctx.moveTo(x + barW, y - 4);
  ctx.lineTo(x + barW, y + 4);
  ctx.stroke();
  ctx.fillText(`0    ${lengthKm} km`, x, y + 12);
  ctx.restore();
}

function drawCompassRose(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const x = Math.min(w - 52, mapView.mapX + mapView.mapW - 36);
  const y = Math.min(h - 52, Math.max(mapView.mapY + 34, 82));

  ctx.save();
  ctx.strokeStyle = withAlpha(COLOR.TYPE_SECONDARY, 0.7);
  ctx.fillStyle = withAlpha(COLOR.TYPE_SECONDARY, 0.85);
  ctx.lineWidth = 1;
  ctx.font = canvasFont('10px', 'mono', 'MEDIUM');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.beginPath();
  ctx.moveTo(x, y + 14);
  ctx.lineTo(x, y - 14);
  ctx.moveTo(x - 5, y - 8);
  ctx.lineTo(x, y - 14);
  ctx.lineTo(x + 5, y - 8);
  ctx.stroke();
  ctx.strokeStyle = COLOR.AMBER_BASE;
  ctx.beginPath();
  ctx.moveTo(x, y - 14);
  ctx.lineTo(x, y - 22);
  ctx.stroke();
  ctx.fillText('N', x, y - 30);
  ctx.restore();
}

// ─── Surface texture overlay ─────────────────────────────────────────────

function ensureNoisePattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (noisePattern) return noisePattern;
  if (!noiseImage) {
    noiseImage = new Image();
    noiseImage.onload = () => { noiseReady = true; };
    noiseImage.src = generateNoiseDataURL();
    return null;
  }
  if (!noiseReady) return null;
  noisePattern = ctx.createPattern(noiseImage, 'repeat');
  return noisePattern;
}

function drawTextureOverlay(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.save();

  const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.18, w / 2, h / 2, Math.max(w, h) * 0.72);
  vignette.addColorStop(0, withAlpha(COLOR.SURFACE_DEEP, 0));
  vignette.addColorStop(1, withAlpha(COLOR.SURFACE_DEEP, TEXTURE.VIGNETTE_ALPHA));
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = withAlpha(COLOR.TYPE_PRIMARY, TEXTURE.SCANLINE_ALPHA);
  for (let y = 0; y < h; y += TEXTURE.SCANLINE_SPACING) {
    ctx.fillRect(0, y, w, 1);
  }

  const pattern = ensureNoisePattern(ctx);
  if (pattern) {
    ctx.globalAlpha = TEXTURE.NOISE_ALPHA;
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, w, h);
  }

  ctx.restore();
}

// (Canvas hover tooltip and sparkline replaced by DOM tooltip + in-canvas
// area chart and gauge; see ui.ts and drawDashboard above.)
