import { describe, expect, it } from "vitest";
import { conditionForAlertId, conditionForLog, dedupeNotificationEvents } from "./notifications";

describe("condition mapping", () => {
  it("maps alert ids (critical and low SpO2 share the spo2 condition)", () => {
    expect(conditionForAlertId("MCM-1-spo2")).toBe("spo2");
    expect(conditionForAlertId("MCM-1-spo2-low")).toBe("spo2");
    expect(conditionForAlertId("MCM-1-temp-high")).toBe("temp");
    expect(conditionForAlertId("MCM-1-offline")).toBe("offline");
    expect(conditionForAlertId("MCM-1-battery")).toBe("battery");
  });

  it("maps activity-log rows to the same vocabulary", () => {
    expect(conditionForLog({ type: "vital", title: "SpO2 critical" })).toBe("spo2");
    expect(conditionForLog({ type: "status", status: "offline" })).toBe("offline");
    expect(conditionForLog({ type: "status", status: "online" })).toBe("");
    expect(conditionForLog({ type: "crud" })).toBe("");
  });
});

describe("dedupeNotificationEvents", () => {
  it("collapses the same device+condition to the first (highest-priority) entry", () => {
    const events = [
      { id: "MCM-1-spo2", source: "alert", deviceId: "MCM-1", condition: "spo2" },
      { id: "log-1", source: "log", deviceId: "MCM-1", condition: "spo2" },
    ];
    const result = dedupeNotificationEvents(events);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("alert");
  });

  it("keeps distinct conditions and devices", () => {
    const events = [
      { id: "a", deviceId: "MCM-1", condition: "spo2" },
      { id: "b", deviceId: "MCM-1", condition: "temp" },
      { id: "c", deviceId: "MCM-2", condition: "spo2" },
    ];
    expect(dedupeNotificationEvents(events)).toHaveLength(3);
  });

  it("always keeps events with no condition (history, recoveries, CRUD)", () => {
    const events = [
      { id: "x", deviceId: "MCM-1", condition: "" },
      { id: "y", deviceId: "MCM-1", condition: "" },
    ];
    expect(dedupeNotificationEvents(events)).toHaveLength(2);
  });
});
