import { hslString, pipeColorHsl } from './config';

// Canvas-rendered circular pressure gauge. Ticks + glowing arc + needle.
// Arc sweeps from 225° (lower-left) clockwise to -45° (lower-right) — i.e.
// a ~270° "speedometer" arc with an open bottom, so the numerical value
// and the "bar" unit label sit inside the open chin.

const START_ANGLE = (135 * Math.PI) / 180;  // bottom-left (after flipping)
const END_ANGLE = (45 * Math.PI) / 180;     // bottom-right
const SWEEP = Math.PI * 1.5;                // 270° total sweep

/**
 * Map a 0..1 value to the canvas angle along the gauge arc. Clamped so
 * values outside the range don't overshoot the arc.
 */
function angleFor(t: number): number {
  return START_ANGLE + Math.max(0, Math.min(1, t)) * SWEEP;
}

/**
 * Draw the full gauge at (cx, cy) with the given radius: background disc,
 * faint underlay arc, glowing active arc, tick marks (minor every 2%,
 * major every 10% with numeric label), needle + hub, centered value
 * readout, and label/unit text. Stateless — render every frame.
 */
export function drawGauge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  value: number,
  min: number,
  max: number,
  label = 'Network Pressure'
): void {
  const range = max - min;
  const t = range > 0 ? (value - min) / range : 0;
  const hsl = pipeColorHsl(Math.max(0, Math.min(1, t)));

  ctx.save();

  // Background disc
  ctx.fillStyle = 'rgba(10,14,23,0.85)';
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  // Faint full arc underlay
  ctx.strokeStyle = 'rgba(30,58,95,0.55)';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 10, START_ANGLE, END_ANGLE, false);
  ctx.stroke();

  // Active arc (pressure fill)
  ctx.save();
  ctx.shadowColor = hslString(hsl, 0.85);
  ctx.shadowBlur = 14;
  ctx.strokeStyle = hslString(hsl, 0.95);
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 10, START_ANGLE, angleFor(t), false);
  ctx.stroke();
  ctx.restore();

  // Tick marks every 10% of range (major) and 2% (minor)
  const tickOuter = radius - 4;
  const majorInner = radius - 12;
  const minorInner = radius - 8;
  for (let i = 0; i <= 50; i++) {
    const tt = i / 50;
    const a = angleFor(tt);
    const major = i % 5 === 0;
    const inner = major ? majorInner : minorInner;
    ctx.strokeStyle = major ? 'rgba(224,231,255,0.75)' : 'rgba(100,116,139,0.5)';
    ctx.lineWidth = major ? 1.3 : 0.7;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    ctx.lineTo(cx + Math.cos(a) * tickOuter, cy + Math.sin(a) * tickOuter);
    ctx.stroke();
  }

  // Numeric scale labels at major ticks (0, 25, 50, 75, 100%)
  ctx.fillStyle = 'rgba(100,116,139,0.75)';
  ctx.font = '9px Courier New';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const labelRadius = radius - 22;
  for (let i = 0; i <= 4; i++) {
    const tt = i / 4;
    const a = angleFor(tt);
    const v = Math.round(min + tt * range);
    ctx.fillText(String(v), cx + Math.cos(a) * labelRadius, cy + Math.sin(a) * labelRadius);
  }

  // Needle
  const needleAngle = angleFor(t);
  ctx.save();
  ctx.strokeStyle = hslString(hsl, 0.98);
  ctx.shadowColor = hslString(hsl, 0.8);
  ctx.shadowBlur = 8;
  ctx.lineCap = 'round';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(cx - Math.cos(needleAngle) * 6, cy - Math.sin(needleAngle) * 6);
  ctx.lineTo(cx + Math.cos(needleAngle) * (radius - 16), cy + Math.sin(needleAngle) * (radius - 16));
  ctx.stroke();
  ctx.restore();

  // Hub
  ctx.fillStyle = 'rgba(13,20,33,1)';
  ctx.strokeStyle = hslString(hsl, 0.9);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Value readout (centered lower)
  ctx.fillStyle = hslString(hsl, 1);
  ctx.font = 'bold 22px Courier New';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(value.toFixed(1), cx, cy + radius * 0.35);

  // Label + unit
  ctx.fillStyle = 'rgba(100,116,139,0.9)';
  ctx.font = '9px Courier New';
  ctx.fillText(label.toUpperCase(), cx, cy - radius * 0.5);
  ctx.fillText('BAR', cx, cy + radius * 0.55);

  ctx.restore();
}
