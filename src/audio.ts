import { $ } from './dom';

interface AudioState {
  ctx: AudioContext | null;
  enabled: boolean;
  initialized: boolean;
  ambientGain: GainNode | null;
  ambientStarted: boolean;
}

const audio: AudioState = {
  ctx: null,
  enabled: true,
  initialized: false,
  ambientGain: null,
  ambientStarted: false
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
  $('#sound-icon').textContent = audio.enabled ? '🔊' : '🔇';
  if (audio.ambientGain && audio.ctx) {
    const target = audio.enabled ? 0.012 : 0.0;
    audio.ambientGain.gain.linearRampToValueAtTime(target, audio.ctx.currentTime + 0.25);
  }
}

// ─── Ambient hum (starts on first click, runs while enabled) ─────────────

/**
 * Start the continuous ambient background hum: two sine oscillators at
 * ~55 Hz detuned by 0.6 Hz, through a gentle low-pass, at near-inaudible
 * level. Idempotent — subsequent calls are ignored once started.
 */
function startAmbient(): void {
  if (!audio.ctx || audio.ambientStarted) return;
  const ctx = audio.ctx;
  try {
    // Two detuned sines + a gentle low-pass for warmth, at near-inaudible level
    const gain = ctx.createGain();
    gain.gain.value = 0.0;
    gain.connect(ctx.destination);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    lp.Q.value = 0.5;
    lp.connect(gain);
    const a = ctx.createOscillator(); a.type = 'sine'; a.frequency.value = 55;
    const b = ctx.createOscillator(); b.type = 'sine'; b.frequency.value = 55.6;
    a.connect(lp); b.connect(lp);
    a.start(); b.start();
    // Ramp up slowly so it doesn't click
    gain.gain.linearRampToValueAtTime(audio.enabled ? 0.012 : 0, ctx.currentTime + 1.2);
    audio.ambientGain = gain;
    audio.ambientStarted = true;
  } catch {
    // Context denied or closed — ignore.
  }
}

/**
 * Low-level one-shot oscillator playback. All named sfx helpers below are
 * thin wrappers around this — they pick a waveform, pitch sweep, duration
 * and volume. Silently no-ops if sound is muted or the context isn't up.
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
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + dur);
  } catch {
    // Ignore transient audio errors (e.g. context closed on unload).
  }
}

/** UI click sfx (build-btn selection, tutorial advance). */
export function playClick(): void { play('sine', 800, 1200, 0.08, 0.1); }

/**
 * Solar/wind/nuclear/pipe build sfx. Two-note rising triangle→sine so it
 * reads as "construction complete" rather than a click.
 */
export function playBuild(): void {
  play('triangle', 300, 800, 0.15, 0.15);
  setTimeout(() => play('sine', 600, 1200, 0.1, 0.1), 100);
}

/**
 * New-customer arpeggio (C-E-G ascending). Triggers once per emergent
 * customer via customers.ts; paired with a region-flash overlay.
 */
export function playCustomer(): void {
  play('sine', 523, 659, 0.12, 0.12);
  setTimeout(() => play('sine', 659, 784, 0.12, 0.1), 120);
  setTimeout(() => play('sine', 784, 1047, 0.15, 0.1), 240);
}

/** High-pitched ding reserved for cash-milestone events. */
export function playMoney(): void { play('sine', 2000, 2500, 0.06, 0.08); }

/** Low urgent square for warning states (currently unused but ready). */
export function playWarning(): void { play('square', 200, 100, 0.3, 0.08); }

/**
 * Short airy sweep played when the network's average pressure crosses a
 * threshold (25/50/70 bar rising edge) — gives the player auditory
 * feedback that the backbone is building up.
 */
export function playWhoosh(): void {
  if (!audio.enabled || !audio.ctx) return;
  try {
    const ctx = audio.ctx;
    // Noise-like sweep: sawtooth through a band-pass sweeping upward.
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(60, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + 0.4);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(400, ctx.currentTime);
    bp.frequency.exponentialRampToValueAtTime(1800, ctx.currentTime + 0.4);
    bp.Q.value = 2.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    o.connect(bp).connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.55);
  } catch {
    // Ignore transient errors.
  }
}

/**
 * Bubbly electrolyzer-startup sfx: three short ascending blips reminiscent
 * of hydrogen coming off the cathode. Played from buildings.ts when an
 * electrolyzer is placed.
 */
export function playBubble(): void {
  play('sine', 400, 700, 0.08, 0.08);
  setTimeout(() => play('sine', 600, 900, 0.07, 0.06), 90);
  setTimeout(() => play('sine', 800, 1200, 0.06, 0.05), 180);
}
