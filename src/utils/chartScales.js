const TICK_STEP = 10;

// Keep sensor charts anchored at zero while preserving enough headroom for
// the largest value in the selected data set.
export function zeroBasedTenScale(values = [], minimumMaximum = TICK_STEP) {
  const numericValues = values
    .map(Number)
    .filter((value) => Number.isFinite(value) && value >= 0);
  const maximum = Math.max(Number(minimumMaximum) || TICK_STEP, ...numericValues, TICK_STEP);
  const upperBound = Math.ceil(maximum / TICK_STEP) * TICK_STEP;

  return {
    domain: [0, upperBound],
    ticks: Array.from({ length: upperBound / TICK_STEP + 1 }, (_, index) => index * TICK_STEP),
  };
}
