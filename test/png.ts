import { deflateSync, inflateSync } from 'node:zlib';
import type { Framebuffer } from '../src/core/framebuffer.js';

export interface DecodedPNG {
  width: number;
  height: number;
  /** RGBA bytes, same layout as `Framebuffer.bytes()`. */
  data: Uint8ClampedArray;
}

/**
 * Decodes PNGs produced by `encodePNG` — 8-bit RGBA, filter type 0, one IDAT.
 * Deliberately not a general decoder; it only has to read our own output, and
 * that lets golden comparisons work on pixels instead of compressed bytes.
 */
export function decodePNG(buf: Buffer): DecodedPNG {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('decodePNG: not a PNG');

  let offset = 8;
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];

  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + length);

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6) {
        throw new Error('decodePNG: expected 8-bit RGBA');
      }
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const out = new Uint8ClampedArray(stride * height);

  for (let y = 0; y < height; y++) {
    const src = y * (stride + 1);
    if (raw[src] !== 0) throw new Error(`decodePNG: unexpected filter ${raw[src]}`);
    out.set(raw.subarray(src + 1, src + 1 + stride), y * stride);
  }

  return { width, height, data: out };
}

export interface PixelDiff {
  differing: number;
  total: number;
  /** First differing pixel, for pointing at the problem. */
  first: { x: number; y: number } | null;
}

export function diffPixels(fb: Framebuffer, golden: DecodedPNG): PixelDiff {
  if (fb.width !== golden.width || fb.height !== golden.height) {
    throw new Error(
      `size mismatch: rendered ${fb.width}x${fb.height}, golden ${golden.width}x${golden.height}`
    );
  }
  const actual = fb.bytes();
  let differing = 0;
  let first: PixelDiff['first'] = null;

  for (let i = 0; i < golden.data.length; i += 4) {
    // The encoder forces alpha to 255, so compare RGB and ignore alpha.
    if (
      actual[i] !== golden.data[i] ||
      actual[i + 1] !== golden.data[i + 1] ||
      actual[i + 2] !== golden.data[i + 2]
    ) {
      differing++;
      if (!first) {
        const p = i / 4;
        first = { x: p % golden.width, y: Math.floor(p / golden.width) };
      }
    }
  }

  return { differing, total: golden.width * golden.height, first };
}

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
