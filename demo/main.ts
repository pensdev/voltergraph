import { VolterGraph, origins, midnight, type ChartConfig, type Theme } from '../src/index.js';
import { setPixelText } from './pixel-text.js';
import {
  rareValues,
  tradeVolume,
  creditSpend,
  weeklyChange,
  hotelPopulation,
  reshuffleRares,
} from './data.js';

/* ------------------------------------------------------------------ theme */

const media = window.matchMedia('(prefers-color-scheme: dark)');

/**
 * The page has three theme states, not two: an explicit `data-theme` wins,
 * and otherwise the OS preference decides. Charts follow the page rather than
 * carrying a theme of their own.
 */
function currentTheme(): Theme {
  const stamped = document.documentElement.dataset.theme;
  if (stamped === 'dark') return midnight;
  if (stamped === 'light') return origins;
  return media.matches ? midnight : origins;
}

const charts: VolterGraph[] = [];

function mount(target: string, config: ChartConfig): VolterGraph {
  const chart = new VolterGraph(target, config);
  charts.push(chart);
  return chart;
}

/* ------------------------------------------------------------- word mark */

function paintWordmark(): void {
  const el = document.querySelector<HTMLElement>('#wordmark');
  if (!el) return;
  const dark = currentTheme() === midnight;
  setPixelText(el, 'VOLTER GRAPH', {
    scale: window.innerWidth < 560 ? 5 : 7,
    tracking: 1,
    color: dark ? '#f2c14e' : '#2b2b3a',
    shadow: dark ? '#0c0e14' : '#fffdf6',
  });
}

/* ----------------------------------------------------------------- charts */

const theme = currentTheme();

const rares = mount('#rares', {
  type: 'line',
  data: rareValues,
  options: {
    theme,
    title: 'Rare trade value (credits)',
    // Three stacked dithers bury the June crash, which is the whole story
    // here. Lines read cleaner; the fills are a button away.
    area: false,
    includeZero: true,
    targetSteps: 4,
  },
});

mount('#spend', {
  type: 'pie',
  data: creditSpend,
  options: { theme, title: 'Credit spend', donut: 0.5, showPercent: true },
});

mount('#volume', {
  type: 'bar',
  data: tradeVolume,
  options: { theme, title: 'Trades cleared', showValues: true },
});

mount('#change', {
  type: 'bar',
  data: weeklyChange,
  options: { theme, title: 'Value change (credits)', showValues: true },
});

mount('#population', {
  type: 'line',
  data: hotelPopulation,
  options: { theme, title: 'Habbos online', stepped: true, area: true, includeZero: true },
});

paintWordmark();

/* --------------------------------------------------------------- controls */

let area = false;
let points = true;

document.querySelector('#reshuffle')?.addEventListener('click', () => {
  rares.setData(reshuffleRares());
});

document.querySelector('#toggle-area')?.addEventListener('click', (e) => {
  area = !area;
  rares.setOptions({ area });
  (e.currentTarget as HTMLButtonElement).textContent = area ? 'Hide fills' : 'Show fills';
});

document.querySelector('#toggle-points')?.addEventListener('click', () => {
  points = !points;
  rares.setOptions({ showPoints: points });
});

/* ------------------------------------------------------- theme reactivity */

function applyTheme(): void {
  const next = currentTheme();
  for (const chart of charts) chart.setOptions({ theme: next });
  paintWordmark();
}

media.addEventListener('change', applyTheme);

// The artifact host can stamp data-theme after load, so watch for it.
new MutationObserver(applyTheme).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['data-theme'],
});

let resizeFrame = 0;
window.addEventListener('resize', () => {
  if (resizeFrame) return;
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = 0;
    paintWordmark();
  });
});
