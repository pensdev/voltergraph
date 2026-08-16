export interface Band {
  index: number;
  /** Left/top edge of the drawable bar, in pixels. */
  start: number;
  /** Width/height of the drawable bar, in pixels. Always >= 1. */
  size: number;
  /** Center of the *slot*, used for tick and label placement. */
  center: number;
}

export interface BandScaleOptions {
  /** Fraction of each slot given to the gap between bars, 0..1. */
  paddingInner?: number;
  /** Fraction of a slot inset at each end of the axis, 0..1. */
  paddingOuter?: number;
  /** Pixel coordinate of the axis start. */
  origin?: number;
}

export interface BandScale {
  bands: Band[];
  /** Pixel index -> band index, or -1. */
  at(pixel: number): number;
}

/**
 * Categorical scale over an integer pixel range.
 *
 * Slot edges come from a single rounded cumulative division rather than from
 * rounding each band independently, which guarantees no gaps, no overlaps, and
 * a deterministic distribution of the leftover pixels. Rounding each band on
 * its own makes bars jitter by a pixel as the data changes, which looks like a
 * rendering bug even though the numbers are right.
 */
export function bandScale(
  count: number,
  length: number,
  options: BandScaleOptions = {}
): BandScale {
  const paddingInner = clamp01(options.paddingInner ?? 0.25);
  const paddingOuter = clamp01(options.paddingOuter ?? 0.1);
  const origin = options.origin ?? 0;

  const bands: Band[] = [];
  if (count <= 0 || length <= 0) {
    return { bands, at: () => -1 };
  }

  const slotGuess = length / (count + 2 * paddingOuter);
  const outer = Math.round(slotGuess * paddingOuter);
  const usable = Math.max(count, length - 2 * outer);
  const base = origin + outer;

  for (let i = 0; i < count; i++) {
    const slotStart = base + Math.round((i * usable) / count);
    const slotEnd = base + Math.round(((i + 1) * usable) / count);
    const slot = slotEnd - slotStart;

    const gap = Math.min(slot - 1, Math.round(slot * paddingInner));
    const left = gap >> 1;
    const size = Math.max(1, slot - gap);

    bands.push({
      index: i,
      start: slotStart + left,
      size,
      center: slotStart + (slot >> 1),
    });
  }

  return {
    bands,
    at(pixel: number) {
      for (const b of bands) {
        if (pixel >= b.start && pixel < b.start + b.size) return b.index;
      }
      return -1;
    },
  };
}

/**
 * Splits one band into `n` side-by-side sub-bands (grouped series), using the
 * same cumulative-rounding rule so groups stay flush with their slot.
 */
export function subdivide(band: Band, n: number, gap = 1): Band[] {
  if (n <= 1) return [band];
  const out: Band[] = [];
  const totalGap = Math.min(band.size - n, gap * (n - 1));
  const usable = Math.max(n, band.size - totalGap);
  const each = totalGap > 0 ? Math.round(totalGap / (n - 1)) : 0;

  for (let i = 0; i < n; i++) {
    const s = Math.round((i * usable) / n);
    const e = Math.round(((i + 1) * usable) / n);
    const start = band.start + s + i * each;
    const size = Math.max(1, e - s);
    out.push({ index: i, start, size, center: start + (size >> 1) });
  }
  return out;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
