/**
 * Axis fitting for pixel grids.
 *
 * A conventional chart library picks nice tick values, maps them through a
 * continuous scale, and rounds at draw time. At 1px gridlines that produces
 * visibly uneven gaps (13, 26, 40, 53...) which reads as a bug, not a style.
 *
 * So the order is inverted here: choose the tick step, then choose an integer
 * pixels-per-step, then *shrink the axis* to `pxPerStep * stepCount`. The few
 * leftover pixels are given back to the caller as padding. Gridlines are then
 * exactly evenly spaced by construction.
 */

export interface AxisFit {
  min: number;
  max: number;
  step: number;
  /** Number of intervals; there are `stepCount + 1` ticks. */
  stepCount: number;
  /** Integer pixels between adjacent ticks. */
  pxPerStep: number;
  /** Actual axis length used, always `pxPerStep * stepCount`. */
  length: number;
  /** Pixels left over from the requested length. */
  slack: number;
  ticks: number[];
}

export interface AxisFitOptions {
  /** Preferred number of intervals. */
  targetSteps?: number;
  /** Never place gridlines closer together than this. */
  minPxPerStep?: number;
  /** Force the domain to include zero — almost always right for bars. */
  includeZero?: boolean;
}

/**
 * Largest power of ten not exceeding `v`, found by exact multiplication and
 * division rather than `Math.log10`.
 *
 * ECMAScript leaves `Math.log10` and `Math.pow` implementation-approximated,
 * so they may return results differing by an ulp between platforms. Feeding
 * that into `Math.floor` turns an invisible rounding difference into a
 * different decade, a different tick step, and a visibly different chart. The
 * basic operators are exactly specified by IEEE 754, so this loop gives the
 * same answer everywhere.
 */
function decade(v: number): number {
  let pow = 1;
  while (pow * 10 <= v) pow *= 10;
  while (pow > v) pow /= 10;
  return pow;
}

/** Nearest 1/2/5 x 10^n at or above `rough`. */
export function niceStep(rough: number): number {
  if (!(rough > 0) || !Number.isFinite(rough)) return 1;
  const pow = decade(rough);
  const frac = rough / pow;
  const nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  return nice * pow;
}

/** Next step up in the 1/2/5 sequence. */
function nextStep(step: number): number {
  const pow = decade(step);
  const frac = Math.round(step / pow);
  if (frac < 2) return 2 * pow;
  if (frac < 5) return 5 * pow;
  return 10 * pow;
}

/** Kills float noise like 0.30000000000000004 in tick labels. */
function snap(value: number, step: number): number {
  let f = 1;
  for (let i = 0, d = decimalsForStep(step); i < d; i++) f *= 10;
  return Math.round(value * f) / f;
}

export function fitAxis(
  dataMin: number,
  dataMax: number,
  pixels: number,
  options: AxisFitOptions = {}
): AxisFit {
  const targetSteps = Math.max(1, options.targetSteps ?? 4);
  const minPxPerStep = Math.max(2, options.minPxPerStep ?? 8);
  const includeZero = options.includeZero ?? true;

  let lo = Math.min(dataMin, dataMax);
  let hi = Math.max(dataMin, dataMax);
  if (includeZero) {
    lo = Math.min(0, lo);
    hi = Math.max(0, hi);
  }
  if (lo === hi) {
    // A flat series still needs an axis with extent.
    if (lo === 0) {
      hi = 1;
    } else {
      const pad = Math.abs(lo) * 0.5;
      lo -= pad;
      hi += pad;
    }
  }

  let step = niceStep((hi - lo) / targetSteps);
  let min = Math.floor(lo / step) * step;
  let max = Math.ceil(hi / step) * step;
  let stepCount = Math.max(1, Math.round((max - min) / step));

  // Coarsen until the gridlines are far enough apart to be legible.
  let guard = 0;
  while (Math.floor(pixels / stepCount) < minPxPerStep && guard++ < 32) {
    step = nextStep(step);
    min = Math.floor(lo / step) * step;
    max = Math.ceil(hi / step) * step;
    stepCount = Math.max(1, Math.round((max - min) / step));
    if (stepCount === 1) break;
  }

  const pxPerStep = Math.max(1, Math.floor(pixels / stepCount));
  const length = pxPerStep * stepCount;

  const ticks: number[] = [];
  for (let i = 0; i <= stepCount; i++) ticks.push(snap(min + i * step, step));

  return {
    min: snap(min, step),
    max: snap(max, step),
    step,
    stepCount,
    pxPerStep,
    length,
    slack: pixels - length,
    ticks,
  };
}

/** Decimal places implied by a step, for consistent tick label formatting. */
export function decimalsForStep(step: number): number {
  if (!(step > 0) || !Number.isFinite(step)) return 0;
  let pow = decade(step);
  let decimals = 0;
  while (pow < 1 && decimals < 12) {
    pow *= 10;
    decimals++;
  }
  return decimals;
}
