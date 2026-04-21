// Compact dual-series area chart: H₂ spot price + network pressure over the
// last ~90 daily samples. Area fills under both lines; axis labels minimal.

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
 * inline legend row at the bottom showing current values. `sampleWindow`
 * limits how many of the most-recent samples to plot (default 90 days).
 * Each series can specify `minFloor` / `maxCeil` to keep the Y-range
 * stable when data is sparse.
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

  // Panel background
  ctx.fillStyle = 'rgba(10,14,23,0.75)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(30,58,95,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);

  const innerX = x + 6;
  const innerY = y + 4;
  const innerW = w - 12;
  const innerH = h - 18; // reserve 14px bottom for labels

  // Horizontal guide lines (thirds)
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

    // Filled area
    ctx.beginPath();
    ctx.moveTo(px(0), innerY + innerH);
    for (let i = 0; i < data.length; i++) ctx.lineTo(px(i), py(data[i]));
    ctx.lineTo(px(data.length - 1), innerY + innerH);
    ctx.closePath();
    ctx.fillStyle = s.fillColor;
    ctx.fill();

    // Stroke line
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      if (i === 0) ctx.moveTo(px(i), py(data[i]));
      else ctx.lineTo(px(i), py(data[i]));
    }
    ctx.strokeStyle = s.strokeColor;
    ctx.lineWidth = 1.3;
    ctx.stroke();
  }

  // Legend / current value labels
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
}
