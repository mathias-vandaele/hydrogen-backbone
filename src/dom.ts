// Tiny typed DOM query helpers. Centralized here so call sites stay readable
// and we can throw loud, helpful errors when a selector is wrong.

/**
 * Required element lookup. Throws if the selector matches nothing so typos
 * are caught immediately at boot rather than NPE-ing later.
 */
export function $<T extends Element = HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Element not found: ${selector}`);
  return el;
}

/**
 * Optional element lookup. Use when the target may legitimately be absent
 * (e.g. UI nodes that are only rendered in certain screens).
 */
export function $maybe<T extends Element = HTMLElement>(selector: string): T | null {
  return document.querySelector<T>(selector);
}

/**
 * NodeList lookup; iterate with .forEach or spread into an array at the call
 * site. Returns live HTMLElements by default.
 */
export function $$<T extends Element = HTMLElement>(selector: string): NodeListOf<T> {
  return document.querySelectorAll<T>(selector);
}

/**
 * Install a CanvasRenderingContext2D.roundRect polyfill on browsers that
 * don't yet ship the native method. Modern Chrome/Safari/Firefox already
 * have it, so this is a no-op on up-to-date builds. Called once from boot.
 */
export function installRoundRectPolyfill(): void {
  const proto = CanvasRenderingContext2D.prototype as unknown as {
    roundRect?: (x: number, y: number, w: number, h: number, r: number | number[]) => void;
  };
  if (typeof proto.roundRect === 'function') return;
  proto.roundRect = function (this: CanvasRenderingContext2D, x, y, w, h, r) {
    const radii = typeof r === 'number' ? [r, r, r, r] : r;
    const [tl, tr, br, bl] = radii;
    this.moveTo(x + tl, y);
    this.lineTo(x + w - tr, y);
    this.quadraticCurveTo(x + w, y, x + w, y + tr);
    this.lineTo(x + w, y + h - br);
    this.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
    this.lineTo(x + bl, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - bl);
    this.lineTo(x, y + tl);
    this.quadraticCurveTo(x, y, x + tl, y);
    this.closePath();
  };
}
