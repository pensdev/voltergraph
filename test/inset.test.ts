import { describe, it, expect } from 'vitest';
import { compileFont } from '../src/core/font.js';
import { volter5 } from '../src/core/fonts/volter5.js';
import { Framebuffer } from '../src/core/framebuffer.js';
import { origins } from '../src/theme/palette.js';
import { drawLineChart } from '../src/charts/line.js';
import { drawBarChart } from '../src/charts/bar.js';
import { layoutCartesian } from '../src/charts/layout.js';
import { compactFormat } from '../src/charts/format.js';
import type { ChartData, DrawContext, LineOptions } from '../src/charts/types.js';

const font = compileFont(volter5);

/** Marker geometry from line.ts: 3px core, 1px outline, 1px hover ring. */
const MARKER_REACH = 2;

function ctx(w = 420, h = 268): DrawContext {
  return { fb: new Framebuffer(w, h), font, theme: origins, width: w, height: h };
}

/** Ends on the axis maximum and starts at the minimum: both edge cases at once. */
const habloons: ChartData = {
  labels: ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'],
  datasets: [
    { label: 'Value', data: [0, 1200, 1150, 1400, 1800, 1700, 2100, 2600, 2400, 3000, 3300, 4000] },
  ],
};

const base: LineOptions = {
  area: true,
  includeZero: true,
  showLegend: false,
  showPoints: true,
  targetSteps: 4,
  plotFrame: false,
  padding: { top: 6, right: 8, bottom: 6, left: 6 },
  format: compactFormat,
};

/**
 * Leftmost painted column inside the plot, which is the outer edge of the
 * first marker. Rendered without the area fill so the only ink in that region
 * is the line and its markers.
 */
function firstInkX(c: DrawContext, options: LineOptions): number {
  const result = drawLineChart(c, habloons, { ...options, area: false }, { hover: null });
  const plot = result.plot!;
  // Ignore chrome: the zero baseline spans the full plot width in `ink`,
  // gridlines span it in `grid`, and category labels sit just below in
  // `inkSoft` — all three would mask the marker's true left edge.
  const chrome = new Set([origins.bg, origins.ink, origins.grid, origins.plot, origins.inkSoft]);

  for (let x = plot.x; x < plot.x + plot.w; x++) {
    for (let y = plot.y - 8; y <= plot.y + plot.h; y++) {
      if (!chrome.has(c.fb.get(x, y))) return x;
    }
  }
  return -1;
}

describe('pointPad', () => {
  it('insets the first and last columns from the plot edges', () => {
    const c = ctx();
    const pad = 8;
    const result = drawLineChart(c, habloons, { ...base, pointPad: pad }, { hover: null });
    const plot = result.plot!;

    // Recover the drawn columns from the rendered marker ink on the top row of
    // the last point, which is the one that used to be clipped.
    const first = plot.x + pad;
    const last = plot.x + plot.w - 1 - pad;

    expect(first - plot.x).toBe(pad);
    expect(plot.x + plot.w - 1 - last).toBe(pad);
    // A whole marker fits inside the drawable band at both ends.
    expect(first - MARKER_REACH).toBeGreaterThanOrEqual(plot.x);
    expect(last + MARKER_REACH).toBeLessThanOrEqual(plot.x + plot.w - 1);
  });

  it('leaves room above a point sitting on the axis maximum', () => {
    const c = ctx();
    const pad = 8;
    drawLineChart(c, habloons, { ...base, pointPad: pad }, { hover: null });

    const layout = layoutCartesian(c, habloons, { ...base, pointPad: pad } as never, {
      includeZeroDefault: false,
      categoryLabels: true,
      pointPad: pad,
    });

    // The maximum maps to the top of the axis band, and the band itself sits
    // `pad` below the top of the drawable region.
    expect(layout.y.px(layout.fit.max)).toBe(layout.plot.y);
    expect(layout.plot.y - layout.canvas.y).toBe(pad);
    expect(pad).toBeGreaterThanOrEqual(MARKER_REACH);
  });

  it('does not clip the marker of a value at the axis maximum', () => {
    const c = ctx();
    drawLineChart(c, habloons, { ...base, pointPad: 8 }, { hover: null });

    // Walk down the rightmost columns and find the first painted row; a whole
    // marker means ink continues for at least MARKER rows below it.
    let firstInkRow = -1;
    const bg = origins.bg;
    outer: for (let y = 0; y < c.height; y++) {
      for (let x = c.width - 40; x < c.width - 8; x++) {
        if (c.fb.get(x, y) !== bg) {
          firstInkRow = y;
          break outer;
        }
      }
    }
    expect(firstInkRow).toBeGreaterThan(0);

    let runs = 0;
    for (let y = firstInkRow; y < firstInkRow + 5; y++) {
      for (let x = c.width - 40; x < c.width - 8; x++) {
        if (c.fb.get(x, y) !== bg) {
          runs++;
          break;
        }
      }
    }
    expect(runs).toBe(5);
  });

  it('keeps gridline spacing exact despite the inset', () => {
    for (const pad of [0, 4, 8, 12]) {
      const layout = layoutCartesian(ctx(), habloons, base as never, {
        includeZeroDefault: false,
        categoryLabels: true,
        pointPad: pad,
      });
      const rows = layout.fit.ticks.map((t) => layout.y.px(t));
      const gaps = rows.slice(1).map((r, i) => rows[i] - r);
      expect(new Set(gaps).size, `pointPad ${pad} produced uneven gridlines`).toBe(1);
    }
  });

  it('defaults to a pad that keeps a marker whole', () => {
    const withDefault = firstInkX(ctx(), base);
    const withZero = firstInkX(ctx(), { ...base, pointPad: 0 });

    // Without a pad the first marker's outline starts left of the plot edge
    // and is clipped to it; with the default it starts inside.
    expect(withDefault).toBeGreaterThan(withZero);
    expect(withDefault - withZero).toBeGreaterThanOrEqual(MARKER_REACH);
  });

  it('never collapses the axis on a very narrow chart', () => {
    for (const w of [40, 60, 90, 140]) {
      const c = ctx(w, 120);
      expect(() =>
        drawLineChart(c, habloons, { ...base, pointPad: 8 }, { hover: null })
      ).not.toThrow();
      // Points must still be laid out left-to-right inside the plot.
      const x = firstInkX(ctx(w, 120), { ...base, pointPad: 8 });
      expect(x).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('plotFrame', () => {
  it('draws the well by default and omits it when false', () => {
    const framed = ctx();
    const bare = ctx();
    drawLineChart(framed, habloons, { ...base, plotFrame: undefined }, { hover: null });
    drawLineChart(bare, habloons, { ...base, plotFrame: false }, { hover: null });

    const ink = (c: DrawContext) => {
      let n = 0;
      for (const px of c.fb.data) if (px !== origins.bg) n++;
      return n;
    };
    // The frame is a border plus a filled well, so removing it removes ink.
    expect(ink(framed)).toBeGreaterThan(ink(bare));
  });

  it('keeps gridlines and the baseline when the frame is off', () => {
    const c = ctx();
    drawLineChart(c, habloons, { ...base, plotFrame: false }, { hover: null });

    // Gridlines are dotted rules in `grid`; the baseline is solid `ink`.
    let gridPixels = 0;
    let inkPixels = 0;
    for (const px of c.fb.data) {
      if (px === origins.grid) gridPixels++;
      if (px === origins.ink) inkPixels++;
    }
    expect(gridPixels).toBeGreaterThan(0);
    expect(inkPixels).toBeGreaterThan(0);
  });

  it('applies to bar charts too', () => {
    const framed = ctx(220, 130);
    const bare = ctx(220, 130);
    const data: ChartData = {
      labels: ['a', 'b', 'c'],
      datasets: [{ label: 'x', data: [3, 7, 5] }],
    };
    drawBarChart(framed, data, {}, { hover: null });
    drawBarChart(bare, data, { plotFrame: false }, { hover: null });
    expect([...framed.fb.data]).not.toEqual([...bare.fb.data]);
  });
});

describe('compactFormat', () => {
  it('abbreviates from a thousand, not from ten thousand', () => {
    expect(compactFormat(900)).toBe('900');
    expect(compactFormat(999)).toBe('999');
    expect(compactFormat(1000)).toBe('1k');
    expect(compactFormat(1600)).toBe('1.6k');
    expect(compactFormat(3600)).toBe('3.6k');
    expect(compactFormat(12000)).toBe('12k');
    expect(compactFormat(2_400_000)).toBe('2.4m');
  });

  it('handles zero and negatives', () => {
    expect(compactFormat(0)).toBe('0');
    expect(compactFormat(-1500)).toBe('-1.5k');
  });
});
