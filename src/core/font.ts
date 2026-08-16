import type { Framebuffer } from './framebuffer.js';
import type { Color } from './color.js';

/** `[yOffset, ...rows]` of `#`/`.`, or a bare number for a blank advance. */
export type GlyphSpec = number | [number, ...string[]];

export interface FontSpec {
  name: string;
  /** Total cell height in pixels. */
  height: number;
  /** Rows above the baseline (i.e. cap height). */
  baseline: number;
  /** Pixels inserted between glyphs. */
  tracking: number;
  spaceWidth: number;
  fallback: GlyphSpec;
  glyphs: Record<string, GlyphSpec>;
}

export interface Glyph {
  width: number;
  yOffset: number;
  /** One bitmask per row, bit (width-1-x) set when the pixel is ink. */
  rows: Uint32Array;
}

export interface BitmapFont {
  name: string;
  height: number;
  baseline: number;
  tracking: number;
  glyphs: Map<string, Glyph>;
  fallback: Glyph;
}

function compileGlyph(spec: GlyphSpec, spaceWidth: number): Glyph {
  if (typeof spec === 'number') {
    return { width: spec || spaceWidth, yOffset: 0, rows: new Uint32Array(0) };
  }
  const [yOffset, ...rows] = spec;
  const width = rows.length ? rows[0].length : 0;
  const bits = new Uint32Array(rows.length);
  rows.forEach((row, i) => {
    if (row.length !== width) {
      throw new Error(`volter-graph: glyph rows must be equal width (got "${row}")`);
    }
    let mask = 0;
    for (let x = 0; x < width; x++) {
      if (row.charCodeAt(x) === 35 /* # */) mask |= 1 << (width - 1 - x);
    }
    bits[i] = mask >>> 0;
  });
  return { width, yOffset, rows: bits };
}

export function compileFont(spec: FontSpec): BitmapFont {
  const glyphs = new Map<string, Glyph>();
  for (const [ch, g] of Object.entries(spec.glyphs)) {
    glyphs.set(ch, compileGlyph(g, spec.spaceWidth));
  }
  return {
    name: spec.name,
    height: spec.height,
    baseline: spec.baseline,
    tracking: spec.tracking,
    glyphs,
    fallback: compileGlyph(spec.fallback, spec.spaceWidth),
  };
}

export function glyphFor(font: BitmapFont, ch: string): Glyph {
  return font.glyphs.get(ch) ?? font.fallback;
}

/** Advance width of `text`, excluding trailing tracking. */
export function measureText(font: BitmapFont, text: string): number {
  let w = 0;
  for (const ch of text) w += glyphFor(font, ch).width + font.tracking;
  return Math.max(0, w - font.tracking);
}

export type HAlign = 'left' | 'center' | 'right';
export type VAlign = 'top' | 'middle' | 'bottom' | 'baseline';

export interface TextOptions {
  align?: HAlign;
  valign?: VAlign;
  /** Draws the text again beneath itself in this color, the retro-UI look. */
  shadow?: Color;
  shadowOffset?: readonly [number, number];
  /** Extra pixels between glyphs, on top of the font's own tracking. */
  letterSpacing?: number;
}

/**
 * Draws `text` with (x, y) as the top-left of the text box by default.
 * All positions are snapped to integers; a bitmap glyph at a fractional
 * offset is the single fastest way to ruin a pixel chart.
 */
export function drawText(
  fb: Framebuffer,
  font: BitmapFont,
  x: number,
  y: number,
  text: string,
  color: Color,
  opts: TextOptions = {}
): void {
  const spacing = font.tracking + (opts.letterSpacing ?? 0);
  const width = measureWithSpacing(font, text, spacing);

  let px = Math.round(x);
  if (opts.align === 'center') px -= width >> 1;
  else if (opts.align === 'right') px -= width;

  let py = Math.round(y);
  if (opts.valign === 'middle') py -= font.height >> 1;
  else if (opts.valign === 'bottom') py -= font.height;
  else if (opts.valign === 'baseline') py -= font.baseline;

  if (opts.shadow !== undefined) {
    const [ox, oy] = opts.shadowOffset ?? [0, 1];
    blitRun(fb, font, px + ox, py + oy, text, opts.shadow, spacing);
  }
  blitRun(fb, font, px, py, text, color, spacing);
}

function measureWithSpacing(font: BitmapFont, text: string, spacing: number): number {
  let w = 0;
  for (const ch of text) w += glyphFor(font, ch).width + spacing;
  return Math.max(0, w - spacing);
}

function blitRun(
  fb: Framebuffer,
  font: BitmapFont,
  x: number,
  y: number,
  text: string,
  color: Color,
  spacing: number
): void {
  let cx = x;
  for (const ch of text) {
    const g = glyphFor(font, ch);
    for (let ry = 0; ry < g.rows.length; ry++) {
      const mask = g.rows[ry];
      if (mask === 0) continue;
      const py = y + g.yOffset + ry;
      for (let rx = 0; rx < g.width; rx++) {
        if ((mask >>> (g.width - 1 - rx)) & 1) fb.set(cx + rx, py, color);
      }
    }
    cx += g.width + spacing;
  }
}
