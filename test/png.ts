import { deflateSync } from 'node:zlib';
import type { Framebuffer } from '../src/core/framebuffer.js';

/**
 * Minimal PNG encoder so golden-image tests need no browser and no deps.
 * Output is fully deterministic, which is the whole point: a framebuffer
 * renderer produces byte-identical images, so a hash comparison catches any
 * accidental antialiasing or off-by-one instantly.
 */
export function encodePNG(fb: Framebuffer): Buffer {
  const { width, height } = fb;
  const bytes = fb.bytes();

  // Filter type 0 per scanline.
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const o = y * (width * 4 + 1);
    raw[o] = 0;
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4;
      const d = o + 1 + x * 4;
      raw[d] = bytes[s];
      raw[d + 1] = bytes[s + 1];
      raw[d + 2] = bytes[s + 2];
      raw[d + 3] = bytes[s + 3] || 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Nearest-neighbour upscale, for eyeballing goldens at a sane size. */
export function encodePNGScaled(fb: Framebuffer, scale: number): Buffer {
  const w = fb.width * scale;
  const h = fb.height * scale;
  const src = fb.bytes();
  const raw = Buffer.alloc((w * 4 + 1) * h);

  for (let y = 0; y < h; y++) {
    const o = y * (w * 4 + 1);
    raw[o] = 0;
    const sy = (y / scale) | 0;
    for (let x = 0; x < w; x++) {
      const sx = (x / scale) | 0;
      const s = (sy * fb.width + sx) * 4;
      const d = o + 1 + x * 4;
      raw[d] = src[s];
      raw[d + 1] = src[s + 1];
      raw[d + 2] = src[s + 2];
      raw[d + 3] = src[s + 3] || 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
