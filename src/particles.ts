import { MAX_PRESSURE } from './config';
import { getCenter } from './map';
import { state } from './state';

interface Particle {
  active: boolean;
  x: number;
  y: number;
  progress: number;
  speed: number;
  pipeIdx: number;
  alpha: number;
  size: number;
}

const MAX = 1500;
const pool: Particle[] = [];
let activeCount = 0;

export function initParticles(): void {
  pool.length = 0;
  for (let i = 0; i < MAX; i++) {
    pool.push({ active: false, x: 0, y: 0, progress: 0, speed: 0, pipeIdx: -1, alpha: 1, size: 2 });
  }
  activeCount = 0;
}

function spawn(pipeIdx: number): void {
  for (let i = 0; i < MAX; i++) {
    const p = pool[i];
    if (!p.active) {
      p.active = true;
      p.progress = 0;
      p.pipeIdx = pipeIdx;
      p.speed = 0.003 + Math.random() * 0.004;
      p.alpha = 0.5 + Math.random() * 0.5;
      p.size = 1.2 + Math.random() * 1.8;
      activeCount++;
      return;
    }
  }
}

export function updateParticles(dt: number): void {
  const s = state;
  const dtFactor = dt / 16.67;

  for (let i = 0; i < MAX; i++) {
    const p = pool[i];
    if (!p.active) continue;

    const pipe = s.pipes[p.pipeIdx];
    if (!pipe || Math.abs(pipe.flow) < 0.1) {
      p.active = false;
      activeCount--;
      continue;
    }

    const flowFactor = Math.min(1, Math.abs(pipe.flow) / pipe.maxFlow);
    p.progress += p.speed * flowFactor * dtFactor * (pipe.flow > 0 ? 1 : -1);

    if (p.progress >= 1 || p.progress <= 0) {
      p.active = false;
      activeCount--;
      continue;
    }

    const c1 = getCenter(pipe.fromId);
    const c2 = getCenter(pipe.toId);
    p.x = c1[0] + (c2[0] - c1[0]) * p.progress;
    p.y = c1[1] + (c2[1] - c1[1]) * p.progress;

    // Slight wave motion perpendicular to pipe direction.
    const perpX = -(c2[1] - c1[1]);
    const perpY = c2[0] - c1[0];
    const len = Math.sqrt(perpX * perpX + perpY * perpY) || 1;
    const wave = Math.sin(p.progress * 20 + performance.now() * 0.003) * 3;
    p.x += (perpX / len) * wave;
    p.y += (perpY / len) * wave;
  }

  // Spawn new particles for active pipes.
  for (let i = 0; i < s.pipes.length; i++) {
    const pipe = s.pipes[i];
    if (Math.abs(pipe.flow) > 1) {
      const rate = Math.ceil(Math.abs(pipe.flow) / pipe.maxFlow * 4);
      for (let j = 0; j < rate; j++) {
        if (Math.random() < 0.15) spawn(i);
      }
    }
  }
}

export function drawParticles(ctx: CanvasRenderingContext2D): void {
  for (let i = 0; i < MAX; i++) {
    const p = pool[i];
    if (!p.active) continue;

    const pipe = state.pipes[p.pipeIdx];
    if (!pipe) continue;

    const pressureRatio = pipe.pressure / MAX_PRESSURE;
    const r = Math.round(20 + (1 - pressureRatio) * 200);
    const g = Math.round(200 + pressureRatio * 55);
    const b = Math.round(160 + pressureRatio * 60);

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${r},${g},${b},${p.alpha * 0.7})`;
    ctx.fill();
  }
}

export function getActiveParticleCount(): number {
  return activeCount;
}
