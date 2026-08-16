import { drawText, measureText } from '../core/font.js';
import { rect } from '../core/raster.js';
import { checkerFill } from '../core/dither.js';
import { darken, lighten, luminance, type Color } from '../core/color.js';
import { bandScale, subdivide } from '../scale/band.js';
import type { Framebuffer } from '../core/framebuffer.js';
import {
  layoutCartesian,
  drawCartesianFrame,
  drawCategoryLabels,
  drawLegend,
  drawTooltip,
  datasetColor,
} from './layout.js';
import type {
  BarOptions,
  ChartData,
  ChartState,
  DrawContext,
  Hit,
  RenderResult,
} from './types.js';

interface BarRegion extends Hit {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function drawBarChart(
  ctx: DrawContext,
  data: ChartData,
  options: BarOptions,
  state: ChartState
): RenderResult {
  const { fb, font, theme } = ctx;
  fb.clear(theme.bg);

  const layout = layoutCartesian(ctx, data, options, {
    includeZeroDefault: true,
    categoryLabels: true,
  });
  drawCartesianFrame(ctx, layout, options);

  const { plot, y, zeroY, format } = layout;
  const datasets = data.datasets;

  const bands = bandScale(data.labels.length, plot.w, {
    paddingInner: options.barPadding ?? 0.3,
    paddingOuter: 0.15,
    origin: plot.x,
  });

  const regions: BarRegion[] = [];
  fb.pushClip(plot.x, plot.y, plot.w, plot.h);

  for (const band of bands.bands) {
    const slots = subdivide(band, Math.max(1, datasets.length), 1);
    datasets.forEach((ds, di) => {
      const value = ds.data[band.index];
      if (value === undefined || !Number.isFinite(value)) return;

      const slot = slots[di];
      const valueY = y.px(value);
      const barTop = Math.min(valueY, zeroY);
      const barH = Math.max(1, Math.abs(valueY - zeroY));
      const base = datasetColor(ctx, di, data);
      const hovered =
        state.hover?.datasetIndex === di && state.hover?.pointIndex === band.index;

      drawBar(fb, slot.start, barTop, slot.size, barH, base, hovered);

      regions.push({
        x: slot.start,
        y: barTop,
        w: slot.size,
        h: barH,
        datasetIndex: di,
        pointIndex: band.index,
        anchorX: slot.start + (slot.size >> 1),
        anchorY: barTop,
      });

      if (options.showValues && slot.size >= 7) {
        const label = format(value);
        // Skip rather than let adjacent grouped labels collide illegibly.
        if (measureText(font, label) <= slot.size + 4) {
          const above = valueY <= zeroY;
          let ly = above ? barTop - font.height : barTop + barH + 1;
          let color = theme.ink;

          // A bar at the axis extreme has no room outside itself, so the label
          // moves inside and switches to a contrasting ink.
          if (above && ly < plot.y) {
            ly = barTop + 1;
            color = contrastOn(base);
          } else if (!above && ly + font.height > plot.y + plot.h) {
            ly = barTop + barH - font.height - 1;
            color = contrastOn(base);
          }

          drawText(fb, font, slot.start + (slot.size >> 1), ly, label, color, {
            align: 'center',
          });
        }
      }
    });
  }

  fb.popClip();

  // Baseline drawn last so bars never paint over it.
  fb.fill(plot.x, zeroY, plot.w, 1, theme.ink);

  drawCategoryLabels(
    ctx,
    data.labels,
    bands.bands.map((b) => b.center),
    layout.labelY
  );

  if (layout.legend) drawLegend(ctx, layout.legend, plot.x, layout.legendY);

  if (state.hover) {
    const ds = datasets[state.hover.datasetIndex];
    const value = ds?.data[state.hover.pointIndex];
    if (ds && value !== undefined) {
      const label = data.labels[state.hover.pointIndex] ?? '';
      const lines = [label, ds.label ? `${ds.label}: ${format(value)}` : format(value)].filter(
        Boolean
      );
      drawTooltip(ctx, lines, state.hover);
    }
  }

  return {
    plot,
    hitTest(px, py) {
      // Reverse order so the most recently drawn bar wins an overlap.
      for (let i = regions.length - 1; i >= 0; i--) {
        const r = regions[i];
        if (px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h) return r;
      }
      return null;
    },
  };
}

/**
 * A bar is four flat elements: outline, fill, top highlight, bottom shade.
 * That is the whole trick — no gradient, no radius, no alpha.
 */
function drawBar(
  fb: Framebuffer,
  x: number,
  yTop: number,
  w: number,
  h: number,
  color: Color,
  hovered: boolean
): void {
  const fill = hovered ? lighten(color, 0.18) : color;
  fb.fill(x, yTop, w, h, fill);

  if (h >= 3 && w >= 3) {
    fb.fill(x + 1, yTop + 1, w - 2, 1, lighten(fill, 0.3));
    fb.fill(x + 1, yTop + h - 2, w - 2, 1, darken(fill, 0.18));
    fb.fill(x + 1, yTop + 1, 1, h - 2, lighten(fill, 0.15));
    fb.fill(x + w - 2, yTop + 1, 1, h - 2, darken(fill, 0.12));
  }
  rect(fb, x, yTop, w, h, darken(color, 0.45));

  if (hovered && h >= 4 && w >= 4) {
    checkerFill(fb, x + 1, yTop + 1, w - 2, h - 2, lighten(fill, 0.35), null, 0);
  }
}

/** Readable ink for text sitting directly on a filled bar. */
function contrastOn(fill: Color): Color {
  return luminance(fill) > 0.5 ? darken(fill, 0.7) : lighten(fill, 0.8);
}
