import {
  Framebuffer,
  compileFont,
  drawText,
  measureText,
  volterGoldfishBold,
  hex,
  type Color,
} from '../src/index.js';

const font = compileFont(volterGoldfishBold);

export interface PixelTextOptions {
  scale?: number;
  color?: string;
  shadow?: string;
  /** Extra pixels between glyphs, before scaling. */
  tracking?: number;
}

/**
 * Renders a string with the library's own bitmap face into a canvas.
 *
 * The page's display type is drawn by the thing the page is demonstrating —
 * which is also the honest way to show the font, since any web font at this
 * size would be a hinted approximation of a bitmap rather than the real one.
 */
export function pixelText(text: string, options: PixelTextOptions = {}): HTMLCanvasElement {
  const scale = Math.max(1, Math.floor(options.scale ?? 4));
  const tracking = options.tracking ?? 0;
  const ink: Color = hex(options.color ?? '#000000');
  const shadow = options.shadow ? hex(options.shadow) : undefined;

  const w = measureText(font, text) + tracking * Math.max(0, text.length - 1) + (shadow ? 1 : 0);
  const h = font.height + (shadow ? 1 : 0);

  const fb = new Framebuffer(Math.max(1, w), h);
  drawText(fb, font, 0, 0, text, ink, {
    letterSpacing: tracking,
    shadow,
    shadowOffset: [1, 1],
  });

  const canvas = document.createElement('canvas');
  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  canvas.width = fb.width * scale * dpr;
  canvas.height = fb.height * scale * dpr;
  canvas.style.width = `${fb.width * scale}px`;
  canvas.style.height = `${fb.height * scale}px`;
  canvas.style.display = 'block';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', text);

  const staging = document.createElement('canvas');
  staging.width = fb.width;
  staging.height = fb.height;
  const sctx = staging.getContext('2d')!;
  const image = sctx.createImageData(fb.width, fb.height);
  image.data.set(fb.bytes());
  sctx.putImageData(image, 0, 0);

  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(staging, 0, 0, canvas.width, canvas.height);

  return canvas;
}

/** Replaces an element's contents with pixel-rendered text. */
export function setPixelText(el: HTMLElement, text: string, options: PixelTextOptions = {}): void {
  el.replaceChildren(pixelText(text, options));
}
