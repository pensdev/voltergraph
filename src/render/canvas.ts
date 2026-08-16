import { Framebuffer } from '../core/framebuffer.js';

export interface CanvasRendererOptions {
  /**
   * Device-independent pixels per logical pixel. Must be an integer —
   * fractional zoom is what produces blurry pixel art. `'auto'` scales the
   * chunkiness with the viewport, which is what keeps a 7px font legible on a
   * phone and stops a chart looking miniature on a desktop monitor.
   */
  zoom?: number | 'auto';
  /** Fixed logical size. Omit for fluid sizing driven by the container. */
  logicalWidth?: number;
  logicalHeight?: number;
  /**
   * Width / height, used only when the container has no height of its own.
   * `'auto'` picks a taller ratio on narrow screens, where a 16:9 chart leaves
   * no room for a title, a legend and an axis at once.
   */
  aspectRatio?: number | 'auto';
  /** Floor for the logical height, in logical pixels. */
  minHeight?: number;
}

/** Logical pixels per zoom step. Wider containers get chunkier pixels. */
const AUTO_ZOOM_UNIT = 300;
const MAX_AUTO_ZOOM = 4;

export class CanvasRenderer {
  readonly canvas: HTMLCanvasElement;
  fb: Framebuffer;

  private container: HTMLElement;
  private options: CanvasRendererOptions;
  private ctx: CanvasRenderingContext2D;
  private staging: HTMLCanvasElement;
  private stagingCtx: CanvasRenderingContext2D;
  private imageData: ImageData | null = null;
  private currentZoom = 2;

  constructor(container: HTMLElement, options: CanvasRendererOptions = {}) {
    this.container = container;
    this.options = options;

    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    // Safari still wants the old keyword; the later declaration wins elsewhere.
    this.canvas.style.setProperty('image-rendering', 'crisp-edges');
    this.canvas.style.setProperty('image-rendering', 'pixelated');
    // Let vertical scrolling through, but claim horizontal drags for the
    // crosshair. Without this a touch-drag scrolls the page instead.
    this.canvas.style.touchAction = 'pan-y';
    container.appendChild(this.canvas);

    const ctx = this.canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('volter-graph: could not acquire a 2D context');
    this.ctx = ctx;

    this.staging = document.createElement('canvas');
    const sctx = this.staging.getContext('2d', { alpha: false, willReadFrequently: true });
    if (!sctx) throw new Error('volter-graph: could not acquire a staging 2D context');
    this.stagingCtx = sctx;

    this.fb = new Framebuffer(1, 1);
    this.resize();
  }

  get zoom(): number {
    return this.currentZoom;
  }

  setZoom(value: number | 'auto'): void {
    this.options.zoom = value;
    this.resize();
  }

  /**
   * Recomputes zoom and logical size from the container. Returns true when the
   * framebuffer was reallocated, meaning the caller must redraw.
   */
  resize(): boolean {
    const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
    const deviceScale = Math.max(1, Math.floor(dpr));

    const { w: cssW, h: cssH } = this.measureContainer();
    const zoom = this.resolveZoom(cssW);

    let lw: number;
    let lh: number;

    if (this.options.logicalWidth && this.options.logicalHeight) {
      lw = this.options.logicalWidth;
      lh = this.options.logicalHeight;
    } else {
      // Fluid: the chart gains pixels rather than growing them.
      lw = Math.max(48, Math.floor(cssW / zoom));
      lh = cssH > 0 ? Math.floor(cssH / zoom) : Math.round(lw / this.resolveAspect(lw));
      lh = Math.max(this.options.minHeight ?? 60, lh);
    }

    if (lw === this.fb.width && lh === this.fb.height && zoom === this.currentZoom && this.imageData) {
      return false;
    }

    this.currentZoom = zoom;
    this.fb = new Framebuffer(lw, lh);
    this.staging.width = lw;
    this.staging.height = lh;
    this.imageData = this.stagingCtx.createImageData(lw, lh);

    this.canvas.width = lw * zoom * deviceScale;
    this.canvas.height = lh * zoom * deviceScale;
    this.canvas.style.width = `${lw * zoom}px`;
    this.canvas.style.height = `${lh * zoom}px`;

    return true;
  }

  private resolveZoom(cssWidth: number): number {
    const requested = this.options.zoom ?? 'auto';
    if (typeof requested === 'number') return Math.max(1, Math.floor(requested));
    return Math.max(2, Math.min(MAX_AUTO_ZOOM, Math.floor(cssWidth / AUTO_ZOOM_UNIT) || 2));
  }

  private resolveAspect(logicalWidth: number): number {
    const requested = this.options.aspectRatio ?? 'auto';
    if (typeof requested === 'number') return requested > 0 ? requested : 16 / 9;
    if (logicalWidth < 170) return 5 / 4;
    if (logicalWidth < 260) return 4 / 3;
    return 16 / 9;
  }

  /**
   * A canvas sized in CSS pixels contributes its full width to its parent's
   * intrinsic size, so inside a grid or flex track the container can never
   * report a width smaller than the canvas already is — it grows and then
   * refuses to shrink. Scaling the canvas down with `max-width: 100%` would
   * fix the layout and destroy the pixel grid, so the canvas is collapsed for
   * the duration of the measurement instead. Costs one forced reflow per
   * resize, which is already coalesced to at most one per frame.
   */
  private measureContainer(): { w: number; h: number } {
    const prevW = this.canvas.style.width;
    const prevH = this.canvas.style.height;
    this.canvas.style.width = '0px';
    this.canvas.style.height = '0px';

    const rect = this.container.getBoundingClientRect();
    const cs = getComputedStyle(this.container);
    const w = rect.width - num(cs.paddingLeft) - num(cs.paddingRight);
    const h = rect.height - num(cs.paddingTop) - num(cs.paddingBottom);

    this.canvas.style.width = prevW;
    this.canvas.style.height = prevH;

    return { w: Math.max(1, Math.floor(w) || 320), h: Math.max(0, Math.floor(h)) };
  }

  /** Pushes the framebuffer to screen. */
  present(): void {
    if (!this.imageData) return;
    this.imageData.data.set(this.fb.bytes());
    this.stagingCtx.putImageData(this.imageData, 0, 0);

    this.ctx.imageSmoothingEnabled = false;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(this.staging, 0, 0, this.canvas.width, this.canvas.height);
  }

  /** Client (CSS) coordinates -> logical framebuffer coordinates. */
  toLogical(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    const sx = this.fb.width / (r.width || 1);
    const sy = this.fb.height / (r.height || 1);
    return {
      x: Math.floor((clientX - r.left) * sx),
      y: Math.floor((clientY - r.top) * sy),
    };
  }

  destroy(): void {
    this.canvas.remove();
    this.imageData = null;
  }
}

function num(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}
