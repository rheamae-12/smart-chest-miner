import { describe, expect, it } from "vitest";
import { zeroBasedTenScale } from "./chartScales";

describe("zeroBasedTenScale", () => {
  it("starts at zero and creates ten-unit ticks with the requested headroom", () => {
    expect(zeroBasedTenScale([32.6, 88, 100], 140)).toEqual({
      domain: [0, 140],
      ticks: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140],
    });
  });

  it("expands to the next ten-unit boundary when data exceeds the default", () => {
    expect(zeroBasedTenScale([143])).toEqual({
      domain: [0, 150],
      ticks: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150],
    });
  });
});
