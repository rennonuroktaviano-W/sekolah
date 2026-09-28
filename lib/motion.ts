export const clamp = (value: number, min = 0, max = 1): number =>
  value < min ? min : value > max ? max : value;

/** Normalized progress of `value` inside the [start, end] window, clamped. */
export const stage = (value: number, start: number, end: number): number =>
  clamp((value - start) / (end - start));

export const lerp = (from: number, to: number, amount: number): number =>
  from + (to - from) * amount;

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutExpo = (t: number): number =>
  t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
