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

/**
 * SI suffixes from 1000 up: `3600` becomes `3.6k`, `900` stays `900`.
 *
 * `defaultFormat` only abbreviates from 10000, because on a wide axis `3600`
 * is clearer than `3.6k`. In a narrow slot the opposite is true, so this is a
 * separate formatter rather than a different threshold for everyone.
 */
export function compactFormat(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return trim(value / 1_000_000_000) + 'b';
  if (abs >= 1_000_000) return trim(value / 1_000_000) + 'm';
  if (abs >= 1000) return trim(value / 1000) + 'k';
  return String(Math.round(value));
}

function trim(v: number): string {
  const s = v.toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}
