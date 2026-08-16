import type { Framebuffer } from '../core/framebuffer.js';
import type { BitmapFont } from '../core/font.js';
import type { Theme } from '../theme/palette.js';
import type { Color } from '../core/color.js';

export interface Dataset {
  label: string;
  data: number[];
  color?: Color | string;
}

export interface ChartData {
  labels: string[];
  datasets: Dataset[];
}

export interface ChartOptions {
  title?: string;
  theme?: Theme | string;
  /** Formats tick and value labels. Receives the raw value. */
  format?: (value: number) => string;
  /** Preferred number of y-axis intervals. */
  targetSteps?: number;
  /** Force zero into the y domain. */
  includeZero?: boolean;
  /** Draw a legend when there is more than one series. Default true. */
  showLegend?: boolean;
  padding?: { top?: number; right?: number; bottom?: number; left?: number };
}

export interface BarOptions extends ChartOptions {
  /** Draw the value above each bar. */
  showValues?: boolean;
  /** Gap fraction between category slots, 0..1. */
  barPadding?: number;
}

export interface LineOptions extends ChartOptions {
  /** Dithered fill between the line and the zero baseline. */
  area?: boolean;
  /** Square markers at each point. Default: on when they fit. */
  showPoints?: boolean;
  /** Right-angle steps instead of diagonals. */
  stepped?: boolean;
  /** 1px dark outline around each line, for contrast over busy fills. */
  outlined?: boolean;
}

export interface PieOptions extends ChartOptions {
  /** Inner radius as a fraction of the outer, 0..0.9. 0 is a full pie. */
  donut?: number;
  /** Extruded side height in pixels. 0 is flat. */
  depth?: number;
  /** Vertical squash, 0.2..1. 1 is a true circle. Defaults by `depth`. */
  tilt?: number;
  /** Degrees clockwise from 12 o'clock for the first slice edge. */
  startAngle?: number;
  /** Percentage labels inside slices that are wide enough. */
  showPercent?: boolean;
}

/** Everything a chart draw function needs, and nothing it doesn't. */
export interface DrawContext {
  fb: Framebuffer;
  font: BitmapFont;
  /**
   * Face for titles and the emphasised line of a tooltip. A bitmap font cannot
   * be synthetically emboldened — smearing a 1px stem sideways just makes it
   * blurry at this size — so weight has to be a second hand-drawn face.
   * Resolves to `font` when the pair has no bold.
   */
  bold: BitmapFont;
  theme: Theme;
  width: number;
  height: number;
}

/**
 * A hovered datum. Deliberately not a rectangle: pie slices are wedges and
 * line points are single pixels, so charts own their own hit geometry and
 * report only the indices plus where a tooltip should point.
 */
export interface Hit {
  datasetIndex: number;
  pointIndex: number;
  anchorX: number;
  anchorY: number;
}

export interface ChartState {
  hover: Hit | null;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RenderResult {
  hitTest(x: number, y: number): Hit | null;
  plot?: Rect;
}
