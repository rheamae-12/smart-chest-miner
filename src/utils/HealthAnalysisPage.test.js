import { describe, expect, it } from "vitest";
import { buildHealthFindings, buildSessionChartData } from "../pages/HealthAnalysisPage";
import { DEFAULT_THRESHOLDS } from "./alertChecker";

describe("buildSessionChartData", () => {
  it("keeps all readings hoverable while limiting the x-axis labels to six", () => {
    const start = 1_700_000_000_000;
    const sessionId = "SCM-001-session-1700000000000";
    const rows = Array.from({ length: 8 }, (_, index) => ({
      timestamp: start + index * 60_000,
      sessionId,
      hr: index === 2 ? 150 : 82 + index,
      spo2: index === 4 ? 75 : 98,
      temp: 36.4,
    }));

    const chart = buildSessionChartData(
      { id: "SCM-001", name: "Miner 1" },
      { sessionId, startTimestamp: start, endTimestamp: start + 7 * 60_000 },
      rows,
      {},
      [{ deviceId: "SCM-001", type: "manual_alert", severity: "critical", timestamp: start + 5 * 60_000 }],
      DEFAULT_THRESHOLDS,
    );

    expect(chart.rows).toHaveLength(8);
    expect(chart.xAxisTicks).toHaveLength(6);
    expect(chart.rows[2].indicators).toEqual(expect.arrayContaining([
      expect.objectContaining({ metric: "hr", severity: "critical" }),
    ]));
    expect(chart.rows[4].indicators).toEqual(expect.arrayContaining([
      expect.objectContaining({ metric: "spo2", severity: "warning" }),
    ]));
    expect(chart.rows[5].indicators).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Manual SOS activation", severity: "critical" }),
    ]));
  });

  it("does not collapse separate readings that have the same timestamp", () => {
    const timestamp = 1_700_000_000_000;
    const rows = Array.from({ length: 33 }, (_, index) => ({
      timestamp,
      hr: 82 + index,
      spo2: 98,
      temp: 36.4,
    }));
    const chart = buildSessionChartData(
      { id: "SCM-001", name: "Miner 1" },
      { startTimestamp: timestamp, endTimestamp: timestamp, readingCount: 33 },
      rows,
      {},
      [],
      DEFAULT_THRESHOLDS,
    );

    expect(chart.rows).toHaveLength(33);
    expect(chart.recordedReadingCount).toBe(33);
  });
});

describe("buildHealthFindings session totals", () => {
  it("counts flagged readings across the complete selected session", () => {
    const start = 1_700_000_000_000;
    const rows = Array.from({ length: 33 }, (_, index) => ({
      timestamp: start + index * 60_000,
      hr: 82,
      spo2: 98,
      temp: index >= 15 ? 39 : 35,
    }));
    const analysis = buildHealthFindings({ id: "SCM-001", name: "Miner 1" }, rows, {}, [], DEFAULT_THRESHOLDS);

    expect(analysis.sampleCount).toBe(33);
    expect(analysis.flaggedCount).toBe(18);
  });
});
