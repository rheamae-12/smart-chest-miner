import { describe, expect, it } from "vitest";
import { formatAlertReading, isAlertEntry } from "../pages/AlertHistoryPage";

describe("alert history records", () => {
  it("keeps offline status records available to the Offline filter", () => {
    expect(isAlertEntry({ type: "status", status: "offline", severity: "info" })).toBe(true);
    expect(isAlertEntry({ type: "status", status: "online", severity: "info" })).toBe(false);
  });

  it("shows readings from new, aliased, and legacy alert records", () => {
    expect(formatAlertReading({ reading: 120.5, unit: "bpm" })).toBe("121 bpm");
    expect(formatAlertReading({ readingValue: "38.2 °C", title: "Temperature high" })).toBe("38.2 °C");
    expect(formatAlertReading({ title: "Heart rate high", detail: "Miner recorded HR 146 bpm." })).toBe("146 bpm");
    expect(formatAlertReading({ title: "SpO2 low", detail: "Miner recorded SpO2 75%." })).toBe("75 %");
    expect(formatAlertReading({ type: "manual_alert", severity: "critical", detail: "Manual SOS pressed." })).toBe("—");
  });
});
