import type { AxisFit } from './ticks.js';

export interface LinearScale {
  /** Value -> integer pixel offset from the axis origin. */
  px(value: number): number;
  /** Value -> unrounded pixel offset, for interim math. */
  raw(value: number): number;
  /** Integer pixel offset -> value. */
  invert(pixel: number): number;
  readonly min: number;
  readonly max: number;
  readonly length: number;
}

export interface LinearScaleOptions {
  /** Pixel coordinate the domain minimum maps to. */
  origin?: number;
  /** Screen y grows downward; set true so higher values sit higher up. */
  flip?: boolean;
}

export function linearScale(
  min: number,
  max: number,
  length: number,
  options: LinearScaleOptions = {}
): LinearScale {
  const origin = options.origin ?? 0;
  const flip = options.flip ?? false;
  const span = max - min || 1;

  const raw = (v: number) => {
    const t = (v - min) / span;
    return flip ? origin + length - t * length : origin + t * length;
  };

  return {
    raw,
    px: (v) => Math.round(raw(v)),
    invert: (p) => {
      const t = flip ? (origin + length - p) / length : (p - origin) / length;
      return min + t * span;
    },
    min,
    max,
    length,
  };
}

/** Builds a scale directly from a fitted axis, using its snapped length. */
export function scaleFromFit(fit: AxisFit, options: LinearScaleOptions = {}): LinearScale {
  return linearScale(fit.min, fit.max, fit.length, options);
}
