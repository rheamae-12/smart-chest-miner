import { describe, expect, it } from "vitest";
import { DEFAULT_THRESHOLDS, buildAlerts, getVitalStatus } from "./alertChecker";

describe("getVitalStatus", () => {
  it("returns null for missing/zero readings", () => {
    expect(getVitalStatus(0, "hr")).toBe(null);
    expect(getVitalStatus(undefined, "spo2")).toBe(null);
  });

  it("classifies heart rate against thresholds", () => {
    expect(getVitalStatus(40, "hr")).toBe("LOW");
    expect(getVitalStatus(80, "hr")).toBe("NORMAL");
    expect(getVitalStatus(130, "hr")).toBe("HIGH");
  });

  it("treats SpO2 below the floor as CRITICAL and the buffer band as LOW", () => {
    expect(getVitalStatus(90, "spo2")).toBe("CRITICAL");
    expect(getVitalStatus(95, "spo2")).toBe("LOW"); // within spo2Min+2
    expect(getVitalStatus(99, "spo2")).toBe("NORMAL");
  });

  it("classifies body temperature", () => {
    expect(getVitalStatus(35, "temp")).toBe("LOW");
    expect(getVitalStatus(37, "temp")).toBe("NORMAL");
    expect(getVitalStatus(39, "temp")).toBe("HIGH");
  });

  it("flags low battery", () => {
    expect(getVitalStatus(15, "battery")).toBe("LOW");
    expect(getVitalStatus(80, "battery")).toBe("NORMAL");
  });
});

describe("buildAlerts", () => {
  const base = { id: "MCM-1", name: "Miner 1", active: true, finger: true, hr: 80, spo2: 99, temp: 37, battery: 90, manual_alert: false, stale: false };

  it("returns no alerts for a healthy active miner", () => {
    expect(buildAlerts([base], DEFAULT_THRESHOLDS)).toHaveLength(0);
  });

  it("does not alarm for a normal offline (session ended)", () => {
    expect(buildAlerts([{ ...base, stale: true }], DEFAULT_THRESHOLDS)).toHaveLength(0);
  });

  it("raises a critical 'lost during alert' when a device drops while concerning", () => {
    const alerts = buildAlerts([{ ...base, stale: true, offlineConcern: true }], DEFAULT_THRESHOLDS);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].id).toBe("MCM-1-offline");
    expect(alerts[0].severity).toBe("critical");
  });

  it("does not alert for an inactive miner that never went stale", () => {
    expect(buildAlerts([{ ...base, active: false, stale: false }], DEFAULT_THRESHOLDS)).toHaveLength(0);
  });

  it("raises a critical alert for dangerously low SpO2", () => {
    const alerts = buildAlerts([{ ...base, spo2: 88 }], DEFAULT_THRESHOLDS);
    expect(alerts.some((a) => a.id === "MCM-1-spo2" && a.severity === "critical")).toBe(true);
  });

  it("raises manual-alert and stops vital checks when chest contact is lost", () => {
    const alerts = buildAlerts([{ ...base, manual_alert: true, finger: false, hr: 200 }], DEFAULT_THRESHOLDS);
    expect(alerts.some((a) => a.id === "MCM-1-manual")).toBe(true);
    expect(alerts.some((a) => a.id === "MCM-1-contact")).toBe(true);
    // HR alert is skipped because contact (and therefore the reading) is unreliable
    expect(alerts.some((a) => a.id === "MCM-1-hr")).toBe(false);
  });

  it("flags low battery as a warning", () => {
    const alerts = buildAlerts([{ ...base, battery: 10 }], DEFAULT_THRESHOLDS);
    expect(alerts.some((a) => a.id === "MCM-1-battery" && a.severity === "warning")).toBe(true);
  });
});
