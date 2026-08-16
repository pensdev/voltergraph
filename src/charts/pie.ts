import { drawText, measureText } from '../core/font.js';
import { darken, lighten, luminance, type Color } from '../core/color.js';
import {
  layoutLegend,
  drawLegend,
  drawTooltip,
  datasetColor,
  clamp,
} from './layout.js';
import { defaultFormat } from './format.js';
import type {
  ChartData,
  ChartState,
  DrawContext,
  Hit,
  PieOptions,
  RenderResult,
} from './types.js';

const TAU = Math.PI * 2;

interface Slice {
  index: number;
  value: number;
  fraction: number;
  /** Radians clockwise from the start angle. */
  from: number;
  to: number;
  color: Color;
}

/**
 * Pies are the hardest shape to do honestly in pixel art: an arc is a curve,
 * and every vector renderer resolves that with antialiasing.
 *
 * The approach here is to build a mask of slice indices by testing each pixel's
 * angle directly, then derive the outlines from *boundaries in that mask*
 * rather than by stroking arcs. One edge-detect pass gives the circumference,
 * the radial dividers and the donut hole simultaneously, all exactly 1px, all
 * exactly aligned with the fill they enclose.
 */
export function drawPieChart(
  ctx: DrawContext,
  data: ChartData,
  options: PieOptions,
  state: ChartState
): RenderResult {
  const { fb, font, theme } = ctx;
  fb.clear(theme.bg);

  const pad = {
    top: options.padding?.top ?? 3,
    right: options.padding?.right ?? 4,
    bottom: options.padding?.bottom ?? 3,
    left: options.padding?.left ?? 3,
  };

  let top = pad.top;
  if (options.title) {
    drawText(fb, font, pad.left, pad.top, options.title, theme.ink, {
      shadow: theme.light,
      shadowOffset: [0, 1],
    });
    top += font.height + 4;
  }

  const values = data.datasets[0]?.data ?? [];
  const total = values.reduce((a, v) => (Number.isFinite(v) && v > 0 ? a + v : a), 0);
  const format = options.format ?? defaultFormat(1);

  const showLegend = options.showLegend ?? true;
  const legend = showLegend
    ? layoutLegend(
        ctx,
        data.labels.map((label, i) => ({
          label: total > 0 ? `${label} ${Math.round((values[i] / total) * 100)}%` : label,
          color: datasetColor(ctx, i, data),
        })),
        ctx.width - pad.left - pad.right
      )
    : null;

  const legendY = ctx.height - pad.bottom - (legend?.height ?? 0);
  const bottom = legend ? legendY - 3 : ctx.height - pad.bottom;

  if (legend) drawLegend(ctx, legend, pad.left, legendY);
  if (total <= 0) return { hitTest: () => null };

  const depth = Math.max(0, Math.round(options.depth ?? 0));
  const tilt = clamp(options.tilt ?? (depth > 0 ? 0.62 : 1), 0.2, 1);
  const donut = clamp(options.donut ?? 0, 0, 0.9);

  const boxW = ctx.width - pad.left - pad.right;
  const boxH = Math.max(8, bottom - top);
  // Fit an ellipse of the requested tilt inside the box, leaving room for the
  // extruded side and the 1px outline.
  const rx = Math.max(3, Math.min((boxW - 2) >> 1, Math.floor((boxH - 2 - depth) / (2 * tilt))));
  const ry = Math.max(2, Math.round(rx * tilt));
  const cx = pad.left + (boxW >> 1);
  // Centre the whole body — disc plus extruded side — inside the box.
  const cy = top + Math.floor((boxH - depth) / 2);

  const startAngle = ((options.startAngle ?? 0) * Math.PI) / 180 - Math.PI / 2;

  const slices: Slice[] = [];
  let cursor = 0;
  values.forEach((v, i) => {
    if (!Number.isFinite(v) || v <= 0) return;
    const fraction = v / total;
    slices.push({
      index: i,
      value: v,
      fraction,
      from: cursor * TAU,
      to: (cursor + fraction) * TAU,
      color: datasetColor(ctx, i, data),
    });
    cursor += fraction;
  });

  const mask = buildMask(slices, cx, cy, rx, ry, donut, startAngle);

  // Painter's order: the extruded sides are the same mask stamped downward,
  // each pass covered by the next, leaving only the visible lower rim.
  for (let d = depth; d >= 1; d--) {
    paintMask(ctx, mask, 0, d, (s) => darken(sliceFill(s, state), 0.42));
  }
  paintMask(ctx, mask, 0, 0, (s) => sliceFill(s, state));

  if (depth > 0) outlineSides(ctx, mask, depth);
  outlineMask(ctx, mask);

  if (options.showPercent) {
    drawPercentLabels(ctx, slices, cx, cy, rx, ry, donut, startAngle);
  }

  if (state.hover) {
    const slice = slices.find((s) => s.index === state.hover!.pointIndex);
    if (slice) {
      const label = data.labels[slice.index] ?? '';
      const pct = `${(slice.fraction * 100).toFixed(slice.fraction < 0.01 ? 1 : 0)}%`;
      drawTooltip(ctx, [label, `${format(slice.value)} (${pct})`].filter(Boolean), state.hover);
    }
  }

  return {
    hitTest(px, py) {
      const nx = (px - cx) / rx;
      const ny = (py - cy) / ry;
      const d2 = nx * nx + ny * ny;
      if (d2 > 1 || d2 < donut * donut) return null;

      let angle = Math.atan2(ny, nx) - startAngle;
      angle = ((angle % TAU) + TAU) % TAU;
      const slice = slices.find((s) => angle >= s.from && angle < s.to);
      if (!slice) return null;

      const mid = (slice.from + slice.to) / 2 + startAngle;
      return {
        datasetIndex: 0,
        pointIndex: slice.index,
        anchorX: Math.round(cx + Math.cos(mid) * rx * 0.7),
        anchorY: Math.round(cy + Math.sin(mid) * ry * 0.7),
      } satisfies Hit;
    },
  };
}

/* -------------------------------------------------------------------- mask */

interface Mask {
  /** Slice index + 1, or 0 for empty. */
  ids: Uint16Array;
  slices: Slice[];
  x0: number;
  y0: number;
  w: number;
  h: number;
}

function buildMask(
  slices: readonly Slice[],
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  donut: number,
  startAngle: number
): Mask {
  const x0 = cx - rx - 1;
  const y0 = cy - ry - 1;
  const w = 2 * rx + 3;
  const h = 2 * ry + 3;
  const ids = new Uint16Array(w * h);
  const inner2 = donut * donut;

  for (let y = 0; y < h; y++) {
    const ny = (y0 + y - cy) / ry;
    for (let x = 0; x < w; x++) {
      const nx = (x0 + x - cx) / rx;
      const d2 = nx * nx + ny * ny;
      if (d2 > 1 || d2 < inner2) continue;

      let angle = Math.atan2(ny, nx) - startAngle;
      angle = ((angle % TAU) + TAU) % TAU;

      // Linear scan: slice counts are small, and a binary search here would
      // cost more in edge cases than it saves.
      for (let i = 0; i < slices.length; i++) {
        if (angle >= slices[i].from && angle < slices[i].to) {
          ids[y * w + x] = i + 1;
          break;
        }
      }
    }
  }

  return { ids, slices: slices as Slice[], x0, y0, w, h };
}

function sliceFill(slice: Slice, state: ChartState): Color {
  return state.hover?.pointIndex === slice.index ? lighten(slice.color, 0.22) : slice.color;
}

function paintMask(
  ctx: DrawContext,
  mask: Mask,
  offsetX: number,
  offsetY: number,
  color: (slice: Slice) => Color
): void {
  const cache = mask.slices.map(color);
  for (let y = 0; y < mask.h; y++) {
    for (let x = 0; x < mask.w; x++) {
      const id = mask.ids[y * mask.w + x];
      if (id === 0) continue;
      ctx.fb.set(mask.x0 + x + offsetX, mask.y0 + y + offsetY, cache[id - 1]);
    }
  }
}

/**
 * Outlines every boundary in the mask in one pass. A pixel whose right or
 * lower neighbour belongs to a different slice becomes outline, which yields
 * the circumference, the radial dividers and the donut hole together — all
 * guaranteed 1px and perfectly registered against the fill.
 */
function outlineMask(ctx: DrawContext, mask: Mask): void {
  const { ids, w, h, x0, y0, slices } = mask;
  const edge = (id: number) => darken(slices[id - 1].color, 0.5);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = ids[y * w + x];
      if (x + 1 < w) mark(a, ids[y * w + x + 1], x, y, x + 1, y);
      if (y + 1 < h) mark(a, ids[(y + 1) * w + x], x, y, x, y + 1);
    }
  }

  function mark(a: number, b: number, ax: number, ay: number, bx: number, by: number): void {
    if (a === b) return;
    if (a !== 0) ctx.fb.set(x0 + ax, y0 + ay, edge(a));
    else ctx.fb.set(x0 + bx, y0 + by, edge(b));
  }
}

/** The silhouette of the extruded body, i.e. the part the top disc misses. */
function outlineSides(ctx: DrawContext, mask: Mask, depth: number): void {
  const { ids, w, h, x0, y0, slices } = mask;
  const filled = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= w) return 0;
    // The union of the top mask and all its downward stamps.
    for (let d = 0; d <= depth; d++) {
      const yy = y - d;
      if (yy >= 0 && yy < h && ids[yy * w + x] !== 0) return ids[yy * w + x];
    }
    return 0;
  };

  for (let y = 0; y < h + depth; y++) {
    for (let x = 0; x < w; x++) {
      const a = filled(x, y);
      if (a === 0) continue;
      const isTop = y < h && ids[y * w + x] !== 0;
      if (isTop) continue;
      if (filled(x + 1, y) === 0 || filled(x, y + 1) === 0) {
        ctx.fb.set(x0 + x, y0 + y, darken(slices[a - 1].color, 0.62));
      }
    }
  }
}

function drawPercentLabels(
  ctx: DrawContext,
  slices: readonly Slice[],
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  donut: number,
  startAngle: number
): void {
  const { fb, font } = ctx;
  const t = donut > 0 ? (1 + donut) / 2 : 0.62;

  for (const slice of slices) {
    const pct = Math.round(slice.fraction * 100);
    if (pct < 1) continue;
    const text = `${pct}%`;
    const tw = measureText(font, text);

    // Only label a slice whose arc at the label radius is wider than the text.
    const arc = (slice.to - slice.from) * rx * t;
    if (arc < tw + 3 || ry * t < font.height) continue;

    const mid = (slice.from + slice.to) / 2 + startAngle;
    const lx = Math.round(cx + Math.cos(mid) * rx * t);
    const ly = Math.round(cy + Math.sin(mid) * ry * t);
    const ink =
      luminance(slice.color) > 0.5 ? darken(slice.color, 0.72) : lighten(slice.color, 0.85);
    drawText(fb, font, lx, ly, text, ink, { align: 'center', valign: 'middle' });
  }
}
