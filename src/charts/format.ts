import { decimalsForStep } from '../scale/ticks.js';

/**
 * Compact default formatter. Pixel charts have very little horizontal room for
 * tick labels, so long numbers get an SI suffix rather than being truncated.
 */
export function defaultFormat(step = 1): (value: number) => string {
  const decimals = decimalsForStep(step);
  return (value: number) => {
    const abs = Math.abs(value);
    if (abs >= 1_000_000_000) return trim(value / 1_000_000_000) + 'b';
    if (abs >= 1_000_000) return trim(value / 1_000_000) + 'm';
    if (abs >= 10_000) return trim(value / 1000) + 'k';
    return decimals > 0 ? value.toFixed(decimals) : String(Math.round(value));
  };
}

function trim(v: number): string {
  const s = v.toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}
