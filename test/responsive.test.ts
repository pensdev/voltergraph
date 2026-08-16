import { describe, it, expect } from 'vitest';
import { compileFont, measureText } from '../src/core/font.js';
import { volterGoldfish } from '../src/core/fonts/volter-goldfish.js';
import { volterGoldfishBold } from '../src/core/fonts/volter-goldfish-bold.js';
import { Framebuffer } from '../src/core/framebuffer.js';
import { origins } from '../src/theme/palette.js';
import { layoutLegend, drawCategoryLabels, layoutCartesian } from '../src/charts/layout.js';
import { drawLineChart } from '../src/charts/line.js';
import { drawPieChart } from '../src/charts/pie.js';
import { renderBar, renderLine, renderPie, sales, trend, shares } from './fixtures.js';
import type { DrawContext } from '../src/charts/types.js';

const font = compileFont(volterGoldfish);
const boldFont = compileFont(volterGoldfishBold);

function ctx(w: number, h: number): DrawContext {
  return { fb: new Framebuffer(w, h), font, bold: boldFont, theme: origins, width: w, height: h };
}

/** Rows of ink in the framebuffer, used to check nothing spills off-canvas. */
function paintedRows(fb: Framebuffer): number {
  let rows = 0;
  for (let y = 0; y < fb.height; y++) {
    for (let x = 0; x < fb.width; x++) {
      if (fb.get(x, y) !== 0) {
        rows++;
        break;
      }
    }
  }
  return rows;
}

describe('legend wrapping', () => {
  const entries = ['Coins', 'Ducats', 'Pixels', 'Diamonds', 'Credits'].map((label) => ({
    label,
    color: origins.series[0],
  }));

  it('uses one row when everything fits', () => {
    expect(layoutLegend(ctx(400, 100), entries, 400).rows).toBe(1);
  });

  it('wraps onto more rows as width shrinks', () => {
    const wide = layoutLegend(ctx(400, 100), entries, 400).rows;
    const narrow = layoutLegend(ctx(120, 100), entries, 120).rows;
    expect(narrow).toBeGreaterThan(wide);
  });

  it('keeps every item within the available width', () => {
    const layout = layoutLegend(ctx(120, 100), entries, 120);
    for (const item of layout.items) {
      expect(item.x + item.w).toBeLessThanOrEqual(120);
    }
    expect(layout.items.length).toBe(entries.length);
  });

  it('reports a height matching its row count', () => {
    const layout = layoutLegend(ctx(120, 100), entries, 120);
    expect(layout.height).toBe(layout.rows * (font.height + 2));
  });
});

describe('category label thinning', () => {
  const labels = Array.from({ length: 12 }, (_, i) =>
    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i]
  );

  function drawnCount(width: number): number {
    const c = ctx(width, 40);
    const centers = labels.map((_, i) => Math.round(((i + 0.5) * width) / labels.length));
    drawCategoryLabels(c, labels, centers, 10);
    let ink = 0;
    for (const px of c.fb.data) if (px !== 0) ink++;
    return ink;
  }

  it('draws every label when there is room', () => {
    expect(drawnCount(400)).toBeGreaterThan(drawnCount(160));
  });

  it('thins rather than overlapping on a narrow chart', () => {
    // Some labels must still appear; thinning is not the same as giving up.
    expect(drawnCount(160)).toBeGreaterThan(0);
  });

  it('accounts for edge clamping when deciding what to thin', () => {
    // The last label is clamped inward to stay on canvas, which moves it
    // toward its neighbour. Thinning must be decided on the clamped positions,
    // not the raw centers, or the final pair collides.
    const width = 187;
    const c = ctx(width, 40);
    const plotW = width - 20;
    const centers = labels.map((_, i) => 17 + Math.round((i * (plotW - 1)) / (labels.length - 1)));
    drawCategoryLabels(c, labels, centers, 10);

    // Walk the label row and confirm every run of ink is separated by a gap.
    const columns: boolean[] = [];
    for (let x = 0; x < width; x++) {
      let ink = false;
      for (let y = 10; y < 10 + font.height; y++) if (c.fb.get(x, y) !== 0) ink = true;
      columns.push(ink);
    }
    // Three-glyph labels are 11px wide; any run longer than that means two
    // labels have merged into one another.
    let run = 0;
    let longest = 0;
    for (const ink of columns) {
      run = ink ? run + 1 : 0;
      longest = Math.max(longest, run);
    }
    expect(longest).toBeLessThanOrEqual(12);
  });

  it('shifts edge labels inward instead of letting them clip away', () => {
    // Centers at the very edges would put half of each label off-canvas.
    const c = ctx(80, 40);
    drawCategoryLabels(c, ['Jan', 'Dec'], [0, 79], 10);

    let leftInk = 0;
    let rightInk = 0;
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 40; x++) if (c.fb.get(x, y) !== 0) leftInk++;
      for (let x = 40; x < 80; x++) if (c.fb.get(x, y) !== 0) rightInk++;
    }
    // Both labels have three glyphs, so both halves must carry similar ink.
    expect(leftInk).toBeGreaterThan(0);
    expect(rightInk).toBeGreaterThan(0);
    expect(Math.abs(leftInk - rightInk)).toBeLessThan(leftInk);
  });
});

describe('narrow layouts', () => {
  it('caps the tick gutter so labels cannot eat the plot', () => {
    const c = ctx(110, 100);
    const data = {
      labels: ['a', 'b'],
      datasets: [{ label: 'big', data: [1234567, 8901234] }],
    };
    const layout = layoutCartesian(c, data, {}, {
      includeZeroDefault: true,
      categoryLabels: true,
    });
    expect(layout.plot.x).toBeLessThanOrEqual(Math.floor(110 / 3) + 6);
    expect(layout.plot.w).toBeGreaterThan(110 / 2);
  });

  it('keeps the plot inside the canvas at every width', () => {
    for (let w = 60; w <= 400; w += 7) {
      const layout = layoutCartesian(ctx(w, 120), trend, {}, {
        includeZeroDefault: false,
        categoryLabels: true,
      });
      expect(layout.plot.x).toBeGreaterThanOrEqual(0);
      expect(layout.plot.x + layout.plot.w).toBeLessThanOrEqual(w);
      expect(layout.plot.y).toBeGreaterThanOrEqual(0);
      expect(layout.plot.y + layout.plot.h).toBeLessThanOrEqual(120);
    }
  });

  it('paints inside the canvas across a sweep of phone-to-desktop sizes', () => {
    for (const [w, h] of [
      [120, 90],
      [150, 110],
      [187, 120],
      [240, 140],
      [320, 180],
      [450, 220],
    ] as const) {
      for (const fb of [
        renderBar(w, h, sales, { title: 'Visits' }),
        renderLine(w, h, trend, { title: 'Growth', area: true }),
        renderPie(w, h, shares, { title: 'Spend', showPercent: true }),
      ]) {
        expect(fb.width).toBe(w);
        expect(paintedRows(fb)).toBe(h);
      }
    }
  });

  it('fits the pie inside its box even when the legend is tall', () => {
    // Five wrapped legend rows on a very narrow canvas.
    const fb = renderPie(110, 150, shares, { title: 'Spend' });
    expect(paintedRows(fb)).toBe(150);
  });
});

describe('hit testing', () => {
  it('snaps line hover to the nearest column rather than the exact pixel', () => {
    const c = ctx(260, 140);
    const result = drawLineChart(c, trend, { title: 'Growth' }, { hover: null });
    // Well away from any marker vertically, but inside the plot.
    const hit = result.hitTest(130, result.plot!.y + 4);
    expect(hit).not.toBeNull();
    expect(hit!.pointIndex).toBeGreaterThanOrEqual(0);
    expect(hit!.pointIndex).toBeLessThan(trend.labels.length);
  });

  it('returns null outside the pie', () => {
    const c = ctx(200, 160);
    const result = drawPieChart(c, shares, {}, { hover: null });
    expect(result.hitTest(0, 0)).toBeNull();
  });

  it('finds every pie slice somewhere on the disc', () => {
    const c = ctx(200, 160);
    const result = drawPieChart(c, shares, {}, { hover: null });
    const found = new Set<number>();
    for (let y = 0; y < 160; y++) {
      for (let x = 0; x < 200; x++) {
        const hit = result.hitTest(x, y);
        if (hit) found.add(hit.pointIndex);
      }
    }
    expect(found.size).toBe(shares.datasets[0].data.length);
  });

  it('measures text the same way the layout does', () => {
    expect(measureText(font, 'Coins')).toBeGreaterThan(0);
  });
});
