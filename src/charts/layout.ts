import { drawText, measureText } from '../core/font.js';
import { dottedHLine } from '../core/raster.js';
import { inset } from '../core/nineslice.js';
import { rect } from '../core/raster.js';
import { darken, luminance, toColor, type Color } from '../core/color.js';
import { fitAxis, type AxisFit } from '../scale/ticks.js';
import { scaleFromFit, type LinearScale } from '../scale/linear.js';
import { seriesColor } from '../theme/palette.js';
import { panel } from '../core/nineslice.js';
import { defaultFormat } from './format.js';
import type { ChartData, ChartOptions, DrawContext, Rect, Hit } from './types.js';

const SWATCH = 5;

/* ------------------------------------------------------------------ legend */

export interface LegendItem {
  label: string;
  color: Color;
  /** Offsets relative to the legend block's top-left. */
  x: number;
  y: number;
  w: number;
}

export interface LegendLayout {
  items: LegendItem[];
  rows: number;
  height: number;
}

export interface LegendEntry {
  label: string;
  color: Color;
}

export function entriesForDatasets(ctx: DrawContext, data: ChartData): LegendEntry[] {
  return data.datasets.map((ds, i) => ({
    label: ds.label,
    color: ds.color !== undefined ? toColor(ds.color) : seriesColor(ctx.theme, i),
  }));
}

/**
 * Flows legend items into as many rows as the width requires. On a phone the
 * legend is frequently wider than the chart, and a single clipped row loses
 * series names silently — wrapping costs a few pixels of height instead.
 */
export function layoutLegend(
  ctx: DrawContext,
  entries: readonly LegendEntry[],
  maxWidth: number
): LegendLayout {
  const rowHeight = ctx.font.height + 2;
  const items: LegendItem[] = [];
  let x = 0;
  let row = 0;

  for (const entry of entries) {
    const w = SWATCH + 2 + measureText(ctx.font, entry.label);
    if (x > 0 && x + w > maxWidth) {
      row++;
      x = 0;
    }
    items.push({ label: entry.label, color: entry.color, x, y: row * rowHeight, w });
    x += w + 6;
  }

  const rows = entries.length ? row + 1 : 0;
  return { items, rows, height: rows * rowHeight };
}

export function drawLegend(
  ctx: DrawContext,
  layout: LegendLayout,
  originX: number,
  originY: number
): void {
  const { fb, font, theme } = ctx;
  for (const item of layout.items) {
    const x = originX + item.x;
    const y = originY + item.y;
    const sy = y + ((font.height - SWATCH) >> 1);
    fb.fill(x, sy, SWATCH, SWATCH, item.color);
    rect(fb, x, sy, SWATCH, SWATCH, darken(item.color, 0.45));
    drawText(fb, font, x + SWATCH + 2, y, item.label, theme.inkSoft);
  }
}

/* ----------------------------------------------------------- cartesian box */

export interface CartesianLayout {
  plot: Rect;
  fit: AxisFit;
  y: LinearScale;
  /** Pixel row of the zero line, or the axis minimum when zero is outside. */
  zeroY: number;
  format: (value: number) => string;
  /** Top of the category label row. */
  labelY: number;
  legend: LegendLayout | null;
  legendY: number;
}

export interface CartesianOptions {
  includeZeroDefault: boolean;
  /** Reserve a row under the plot for category labels. */
  categoryLabels: boolean;
}

/**
 * Shared frame for bar and line: title, legend, tick gutter and plot rect.
 *
 * The order matters. The legend has to be measured before the plot height is
 * known, the axis has to be fitted before the tick labels can be measured, and
 * the tick labels determine the left gutter. The axis fit depends only on
 * height, so measuring the gutter afterwards cannot invalidate it.
 */
export function layoutCartesian(
  ctx: DrawContext,
  data: ChartData,
  options: ChartOptions,
  config: CartesianOptions
): CartesianLayout {
  const { font } = ctx;
  const pad = {
    top: options.padding?.top ?? 3,
    right: options.padding?.right ?? 4,
    bottom: options.padding?.bottom ?? 3,
    left: options.padding?.left ?? 3,
  };

  let top = pad.top;
  if (options.title) top += font.height + 4;

  const showLegend = (options.showLegend ?? true) && data.datasets.length > 1;
  const legend = showLegend
    ? layoutLegend(ctx, entriesForDatasets(ctx, data), ctx.width - pad.left - pad.right)
    : null;

  let bottom = ctx.height - pad.bottom;
  const legendY = bottom - (legend?.height ?? 0);
  if (legend) bottom -= legend.height + 2;
  if (config.categoryLabels) bottom -= font.height + 3;

  const { min, max } = extent(data);
  const availableHeight = Math.max(8, bottom - top);
  const fit = fitAxis(min, max, availableHeight, {
    targetSteps: options.targetSteps ?? 4,
    includeZero: options.includeZero ?? config.includeZeroDefault,
    minPxPerStep: font.height + 3,
  });

  const format = options.format ?? defaultFormat(fit.step);

  let gutter = 0;
  for (const t of fit.ticks) gutter = Math.max(gutter, measureText(font, format(t)));
  // A narrow chart must not hand its whole width to tick labels.
  gutter = Math.min(gutter, Math.max(6, Math.floor(ctx.width / 3)));

  const plotX = pad.left + gutter + 3;
  const plot: Rect = {
    x: plotX,
    y: top + fit.slack,
    w: Math.max(4, ctx.width - pad.right - plotX),
    h: fit.length,
  };

  const y = scaleFromFit(fit, { origin: plot.y, flip: true });
  const zeroY = y.px(0 >= fit.min && 0 <= fit.max ? 0 : fit.min);

  return {
    plot,
    fit,
    y,
    zeroY,
    format,
    labelY: plot.y + plot.h + 3,
    legend,
    legendY,
  };
}

/** Title, plot well and gridlines — everything behind the data. */
export function drawCartesianFrame(
  ctx: DrawContext,
  layout: CartesianLayout,
  options: ChartOptions
): void {
  const { fb, font, theme } = ctx;
  const pad = { top: options.padding?.top ?? 3, left: options.padding?.left ?? 3 };

  if (options.title) {
    drawText(fb, font, pad.left, pad.top, options.title, theme.ink, {
      shadow: theme.light,
      shadowOffset: [0, 1],
    });
  }

  const { plot } = layout;
  inset(fb, plot.x - 1, plot.y - 1, plot.w + 2, plot.h + 2, {
    fill: theme.plot,
    border: theme.ink,
    light: theme.light,
    dark: theme.dark,
  });

  for (const tick of layout.fit.ticks) {
    const py = layout.y.px(tick);
    if (tick !== layout.fit.min) dottedHLine(fb, plot.x, py, plot.w, theme.grid, 2);
    drawText(fb, font, plot.x - 3, py - (font.baseline - 1), layout.format(tick), theme.inkSoft, {
      align: 'right',
    });
  }
}

/* -------------------------------------------------------- category labels */

/**
 * Draws as many category labels as fit without overlapping, thinning by a
 * uniform stride. Below ~200 logical pixels every label rarely fits, and
 * overlapping 3px text is worse than showing every second one.
 */
export function drawCategoryLabels(
  ctx: DrawContext,
  labels: readonly string[],
  centers: readonly number[],
  y: number
): void {
  const { fb, font, theme } = ctx;
  const n = Math.min(labels.length, centers.length);
  if (n === 0) return;

  const widths: number[] = [];
  // Clamp first, then test for collisions. An edge label pushed inward to stay
  // on canvas moves *toward* its neighbour, so testing the unclamped centers
  // misses exactly the collision that clamping creates.
  const lefts: number[] = [];
  for (let i = 0; i < n; i++) {
    const w = measureText(font, labels[i] ?? '');
    widths.push(w);
    const half = w >> 1;
    lefts.push(clamp(centers[i], half, ctx.width - 1 - (w - half)) - half);
  }

  let stride = 1;
  for (; stride <= n; stride++) {
    if (fits(lefts, widths, n, stride)) break;
  }
  if (stride > n) return;

  for (let i = 0; i < n; i += stride) {
    const label = labels[i];
    if (!label) continue;
    drawText(fb, font, lefts[i], y, label, theme.inkSoft);
  }
}

function fits(
  lefts: readonly number[],
  widths: readonly number[],
  n: number,
  stride: number
): boolean {
  let prevRight = -Infinity;
  for (let i = 0; i < n; i += stride) {
    if (lefts[i] < prevRight + 2) return false;
    prevRight = lefts[i] + widths[i];
  }
  return true;
}

/* ----------------------------------------------------------------- tooltip */

/** A tooltip is a beveled panel with a hard drop shadow, drawn in-framebuffer. */
export function drawTooltip(
  ctx: DrawContext,
  lines: readonly string[],
  hit: Hit,
  swatches?: readonly (Color | null)[]
): void {
  const { fb, font, theme } = ctx;
  if (!lines.length) return;

  const hasSwatch = swatches?.some((s) => s !== null) ?? false;
  const indent = hasSwatch ? SWATCH + 2 : 0;

  let textW = 0;
  lines.forEach((l, i) => {
    const own = measureText(font, l) + (swatches?.[i] ? indent : 0);
    textW = Math.max(textW, own);
  });

  const boxW = textW + 6;
  const boxH = lines.length * (font.height + 1) + 5;

  let x = hit.anchorX - (boxW >> 1);
  let y = hit.anchorY - boxH - 3;
  x = clamp(x, 1, Math.max(1, ctx.width - boxW - 2));
  // Prefer above the anchor so a finger on a touch screen does not cover it.
  if (y < 1) y = Math.min(hit.anchorY + 6, ctx.height - boxH - 2);
  y = clamp(y, 1, Math.max(1, ctx.height - boxH - 2));

  panel(fb, x, y, boxW, boxH, {
    fill: theme.panel,
    border: theme.ink,
    light: theme.light,
    dark: theme.dark,
    shadow: theme.shadow,
  });

  const textColor = luminance(theme.panel) > 0.5 ? theme.ink : theme.light;
  lines.forEach((l, i) => {
    const ly = y + 3 + i * (font.height + 1);
    const sw = swatches?.[i];
    if (sw) {
      const sy = ly + ((font.height - SWATCH) >> 1);
      fb.fill(x + 3, sy, SWATCH, SWATCH, sw);
      rect(fb, x + 3, sy, SWATCH, SWATCH, darken(sw, 0.45));
    }
    drawText(fb, font, x + 3 + (sw ? indent : 0), ly, l, textColor);
  });
}

/* ------------------------------------------------------------------ shared */

export function extent(data: ChartData): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const ds of data.datasets) {
    for (const v of ds.data) {
      if (!Number.isFinite(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (min === Infinity) return { min: 0, max: 1 };
  return { min, max };
}

export function datasetColor(ctx: DrawContext, index: number, data: ChartData): Color {
  const ds = data.datasets[index];
  return ds?.color !== undefined ? toColor(ds.color) : seriesColor(ctx.theme, index);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
