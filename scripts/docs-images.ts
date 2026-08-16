/**
 * Renders the images the README embeds. Unlike `preview/`, these are
 * committed — a charting library whose README shows no charts is asking the
 * reader to take the interesting part on faith.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePNGScaled } from '../test/png.js';
import { renderBar, renderLine, renderPie } from '../test/fixtures.js';
import {
  rareValues,
  tradeVolume,
  creditSpend,
  hotelPopulation,
} from '../demo/data.js';
import type { Framebuffer } from '../src/core/framebuffer.js';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs');
mkdirSync(out, { recursive: true });

function write(name: string, fb: Framebuffer, scale = 3): void {
  writeFileSync(join(out, `${name}.png`), encodePNGScaled(fb, scale));
  console.log(`docs/${name}.png  ${fb.width}x${fb.height} @${scale}x`);
}

write(
  'rares',
  renderLine(320, 150, rareValues, {
    title: 'Rare trade value (credits)',
    includeZero: true,
  })
);

write(
  'bar',
  renderBar(210, 145, tradeVolume, { title: 'Trades by rare', showValues: true })
);

write('pie', renderPie(210, 165, creditSpend, { title: 'Credit spend', depth: 6, showPercent: true }));

write(
  'line-area',
  renderLine(210, 145, hotelPopulation, {
    title: 'Habbos online',
    stepped: true,
    area: true,
    includeZero: true,
  })
);
