import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_THRESHOLDS } from "../utils/alertChecker";
import { canonicalSessionId, createSessionId } from "../utils/sessionIds";
import { buildHistorySummariesForDevice, buildVitalLogs, mapRealtimeDevices, mergeAnalyticsData } from "./useMinerSystem";

describe("mapRealtimeDevices", () => {
  afterEach(() => vi.restoreAllMocks());

  it("recovers a device when fresh readings arrive after an offline status sync", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_030_000);
    const [miner] = mapRealtimeDevices({
      "SCM-001": {
        name: "Miner 1",
        active: false,
        status: "offline",
        live: {
          timestamp: 1_700_000_000_000,
          heartRate: 82,
          spo2: 97,
          finger: true,
        },
      },
    }, 75_000);

    expect(miner.active).toBe(true);
    expect(miner.status).toBe("online");
    expect(miner.stale).toBe(false);
  });

  it("keeps stale readings offline", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_100_000);
    const [miner] = mapRealtimeDevices({
      "SCM-001": {
        active: true,
        status: "online",
        live: { timestamp: 1_700_000_000_000, heartRate: 82, spo2: 97 },
      },
    }, 75_000);

    expect(miner.active).toBe(false);
    expect(miner.stale).toBe(true);
  });

  it("excludes archived and deleted devices from the live registry", () => {
    const miners = mapRealtimeDevices({
      active: { active: true, live: { timestamp: Date.now(), heartRate: 80, spo2: 97 } },
      archived: { archived: true, active: true, live: { timestamp: Date.now(), heartRate: 80, spo2: 97 } },
      deleted: { deleted: true, active: true, live: { timestamp: Date.now(), heartRate: 80, spo2: 97 } },
    });

    expect(miners.map((miner) => miner.id)).toEqual(["active"]);
  });
});

describe("buildVitalLogs", () => {
  it("records a manual SOS even when chest contact is missing", () => {
    const logs = buildVitalLogs({
      id: "SCM-001",
      name: "Miner 1",
      active: true,
      finger: false,
      manual_alert: true,
      button_pressed: true,
      button_press_count: 3,
      lastSeen: new Date(1_700_000_000_000),
    }, DEFAULT_THRESHOLDS);

    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      type: "manual_alert",
      severity: "critical",
      status: "pressed",
    });
  });

  it("persists the triggering vital reading and unit on alert records", () => {
    const logs = buildVitalLogs({
      id: "SCM-001",
      name: "Miner 1",
      active: true,
      finger: true,
      hr: 150,
      spo2: 75,
      temp: 39,
      lastSeen: new Date(1_700_000_000_000),
    }, DEFAULT_THRESHOLDS);

    expect(logs).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "vital", title: "Heart rate critical", reading: 150, unit: "bpm" }),
      expect.objectContaining({ type: "vital", title: "SpO2 low", reading: 75, unit: "%" }),
      expect.objectContaining({ type: "vital", title: "Temperature critical", reading: 39, unit: "°C" }),
    ]));
  });
});

describe("mergeAnalyticsData", () => {
  it("preserves valid sensor values when a same-timestamp realtime row is partial", () => {
    const timestamp = 1_700_000_000_000;
    const merged = mergeAnalyticsData(
      { "SCM-001": [{ timestamp, hr: 82, spo2: 97, temp: 36.5, sessionId: "session-1" }] },
      { "SCM-001": [{ timestamp, hr: 0, spo2: 0, temp: 0, sessionId: "" }] },
    );

    expect(merged["SCM-001"][0]).toMatchObject({
      hr: 82,
      spo2: 97,
      temp: 36.5,
      sessionId: "session-1",
    });
  });
});

describe("session IDs", () => {
  it("uses the same lifecycle ID for every monitor of the same device timeline", () => {
    const timestamp = 1_700_000_000_000;
    expect(createSessionId("SCM-001", timestamp)).toBe("SCM-001-session-1700000000000");
    expect(createSessionId("SCM-001", timestamp)).toBe(createSessionId("SCM-001", timestamp));
    expect(canonicalSessionId("SCM-001", "SCM-001-session-1700000000000-12345")).toBe("SCM-001-session-1700000000000");
  });

  it("keeps the final reading in the same session as its terminal status event", () => {
    const start = 1_700_900_000_000;
    const summaries = buildHistorySummariesForDevice(
      "SCM-001",
      [
        { timestamp: start, hr: 101, spo2: 98, temp: 32 },
        { timestamp: start + 60_000, hr: 116, spo2: 100, temp: 32.1 },
      ],
      { name: "Miner 1", location: "Shaft A" },
      DEFAULT_THRESHOLDS,
      [{ deviceId: "SCM-001", type: "session_status", status: "completed", timestamp: start + 60_000 }],
    );

    expect(Object.keys(summaries.miningSessions)).toHaveLength(1);
    expect(Object.values(summaries.miningSessions)[0].startTimestamp).toBe(start);
  });
});
