import {
  polyline,
  outlinedPolyline,
  fillPolygon,
  dottedVLine,
  rect,
  type Point,
} from '../core/raster.js';
import { darken, lighten, type Color } from '../core/color.js';
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
  ChartData,
  ChartState,
  DrawContext,
  Hit,
  LineOptions,
  RenderResult,
} from './types.js';

const MARKER = 3;

export function drawLineChart(
  ctx: DrawContext,
  data: ChartData,
  options: LineOptions,
  state: ChartState
): RenderResult {
  const { fb, theme } = ctx;
  fb.clear(theme.bg);

  const layout = layoutCartesian(ctx, data, options, {
    includeZeroDefault: false,
    categoryLabels: true,
  });
  drawCartesianFrame(ctx, layout, options);

  const { plot, y, zeroY, format } = layout;
  const n = data.labels.length;

  // Points sit on evenly divided columns derived from one cumulative rounding,
  // so spacing never drifts by more than a pixel across the axis.
  const columns: number[] = [];
  for (let i = 0; i < n; i++) {
    columns.push(n === 1 ? plot.x + (plot.w >> 1) : plot.x + Math.round((i * (plot.w - 1)) / (n - 1)));
  }

  const spacing = n > 1 ? (plot.w - 1) / (n - 1) : plot.w;
  const showPoints = options.showPoints ?? spacing >= 8;

  fb.pushClip(plot.x, plot.y, plot.w, plot.h);

  const series = data.datasets.map((ds, di) => ({
    color: datasetColor(ctx, di, data),
    points: buildPoints(ds.data, columns, y, options.stepped ?? false),
  }));

  if (options.area) {
    series.forEach((s, di) => {
      if (s.points.length < 2) return;
      const poly: Point[] = [
        [s.points[0][0], zeroY],
        ...s.points,
        [s.points[s.points.length - 1][0], zeroY],
      ];
      // Each series dithers more sparsely than the last so overlaps stay
      // distinguishable. Past three series the fills stop separating at all —
      // that is a data-shape problem, not something more levels would fix.
      fillPolygon(fb, poly, s.color, Math.max(2, 7 - di * 2));
    });
  }

  for (const s of series) {
    if (s.points.length === 1) {
      drawMarker(fb, s.points[0][0], s.points[0][1], s.color, false);
    } else if (options.outlined) {
      outlinedPolyline(fb, s.points, s.color, darken(s.color, 0.5));
    } else {
      polyline(fb, s.points, s.color);
    }
  }

  if (showPoints) {
    const hoverX = state.hover ? columns[state.hover.pointIndex] : undefined;
    series.forEach((s, di) => {
      for (const [px, py] of s.points) {
        const hovered = px === hoverX && state.hover?.datasetIndex === di;
        drawMarker(fb, px, py, s.color, hovered);
      }
    });
  }

  // Crosshair rule under the hovered column.
  if (state.hover) {
    const cx = columns[state.hover.pointIndex];
    if (cx !== undefined) dottedVLine(fb, cx, plot.y, plot.h, theme.inkSoft, 2);
  }

  fb.popClip();

  if (layout.fit.min <= 0 && layout.fit.max >= 0) {
    fb.fill(plot.x, zeroY, plot.w, 1, theme.ink);
  }

  drawCategoryLabels(ctx, data.labels, columns, layout.labelY);
  if (layout.legend) drawLegend(ctx, layout.legend, plot.x, layout.legendY);

  if (state.hover) {
    // A line chart reads by column, so the tooltip lists every series at once.
    const idx = state.hover.pointIndex;
    const lines: string[] = [data.labels[idx] ?? ''];
    const swatches: (Color | null)[] = [null];
    data.datasets.forEach((ds, di) => {
      const v = ds.data[idx];
      if (v === undefined || !Number.isFinite(v)) return;
      lines.push(ds.label ? `${ds.label}: ${format(v)}` : format(v));
      swatches.push(datasetColor(ctx, di, data));
    });
    drawTooltip(ctx, lines.filter(Boolean), state.hover, swatches);
  }

  return {
    plot,
    hitTest(px, py) {
      if (py < plot.y - 4 || py > plot.y + plot.h + 4) return null;
      if (px < plot.x - 4 || px > plot.x + plot.w + 4) return null;
      if (!columns.length) return null;

      // Snap to the nearest column: on a phone a fingertip covers ~40px, so
      // requiring a hit on the 3px marker itself would make this unusable.
      let best = 0;
      for (let i = 1; i < columns.length; i++) {
        if (Math.abs(columns[i] - px) < Math.abs(columns[best] - px)) best = i;
      }

      let ds = 0;
      let bestDy = Infinity;
      let anchorY = plot.y;
      series.forEach((s, di) => {
        const p = s.points.find((q) => q[0] === columns[best]);
        if (!p) return;
        const dy = Math.abs(p[1] - py);
        if (dy < bestDy) {
          bestDy = dy;
          ds = di;
          anchorY = p[1];
        }
      });

      return {
        datasetIndex: ds,
        pointIndex: best,
        anchorX: columns[best],
        anchorY: anchorY - MARKER,
      } satisfies Hit;
    },
  };
}

/**
 * Builds the pixel path. Non-finite values break the line into segments rather
 * than being interpolated across, which would invent data.
 */
function buildPoints(
  values: readonly number[],
  columns: readonly number[],
  y: { px(v: number): number },
  stepped: boolean
): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < columns.length; i++) {
    const v = values[i];
    if (v === undefined || !Number.isFinite(v)) continue;
    const py = y.px(v);
    if (stepped && pts.length) {
      // Right angles only: a diagonal at 1px reads as a slope, which is wrong
      // for step data.
      pts.push([columns[i], pts[pts.length - 1][1]]);
    }
    pts.push([columns[i], py]);
  }
  return pts;
}

/** A square marker, because a 3px circle is just a square with worse corners. */
function drawMarker(
  fb: Framebuffer,
  x: number,
  y: number,
  color: Color,
  hovered: boolean
): void {
  const half = MARKER >> 1;
  const fill = hovered ? lighten(color, 0.4) : color;
  fb.fill(x - half, y - half, MARKER, MARKER, fill);
  rect(fb, x - half - 1, y - half - 1, MARKER + 2, MARKER + 2, darken(color, 0.5));
  if (hovered) {
    rect(fb, x - half - 2, y - half - 2, MARKER + 4, MARKER + 4, lighten(color, 0.5));
  }
}
