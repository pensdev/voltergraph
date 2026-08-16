import { describe, it, expect } from 'vitest';
import { encodePNG, decodePNG, diffPixels } from './png.js';
import { Framebuffer } from '../src/core/framebuffer.js';
import { hex } from '../src/core/color.js';
import { renderBar, sales } from './fixtures.js';

/**
 * The golden tests are only as trustworthy as the encoder and decoder they
 * compare through, so those get tested too. A decoder bug that silently
 * returned matching pixels would make every golden assertion vacuous.
 */
describe('png round-trip', () => {
  it('preserves every pixel of a real chart', () => {
    const fb = renderBar(220, 130, sales, { title: 'Visits' });
    const decoded = decodePNG(encodePNG(fb));

    expect(decoded.width).toBe(fb.width);
    expect(decoded.height).toBe(fb.height);
    expect(diffPixels(fb, decoded).differing).toBe(0);
  });

  it('preserves exact channel values, not just approximate ones', () => {
    const fb = new Framebuffer(4, 2);
    const colors = [hex('#000000'), hex('#ffffff'), hex('#010203'), hex('#fe01a7')];
    colors.forEach((c, i) => fb.set(i, 0, c));
    colors.forEach((c, i) => fb.set(3 - i, 1, c));

    const decoded = decodePNG(encodePNG(fb));
    expect([...decoded.data]).toEqual([...fb.bytes()]);
  });

  it('reports a single changed pixel with its coordinates', () => {
    const fb = renderBar(120, 90, sales, { title: 'Visits' });
    const golden = decodePNG(encodePNG(fb));

    expect(diffPixels(fb, golden).differing).toBe(0);

    // Flip one pixel and confirm the diff finds exactly it.
    const before = fb.get(40, 40);
    fb.set(40, 40, before === hex('#ff00ff') ? hex('#00ff00') : hex('#ff00ff'));

    const diff = diffPixels(fb, golden);
    expect(diff.differing).toBe(1);
    expect(diff.first).toEqual({ x: 40, y: 40 });
  });

  it('refuses to compare renders of different sizes', () => {
    const a = new Framebuffer(10, 10);
    const b = decodePNG(encodePNG(new Framebuffer(10, 11)));
    expect(() => diffPixels(a, b)).toThrow(/size mismatch/);
  });

  it('rejects data that is not a PNG', () => {
    expect(() => decodePNG(Buffer.from('not a png at all'))).toThrow(/not a PNG/);
  });
});
