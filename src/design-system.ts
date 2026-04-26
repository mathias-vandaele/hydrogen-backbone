// ═══════════════════════════════════════════════════════════════════════
// THE BACKBONE — DESIGN SYSTEM
// ═══════════════════════════════════════════════════════════════════════
// References: Saul Bass, Dieter Rams, Centre Pompidou, NASA Apollo.
// Every visual decision in the game imports from this file.
// ═══════════════════════════════════════════════════════════════════════

// ─── COLOR TOKENS ──────────────────────────────────────────────────────
// A four-color system. Ruthless. Nothing else is permitted.

export const COLOR = {
  // Surfaces — warm deep blue-black, not pure black (which feels digital)
  SURFACE_DEEP:     '#0A1420',
  SURFACE_BASE:     '#0F1C2B',
  SURFACE_RAISED:   '#16253A',
  SURFACE_BORDER:   '#1E3149',

  // Primary amber — carries the main informational load
  // Sodium-vapor industrial signage, not cartoon yellow
  AMBER_DIM:        '#8C6B1F',
  AMBER_BASE:       '#D4A533',
  AMBER_BRIGHT:     '#FFC857',
  AMBER_GLOW:       '#FFE0A0',

  // Secondary teal — storage, cooling, counter-current systems
  // Soft, not neon — muted maritime blue-green
  TEAL_DIM:         '#1A5A5A',
  TEAL_BASE:        '#1EA896',
  TEAL_BRIGHT:      '#6EE2C9',

  // Alert rust — curtailment, warnings, failure states
  // Industrial oxidation, not fire-engine red
  RUST_DIM:         '#6B3020',
  RUST_BASE:        '#C84B31',
  RUST_BRIGHT:      '#F07B5A',

  // Typography
  TYPE_PRIMARY:     '#E8E4DB',
  TYPE_SECONDARY:   '#A8A097',
  TYPE_TERTIARY:    '#6B665D',
  TYPE_ON_AMBER:    '#0A1420',
} as const;

// ─── TYPOGRAPHY ────────────────────────────────────────────────────────
// Two typefaces, no more. Mono for numbers + labels, Display for headers.
// Both must be web-safe loaded via @fontsource or system fallback.

export const TYPE = {
  MONO:    '"IBM Plex Mono", "Courier New", monospace',
  DISPLAY: '"Space Grotesk", "Helvetica Neue", sans-serif',

  SIZE: {
    MICRO:   '10px',
    SMALL:   '12px',
    BASE:    '14px',
    LARGE:   '16px',
    XL:      '20px',
    DISPLAY: '32px',
    HERO:    '48px',
  },

  WEIGHT: {
    REGULAR: 400,
    MEDIUM:  500,
    BOLD:    600,
  },

  TRACKING: {
    TIGHT:  '-0.02em',
    NORMAL: '0',
    WIDE:   '0.08em',
    WIDER:  '0.15em',
  },
} as const;

// ─── GEOMETRY ──────────────────────────────────────────────────────────
// 4px grid. Every spatial decision snaps to a multiple of 4.

export const GRID = {
  UNIT: 4,

  RADIUS: {
    NONE:  0,
    SMALL: 2,
    BASE:  4,
    LARGE: 8,
  },

  STROKE: {
    HAIR:    0.5,
    THIN:    1,
    REGULAR: 1.5,
    HEAVY:   2,
  },
} as const;

// ─── MOTION ────────────────────────────────────────────────────────────
// Movement is earned, not automatic. Nothing animates without reason.

export const MOTION = {
  DURATION: {
    INSTANT: 80,
    QUICK:   160,
    BASE:    240,
    SLOW:    480,
    AMBIENT: 2000,
  },
  EASING: {
    STANDARD:  'cubic-bezier(0.4, 0.0, 0.2, 1)',
    DECEL:     'cubic-bezier(0.0, 0.0, 0.2, 1)',
    ACCEL:     'cubic-bezier(0.4, 0.0, 1.0, 1.0)',
  },
} as const;

// ─── SURFACE TEXTURE ───────────────────────────────────────────────────
// The element that transforms "generic dark UI" into "real instrument."
// Applied as a single overlay layer across the whole app.

export const TEXTURE = {
  NOISE_ALPHA: 0.03,
  SCANLINE_ALPHA: 0.04,
  SCANLINE_SPACING: 2,
  VIGNETTE_ALPHA: 0.25,
} as const;

// ─── GLOW CONVENTIONS ──────────────────────────────────────────────────
// Glow is used for meaningful state, never decorative. Three intensities:

export const GLOW = {
  SUBTLE: {
    blur: 4,
    alpha: 0.3,
  },
  MEDIUM: {
    blur: 12,
    alpha: 0.5,
  },
  PEAK: {
    blur: 32,
    alpha: 0.8,
  },
} as const;

type ColorValue = typeof COLOR[keyof typeof COLOR];

interface RGB {
  r: number;
  g: number;
  b: number;
}

const rgbCache = new Map<string, RGB>();

function hexToRgb(hex: string): RGB {
  const key = hex.toLowerCase();
  const cached = rgbCache.get(key);
  if (cached) return cached;
  const value = key.replace('#', '');
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  const rgb = { r, g, b };
  rgbCache.set(key, rgb);
  return rgb;
}

function blendColor(a: ColorValue, b: ColorValue, t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const mix = (from: number, to: number) => Math.round(from + (to - from) * clamped);
  return `#${[mix(ca.r, cb.r), mix(ca.g, cb.g), mix(ca.b, cb.b)]
    .map(v => v.toString(16).padStart(2, '0'))
    .join('')}`;
}

export function withAlpha(color: ColorValue | string, alpha: number): string {
  const { r, g, b } = hexToRgb(color);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

export function pressureColor(ratio: number, alpha = 1): string {
  const t = Math.max(0, Math.min(1, ratio));
  let color: string;
  if (t < 0.15) {
    color = blendColor(COLOR.RUST_DIM, COLOR.AMBER_DIM, t / 0.15);
  } else if (t < 0.6) {
    color = blendColor(COLOR.AMBER_DIM, COLOR.AMBER_BASE, (t - 0.15) / 0.45);
  } else {
    color = blendColor(COLOR.AMBER_BASE, COLOR.AMBER_BRIGHT, (t - 0.6) / 0.4);
  }
  return alpha >= 1 ? color : withAlpha(color, alpha);
}

export function canvasFont(
  size: keyof typeof TYPE.SIZE | string,
  family: 'mono' | 'display',
  weight: keyof typeof TYPE.WEIGHT | number = 'REGULAR'
): string {
  const resolvedSize = size in TYPE.SIZE ? TYPE.SIZE[size as keyof typeof TYPE.SIZE] : size;
  const resolvedFamily = family === 'mono' ? TYPE.MONO : TYPE.DISPLAY;
  const resolvedWeight = typeof weight === 'number' ? weight : TYPE.WEIGHT[weight];
  return `${resolvedWeight} ${resolvedSize} ${resolvedFamily}`;
}

function kebab(input: string): string {
  return input.toLowerCase().replaceAll('_', '-');
}

function setNestedTokens(prefix: string, value: unknown, root: CSSStyleDeclaration): void {
  if (typeof value === 'string' || typeof value === 'number') {
    root.setProperty(prefix, String(value));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, nestedValue] of Object.entries(value)) {
    setNestedTokens(`${prefix}-${kebab(key)}`, nestedValue, root);
  }
}

export function installDesignSystemTokens(): void {
  const root = document.documentElement.style;
  setNestedTokens('--bb-color', COLOR, root);
  setNestedTokens('--bb-type', TYPE, root);
  setNestedTokens('--bb-grid', GRID, root);
  setNestedTokens('--bb-motion', MOTION, root);
  setNestedTokens('--bb-texture', TEXTURE, root);
  setNestedTokens('--bb-glow', GLOW, root);
}

export function generateNoiseDataURL(): string {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const imageData = ctx.createImageData(128, 128);
  for (let i = 0; i < imageData.data.length; i += 4) {
    const v = Math.floor(Math.random() * 32);
    imageData.data[i] = imageData.data[i + 1] = imageData.data[i + 2] = v;
    imageData.data[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL();
}
