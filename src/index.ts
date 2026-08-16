import { compileFont, type BitmapFont } from './core/font.js';
import { volter5 } from './core/fonts/volter5.js';
import { CanvasRenderer, type CanvasRendererOptions } from './render/canvas.js';
import { resolveTheme } from './theme/palette.js';
import { drawBarChart } from './charts/bar.js';
import { drawLineChart } from './charts/line.js';
import { drawPieChart } from './charts/pie.js';
import { createDataTable, updateDataTable } from './a11y/table.js';
import type {
  BarOptions,
  ChartData,
  DrawContext,
  Hit,
  LineOptions,
  PieOptions,
  RenderResult,
} from './charts/types.js';

export type ChartConfig = { render?: CanvasRendererOptions; font?: BitmapFont } & (
  | { type: 'bar'; data: ChartData; options?: BarOptions }
  | { type: 'line'; data: ChartData; options?: LineOptions }
  | { type: 'pie'; data: ChartData; options?: PieOptions }
);

const defaultFont = compileFont(volter5);

export class VolterGraph {
  readonly renderer: CanvasRenderer;

  private table: HTMLElement;
  private font: BitmapFont;
  private config: ChartConfig;
  private result: RenderResult | null = null;
  private hover: Hit | null = null;
  private frame = 0;
  private observer: ResizeObserver | null = null;
  private touching = false;

  constructor(target: HTMLElement | string, config: ChartConfig) {
    const host = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target;
    if (!host) throw new Error(`volter-graph: no element matching ${String(target)}`);

    this.config = config;
    this.font = config.font ?? defaultFont;

    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';

    this.renderer = new CanvasRenderer(host, config.render);
    this.table = createDataTable();
    host.appendChild(this.table);

    const canvas = this.renderer.canvas;
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerCancel);
    canvas.addEventListener('pointerleave', this.onPointerLeave);

    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => this.handleResize());
      this.observer.observe(host);
    }

    this.render();
  }

  setData(data: ChartData): void {
    this.config.data = data;
    this.hover = null;
    this.render();
  }

  /** Merges into the existing options. Accepts any chart type's fields. */
  setOptions(options: Partial<BarOptions & LineOptions & PieOptions>): void {
    this.config.options = { ...this.config.options, ...options };
    this.render();
  }

  /** Draws immediately. Prefer `invalidate()` from event handlers. */
  render(): void {
    const options = this.config.options ?? {};
    const ctx: DrawContext = {
      fb: this.renderer.fb,
      font: this.font,
      theme: resolveTheme(options.theme),
      width: this.renderer.fb.width,
      height: this.renderer.fb.height,
    };

    const state = { hover: this.hover };
    switch (this.config.type) {
      case 'line':
        this.result = drawLineChart(ctx, this.config.data, this.config.options ?? {}, state);
        break;
      case 'pie':
        this.result = drawPieChart(ctx, this.config.data, this.config.options ?? {}, state);
        break;
      default:
        this.result = drawBarChart(ctx, this.config.data, this.config.options ?? {}, state);
    }

    this.renderer.present();
    updateDataTable(this.table, this.config.data, options);
  }

  /** Coalesces multiple redraw requests into one animation frame. */
  invalidate(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.render();
    });
  }

  destroy(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.observer?.disconnect();
    const canvas = this.renderer.canvas;
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerCancel);
    canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.renderer.destroy();
    this.table.remove();
  }

  private handleResize(): void {
    if (this.renderer.resize()) this.invalidate();
  }

  private updateHover(e: PointerEvent): void {
    const { x, y } = this.renderer.toLogical(e.clientX, e.clientY);
    const hit = this.result?.hitTest(x, y) ?? null;
    if (sameHit(hit, this.hover)) return;
    this.hover = hit;
    this.invalidate();
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse') return;
    // Touch has no hover state, so a press stands in for one.
    this.touching = true;
    this.updateHover(e);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (e.pointerType !== 'mouse' && !this.touching) return;
    this.updateHover(e);
  };

  /**
   * The tooltip deliberately survives lifting a finger. Clearing on release
   * would make a tap flash the value and hide it again, so it stays until the
   * next tap resolves to nothing — or until the gesture turns into a scroll,
   * which arrives as a cancel.
   */
  private onPointerUp = (): void => {
    this.touching = false;
  };

  private onPointerCancel = (): void => {
    this.touching = false;
    if (!this.hover) return;
    this.hover = null;
    this.invalidate();
  };

  private onPointerLeave = (e: PointerEvent): void => {
    if (e.pointerType !== 'mouse') return;
    if (!this.hover) return;
    this.hover = null;
    this.invalidate();
  };
}

function sameHit(a: Hit | null, b: Hit | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.datasetIndex === b.datasetIndex && a.pointIndex === b.pointIndex;
}

/** Convenience factory mirroring the class constructor. */
export function createChart(target: HTMLElement | string, config: ChartConfig): VolterGraph {
  return new VolterGraph(target, config);
}

export { Framebuffer } from './core/framebuffer.js';
export { compileFont, drawText, measureText } from './core/font.js';
export type { BitmapFont, FontSpec, GlyphSpec, TextOptions } from './core/font.js';
export { volter5 } from './core/fonts/volter5.js';
export * as raster from './core/raster.js';
export * as dither from './core/dither.js';
export { panel, inset } from './core/nineslice.js';
export type { PanelStyle } from './core/nineslice.js';
export {
  rgb,
  rgba,
  hex,
  mix,
  darken,
  lighten,
  luminance,
  unpack,
  toColor,
} from './core/color.js';
export type { Color } from './core/color.js';
export { fitAxis, niceStep, decimalsForStep } from './scale/ticks.js';
export type { AxisFit, AxisFitOptions } from './scale/ticks.js';
export { linearScale, scaleFromFit } from './scale/linear.js';
export type { LinearScale } from './scale/linear.js';
export { bandScale, subdivide } from './scale/band.js';
export type { Band, BandScale } from './scale/band.js';
export { origins, midnight, themes, resolveTheme, seriesColor } from './theme/palette.js';
export type { Theme } from './theme/palette.js';
export { CanvasRenderer } from './render/canvas.js';
export type { CanvasRendererOptions } from './render/canvas.js';
export { drawBarChart } from './charts/bar.js';
export { drawLineChart } from './charts/line.js';
export { drawPieChart } from './charts/pie.js';
export { defaultFormat } from './charts/format.js';
export type {
  BarOptions,
  ChartData,
  ChartOptions,
  ChartState,
  Dataset,
  DrawContext,
  Hit,
  LineOptions,
  PieOptions,
  RenderResult,
} from './charts/types.js';
