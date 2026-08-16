import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePNG, decodePNG, diffPixels } from './png.js';
import {
  renderBar,
  renderLine,
  renderPie,
  renderPieFull,
  renderLineFull,
  sales,
  twoSeries,
  trend,
  shares,
} from './fixtures.js';
import { midnight } from '../src/theme/palette.js';
import type { Framebuffer } from '../src/core/framebuffer.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '__golden__');
mkdirSync(dir, { recursive: true });

/**
 * Golden-image comparison, done on decoded pixels rather than on a hash of the
 * PNG bytes. Two renders that agree pixel-for-pixel can still compress to
 * different bytes, and a hash mismatch reports nothing useful about what
 * actually changed; a pixel count says whether one anti-aliased edge crept in
 * or the whole chart moved.
 *
 * `maxDiffPixels` exists for one narrow reason. Everything the rasterizer does
 * with the basic operators is exactly specified by IEEE 754 and therefore
 * identical on every platform, but ECMAScript explicitly leaves `Math.atan2`,
 * `Math.sin` and `Math.cos` implementation-approximated. The pie decides slice
 * membership from an angle, so on a different CPU architecture a handful of
 * pixels sitting exactly on a slice boundary can fall the other way. That is a
 * property of the language, not a bug to fix, so those charts carry a small
 * explicit allowance and everything else is held to exact equality.
 *
 * Run with UPDATE_GOLDEN=1 to rewrite the references after an intended change.
 */
function expectGolden(name: string, fb: Framebuffer, maxDiffPixels = 0): void {
  const file = join(dir, `${name}.png`);

  if (!existsSync(file) || process.env.UPDATE_GOLDEN) {
    writeFileSync(file, encodePNG(fb));
    return;
  }

  const diff = diffPixels(fb, decodePNG(readFileSync(file)));

  if (diff.differing > 0) {
    writeFileSync(join(dir, `${name}.actual.png`), encodePNG(fb));
    const pct = ((diff.differing / diff.total) * 100).toFixed(3);
    const where = diff.first ? ` first at (${diff.first.x}, ${diff.first.y})` : '';
    // Surfaced even when within tolerance, so drift is visible in CI logs
    // before it grows past the allowance.
    console.warn(
      `golden ${name}: ${diff.differing}/${diff.total} px differ (${pct}%)${where}` +
        `, allowance ${maxDiffPixels}`
    );
  }

  expect(
    diff.differing,
    `${name} differs by ${diff.differing} px (allowance ${maxDiffPixels}); ` +
      `wrote ${name}.actual.png`
  ).toBeLessThanOrEqual(maxDiffPixels);
}

/**
 * Pies decide slice membership with `Math.atan2`, which ECMAScript allows to
 * differ between implementations, so boundary pixels are not guaranteed
 * identical across architectures. Sized to catch a real regression while
 * tolerating an ulp: the radial dividers are the only pixels at risk.
 */
const PIE_ALLOWANCE = 120;

describe('bar goldens', () => {
  it('single series', () => {
    expectGolden('bar-single', renderBar(220, 130, sales, { title: 'Visits this week' }));
  });

  it('grouped series with legend and values', () => {
    expectGolden(
      'bar-grouped',
      renderBar(220, 140, twoSeries, { title: 'Currency', showValues: true })
    );
  });

  it('midnight theme', () => {
    expectGolden('bar-midnight', renderBar(220, 130, sales, { title: 'Visits', theme: midnight }));
  });

  it('negative values straddling the baseline', () => {
    expectGolden(
      'bar-negative',
      renderBar(200, 130, {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
        datasets: [{ label: 'Net', data: [40, -25, 65, -10, 30] }],
      })
    );
  });
});

describe('line goldens', () => {
  it('two series with markers', () => {
    expectGolden('line-basic', renderLine(260, 140, trend, { title: 'Growth' }));
  });

  it('dithered area fill', () => {
    expectGolden('line-area', renderLine(260, 140, trend, { title: 'Growth', area: true }));
  });

  it('stepped', () => {
    expectGolden(
      'line-stepped',
      renderLine(220, 120, sales, { title: 'Visits', stepped: true, includeZero: true })
    );
  });

  it('crosshair and multi-series tooltip on hover', () => {
    const { result } = renderLineFull(260, 140, trend, { title: 'Growth' });
    const hit = result.hitTest(130, 70);
    expect(hit).not.toBeNull();
    expectGolden('line-hover', renderLine(260, 140, trend, { title: 'Growth' }, { hover: hit }));
  });
});

describe('pie goldens', () => {
  it('flat pie', () => {
    expectGolden('pie-flat', renderPie(200, 160, shares, { title: 'Spend', showPercent: true }), PIE_ALLOWANCE);
  });

  it('donut', () => {
    expectGolden('pie-donut', renderPie(200, 160, shares, { title: 'Spend', donut: 0.5 }), PIE_ALLOWANCE);
  });

  it('extruded', () => {
    expectGolden('pie-depth', renderPie(200, 160, shares, { title: 'Spend', depth: 5 }), PIE_ALLOWANCE);
  });

  it('hovered slice', () => {
    const { result } = renderPieFull(200, 160, shares, { title: 'Spend' });
    const hit = result.hitTest(130, 70);
    expect(hit).not.toBeNull();
    expectGolden('pie-hover', renderPie(200, 160, shares, { title: 'Spend' }, { hover: hit }), PIE_ALLOWANCE);
  });
});

describe('render invariants', () => {
  it('is deterministic across repeated renders', () => {
    for (const render of [
      () => renderBar(220, 130, sales, { title: 'Visits' }),
      () => renderLine(260, 140, trend, { title: 'Growth', area: true }),
      () => renderPie(200, 160, shares, { title: 'Spend', depth: 4 }),
    ]) {
      expect([...render().data]).toEqual([...render().data]);
    }
  });

  it('leaves no pixel unpainted', () => {
    for (const fb of [
      renderBar(220, 130, sales, { title: 'Visits' }),
      renderLine(260, 140, trend, { title: 'Growth' }),
      renderPie(200, 160, shares, { title: 'Spend', depth: 4 }),
    ]) {
      expect([...fb.data].every((px) => px !== 0)).toBe(true);
    }
  });

  it('survives degenerate sizes and empty data', () => {
    const empty = { labels: [], datasets: [] };
    expect(() => renderBar(40, 30, empty)).not.toThrow();
    expect(() => renderLine(40, 30, empty)).not.toThrow();
    expect(() => renderPie(40, 30, empty)).not.toThrow();
    expect(() =>
      renderPie(60, 40, { labels: ['a'], datasets: [{ label: 'x', data: [0] }] })
    ).not.toThrow();
    expect(() =>
      renderLine(60, 40, { labels: ['a'], datasets: [{ label: 'x', data: [5] }] })
    ).not.toThrow();
    expect(() =>
      renderBar(400, 200, {
        labels: Array.from({ length: 60 }, (_, i) => `item ${i}`),
        datasets: [{ label: 'x', data: Array.from({ length: 60 }, (_, i) => i) }],
      })
    ).not.toThrow();
  });

  it('handles non-finite values by skipping them', () => {
    const data = { labels: ['a', 'b', 'c'], datasets: [{ label: 'x', data: [10, NaN, 30] }] };
    expect(renderBar(160, 100, data).width).toBe(160);
    expect(renderLine(160, 100, data).width).toBe(160);
    expect(renderPie(160, 120, data).width).toBe(160);
  });

  it('renders at phone-sized logical dimensions without throwing', () => {
    // 375px CSS at auto zoom 2 gives ~187 logical pixels.
    for (const w of [120, 150, 187, 220]) {
      expect(() => renderBar(w, 110, sales, { title: 'Visits' })).not.toThrow();
      expect(() => renderLine(w, 110, trend, { title: 'Growth' })).not.toThrow();
      expect(() => renderPie(w, 130, shares, { title: 'Spend' })).not.toThrow();
    }
  });
});
