import type { Framebuffer } from './framebuffer.js';
import type { Color } from './color.js';
import { bayerAt } from './dither.js';

/** Horizontal run. `w` may be negative; it is normalized. */
export function hline(fb: Framebuffer, x: number, y: number, w: number, color: Color): void {
  if (w < 0) {
    x += w + 1;
    w = -w;
  }
  fb.fill(x, y, w, 1, color);
}

export function vline(fb: Framebuffer, x: number, y: number, h: number, color: Color): void {
  if (h < 0) {
    y += h + 1;
    h = -h;
  }
  fb.fill(x, y, 1, h, color);
}

/** 1px rectangle outline drawn *inside* the given bounds. */
export function rect(fb: Framebuffer, x: number, y: number, w: number, h: number, color: Color): void {
  if (w <= 0 || h <= 0) return;
  if (h === 1) return void fb.fill(x, y, w, 1, color);
  if (w === 1) return void fb.fill(x, y, 1, h, color);
  fb.fill(x, y, w, 1, color);
  fb.fill(x, y + h - 1, w, 1, color);
  fb.fill(x, y + 1, 1, h - 2, color);
  fb.fill(x + w - 1, y + 1, 1, h - 2, color);
}

export function fillRect(fb: Framebuffer, x: number, y: number, w: number, h: number, color: Color): void {
  fb.fill(x, y, w, h, color);
}

/**
 * Bresenham line. `pattern` is a bitmask sampled along the line's step index —
 * 0xFFFFFFFF is solid, 0x55555555 gives the classic 1-on/1-off dotted rule.
 */
export function line(
  fb: Framebuffer,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: Color,
  pattern = 0xffffffff
): void {
  x0 |= 0;
  y0 |= 0;
  x1 |= 0;
  y1 |= 0;

  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let step = 0;

  for (;;) {
    if ((pattern >>> (step & 31)) & 1) fb.set(x0, y0, color);
    step++;
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/**
 * A dotted line whose phase is anchored to absolute framebuffer coordinates,
 * so parallel gridlines stay in step with each other instead of shimmering.
 */
export function dottedHLine(fb: Framebuffer, x: number, y: number, w: number, color: Color, period = 2): void {
  for (let i = 0; i < w; i++) {
    if ((x + i) % period === 0) fb.set(x + i, y, color);
  }
}

export function dottedVLine(fb: Framebuffer, x: number, y: number, h: number, color: Color, period = 2): void {
  for (let i = 0; i < h; i++) {
    if ((y + i) % period === 0) fb.set(x, y + i, color);
  }
}

/** Midpoint circle outline. */
export function circle(fb: Framebuffer, cx: number, cy: number, r: number, color: Color): void {
  if (r < 0) return;
  let x = r;
  let y = 0;
  let err = 1 - r;
  while (x >= y) {
    fb.set(cx + x, cy + y, color);
    fb.set(cx + y, cy + x, color);
    fb.set(cx - y, cy + x, color);
    fb.set(cx - x, cy + y, color);
    fb.set(cx - x, cy - y, color);
    fb.set(cx - y, cy - x, color);
    fb.set(cx + y, cy - x, color);
    fb.set(cx + x, cy - y, color);
    y++;
    if (err < 0) {
      err += 2 * y + 1;
    } else {
      x--;
      err += 2 * (y - x) + 1;
    }
  }
}

export function fillCircle(fb: Framebuffer, cx: number, cy: number, r: number, color: Color): void {
  if (r < 0) return;
  let x = r;
  let y = 0;
  let err = 1 - r;
  while (x >= y) {
    hline(fb, cx - x, cy + y, 2 * x + 1, color);
    hline(fb, cx - x, cy - y, 2 * x + 1, color);
    hline(fb, cx - y, cy + x, 2 * y + 1, color);
    hline(fb, cx - y, cy - x, 2 * y + 1, color);
    y++;
    if (err < 0) {
      err += 2 * y + 1;
    } else {
      x--;
      err += 2 * (y - x) + 1;
    }
  }
}

export type Point = readonly [number, number];

/**
 * Scanline polygon fill with the even-odd rule, sampling at pixel centers so
 * shared edges between adjacent polygons neither overlap nor leave seams.
 *
 * `ditherLevel` (0..16) fills through the Bayer matrix instead of solidly,
 * which is how area fills stay readable when they overlap — alpha would just
 * produce off-palette mud.
 */
export function fillPolygon(
  fb: Framebuffer,
  points: readonly Point[],
  color: Color,
  ditherLevel?: number
): void {
  const n = points.length;
  if (n < 3) return;

  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, py] of points) {
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }
  const c = fb.clip;
  const y0 = Math.max(c.y0, Math.floor(minY));
  const y1 = Math.min(c.y1 - 1, Math.ceil(maxY));
  const xs: number[] = [];

  for (let y = y0; y <= y1; y++) {
    const sample = y + 0.5;
    xs.length = 0;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const [xi, yi] = points[i];
      const [xj, yj] = points[j];
      if (yi <= sample ? yj > sample : yj <= sample) {
        xs.push(xi + ((sample - yi) / (yj - yi)) * (xj - xi));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const sx = Math.round(xs[k]);
      const ex = Math.round(xs[k + 1]);
      if (ex <= sx) continue;
      if (ditherLevel === undefined) {
        fb.fill(sx, y, ex - sx, 1, color);
      } else {
        for (let x = sx; x < ex; x++) {
          if (bayerAt(x, y, ditherLevel)) fb.set(x, y, color);
        }
      }
    }
  }
}

/** Connected 1px polyline. */
export function polyline(fb: Framebuffer, points: readonly Point[], color: Color, pattern = 0xffffffff): void {
  for (let i = 1; i < points.length; i++) {
    line(fb, points[i - 1][0], points[i - 1][1], points[i][0], points[i][1], color, pattern);
  }
}

/**
 * Pixel-art "thick" line: a 1px core with a 1px outline offset around it.
 * Real stroke-width thickening produces lumpy joins at this resolution.
 */
export function outlinedPolyline(
  fb: Framebuffer,
  points: readonly Point[],
  core: Color,
  outline: Color
): void {
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
    polyline(
      fb,
      points.map(([x, y]) => [x + dx, y + dy] as Point),
      outline
    );
  }
  polyline(fb, points, core);
}
