import { describe, expect, it } from "vitest";
import { analyzeSpo2Trend } from "./anomalyDetection";

// Build an evenly-spaced series (30s apart) from a list of SpO2 values.
function series(values, stepMs = 30000, start = 1_700_000_000_000) {
  return values.map((spo2, i) => ({ spo2, timestamp: start + i * stepMs }));
}

describe("analyzeSpo2Trend", () => {
  it("needs a minimum number of samples", () => {
    expect(analyzeSpo2Trend(series([98, 97])).declining).toBe(false);
    expect(analyzeSpo2Trend([]).declining).toBe(false);
    expect(analyzeSpo2Trend(undefined).declining).toBe(false);
  });

  it("does not flag a stable reading", () => {
    const result = analyzeSpo2Trend(series([98, 98, 97, 98, 98, 97]));
    expect(result.declining).toBe(false);
  });

  it("flags a sustained decline beyond the drop threshold", () => {
    const result = analyzeSpo2Trend(series([99, 98, 97, 96, 95, 94]));
    expect(result.declining).toBe(true);
    expect(result.netDrop).toBeCloseTo(5, 1);
    expect(result.slopePerMin).toBeLessThan(0);
  });

  it("ignores a single noisy dip that recovers", () => {
    const result = analyzeSpo2Trend(series([98, 98, 90, 98, 98, 98]));
    expect(result.declining).toBe(false);
  });

  it("ignores zero/invalid readings when measuring", () => {
    const result = analyzeSpo2Trend(series([0, 0, 99, 98, 97, 96, 95, 94]));
    expect(result.declining).toBe(true);
  });

  it("orders out-of-order samples before calculating the slope", () => {
    const shuffled = series([99, 98, 97, 96, 95, 94]).reverse();
    expect(analyzeSpo2Trend(shuffled).declining).toBe(true);
  });
});
