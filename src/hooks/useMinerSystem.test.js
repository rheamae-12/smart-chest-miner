import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_THRESHOLDS } from "../utils/alertChecker";
import { buildVitalLogs, mapRealtimeDevices } from "./useMinerSystem";

describe("mapRealtimeDevices", () => {
  afterEach(() => vi.restoreAllMocks());

  it("recovers a device when fresh readings arrive after an offline status sync", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_030_000);
    const [miner] = mapRealtimeDevices({
      "MCM-001": {
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
      "MCM-001": {
        active: true,
        status: "online",
        live: { timestamp: 1_700_000_000_000, heartRate: 82, spo2: 97 },
      },
    }, 75_000);

    expect(miner.active).toBe(false);
    expect(miner.stale).toBe(true);
  });
});

describe("buildVitalLogs", () => {
  it("records a manual SOS even when chest contact is missing", () => {
    const logs = buildVitalLogs({
      id: "MCM-001",
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
