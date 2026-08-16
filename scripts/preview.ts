/**
 * Renders the sample charts to PNGs at 4x so the pixel work can be inspected
 * without a browser. `npm run preview`.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePNGScaled } from '../test/png.js';
import {
  renderBar,
  renderLine,
  renderPie,
  renderPieFull,
  renderLineFull,
  sales,
  twoSeries,
  trend,
  shares,
  font,
} from '../test/fixtures.js';
import { Framebuffer } from '../src/core/framebuffer.js';
import { drawText } from '../src/core/font.js';
import { origins, midnight } from '../src/theme/palette.js';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'preview');
mkdirSync(out, { recursive: true });

function write(name: string, fb: Framebuffer, scale = 4): void {
  writeFileSync(join(out, `${name}.png`), encodePNGScaled(fb, scale));
  console.log(`preview/${name}.png  ${fb.width}x${fb.height} @${scale}x`);
}

write('bar-single', renderBar(220, 130, sales, { title: 'Visits this week' }));
write('bar-grouped', renderBar(220, 140, twoSeries, { title: 'Currency', showValues: true }));
write('bar-midnight', renderBar(220, 130, sales, { title: 'Visits', theme: midnight }));

write('line-basic', renderLine(260, 140, trend, { title: 'Growth' }));
write('line-area', renderLine(260, 140, trend, { title: 'Growth', area: true }));
write('line-midnight', renderLine(260, 140, trend, { title: 'Growth', area: true, theme: midnight }));
write('line-stepped', renderLine(220, 120, sales, { title: 'Visits', stepped: true }));

const lineHit = renderLineFull(260, 140, trend, { title: 'Growth' }).result.hitTest(130, 70);
write('line-hover', renderLine(260, 140, trend, { title: 'Growth' }, { hover: lineHit }));

write('pie-flat', renderPie(200, 160, shares, { title: 'Spend', showPercent: true }));
write('pie-donut', renderPie(200, 160, shares, { title: 'Spend', donut: 0.5 }));
write('pie-depth', renderPie(200, 170, shares, { title: 'Spend', depth: 6, showPercent: true }));
write('pie-midnight', renderPie(200, 170, shares, { title: 'Spend', depth: 6, theme: midnight }));

const pieHit = renderPieFull(200, 160, shares, { title: 'Spend' }).result.hitTest(130, 70);
write('pie-hover', renderPie(200, 160, shares, { title: 'Spend' }, { hover: pieHit }));

// Phone-sized: 375px CSS at auto zoom 2.
write('mobile-bar', renderBar(187, 120, sales, { title: 'Visits' }), 3);
write('mobile-line', renderLine(187, 120, trend, { title: 'Growth', area: true }), 3);
write('mobile-pie', renderPie(187, 140, shares, { title: 'Spend', showPercent: true }), 3);

// A specimen sheet, because font bugs are invisible inside a chart.
const specimen = new Framebuffer(200, 60);
specimen.clear(origins.bg);
[
  'ABCDEFGHIJKLM',
  'NOPQRSTUVWXYZ',
  'abcdefghijklm',
  'nopqrstuvwxyz',
  '0123456789 .,:;!?',
  '+-=/\\()[]<>%$#*',
].forEach((l, i) => drawText(specimen, font, 4, 3 + i * 9, l, origins.ink));
write('specimen', specimen, 4);
