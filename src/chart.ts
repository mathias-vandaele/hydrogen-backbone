// Compact dual-series area chart plus a specialized price-trajectory chart
// (Priority 3): threshold lines per price-gated customer type, animated
// flashes when the live price crosses a threshold downward, customer-icon
// markers at each materialization point, and a dashed forward projection
// that extrapolates 120 days from recent price momentum.

import { CUSTOMER_TYPES, ECONOMY } from './config';
import { state } from './state';
import type { CustomerType } from './types';

export interface ChartSeries {
  values: number[];
  strokeColor: string;
  fillColor: string;
  label: string;
  unit: string;
  minFloor?: number;
  maxCeil?: number;
}

/**
 * Draw a compact dual-series area chart: background panel, two horizontal
 * guide lines, one filled area per series stroked over the top, and an
 * inline legend row at the bottom showing current values. Used by the
 * dashboard for a combined H₂ spot price + network pressure view.
 */
export function drawAreaChart(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  series: ChartSeries[],
  sampleWindow = 90
): void {
  ctx.save();

  ctx.fillStyle = 'rgba(10,14,23,0.75)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(30,58,95,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);

  const innerX = x + 6;
  const innerY = y + 4;
  const innerW = w - 12;
  const innerH = h - 18;

  ctx.strokeStyle = 'rgba(30,58,95,0.25)';
  ctx.setLineDash([2, 3]);
  for (let i = 1; i < 3; i++) {
    const gy = innerY + (innerH * i) / 3;
    ctx.beginPath();
    ctx.moveTo(innerX, gy);
    ctx.lineTo(innerX + innerW, gy);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  for (const s of series) {
    const data = s.values.slice(-sampleWindow);
    if (data.length < 2) continue;
    const lo = Math.min(...data, s.minFloor ?? Infinity);
    const hi = Math.max(...data, s.maxCeil ?? -Infinity);
    const range = hi - lo || 1;
    const px = (i: number) => innerX + (i / (data.length - 1)) * innerW;
    const py = (v: number) => innerY + innerH - ((v - lo) / range) * innerH;
    ctx.beginPath();
    ctx.moveTo(px(0), innerY + innerH);
    for (let i = 0; i < data.length; i++) ctx.lineTo(px(i), py(data[i]));
    ctx.lineTo(px(data.length - 1), innerY + innerH);
    ctx.closePath();
    ctx.fillStyle = s.fillColor;
    ctx.fill();
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      if (i === 0) ctx.moveTo(px(i), py(data[i]));
      else ctx.lineTo(px(i), py(data[i]));
    }
    ctx.strokeStyle = s.strokeColor;
    ctx.lineWidth = 1.3;
    ctx.stroke();
  }

  ctx.font = '9px Courier New';
  ctx.textBaseline = 'middle';
  let labelX = x + 6;
  const labelY = y + h - 8;
  for (const s of series) {
    const v = s.values.length ? s.values[s.values.length - 1] : 0;
    ctx.fillStyle = s.strokeColor;
    ctx.textAlign = 'left';
    const txt = `${s.label} ${v.toFixed(1)}${s.unit}`;
    ctx.fillText(txt, labelX, labelY);
    labelX += ctx.measureText(txt).width + 10;
  }

  ctx.restore();
}

// ─── Price trajectory chart (Priority 3) ─────────────────────────────────

/** Transient flash effect for recent threshold crossings. */
const crossingFlashes = new Map<CustomerType, number>(); // type → start ms

export function noteThresholdCrossing(type: CustomerType): void {
  crossingFlashes.set(type, performance.now());
}

const FLASH_MS = 2000;

/**
 * Draw the price-trajectory chart: history line + area fill, horizontal
 * threshold lines for each price-gated customer (with right-edge icon +
 * name), highlighted export line, dashed forward
 * projection 120 days out, and small customer icons at materialization
 * points.
 */
export function drawPriceChart(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  sampleWindow = 90,
  projectionDays = 120
): void {
  ctx.save();
  ctx.fillStyle = 'rgba(10,14,23,0.80)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(30,58,95,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);

  const innerX = x + 6;
  const innerY = y + 6;
  const innerW = w - 80; // reserve right strip for threshold labels
  const innerH = h - 26; // reserve bottom strip for legend

  const history = state.priceHistory.slice(-sampleWindow);
  if (history.length < 2) { ctx.restore(); return; }

  // Price Y-range: clamp to [1, 8] so thresholds have stable positions.
  const lo = 1.0;
  const hi = Math.max(8.0, ...history);
  const range = hi - lo;
  const toY = (v: number) => innerY + innerH - ((v - lo) / range) * innerH;
  // X spans: first 0..sampleWindow-1 live history, then projectionDays ahead.
  const totalSlots = history.length - 1 + projectionDays;
  const toX = (i: number) => innerX + (i / totalSlots) * innerW;

  // Threshold lines
  drawThresholdLines(ctx, innerX, innerW, toY);

  // Filled area under the history
  ctx.beginPath();
  ctx.moveTo(toX(0), innerY + innerH);
  for (let i = 0; i < history.length; i++) ctx.lineTo(toX(i), toY(history[i]));
  ctx.lineTo(toX(history.length - 1), innerY + innerH);
  ctx.closePath();
  ctx.fillStyle = 'rgba(6, 214, 160, 0.18)';
  ctx.fill();

  // Stroke history line
  ctx.beginPath();
  for (let i = 0; i < history.length; i++) {
    if (i === 0) ctx.moveTo(toX(i), toY(history[i]));
    else ctx.lineTo(toX(i), toY(history[i]));
  }
  ctx.strokeStyle = 'rgba(6, 214, 160, 0.95)';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // Forward projection: simple linear extrapolation of the last N days'
  // slope projected from recent downward momentum. Dashed.
  drawProjection(ctx, history, toX, toY, projectionDays);

  // Customer emergence markers on the history
  drawCustomerMarkers(ctx, history, sampleWindow, toX, toY);

  // Legend
  ctx.font = '9px Courier New';
  ctx.fillStyle = 'rgba(100,116,139,0.8)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const last = history[history.length - 1];
  ctx.fillText(`H₂ €${last.toFixed(2)}/kg · ${projectionDays}d forecast`, x + 6, y + h - 9);

  // Right-edge "today" tick
  ctx.strokeStyle = 'rgba(224,231,255,0.3)';
  ctx.beginPath();
  ctx.moveTo(toX(history.length - 1), innerY);
  ctx.lineTo(toX(history.length - 1), innerY + innerH);
  ctx.stroke();

  ctx.restore();
}

/**
 * Draw one horizontal line per customer type. Export gets highlighted
 * styling. Label column at
 * the right edge shows icon + short name.
 */
function drawThresholdLines(
  ctx: CanvasRenderingContext2D,
  innerX: number,
  innerW: number,
  toY: (v: number) => number
): void {
  const now = performance.now();
  ctx.save();
  ctx.font = '9px Courier New';
  ctx.textBaseline = 'middle';

  for (const [type, cfg] of Object.entries(CUSTOMER_TYPES)) {
    // Threshold lines are interesting both for price-gated types and for
    // "informational" ones like export — we render informational ones too
    // so the player sees a full staircase.
    const threshold = cfg.priceThreshold;
    const y = toY(threshold);
    const flashStart = crossingFlashes.get(type as CustomerType);
    const flashT = flashStart ? Math.max(0, 1 - (now - flashStart) / FLASH_MS) : 0;

    // Highlighted stops
    const isExport = cfg.archetype === 'export' && cfg.tier === 'big';

    let stroke = 'rgba(6,214,160,0.28)';
    if (isExport) stroke = 'rgba(6,214,160,0.55)';
    if (flashT > 0) stroke = `rgba(255,255,255,${0.3 + 0.6 * flashT})`;

    ctx.strokeStyle = stroke;
    ctx.lineWidth = isExport ? 1.3 : 0.8;
    ctx.setLineDash(isExport ? [] : [3, 3]);
    ctx.beginPath();
    ctx.moveTo(innerX, y);
    ctx.lineTo(innerX + innerW, y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Right-edge icon + label
    ctx.fillStyle = stroke;
    ctx.textAlign = 'left';
    let label = `${cfg.icon} ${cfg.name}`;
    if (isExport) label = '🚢 Global export';
    ctx.fillText(`${label} €${threshold.toFixed(1)}`, innerX + innerW + 4, y);
  }
  ctx.restore();
}

/**
 * Extrapolate price 120 days forward using recent downward slope.
 */
function drawProjection(
  ctx: CanvasRenderingContext2D,
  history: number[],
  toX: (i: number) => number,
  toY: (v: number) => number,
  projectionDays: number
): void {
  if (history.length < 10) return;

  const lastIdx = history.length - 1;
  const last = history[lastIdx];
  const prev = history[Math.max(0, lastIdx - 14)];
  const rawDailySlope = (last - prev) / 14;
  const dailySlope = Math.min(0, rawDailySlope);

  ctx.save();
  ctx.strokeStyle = 'rgba(6, 214, 160, 0.55)';
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(toX(lastIdx), toY(last));
  for (let d = 1; d <= projectionDays; d++) {
    const projected = Math.max(0.5, last + dailySlope * d);
    ctx.lineTo(toX(lastIdx + d), toY(projected));
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/**
 * Draw a small icon at the (time, price) coordinate where each live
 * customer actually materialized. Only recent enough to be inside the
 * current sample window.
 */
function drawCustomerMarkers(
  ctx: CanvasRenderingContext2D,
  history: number[],
  sampleWindow: number,
  toX: (i: number) => number,
  toY: (v: number) => number
): void {
  const today = state.gameDay;
  ctx.save();
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const c of state.customers) {
    if (!c.active) continue;
    const daysAgo = today - c.appearedDay;
    if (daysAgo < 0 || daysAgo >= Math.min(sampleWindow, history.length)) continue;
    const idx = history.length - 1 - daysAgo;
    if (idx < 0 || idx >= history.length) continue;
    const priceAt = history[idx];
    ctx.fillStyle = CUSTOMER_TYPES[c.type].color;
    ctx.fillText(CUSTOMER_TYPES[c.type].icon, toX(idx), toY(priceAt) - 8);
  }
  ctx.restore();
}

// ─── Budget history chart (v4, Priority 3) ───────────────────────────────

/**
 * Render the Budget history area chart: the player's cumulative budget
 * over the last N game days, with a red horizontal line at the
 * BANKRUPTCY_THRESHOLD so the player can see the ceiling of death
 * they must stay above. The line changes color dynamically — green
 * when trending up, amber when flat, red when trending down.
 */
export function drawBudgetChart(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  sampleWindow = 180
): void {
  ctx.save();

  ctx.fillStyle = 'rgba(10,14,23,0.80)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(30,58,95,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);

  const innerX = x + 6;
  const innerY = y + 6;
  const innerW = w - 12;
  const innerH = h - 22;

  const history = state.budgetHistory.slice(-sampleWindow);
  if (history.length < 2) {
    ctx.fillStyle = 'rgba(100,116,139,0.75)';
    ctx.font = '10px Courier New';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText('Budget history: collecting…', innerX, y + h / 2);
    ctx.restore();
    return;
  }

  const lo = Math.min(...history, ECONOMY.BANKRUPTCY_THRESHOLD);
  const hi = Math.max(...history, 0);
  const range = (hi - lo) || 1;
  const toY = (v: number) => innerY + innerH - ((v - lo) / range) * innerH;
  const toX = (i: number) => innerX + (i / (history.length - 1)) * innerW;

  // Zero baseline
  ctx.strokeStyle = 'rgba(100,116,139,0.3)';
  ctx.setLineDash([2, 3]);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(innerX, toY(0));
  ctx.lineTo(innerX + innerW, toY(0));
  ctx.stroke();
  ctx.setLineDash([]);

  // Bankruptcy threshold line — the "bottom of the pool".
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.75)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(innerX, toY(ECONOMY.BANKRUPTCY_THRESHOLD));
  ctx.lineTo(innerX + innerW, toY(ECONOMY.BANKRUPTCY_THRESHOLD));
  ctx.stroke();
  ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
  ctx.font = '9px Courier New';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('bankruptcy', innerX + innerW - 2, toY(ECONOMY.BANKRUPTCY_THRESHOLD) - 1);

  // Trend color based on recent slope
  const last = history[history.length - 1];
  const prev = history[Math.max(0, history.length - 15)];
  const slope = last - prev;
  const stroke = slope > 0 ? 'rgba(0, 255, 136, 0.95)'
               : slope < 0 ? 'rgba(239, 68, 68, 0.95)'
               : 'rgba(245, 158, 11, 0.95)';
  const fill = slope > 0 ? 'rgba(0, 255, 136, 0.12)'
             : slope < 0 ? 'rgba(239, 68, 68, 0.12)'
             : 'rgba(245, 158, 11, 0.10)';

  // Filled area under the line.
  ctx.beginPath();
  ctx.moveTo(toX(0), toY(0));
  for (let i = 0; i < history.length; i++) ctx.lineTo(toX(i), toY(history[i]));
  ctx.lineTo(toX(history.length - 1), toY(0));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();

  // Stroke line.
  ctx.beginPath();
  for (let i = 0; i < history.length; i++) {
    if (i === 0) ctx.moveTo(toX(i), toY(history[i]));
    else ctx.lineTo(toX(i), toY(history[i]));
  }
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Bottom label.
  ctx.font = '9px Courier New';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = stroke;
  const sign = last >= 0 ? '€' : '-€';
  ctx.fillText(
    `Budget ${sign}${Math.abs(Math.round(last / 1e6))}M · ${history.length}d`,
    x + 6, y + h - 9
  );
  ctx.restore();
}
