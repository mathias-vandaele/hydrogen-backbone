import { $ } from './dom';
import { setDomIcon } from './icons';

interface AudioState {
  ctx: AudioContext | null;
  enabled: boolean;
  initialized: boolean;
  ambientGain: GainNode | null;
  ambientStarted: boolean;
  /** Timestamp of last bankruptcy heartbeat beat (ms). */
  lastHeartbeat: number;
  /** Current beat interval — shortens as runway shrinks. */
  heartbeatIntervalMs: number;
}

const audio: AudioState = {
  ctx: null,
  enabled: true,
  initialized: false,
  ambientGain: null,
  ambientStarted: false,
  lastHeartbeat: 0,
  heartbeatIntervalMs: 0
};

/**
 * Set up the one-shot handler that creates the AudioContext on the first
 * user click. Browser autoplay policies forbid creating audio contexts
 * before a user gesture, so we defer. Also kicks off the ambient hum
 * once the context exists.
 */
export function initAudio(): void {
  const handler = () => {
    if (!audio.initialized) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) audio.ctx = new Ctor();
      audio.initialized = true;
      startAmbient();
    }
    document.removeEventListener('click', handler);
  };
  document.addEventListener('click', handler);
}

/**
 * Mute/unmute everything. One-shot sfx simply check `audio.enabled`; the
 * ambient hum is faded in/out so there's no click.
 */
export function toggleAudio(): void {
  audio.enabled = !audio.enabled;
  setDomIcon($('#sound-icon'), audio.enabled ? 'soundOn' : 'soundOff');
  if (audio.ambientGain && audio.ctx) {
    const target = audio.enabled ? 0.009 : 0.0;
    audio.ambientGain.gain.linearRampToValueAtTime(target, audio.ctx.currentTime + 0.25);
  }
}

// ─── Ambient hum (starts on first click, runs while enabled) ─────────────

/**
 * Start the continuous ambient room tone: two low oscillators around
 * 40 Hz, detuned just enough to feel like old electrical equipment in a
 * real control room. Idempotent — subsequent calls are ignored once started.
 */
function startAmbient(): void {
  if (!audio.ctx || audio.ambientStarted) return;
  const ctx = audio.ctx;
  try {
    const gain = ctx.createGain();
    gain.gain.value = 0.0;
    gain.connect(ctx.destination);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    lp.Q.value = 0.7;
    lp.connect(gain);
    const a = ctx.createOscillator(); a.type = 'sine'; a.frequency.value = 41;
    const b = ctx.createOscillator(); b.type = 'triangle'; b.frequency.value = 41.7;
    a.connect(lp); b.connect(lp);
    a.start(); b.start();
    // Ramp up slowly so it doesn't click
    gain.gain.linearRampToValueAtTime(audio.enabled ? 0.009 : 0, ctx.currentTime + 1.2);
    audio.ambientGain = gain;
    audio.ambientStarted = true;
  } catch {
    // Context denied or closed — ignore.
  }
}

/**
 * Low-level one-shot oscillator playback. The oscillator is filtered so
 * even synthetic tones arrive as warm relays and metalwork, not arcade UI.
 */
function play(type: OscillatorType, freq: number, freqEnd: number | null, dur: number, vol: number): void {
  if (!audio.enabled || !audio.ctx) return;
  try {
    const ctx = audio.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (freqEnd !== null) o.frequency.exponentialRampToValueAtTime(freqEnd, ctx.currentTime + dur * 0.7);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    lp.Q.value = 0.6;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(lp).connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + dur);
  } catch {
    // Ignore transient audio errors (e.g. context closed on unload).
  }
}

function playNoiseBurst(dur: number, vol: number, filterFreq: number, delay = 0): void {
  if (!audio.enabled || !audio.ctx) return;
  try {
    const ctx = audio.ctx;
    const samples = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, samples, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < samples; i++) {
      const decay = 1 - i / samples;
      data[i] = (Math.random() * 2 - 1) * decay * decay;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = filterFreq;
    bp.Q.value = 4;
    const g = ctx.createGain();
    const t = ctx.currentTime + delay;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(bp).connect(g).connect(ctx.destination);
    src.start(t);
  } catch {
    // Ignore transient audio errors.
  }
}

function playBell(freq: number, delay = 0, vol = 0.08, dur = 0.42): void {
  if (!audio.enabled || !audio.ctx) return;
  try {
    const ctx = audio.ctx;
    const t = ctx.currentTime + delay;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    lp.Q.value = 0.7;
    lp.connect(g).connect(ctx.destination);
    for (const [multiple, gain] of [[1, 1], [2.01, 0.34], [2.98, 0.18]] as const) {
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      o.type = multiple === 1 ? 'triangle' : 'sine';
      o.frequency.setValueAtTime(freq * multiple, t);
      og.gain.value = gain;
      o.connect(og).connect(lp);
      o.start(t);
      o.stop(t + dur);
    }
  } catch {
    // Ignore transient audio errors.
  }
}

/** UI click sfx: a short mechanical switch, not a digital beep. */
export function playClick(): void {
  playNoiseBurst(0.026, 0.12, 1800);
  play('square', 150, 92, 0.045, 0.026);
}

/**
 * Solar/wind/nuclear/pipe build sfx. Two-note rising triangle→sine so it
 * reads as "construction complete" rather than a click.
 */
export function playBuild(): void {
  playClick();
  setTimeout(() => play('triangle', 180, 108, 0.12, 0.08), 58);
  setTimeout(() => playNoiseBurst(0.045, 0.08, 900), 82);
}

/**
 * New-customer arpeggio (C-E-G ascending). Triggers once per emergent
 * customer via customers.ts; paired with a region-flash overlay.
 */
export function playCustomer(): void {
  playBell(392, 0, 0.08, 0.46);
  playBell(523, 0.11, 0.055, 0.5);
}

/** Ledger tick reserved for cash-milestone events. */
export function playMoney(): void {
  playNoiseBurst(0.018, 0.08, 2200);
  play('triangle', 620, 520, 0.06, 0.035);
}

/** Low urgent relay buzz for warning states (currently unused but ready). */
export function playWarning(): void {
  play('square', 120, 70, 0.22, 0.055);
  setTimeout(() => playNoiseBurst(0.06, 0.05, 300), 30);
}

/**
 * Soft pressure pulse played when average pressure crosses a band
 * (25/50/70 bar rising edge). This is an acknowledgment thump, not an
 * alarm or whoosh.
 */
export function playWhoosh(): void {
  play('triangle', 118, 74, 0.26, 0.055);
  playNoiseBurst(0.08, 0.035, 260);
}

/**
 * Bubbly electrolyzer-startup sfx: three short ascending blips reminiscent
 * of hydrogen coming off the cathode. Played from buildings.ts when an
 * electrolyzer is placed.
 */
export function playBubble(): void {
  playClick();
  setTimeout(() => playClick(), 80);
  setTimeout(() => play('triangle', 360, 420, 0.08, 0.04), 155);
}

/**
 * Contract latch: a small secondary mechanical confirmation when a new
 * customer appears. It replaces the old "cash register" idea with
 * something more like a stamped order crossing a desk.
 */
export function playChaChing(): void {
  setTimeout(() => playNoiseBurst(0.028, 0.1, 1600), 210);
  setTimeout(() => play('square', 190, 130, 0.06, 0.04), 230);
}

/** Three-tone ascending mechanical chime for research completion/advance. */
export function playResearchComplete(): void {
  playBell(330, 0, 0.055, 0.34);
  playBell(392, 0.12, 0.055, 0.36);
  playBell(494, 0.24, 0.06, 0.42);
}

/** Deeper sustained chord reserved for the endgame cinematic. */
export function playEscapeVelocity(): void {
  playBell(98, 0, 0.09, 1.8);
  playBell(147, 0.08, 0.07, 1.9);
  playBell(196, 0.16, 0.055, 2.0);
}

/** Muted, slightly-detuned "thud" — one beat of the bankruptcy heartbeat. */
function playHeartbeat(intensity: number): void {
  if (!audio.enabled || !audio.ctx) return;
  try {
    const ctx = audio.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(48, ctx.currentTime + 0.22);
    const g = ctx.createGain();
    const peak = Math.min(0.14, 0.05 + intensity * 0.1);
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(peak, ctx.currentTime + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.3);
  } catch {
    // Silently no-op on transient failure.
  }
}

/**
 * Per-frame audio side-effects driven by the financial state. Called
 * from the main loop with the current runway (in game-days). Produces
 * a quiet, escalating heartbeat as runway shortens:
 *   - Runway > 60 days   → silent.
 *   - 60..30 days        → slow pulse (~2s interval).
 *   - 30..10 days        → medium pulse (~1s).
 *   - < 10 days          → fast pulse (~0.5s), louder.
 * The function is stateless at the caller's level; it tracks its own
 * last-beat timestamp and adjusts the interval on every call.
 */
export function updateFinancialAudio(runwayDays: number): void {
  if (!audio.enabled || !audio.ctx) { audio.lastHeartbeat = 0; return; }
  if (!Number.isFinite(runwayDays) || runwayDays >= 60) {
    audio.heartbeatIntervalMs = 0;
    return;
  }
  // Map runway → interval. Below 10 days, fast; otherwise linearly.
  let interval: number;
  let intensity: number;
  if (runwayDays < 10) {
    interval = 500;
    intensity = 1;
  } else if (runwayDays < 30) {
    interval = 1000;
    intensity = 0.7;
  } else {
    interval = 2000;
    intensity = 0.4;
  }
  audio.heartbeatIntervalMs = interval;
  const now = performance.now();
  if (now - audio.lastHeartbeat >= interval) {
    playHeartbeat(intensity);
    audio.lastHeartbeat = now;
  }
}
