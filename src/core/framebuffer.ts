import { alphaOf, unpack, rgba, type Color } from './color.js';

interface ClipRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * A logical-pixel canvas. Every drawing primitive in the library writes here;
 * nothing ever touches the Canvas2D vector API, which is what keeps output
 * free of antialiasing and byte-for-byte reproducible across platforms.
 */
export class Framebuffer {
  readonly width: number;
  readonly height: number;
  readonly data: Uint32Array;

  private clipRect: ClipRect;
  private clipStack: ClipRect[] = [];

  constructor(width: number, height: number) {
    this.width = Math.max(1, width | 0);
    this.height = Math.max(1, height | 0);
    this.data = new Uint32Array(this.width * this.height);
    this.clipRect = { x0: 0, y0: 0, x1: this.width, y1: this.height };
  }

  clear(color: Color = 0): void {
    this.data.fill(color >>> 0);
  }

  /** Intersects the current clip with `rect` and pushes it. */
  pushClip(x: number, y: number, w: number, h: number): void {
    const c = this.clipRect;
    this.clipStack.push(c);
    this.clipRect = {
      x0: Math.max(c.x0, x | 0),
      y0: Math.max(c.y0, y | 0),
      x1: Math.min(c.x1, (x | 0) + (w | 0)),
      y1: Math.min(c.y1, (y | 0) + (h | 0)),
    };
  }

  popClip(): void {
    const prev = this.clipStack.pop();
    if (prev) this.clipRect = prev;
  }

  get clip(): Readonly<ClipRect> {
    return this.clipRect;
  }

  /** Writes one pixel. Fully transparent skips, opaque overwrites, else src-over. */
  set(x: number, y: number, color: Color): void {
    const c = this.clipRect;
    if (x < c.x0 || y < c.y0 || x >= c.x1 || y >= c.y1) return;
    const a = alphaOf(color);
    if (a === 0) return;
    const i = y * this.width + x;
    if (a === 255) {
      this.data[i] = color >>> 0;
      return;
    }
    this.data[i] = blend(this.data[i], color, a);
  }

  /** Unclipped, unblended write. Only for hot loops that pre-clipped themselves. */
  setUnsafe(x: number, y: number, color: Color): void {
    this.data[y * this.width + x] = color >>> 0;
  }

  get(x: number, y: number): Color {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 0;
    return this.data[y * this.width + x];
  }

  fill(x: number, y: number, w: number, h: number, color: Color): void {
    const c = this.clipRect;
    const x0 = Math.max(c.x0, x | 0);
    const y0 = Math.max(c.y0, y | 0);
    const x1 = Math.min(c.x1, (x | 0) + (w | 0));
    const y1 = Math.min(c.y1, (y | 0) + (h | 0));
    if (x1 <= x0 || y1 <= y0) return;

    const a = alphaOf(color);
    if (a === 0) return;

    if (a === 255) {
      const v = color >>> 0;
      for (let yy = y0; yy < y1; yy++) {
        this.data.fill(v, yy * this.width + x0, yy * this.width + x1);
      }
      return;
    }
    for (let yy = y0; yy < y1; yy++) {
      const row = yy * this.width;
      for (let xx = x0; xx < x1; xx++) {
        this.data[row + xx] = blend(this.data[row + xx], color, a);
      }
    }
  }

  /** RGBA bytes over the same buffer — no copy. */
  bytes(): Uint8ClampedArray {
    return new Uint8ClampedArray(this.data.buffer);
  }
}

function blend(dst: Color, src: Color, srcAlpha: number): Color {
  const [sr, sg, sb] = unpack(src);
  const [dr, dg, db, da] = unpack(dst);
  const t = srcAlpha / 255;
  return rgba(
    Math.round(dr + (sr - dr) * t),
    Math.round(dg + (sg - dg) * t),
    Math.round(db + (sb - db) * t),
    Math.max(da, srcAlpha)
  );
}
