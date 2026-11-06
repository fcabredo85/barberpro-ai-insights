/**
 * Clean axis ticks: 0 up to a "nice" maximum in 1 / 2 / 2.5 / 5 × 10^k steps,
 * e.g. max 3,710 -> [0, 1000, 2000, 3000, 4000]. Display-only (chart scale).
 */
export function niceTicks(maxValue: number, targetIntervals = 4): number[] {
  if (!Number.isFinite(maxValue) || maxValue <= 0) return [0, 250, 500, 750, 1000];
  const rawStep = maxValue / targetIntervals;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rawStep) ?? 10 * magnitude;
  const top = Math.ceil(maxValue / step) * step;
  const count = Math.round(top / step);
  return Array.from({ length: count + 1 }, (_, i) => Number((i * step).toFixed(6)));
}
