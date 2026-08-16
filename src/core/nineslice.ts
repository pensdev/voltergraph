import type { Framebuffer } from './framebuffer.js';
import { rect } from './raster.js';
import type { Color } from './color.js';

export interface PanelStyle {
  fill: Color;
  /** 1px outer border. */
  border: Color;
  /** Inner top/left bevel. */
  light: Color;
  /** Inner bottom/right bevel. */
  dark: Color;
  /** Optional hard 1px drop shadow, offset down-right. */
  shadow?: Color;
}

/**
 * The chunky beveled box that carries the whole aesthetic: hard 1px border,
 * a light inner edge on top/left, a dark one on bottom/right, flat fill.
 * No gradients, no rounded corners, no blur.
 */
export function panel(
  fb: Framebuffer,
  x: number,
  y: number,
  w: number,
  h: number,
  style: PanelStyle
): void {
  if (w <= 0 || h <= 0) return;
  x |= 0;
  y |= 0;
  w |= 0;
  h |= 0;

  if (style.shadow !== undefined) {
    fb.fill(x + 1, y + h, w, 1, style.shadow);
    fb.fill(x + w, y + 1, 1, h - 1, style.shadow);
  }

  fb.fill(x + 1, y + 1, w - 2, h - 2, style.fill);
  rect(fb, x, y, w, h, style.border);

  if (w > 2 && h > 2) {
    fb.fill(x + 1, y + 1, w - 2, 1, style.light);
    fb.fill(x + 1, y + 1, 1, h - 2, style.light);
    fb.fill(x + 1, y + h - 2, w - 2, 1, style.dark);
    fb.fill(x + w - 2, y + 1, 1, h - 2, style.dark);
  }
}

/**
 * Inset variant — bevel reversed, for wells and plot backgrounds that should
 * read as sunk into the panel rather than raised off it.
 */
export function inset(
  fb: Framebuffer,
  x: number,
  y: number,
  w: number,
  h: number,
  style: PanelStyle
): void {
  panel(fb, x, y, w, h, { ...style, light: style.dark, dark: style.light, shadow: undefined });
}
