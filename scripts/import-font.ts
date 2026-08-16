/**
 * Converts a pixel TTF into the bitmap FontSpec this library draws with.
 *
 *   npm run import-font -- --input path/to.ttf --out src/core/fonts/x.ts \
 *                          --name x --size 9
 *
 * A pixel typeface is only itself at one size: its outlines are axis-aligned
 * rectangles laid out on a grid, so rasterizing at the design ppem reproduces
 * the intended bitmap exactly, while any other size produces the mush that
 * hinting exists to hide. `--size` must therefore be the size the face was
 * drawn at, not a size you would like it to be.
 *
 * Glyph advance is baked into the bitmap width and tracking is set to zero, so
 * the imported face keeps the spacing its designer chose rather than having
 * this library's own letter-spacing imposed on top.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { parse, type Path } from 'opentype.js';

interface Args {
  input: string;
  out: string;
  name: string;
  size: number;
  charset: string;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string, fallback?: string): string => {
    const i = argv.indexOf(`--${flag}`);
    if (i === -1 || i + 1 >= argv.length) {
      if (fallback !== undefined) return fallback;
      throw new Error(`import-font: missing --${flag}`);
    }
    return argv[i + 1];
  };

  // Printable ASCII, which is what a chart needs; extend if a face has more.
  const defaultCharset = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('');

  return {
    input: get('input'),
    out: get('out'),
    name: get('name'),
    size: Number(get('size', '9')),
    charset: get('charset', defaultCharset),
  };
}

type Edge = { x0: number; y0: number; x1: number; y1: number };

/** Flattens a glyph path into straight edges in pixel space. */
function toEdges(path: Path): Edge[] {
  const edges: Edge[] = [];
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;

  const line = (x0: number, y0: number, x1: number, y1: number) => {
    if (y0 !== y1) edges.push({ x0, y0, x1, y1 });
  };

  // Pixel faces are all straight lines, but flatten curves anyway so the
  // importer does not quietly drop part of a glyph from a less strict font.
  const STEPS = 16;

  for (const c of path.commands) {
    switch (c.type) {
      case 'M':
        cx = sx = c.x;
        cy = sy = c.y;
        break;
      case 'L':
        line(cx, cy, c.x, c.y);
        cx = c.x;
        cy = c.y;
        break;
      case 'Q': {
        for (let i = 1; i <= STEPS; i++) {
          const t = i / STEPS;
          const u = 1 - t;
          const x = u * u * cx + 2 * u * t * c.x1 + t * t * c.x;
          const y = u * u * cy + 2 * u * t * c.y1 + t * t * c.y;
          line(cx, cy, x, y);
          cx = x;
          cy = y;
        }
        break;
      }
      case 'C': {
        for (let i = 1; i <= STEPS; i++) {
          const t = i / STEPS;
          const u = 1 - t;
          const x =
            u * u * u * cx + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x;
          const y =
            u * u * u * cy + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y;
          line(cx, cy, x, y);
          cx = x;
          cy = y;
        }
        break;
      }
      case 'Z':
        line(cx, cy, sx, sy);
        cx = sx;
        cy = sy;
        break;
    }
  }
  return edges;
}

/**
 * Samples the outline at pixel centres using the nonzero winding rule, which
 * is what TrueType specifies. Sampling at centres rather than corners is what
 * makes a rectangle that spans exactly one pixel come out as exactly one
 * pixel, rather than as two or none depending on rounding.
 */
function rasterize(edges: Edge[], width: number, height: number): boolean[][] {
  const rows: boolean[][] = [];

  for (let y = 0; y < height; y++) {
    const yc = y + 0.5;
    const crossings: { x: number; dir: number }[] = [];

    for (const e of edges) {
      const { x0, y0, x1, y1 } = e;
      if (yc < Math.min(y0, y1) || yc >= Math.max(y0, y1)) continue;
      const t = (yc - y0) / (y1 - y0);
      crossings.push({ x: x0 + t * (x1 - x0), dir: y1 > y0 ? 1 : -1 });
    }
    crossings.sort((a, b) => a.x - b.x);

    const row: boolean[] = new Array(width).fill(false);
    let winding = 0;
    let spanStart = 0;

    for (const crossing of crossings) {
      const before = winding;
      winding += crossing.dir;
      if (before === 0 && winding !== 0) {
        spanStart = crossing.x;
      } else if (before !== 0 && winding === 0) {
        fillSpan(row, spanStart, crossing.x, width);
      }
    }
    rows.push(row);
  }
  return rows;
}

function fillSpan(row: boolean[], from: number, to: number, width: number): void {
  for (let x = 0; x < width; x++) {
    const xc = x + 0.5;
    if (xc >= from && xc < to) row[x] = true;
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const buf = readFileSync(args.input);
  const font = parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

  const unitsToPx = args.size / font.unitsPerEm;
  const ascent = Math.round(font.ascender * unitsToPx);
  const descent = Math.abs(Math.round(font.descender * unitsToPx));
  const height = ascent + descent;

  const glyphs: string[] = [];
  let spaceWidth = Math.max(1, Math.round(args.size / 2));
  const skipped: string[] = [];

  for (const ch of args.charset) {
    const glyph = font.charToGlyph(ch);
    if (!glyph || glyph.index === 0) {
      skipped.push(ch);
      continue;
    }

    const advance = Math.max(1, Math.round((glyph.advanceWidth ?? 0) * unitsToPx));
    // Baseline at `ascent`, so row 0 is the top of the cell.
    const edges = toEdges(glyph.getPath(0, ascent, args.size));

    let inkRight = 0;
    for (const e of edges) inkRight = Math.max(inkRight, Math.ceil(e.x0), Math.ceil(e.x1));
    const width = Math.max(advance, inkRight);

    const rows = rasterize(edges, width, height);
    const painted = rows.map((r) => r.map((on) => (on ? '#' : '.')).join(''));

    // Trim blank rows top and bottom; the spec stores a y offset instead.
    let top = 0;
    while (top < painted.length && !painted[top].includes('#')) top++;
    let bottom = painted.length;
    while (bottom > top && !painted[bottom - 1].includes('#')) bottom--;

    if (top >= bottom) {
      // Blank glyph, e.g. space: a bare advance width.
      if (ch === ' ') spaceWidth = advance;
      glyphs.push(`    ${key(ch)}: ${advance},`);
      continue;
    }

    const body = painted
      .slice(top, bottom)
      .map((r) => `'${r}'`)
      .join(', ');
    glyphs.push(`    ${key(ch)}: [${top}, ${body}],`);
  }

  const source = `// GENERATED by scripts/import-font.ts — do not edit by hand.
// Source: ${relative(process.cwd(), resolve(args.input))} rasterized at ${args.size}px.
// Re-run: npm run import-font -- --input <ttf> --out <path> --name ${args.name} --size ${args.size}
import type { FontSpec } from '../font.js';

export const ${args.name}: FontSpec = {
  name: ${JSON.stringify(args.name)},
  height: ${height},
  baseline: ${ascent},
  // Advance is baked into each glyph's width, so no extra tracking is added.
  tracking: 0,
  spaceWidth: ${spaceWidth},
  fallback: [0, ${'"' + '#'.repeat(3) + '"'}, '#.#', '#.#', '#.#', ${'"' + '#'.repeat(3) + '"'}],
  glyphs: {
${glyphs.join('\n')}
  },
};
`;

  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, source);

  console.log(`${args.out}`);
  console.log(`  ${args.name}: ${height}px cell, baseline ${ascent}, ${glyphs.length} glyphs`);
  if (skipped.length) console.log(`  skipped (not in font): ${JSON.stringify(skipped.join(''))}`);
}

/** Quotes a glyph key only when it is not a safe identifier. */
function key(ch: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(ch) ? ch : JSON.stringify(ch);
}

main();
