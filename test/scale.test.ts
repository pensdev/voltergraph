import { describe, it, expect } from 'vitest';
import { fitAxis, niceStep, decimalsForStep } from '../src/scale/ticks.js';
import { scaleFromFit } from '../src/scale/linear.js';
import { bandScale, subdivide } from '../src/scale/band.js';

describe('niceStep', () => {
  it('snaps to the 1/2/5 sequence', () => {
    expect(niceStep(0.7)).toBe(1);
    expect(niceStep(1.3)).toBe(2);
    expect(niceStep(3)).toBe(5);
    expect(niceStep(7)).toBe(10);
    expect(niceStep(23)).toBe(50);
    expect(niceStep(0.03)).toBe(0.05);
  });

  it('lands exactly on the decade boundaries', () => {
    // These are where a Math.log10 that is off by an ulp flips the answer, so
    // they are the cases the transcendental-free implementation exists for.
    for (const exp of [-6, -3, -1, 0, 1, 3, 6, 9]) {
      let p = 1;
      for (let i = 0; i < Math.abs(exp); i++) p = exp < 0 ? p / 10 : p * 10;
      expect(niceStep(p), `niceStep(1e${exp})`).toBe(p);
    }
  });

  it('is monotonic — a larger rough step never yields a smaller nice step', () => {
    let previous = 0;
    for (let v = 0.001; v < 10000; v *= 1.07) {
      const step = niceStep(v);
      expect(step).toBeGreaterThanOrEqual(previous);
      previous = step;
    }
  });

  it('survives degenerate input', () => {
    expect(niceStep(0)).toBe(1);
    expect(niceStep(-5)).toBe(1);
    expect(niceStep(NaN)).toBe(1);
    expect(niceStep(Infinity)).toBe(1);
  });
});

describe('decimalsForStep', () => {
  it('counts the places a step actually needs', () => {
    expect(decimalsForStep(100)).toBe(0);
    expect(decimalsForStep(1)).toBe(0);
    expect(decimalsForStep(0.5)).toBe(1);
    expect(decimalsForStep(0.05)).toBe(2);
    expect(decimalsForStep(0.002)).toBe(3);
  });

  it('never returns a negative or unbounded count', () => {
    expect(decimalsForStep(0)).toBe(0);
    expect(decimalsForStep(NaN)).toBe(0);
    expect(decimalsForStep(1e-30)).toBeLessThanOrEqual(12);
  });
});

describe('fitAxis', () => {
  it('makes gridline spacing an exact integer', () => {
    const fit = fitAxis(0, 310, 137, { targetSteps: 4 });
    expect(fit.length).toBe(fit.pxPerStep * fit.stepCount);
    expect(Number.isInteger(fit.pxPerStep)).toBe(true);
    expect(fit.length).toBeLessThanOrEqual(137);
    expect(fit.slack).toBe(137 - fit.length);
  });

  it('places every tick on a distinct, evenly spaced pixel', () => {
    const fit = fitAxis(0, 987, 200, { targetSteps: 5 });
    const y = scaleFromFit(fit, { origin: 0, flip: true });
    const pixels = fit.ticks.map((t) => y.px(t));
    const gaps = pixels.slice(1).map((p, i) => pixels[i] - p);
    expect(new Set(gaps).size).toBe(1);
    expect(gaps[0]).toBe(fit.pxPerStep);
  });

  it('never produces float-noise tick labels', () => {
    const fit = fitAxis(0, 1, 120, { targetSteps: 5 });
    for (const t of fit.ticks) {
      expect(String(t).length).toBeLessThan(6);
    }
  });

  it('coarsens rather than crowding gridlines', () => {
    const fit = fitAxis(0, 1000, 30, { targetSteps: 8, minPxPerStep: 10 });
    expect(fit.pxPerStep).toBeGreaterThanOrEqual(10);
  });

  it('gives a flat series a real extent', () => {
    expect(fitAxis(5, 5, 100).max).toBeGreaterThan(5);
    expect(fitAxis(0, 0, 100).max).toBeGreaterThan(0);
  });

  it('includes zero for bars but can be told not to', () => {
    expect(fitAxis(50, 90, 100, { includeZero: true }).min).toBe(0);
    expect(fitAxis(50, 90, 100, { includeZero: false }).min).toBeGreaterThan(0);
  });

  it('handles negative domains', () => {
    const fit = fitAxis(-40, 90, 130);
    expect(fit.min).toBeLessThanOrEqual(-40);
    expect(fit.max).toBeGreaterThanOrEqual(90);
    expect(fit.ticks).toContain(0);
  });
});

describe('bandScale', () => {
  it('tiles the range with no gaps or overlaps between slots', () => {
    const { bands } = bandScale(7, 137, { paddingInner: 0, paddingOuter: 0, origin: 0 });
    expect(bands[0].start).toBe(0);
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i].start).toBe(bands[i - 1].start + bands[i - 1].size);
    }
    const last = bands[bands.length - 1];
    expect(last.start + last.size).toBe(137);
  });

  it('keeps band sizes within one pixel of each other', () => {
    const { bands } = bandScale(9, 100, { paddingInner: 0.25, origin: 10 });
    const sizes = bands.map((b) => b.size);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  });

  it('is stable: same inputs, same pixels', () => {
    const a = bandScale(5, 91, { origin: 3 }).bands;
    const b = bandScale(5, 91, { origin: 3 }).bands;
    expect(a).toEqual(b);
  });

  it('never emits a zero-width band', () => {
    for (const n of [1, 3, 12, 40]) {
      for (const px of [10, 41, 200]) {
        for (const band of bandScale(n, px).bands) {
          expect(band.size).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it('hit-tests back to the originating index', () => {
    const scale = bandScale(6, 120, { origin: 5 });
    for (const band of scale.bands) {
      expect(scale.at(band.start)).toBe(band.index);
      expect(scale.at(band.start + band.size - 1)).toBe(band.index);
    }
  });
});

describe('subdivide', () => {
  it('keeps grouped bars inside their band', () => {
    const [band] = bandScale(1, 60, { paddingInner: 0.2, paddingOuter: 0 }).bands;
    for (const n of [1, 2, 3, 4]) {
      const parts = subdivide(band, n, 1);
      expect(parts.length).toBe(n);
      expect(parts[0].start).toBeGreaterThanOrEqual(band.start);
      const last = parts[n - 1];
      expect(last.start + last.size).toBeLessThanOrEqual(band.start + band.size);
    }
  });

  it('does not overlap sub-bands', () => {
    const [band] = bandScale(1, 41, { paddingInner: 0.2, paddingOuter: 0 }).bands;
    const parts = subdivide(band, 3, 1);
    for (let i = 1; i < parts.length; i++) {
      expect(parts[i].start).toBeGreaterThanOrEqual(parts[i - 1].start + parts[i - 1].size);
    }
  });
});
