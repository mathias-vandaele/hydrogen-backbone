import { MAX_PRESSURE } from './config';
import { COLOR, pressureColor, withAlpha } from './design-system';
import { getCenter } from './map';
import { state } from './state';

// ─── Molecule particles travelling along pipes ────────────────────────────
// Pool-allocated, capped at MAX to avoid GC pauses. Speed along the pipe
// scales with mass flow rate (flow / maxFlow); emission rate scales with
// pressure so tense pipes sparkle heavily.

interface Particle {
  active: boolean;
  x: number;
  y: number;
  progress: number;   // 0..1 along the pipe, sign = direction
  speed: number;      // per-frame base speed
  pipeIdx: number;
  alpha: number;
  size: number;
  pressureRatio: number;
}

const MAX = 500;
const pool: Particle[] = [];
let activeCount = 0;

/**
 * Preallocate the full particle pool. Called once on boot so no allocation
 * happens at render time — prevents GC pauses in the main loop.
 */
export function initParticles(): void {
  pool.length = 0;
  for (let i = 0; i < MAX; i++) {
    pool.push({ active: false, x: 0, y: 0, progress: 0, speed: 0, pipeIdx: -1, alpha: 1, size: 2, pressureRatio: 0 });
  }
  activeCount = 0;
  pulses.length = 0;
}

/**
 * Check out a free slot from the pool and initialize it as a new molecule
 * on the given pipe. Silently drops the request if the pool is full —
 * caps maximum simultaneous draw cost.
 */
function spawn(pipeIdx: number, pressureRatio: number): void {
  if (activeCount >= MAX) return;
  for (let i = 0; i < MAX; i++) {
    const p = pool[i];
    if (!p.active) {
      p.active = true;
      p.progress = 0;
      p.pipeIdx = pipeIdx;
      p.speed = 0.004 + Math.random() * 0.003;
      p.alpha = 0.6 + Math.random() * 0.4;
      p.size = 1.2 + pressureRatio * 1.8;
      p.pressureRatio = pressureRatio;
      activeCount++;
      return;
    }
  }
}

/**
 * Per-render-frame particle update (driven by the main loop, not the sim
 * tick — particles run at render rate for smooth motion).
 *
 * Three passes: advance every active particle along its pipe (speed scales
 * with flow ratio, direction flips with flow sign, perpendicular wave
 * gives a mild organic wobble), spawn new particles per pipe with rate
 * proportional to pressure × flow, and finally update pressure pulses.
 */
export function updateParticles(dt: number): void {
  const s = state;
  const dtFactor = dt / 16.67;

  // Advance existing particles
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
    // Speed along pipe: linear with flow, clamped so low-flow pipes still
    // animate subtly but high-flow ones race.
    p.progress += p.speed * (0.1 + flowFactor * 1.4) * dtFactor * (pipe.flow > 0 ? 1 : -1);

    if (p.progress >= 1 || p.progress <= 0) {
      p.active = false;
      activeCount--;
      continue;
    }

    const c1 = getCenter(pipe.fromId);
    const c2 = getCenter(pipe.toId);
    p.x = c1[0] + (c2[0] - c1[0]) * p.progress;
    p.y = c1[1] + (c2[1] - c1[1]) * p.progress;

    // Update pressure ratio live so color shifts as pressure changes
    p.pressureRatio = pipe.pressure / MAX_PRESSURE;

    // Gentle wave perpendicular to pipe direction
    const perpX = -(c2[1] - c1[1]);
    const perpY = c2[0] - c1[0];
    const len = Math.sqrt(perpX * perpX + perpY * perpY) || 1;
    const wave = Math.sin(p.progress * 20 + performance.now() * 0.003) * 2.5;
    p.x += (perpX / len) * wave;
    p.y += (perpY / len) * wave;
  }

  // Spawn new particles: rate scales with pressure and flow
  for (let i = 0; i < s.pipes.length; i++) {
    const pipe = s.pipes[i];
    const flowMag = Math.abs(pipe.flow);
    if (flowMag < 1) continue;
    const pressureRatio = pipe.pressure / MAX_PRESSURE;
    const flowFactor = Math.min(1, flowMag / pipe.maxFlow);
    // Higher pressure + higher flow → more emissions. Clamp to avoid floods.
    const spawnChance = Math.min(0.55, 0.05 + pressureRatio * 0.35 + flowFactor * 0.25);
    if (Math.random() < spawnChance) spawn(i, pressureRatio);
  }

  updatePulses(dtFactor);
}

/**
 * Draw all pulses first (so molecules sit on top), then every active
 * molecule as a small colored disc whose hue comes from the shared pipe
 * palette and whose alpha varies per-particle for crowd variety.
 */
export function drawParticles(ctx: CanvasRenderingContext2D): void {
  drawPulses(ctx);

  for (let i = 0; i < MAX; i++) {
    const p = pool[i];
    if (!p.active) continue;

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fillStyle = pressureColor(p.pressureRatio, p.alpha * 0.75);
    ctx.fill();
  }
}

/** Debug/diagnostic accessor: how many pool slots are currently in use. */
export function getActiveParticleCount(): number {
  return activeCount;
}

// ─── Pressure pulses (brief waves that travel outward from a node) ────────
// Emitted when an electrolyzer injects or a customer withdraws. Each pulse
// rides a single connected pipe from the node outward for ~1 second.

interface Pulse {
  pipeIdx: number;
  direction: 1 | -1;   // +1 = toward "to", -1 = toward "from"
  progress: number;    // 0..1
  life: number;        // remaining frames
  intensity: number;   // 0..1
  kind: 'inject' | 'withdraw';
}

const pulses: Pulse[] = [];
const MAX_PULSES = 64;

/**
 * Emit a pressure pulse outward from `regionId` along every pipe it
 * touches. Caller supplies whether this is an injection (from an
 * electrolyzer adding H₂) or a withdraw (from a customer consuming).
 * Hard-capped at MAX_PULSES to avoid visual spam.
 */
export function spawnPressurePulse(regionId: string, kind: 'inject' | 'withdraw', intensity = 1): void {
  if (pulses.length >= MAX_PULSES) return;
  const s = state;
  for (let i = 0; i < s.pipes.length; i++) {
    const pipe = s.pipes[i];
    if (pipe.fromId === regionId) {
      pulses.push({ pipeIdx: i, direction: 1, progress: 0, life: 60, intensity, kind });
    } else if (pipe.toId === regionId) {
      pulses.push({ pipeIdx: i, direction: -1, progress: 0, life: 60, intensity, kind });
    }
    if (pulses.length >= MAX_PULSES) return;
  }
}

/**
 * Advance every pulse along its pipe each frame. Pulses fade and expire
 * both by progress (they reach the far end) and by life counter (bounded
 * max duration even if pipes are long). Back-to-front remove so splice
 * indexes stay valid.
 */
function updatePulses(dtFactor: number): void {
  for (let i = pulses.length - 1; i >= 0; i--) {
    const pulse = pulses[i];
    pulse.progress += 0.025 * dtFactor;
    pulse.life -= dtFactor;
    if (pulse.progress >= 1 || pulse.life <= 0) pulses.splice(i, 1);
  }
}

/**
 * Render every active pulse as a glowing disc advancing along its pipe,
 * with radius and alpha both dropping as it ages.
 */
function drawPulses(ctx: CanvasRenderingContext2D): void {
  const s = state;
  for (const pulse of pulses) {
    const pipe = s.pipes[pulse.pipeIdx];
    if (!pipe) continue;
    const c1 = getCenter(pipe.fromId);
    const c2 = getCenter(pipe.toId);
    // Effective progress points from the pulse origin outward
    const t = pulse.direction === 1 ? pulse.progress : 1 - pulse.progress;
    const x = c1[0] + (c2[0] - c1[0]) * t;
    const y = c1[1] + (c2[1] - c1[1]) * t;

    const fade = 1 - pulse.progress;
    const radius = 6 + (1 - pulse.progress) * 10;
    const color = pulse.kind === 'inject' ? COLOR.AMBER_GLOW : COLOR.AMBER_DIM;

    ctx.save();
    ctx.shadowColor = pressureColor(pipe.pressure / MAX_PRESSURE, fade * 0.8);
    ctx.shadowBlur = 18;
    ctx.fillStyle = pulse.kind === 'inject'
      ? pressureColor(pipe.pressure / MAX_PRESSURE, fade * 0.5 * pulse.intensity)
      : withAlpha(color, fade * 0.5 * pulse.intensity);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
