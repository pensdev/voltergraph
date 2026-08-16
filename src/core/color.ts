/**
 * Colors are packed into a single 32-bit integer laid out in the *native byte
 * order of ImageData*, so a Uint32Array view over a framebuffer can be handed
 * straight to `putImageData` with no per-channel shuffling.
 */
export type Color = number;

const LITTLE_ENDIAN =
  new Uint8Array(new Uint32Array([0x11223344]).buffer)[0] === 0x44;

export function rgba(r: number, g: number, b: number, a = 255): Color {
  r &= 255;
  g &= 255;
  b &= 255;
  a &= 255;
  return LITTLE_ENDIAN
    ? (((a << 24) | (b << 16) | (g << 8) | r) >>> 0)
    : (((r << 24) | (g << 16) | (b << 8) | a) >>> 0);
}

export function rgb(r: number, g: number, b: number): Color {
  return rgba(r, g, b, 255);
}

export const TRANSPARENT: Color = 0;

export function unpack(c: Color): [number, number, number, number] {
  return LITTLE_ENDIAN
    ? [c & 255, (c >>> 8) & 255, (c >>> 16) & 255, (c >>> 24) & 255]
    : [(c >>> 24) & 255, (c >>> 16) & 255, (c >>> 8) & 255, c & 255];
}

export function alphaOf(c: Color): number {
  return LITTLE_ENDIAN ? (c >>> 24) & 255 : c & 255;
}

/** Accepts `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa` (leading `#` optional). */
export function hex(str: string): Color {
  let s = str.trim();
  if (s.charCodeAt(0) === 35) s = s.slice(1);
  if (s.length === 3 || s.length === 4) {
    s = s
      .split('')
      .map((ch) => ch + ch)
      .join('');
  }
  if (s.length !== 6 && s.length !== 8) {
    throw new Error(`volter-graph: bad hex color "${str}"`);
  }
  const n = parseInt(s, 16);
  return s.length === 6
    ? rgba((n >>> 16) & 255, (n >>> 8) & 255, n & 255, 255)
    : rgba((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
}

/** Normalizes a user-supplied color (hex string or packed int) to a Color. */
export function toColor(c: Color | string): Color {
  return typeof c === 'string' ? hex(c) : c;
}

/** Linear blend, `t` in 0..1. Alpha is blended too. */
export function mix(a: Color, b: Color, t: number): Color {
  const [ar, ag, ab, aa] = unpack(a);
  const [br, bg, bb, ba] = unpack(b);
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return rgba(
    Math.round(ar + (br - ar) * k),
    Math.round(ag + (bg - ag) * k),
    Math.round(ab + (bb - ab) * k),
    Math.round(aa + (ba - aa) * k)
  );
}

export function darken(c: Color, amount = 0.25): Color {
  const [r, g, b, a] = unpack(c);
  const k = 1 - amount;
  return rgba(Math.round(r * k), Math.round(g * k), Math.round(b * k), a);
}

export function lighten(c: Color, amount = 0.25): Color {
  const [r, g, b, a] = unpack(c);
  return rgba(
    Math.round(r + (255 - r) * amount),
    Math.round(g + (255 - g) * amount),
    Math.round(b + (255 - b) * amount),
    a
  );
}

/** Perceptual luminance 0..1, for picking readable label colors over fills. */
export function luminance(c: Color): number {
  const [r, g, b] = unpack(c);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
