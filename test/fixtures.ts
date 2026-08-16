import { compileFont } from '../src/core/font.js';
import { volter5 } from '../src/core/fonts/volter5.js';
import { Framebuffer } from '../src/core/framebuffer.js';
import { resolveTheme } from '../src/theme/palette.js';
import { drawBarChart } from '../src/charts/bar.js';
import { drawLineChart } from '../src/charts/line.js';
import { drawPieChart } from '../src/charts/pie.js';
import type {
  BarOptions,
  ChartData,
  ChartOptions,
  ChartState,
  DrawContext,
  LineOptions,
  PieOptions,
  RenderResult,
} from '../src/charts/types.js';

export const font = compileFont(volter5);

function context(fb: Framebuffer, options: ChartOptions): DrawContext {
  return {
    fb,
    font,
    theme: resolveTheme(options.theme),
    width: fb.width,
    height: fb.height,
  };
}

export interface Rendered {
  fb: Framebuffer;
  result: RenderResult;
}

export function renderBar(
  w: number,
  h: number,
  data: ChartData,
  options: BarOptions = {},
  state: ChartState = { hover: null }
): Framebuffer {
  return renderBarFull(w, h, data, options, state).fb;
}

export function renderBarFull(
  w: number,
  h: number,
  data: ChartData,
  options: BarOptions = {},
  state: ChartState = { hover: null }
): Rendered {
  const fb = new Framebuffer(w, h);
  return { fb, result: drawBarChart(context(fb, options), data, options, state) };
}

export function renderLine(
  w: number,
  h: number,
  data: ChartData,
  options: LineOptions = {},
  state: ChartState = { hover: null }
): Framebuffer {
  return renderLineFull(w, h, data, options, state).fb;
}

export function renderLineFull(
  w: number,
  h: number,
  data: ChartData,
  options: LineOptions = {},
  state: ChartState = { hover: null }
): Rendered {
  const fb = new Framebuffer(w, h);
  return { fb, result: drawLineChart(context(fb, options), data, options, state) };
}

export function renderPie(
  w: number,
  h: number,
  data: ChartData,
  options: PieOptions = {},
  state: ChartState = { hover: null }
): Framebuffer {
  return renderPieFull(w, h, data, options, state).fb;
}

export function renderPieFull(
  w: number,
  h: number,
  data: ChartData,
  options: PieOptions = {},
  state: ChartState = { hover: null }
): Rendered {
  const fb = new Framebuffer(w, h);
  return { fb, result: drawPieChart(context(fb, options), data, options, state) };
}

export const sales: ChartData = {
  labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  datasets: [{ label: 'Visits', data: [120, 190, 90, 240, 180, 310, 275] }],
};

export const twoSeries: ChartData = {
  labels: ['Q1', 'Q2', 'Q3', 'Q4'],
  datasets: [
    { label: 'Coins', data: [42, 58, 31, 74] },
    { label: 'Ducats', data: [18, 26, 44, 39] },
  ],
};

export const trend: ChartData = {
  labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  datasets: [
    { label: 'Users', data: [12, 19, 17, 28, 34, 31, 42, 47, 44, 58, 61, 72] },
    { label: 'Rooms', data: [8, 11, 15, 14, 22, 27, 25, 33, 38, 36, 44, 49] },
  ],
};

export const shares: ChartData = {
  labels: ['Furni', 'Badges', 'Pets', 'Rooms', 'Other'],
  datasets: [{ label: 'Spend', data: [42, 23, 15, 12, 8] }],
};
