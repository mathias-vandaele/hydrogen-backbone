import { ADJACENCIES, BUILDINGS, CUSTOMER_TYPES, MAX_PRESSURE, getRegionConfig } from './config';
import { input } from './input';
import { distanceBetween, getCenter, mapView } from './map';
import { drawParticles } from './particles';
import { state } from './state';
import { fmtMoney } from './ui';

const render = {
  lastTime: 0,
  animPhase: 0
};

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
  drawGasCorridors(ctx);
  drawPipes(ctx);
  drawPipePreview(ctx);
  drawParticles(ctx);
  drawBuildings(ctx);
  drawCustomers(ctx);
  drawDayNight(ctx, w, h);
  drawPriceSparkline(ctx);
  drawHoverTooltip(ctx);
}

function drawGasCorridors(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.setLineDash([3, 8]);
  ctx.lineWidth = 1;
  ctx.lineCap = 'round';
  for (const [a, b] of ADJACENCIES) {
    const ac = getRegionConfig(a);
    const bc = getRegionConfig(b);
    if (!ac || !bc) continue;
    const infra = Math.min(ac.gasInfra, bc.gasInfra);
    if (infra < 0.3) continue;
    const c1 = getCenter(a);
    const c2 = getCenter(b);
    const hasPipe = state.pipes.some(p =>
      (p.fromId === a && p.toId === b) || (p.fromId === b && p.toId === a));
    if (hasPipe) continue;
    ctx.strokeStyle = `rgba(80,100,120,${infra * 0.2})`;
    ctx.beginPath();
    ctx.moveTo(c1[0], c1[1]);
    ctx.lineTo(c2[0], c2[1]);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}

function drawPriceSparkline(ctx: CanvasRenderingContext2D): void {
  const history = state.priceHistory;
  if (history.length < 2) return;
  const x0 = mapView.mapX + mapView.mapW - 120;
  const y0 = mapView.mapY + 10;
  const sw = 110;
  const sh = 35;

  ctx.fillStyle = 'rgba(10,14,23,0.7)';
  ctx.fillRect(x0, y0, sw, sh);
  ctx.strokeStyle = 'rgba(30,58,95,0.4)';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(x0, y0, sw, sh);

  const data = history.slice(-60);
  const maxP = Math.max(...data, 6);
  const minP = Math.min(...data, 1);
  const range = maxP - minP || 1;

  ctx.beginPath();
  for (let i = 0; i < data.length; i++) {
    const px = x0 + 4 + (i / (data.length - 1)) * (sw - 8);
    const py = y0 + sh - 4 - ((data[i] - minP) / range) * (sh - 8);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.strokeStyle = '#06d6a0';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.font = '8px Courier New';
  ctx.fillStyle = 'rgba(100,116,139,0.6)';
  ctx.textAlign = 'left';
  ctx.fillText(`€${maxP.toFixed(1)}`, x0 + 2, y0 + 8);
  ctx.fillText(`€${minP.toFixed(1)}`, x0 + 2, y0 + sh - 2);
  ctx.textAlign = 'right';
  ctx.fillText('H₂ Price', x0 + sw - 2, y0 + 8);
}

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

function drawRegions(ctx: CanvasRenderingContext2D): void {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  for (const rp of mapView.regionPaths) {
    const rs = state.regions[rp.id];
    const isHovered = mapView.hoveredRegion === rp.id;
    const isSelected = mapView.selectedRegion === rp.id;

    if (isSelected) ctx.fillStyle = 'rgba(6,214,160,0.15)';
    else if (isHovered) ctx.fillStyle = 'rgba(6,214,160,0.08)';
    else ctx.fillStyle = rp.config.color;
    ctx.fill(rp.path);

    // Supply/demand tint
    if (rs.supply > 0 && rs.pipeConnections > 0) {
      const intensity = Math.min(0.15, rs.supply / 50000 * 0.15);
      ctx.fillStyle = `rgba(6,214,160,${intensity})`;
      ctx.fill(rp.path);
    }

    ctx.strokeStyle = isSelected ? '#06d6a0' : isHovered ? 'rgba(6,214,160,0.6)' : 'rgba(30,58,95,0.5)';
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.stroke(rp.path);

    const center = getCenter(rp.id);
    ctx.font = '10px Courier New';
    ctx.fillStyle = isHovered || isSelected ? '#06d6a0' : 'rgba(224,231,255,0.5)';
    ctx.textAlign = 'center';
    ctx.fillText(rp.config.abbr, center[0], center[1] - 4);

    // Pressure indicator for connected regions
    if (rs.pipeConnections > 0) {
      const pressureRatio = rs.pressure / MAX_PRESSURE;
      const barW = 24;
      const barH = 3;
      const bx = center[0] - barW / 2;
      const by = center[1] + 4;

      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(bx, by, barW, barH);

      const r = Math.round(255 * (1 - pressureRatio));
      const g = Math.round(255 * pressureRatio);
      ctx.fillStyle = `rgba(${r},${g},160,0.7)`;
      ctx.fillRect(bx, by, barW * pressureRatio, barH);
    }
  }
}

function drawPipes(ctx: CanvasRenderingContext2D): void {
  for (const pipe of state.pipes) {
    const c1 = getCenter(pipe.fromId);
    const c2 = getCenter(pipe.toId);

    const pressureRatio = pipe.pressure / MAX_PRESSURE;
    const flowRatio = Math.min(1, Math.abs(pipe.flow) / pipe.maxFlow);

    ctx.save();
    const glowIntensity = 5 + pressureRatio * 20;
    const alpha = 0.3 + pressureRatio * 0.5;

    // Pressure color: low=red-orange, high=cyan-white
    let r: number, g: number, b: number;
    if (pressureRatio < 0.3) {
      r = 200; g = 80; b = 40;
    } else if (pressureRatio < 0.6) {
      const t = (pressureRatio - 0.3) / 0.3;
      r = Math.round(200 - t * 180);
      g = Math.round(80 + t * 140);
      b = Math.round(40 + t * 120);
    } else {
      const t = (pressureRatio - 0.6) / 0.4;
      r = Math.round(20 + t * 60);
      g = Math.round(220 + t * 35);
      b = Math.round(160 + t * 95);
    }

    ctx.shadowColor = `rgba(${r},${g},${b},${alpha})`;
    ctx.shadowBlur = glowIntensity;
    ctx.strokeStyle = `rgba(${r},${g},${b},${alpha * 0.8})`;
    ctx.lineWidth = 3 + flowRatio * 3;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(c1[0], c1[1]);
    ctx.lineTo(c2[0], c2[1]);
    ctx.stroke();

    // Inner bright line
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(${Math.min(255, r + 50)},${Math.min(255, g + 30)},${Math.min(255, b + 40)},${alpha * 0.5})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();

    // Flow direction indicator (small arrow at midpoint)
    if (Math.abs(pipe.flow) > 10) {
      const mx = (c1[0] + c2[0]) / 2;
      const my = (c1[1] + c2[1]) / 2;
      const angle = Math.atan2(c2[1] - c1[1], c2[0] - c1[0]);
      const dir = pipe.flow > 0 ? 1 : -1;

      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(angle * dir);
      ctx.fillStyle = `rgba(${r},${g},${b},0.6)`;
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(-3, -3);
      ctx.lineTo(-3, 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}

function drawPipePreview(ctx: CanvasRenderingContext2D): void {
  if (input.buildMode !== 'pipeline' || !input.pipeStart) return;

  const start = getCenter(input.pipeStart);
  ctx.strokeStyle = 'rgba(6,214,160,0.4)';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 4]);
  ctx.beginPath();
  ctx.moveTo(start[0], start[1]);
  ctx.lineTo(input.mx, input.my);
  ctx.stroke();
  ctx.setLineDash([]);

  if (mapView.hoveredRegion && mapView.hoveredRegion !== input.pipeStart) {
    const end = getCenter(mapView.hoveredRegion);
    const dist = distanceBetween(input.pipeStart, mapView.hoveredRegion);
    const cfg = BUILDINGS.pipeline;
    const fromCfg = getRegionConfig(input.pipeStart);
    const toCfg = getRegionConfig(mapView.hoveredRegion);
    if (!fromCfg || !toCfg) return;
    const infraDiscount = 1.0 - (Math.min(fromCfg.gasInfra, toCfg.gasInfra) * 0.4);
    const cost = Math.round(cfg.baseCostPerKm * dist * infraDiscount * state.wright.pipeline.mult);

    const mx = (start[0] + end[0]) / 2;
    const my = (start[1] + end[1]) / 2;

    ctx.font = '11px Courier New';
    ctx.fillStyle = 'rgba(6,214,160,0.9)';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(dist)}km — €${fmtMoney(cost)}`, mx, my - 8);
  }
}

function drawBuildings(ctx: CanvasRenderingContext2D): void {
  for (const b of state.buildings) {
    const cfg = BUILDINGS[b.type];
    const x = b.x;
    const y = b.y;

    ctx.save();

    let color = '#ffffff';
    let glow = 'rgba(255,255,255,0.1)';
    if (b.type === 'solar') {
      color = '#fbbf24';
      glow = b.production > 0 ? 'rgba(251,191,36,0.4)' : 'rgba(251,191,36,0.1)';
    } else if (b.type === 'wind') {
      color = '#e2e8f0';
      glow = b.production > 0 ? 'rgba(226,232,240,0.3)' : 'rgba(226,232,240,0.1)';
    } else if (b.type === 'nuclear') {
      color = '#a78bfa';
      glow = 'rgba(167,139,250,0.3)';
    } else if (b.type === 'electrolyzer') {
      color = '#06d6a0';
      glow = b.production > 0 ? 'rgba(6,214,160,0.4)' : 'rgba(6,214,160,0.1)';
    }

    if (b.production > 0) {
      ctx.shadowColor = glow;
      ctx.shadowBlur = 8;
    }

    ctx.fillStyle = color;
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cfg.icon, x, y);

    ctx.restore();
  }
}

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

function drawDayNight(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const t = state.timeOfDay;
  const darkness = Math.max(0, -Math.sin(t * Math.PI) * 0.25);
  if (darkness > 0.02) {
    ctx.fillStyle = `rgba(5,8,20,${darkness})`;
    ctx.fillRect(0, 0, w, h);
  }
}

function drawHoverTooltip(ctx: CanvasRenderingContext2D): void {
  if (!mapView.hoveredRegion || input.buildMode === 'pipeline') return;

  const rc = getRegionConfig(mapView.hoveredRegion);
  const rs = state.regions[mapView.hoveredRegion];
  if (!rc) return;

  const mx = input.mx + 15;
  const my = input.my + 15;

  const lines = [
    rc.name,
    `☀️ Solar: ${(rc.solarBase * 100).toFixed(0)}%  💨 Wind: ${(rc.windBase * 100).toFixed(0)}%`,
    `⚛️ Nuclear: ${rc.nuclearBonus > 0.5 ? 'Yes' : 'No'}  🏭 Industry: ${(rc.industryDemand * 100).toFixed(0)}%`,
    rc.hasPort ? `🚢 Port: ${rc.portName}` : '',
    rs.pipeConnections > 0 ? `📊 Pressure: ${rs.pressure.toFixed(1)} bar` : '',
    rs.supply > 0 ? `⬆️ H₂ Supply: ${Math.round(rs.supply)} kg/day` : '',
    rs.demand > 0 ? `⬇️ H₂ Demand: ${Math.round(rs.demand)} kg/day` : ''
  ].filter(l => l);

  const lineH = 16;
  const padX = 10;
  const padY = 6;
  const w2 = 260;
  const h2 = lines.length * lineH + padY * 2;

  const ttX = Math.min(mx, mapView.width - w2 - 10);
  const ttY = Math.min(my, mapView.height - h2 - 10);

  ctx.fillStyle = 'rgba(13,20,33,0.95)';
  ctx.strokeStyle = 'rgba(6,214,160,0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  (ctx as CanvasRenderingContext2D & { roundRect: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect(ttX, ttY, w2, h2, 4);
  ctx.fill();
  ctx.stroke();

  ctx.font = '11px Courier New';
  ctx.textAlign = 'left';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillStyle = i === 0 ? '#06d6a0' : '#e0e7ff';
    ctx.fillText(lines[i], ttX + padX, ttY + padY + 12 + i * lineH);
  }
}
