// Tiny typed query helpers. Cast at the call site when you need a specific element type.

export function $<T extends Element = HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Element not found: ${selector}`);
  return el;
}

export function $maybe<T extends Element = HTMLElement>(selector: string): T | null {
  return document.querySelector<T>(selector);
}

export function $$<T extends Element = HTMLElement>(selector: string): NodeListOf<T> {
  return document.querySelectorAll<T>(selector);
}

// roundRect polyfill for older browsers. Modern Chrome/Safari/Firefox already ship it.
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
