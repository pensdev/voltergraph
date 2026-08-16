import type { Framebuffer } from './framebuffer.js';
import type { Color } from './color.js';

/**
 * Shading in pixel art is a pattern, not an alpha value. Everything that would
 * be `opacity: 0.5` in a normal chart library is a dither here.
 */

/** 4x4 ordered (Bayer) matrix, values 0..15. */
export const BAYER4: readonly number[] = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
];

/** Threshold at absolute coordinates. `level` 0..16: 0 = all bg, 16 = all fg. */
export function bayerAt(x: number, y: number, level: number): boolean {
  return BAYER4[(y & 3) * 4 + (x & 3)] < level;
}

/**
 * Ordered-dither fill. Phase is tied to absolute coordinates so adjacent
 * shapes tile seamlessly instead of showing a visible seam at their edge.
 */
export function ditherFill(
  fb: Framebuffer,
  x: number,
  y: number,
  w: number,
  h: number,
  fg: Color,
  bg: Color | null,
  level: number
): void {
  const c = fb.clip;
  const x0 = Math.max(c.x0, x | 0);
  const y0 = Math.max(c.y0, y | 0);
  const x1 = Math.min(c.x1, (x | 0) + (w | 0));
  const y1 = Math.min(c.y1, (y | 0) + (h | 0));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      if (bayerAt(xx, yy, level)) fb.set(xx, yy, fg);
      else if (bg !== null) fb.set(xx, yy, bg);
    }
  }
}

/** 50% checkerboard — the classic two-tone shade. `phase` flips which cell wins. */
export function checkerFill(
  fb: Framebuffer,
  x: number,
  y: number,
  w: number,
  h: number,
  a: Color,
  b: Color | null,
  phase = 0
): void {
  const c = fb.clip;
  const x0 = Math.max(c.x0, x | 0);
  const y0 = Math.max(c.y0, y | 0);
  const x1 = Math.min(c.x1, (x | 0) + (w | 0));
  const y1 = Math.min(c.y1, (y | 0) + (h | 0));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      if (((xx + yy + phase) & 1) === 0) fb.set(xx, yy, a);
      else if (b !== null) fb.set(xx, yy, b);
    }
  }
}

/** 25% scatter — a lighter veil than the checker, used for hover washes. */
export function sparseFill(
  fb: Framebuffer,
  x: number,
  y: number,
  w: number,
  h: number,
  color: Color
): void {
  ditherFill(fb, x, y, w, h, color, null, 4);
}
