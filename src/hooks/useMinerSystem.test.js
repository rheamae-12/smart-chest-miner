import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_THRESHOLDS } from "../utils/alertChecker";
import { buildVitalLogs, mapRealtimeDevices, mergeAnalyticsData } from "./useMinerSystem";

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
