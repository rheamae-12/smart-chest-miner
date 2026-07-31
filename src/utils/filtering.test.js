import { describe, expect, it } from "vitest";
import { isWithinDateRange, matchesAlertType, matchesSearch, resolveDateRange } from "./filtering";

describe("filtering utilities", () => {
  it("uses inclusive local-day boundaries for custom date filters", () => {
    const range = resolveDateRange("custom", { from: "2026-07-30", to: "2026-07-31" });
    expect(isWithinDateRange(new Date(2026, 6, 30, 0, 0).getTime(), range)).toBe(true);
    expect(isWithinDateRange(new Date(2026, 6, 31, 23, 59, 59).getTime(), range)).toBe(true);
    expect(isWithinDateRange(new Date(2026, 7, 1, 0, 0).getTime(), range)).toBe(false);
  });

  it("matches alert types from normalized fields and descriptive text", () => {
    expect(matchesAlertType({ type: "status", status: "offline", severity: "critical" }, "offline")).toBe(true);
    expect(matchesAlertType({ type: "vital", status: "critical", title: "SpO2 critical" }, "low-spo2")).toBe(true);
    expect(matchesAlertType({ type: "vital", status: "high", title: "Heart rate high" }, "high-hr")).toBe(true);
  });

  it("searches across every supplied display field", () => {
    expect(matchesSearch("mcm-003", "Acuzar Great Miner", "MCM-003", "Masara Shaft-3")).toBe(true);
    expect(matchesSearch("shaft-2", "Acuzar Great Miner", "MCM-003", "Masara Shaft-3")).toBe(false);
  });
});
