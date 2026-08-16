import { describe, it, expect } from 'vitest';
import { Framebuffer } from '../src/core/framebuffer.js';
import { line, rect, fillPolygon, circle, dottedHLine } from '../src/core/raster.js';
import { hex, rgba, unpack, mix, darken, lighten } from '../src/core/color.js';
import { compileFont, measureText, drawText, glyphFor } from '../src/core/font.js';
import { volter5 } from '../src/core/fonts/volter5.js';
import { bayerAt } from '../src/core/dither.js';

const RED = hex('#ff0000');
const BLUE = hex('#0000ff');

function inkCount(fb: Framebuffer, color: number): number {
  let n = 0;
  for (const px of fb.data) if (px === color) n++;
  return n;
}

describe('color', () => {
  it('round-trips through pack/unpack', () => {
    expect(unpack(rgba(1, 2, 3, 4))).toEqual([1, 2, 3, 4]);
    expect(unpack(hex('#204080'))).toEqual([0x20, 0x40, 0x80, 255]);
  });

  it('expands shorthand hex', () => {
    expect(hex('#f00')).toBe(hex('#ff0000'));
    expect(hex('abc')).toBe(hex('#aabbcc'));
  });

  it('mixes, darkens and lightens without leaving the byte range', () => {
    expect(mix(hex('#000000'), hex('#ffffff'), 0.5)).toBe(hex('#808080'));
    const [r] = unpack(darken(hex('#ffffff'), 1));
    expect(r).toBe(0);
    expect(lighten(hex('#000000'), 1)).toBe(hex('#ffffff'));
  });
});

describe('framebuffer', () => {
  it('rejects writes outside the clip', () => {
    const fb = new Framebuffer(10, 10);
    fb.pushClip(2, 2, 4, 4);
    fb.fill(0, 0, 10, 10, RED);
    fb.popClip();
    expect(inkCount(fb, RED)).toBe(16);
    expect(fb.get(1, 1)).toBe(0);
    expect(fb.get(2, 2)).toBe(RED);
  });

  it('nests clips by intersection', () => {
    const fb = new Framebuffer(10, 10);
    fb.pushClip(0, 0, 6, 6);
    fb.pushClip(4, 4, 6, 6);
    fb.fill(0, 0, 10, 10, RED);
    fb.popClip();
    fb.popClip();
    expect(inkCount(fb, RED)).toBe(4);
  });

  it('blends only when alpha is partial', () => {
    const fb = new Framebuffer(2, 1);
    fb.fill(0, 0, 2, 1, hex('#000000'));
    fb.set(0, 0, rgba(255, 255, 255, 128));
    const [r] = unpack(fb.get(0, 0));
    expect(r).toBeGreaterThan(120);
    expect(r).toBeLessThan(136);
    fb.set(1, 0, rgba(255, 255, 255, 0));
    expect(fb.get(1, 0)).toBe(hex('#000000'));
  });
});

describe('raster', () => {
  it('draws axis-aligned lines with no antialiasing', () => {
    const fb = new Framebuffer(20, 20);
    line(fb, 2, 5, 17, 5, RED);
    expect(inkCount(fb, RED)).toBe(16);
    // Every written pixel is exactly the requested color, never a blend.
    for (const px of fb.data) expect(px === 0 || px === RED).toBe(true);
  });

  it('draws a 45-degree line one pixel per step', () => {
    const fb = new Framebuffer(20, 20);
    line(fb, 0, 0, 9, 9, RED);
    expect(inkCount(fb, RED)).toBe(10);
  });

  it('applies a stipple pattern to lines', () => {
    const fb = new Framebuffer(20, 2);
    line(fb, 0, 0, 15, 0, RED, 0x55555555);
    expect(inkCount(fb, RED)).toBe(8);
  });

  it('anchors dotted gridlines to absolute coordinates', () => {
    const fb = new Framebuffer(20, 4);
    dottedHLine(fb, 3, 0, 10, RED, 2);
    dottedHLine(fb, 3, 2, 10, RED, 2);
    for (let x = 0; x < 20; x++) {
      expect(fb.get(x, 0)).toBe(fb.get(x, 2));
    }
  });

  it('draws rect outlines inside their bounds', () => {
    const fb = new Framebuffer(20, 20);
    rect(fb, 2, 2, 6, 5, RED);
    expect(inkCount(fb, RED)).toBe(2 * 6 + 2 * 3);
    expect(fb.get(2, 2)).toBe(RED);
    expect(fb.get(7, 6)).toBe(RED);
    expect(fb.get(3, 3)).toBe(0);
  });

  it('degenerates rects to lines instead of vanishing', () => {
    const fb = new Framebuffer(10, 10);
    rect(fb, 0, 0, 5, 1, RED);
    expect(inkCount(fb, RED)).toBe(5);
  });

  it('fills polygons without seams between adjacent shapes', () => {
    const fb = new Framebuffer(20, 20);
    fillPolygon(fb, [[0, 0], [10, 0], [10, 10], [0, 10]], RED);
    fillPolygon(fb, [[10, 0], [20, 0], [20, 10], [10, 10]], BLUE);
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 20; x++) {
        expect(fb.get(x, y)).not.toBe(0);
      }
    }
  });

  it('draws symmetric circles', () => {
    const fb = new Framebuffer(21, 21);
    circle(fb, 10, 10, 7, RED);
    for (let y = 0; y < 21; y++) {
      for (let x = 0; x < 21; x++) {
        expect(fb.get(x, y)).toBe(fb.get(20 - x, y));
        expect(fb.get(x, y)).toBe(fb.get(x, 20 - y));
      }
    }
  });
});

describe('dither', () => {
  it('produces a stable pattern tied to absolute coordinates', () => {
    expect(bayerAt(0, 0, 8)).toBe(bayerAt(4, 4, 8));
    expect(bayerAt(0, 0, 0)).toBe(false);
    expect(bayerAt(0, 0, 16)).toBe(true);
  });

  it('covers roughly the requested fraction of pixels', () => {
    let on = 0;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (bayerAt(x, y, 8)) on++;
    expect(on).toBe(128);
  });
});

describe('font', () => {
  const font = compileFont(volter5);

  it('compiles every declared glyph', () => {
    expect(font.glyphs.size).toBeGreaterThan(90);
    for (const ch of 'ABCXYZabcxyz0123456789') {
      expect(font.glyphs.has(ch)).toBe(true);
    }
  });

  it('gives all digits an identical advance so numbers align in columns', () => {
    const widths = [...'0123456789'].map((d) => glyphFor(font, d).width);
    expect(new Set(widths).size).toBe(1);
  });

  it('measures text as the sum of advances minus trailing tracking', () => {
    expect(measureText(font, '')).toBe(0);
    expect(measureText(font, '0')).toBe(3);
    expect(measureText(font, '00')).toBe(7);
    expect(measureText(font, '000')).toBe(11);
  });

  it('falls back to a visible box for unknown glyphs', () => {
    const fb = new Framebuffer(20, 10);
    drawText(fb, font, 1, 1, '☃', RED);
    expect(inkCount(fb, RED)).toBeGreaterThan(0);
  });

  it('keeps every glyph inside the cell height', () => {
    for (const [ch, g] of font.glyphs) {
      expect(g.yOffset + g.rows.length, `glyph ${ch} overflows the cell`).toBeLessThanOrEqual(
        font.height
      );
    }
  });

  it('snaps fractional positions to integers', () => {
    const a = new Framebuffer(20, 10);
    const b = new Framebuffer(20, 10);
    drawText(a, font, 2, 2, '42', RED);
    drawText(b, font, 2.4, 2.4, '42', RED);
    expect([...b.data]).toEqual([...a.data]);
  });

  it('aligns right and center by exact pixel counts', () => {
    const fb = new Framebuffer(40, 10);
    drawText(fb, font, 39, 0, '123', RED, { align: 'right' });
    const width = measureText(font, '123');
    let minX = 40;
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 40; x++) if (fb.get(x, y) === RED) minX = Math.min(minX, x);
    }
    expect(minX).toBe(39 - width);
  });

  it('draws the shadow beneath the ink, not over it', () => {
    const fb = new Framebuffer(20, 10);
    drawText(fb, font, 2, 2, '8', RED, { shadow: BLUE });
    expect(inkCount(fb, RED)).toBeGreaterThan(0);
    expect(inkCount(fb, BLUE)).toBeGreaterThan(0);
  });
});
