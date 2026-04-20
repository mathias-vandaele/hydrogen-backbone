import { $ } from './dom';

interface AudioState {
  ctx: AudioContext | null;
  enabled: boolean;
  initialized: boolean;
}

const audio: AudioState = {
  ctx: null,
  enabled: true,
  initialized: false
};

export function initAudio(): void {
  // Defer AudioContext creation to first user interaction (browser autoplay policy).
  const handler = () => {
    if (!audio.initialized) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) audio.ctx = new Ctor();
      audio.initialized = true;
    }
    document.removeEventListener('click', handler);
  };
  document.addEventListener('click', handler);
}

export function toggleAudio(): void {
  audio.enabled = !audio.enabled;
  $('#sound-icon').textContent = audio.enabled ? '🔊' : '🔇';
}

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

export function playClick(): void { play('sine', 800, 1200, 0.08, 0.1); }

export function playBuild(): void {
  play('triangle', 300, 800, 0.15, 0.15);
  setTimeout(() => play('sine', 600, 1200, 0.1, 0.1), 100);
}

export function playCustomer(): void {
  play('sine', 523, 659, 0.12, 0.12);
  setTimeout(() => play('sine', 659, 784, 0.12, 0.1), 120);
  setTimeout(() => play('sine', 784, 1047, 0.15, 0.1), 240);
}

export function playMoney(): void { play('sine', 2000, 2500, 0.06, 0.08); }
export function playWarning(): void { play('square', 200, 100, 0.3, 0.08); }
