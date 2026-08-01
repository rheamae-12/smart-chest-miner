import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_THRESHOLDS } from "./alertChecker";
import { buildSessions } from "../pages/HealthLogsPage";

describe("buildSessions", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps separate session rows and applies the chosen status to the correct session", () => {
    const firstTimestamp = 1_700_000_000_000;
    const secondTimestamp = firstTimestamp + 60_000;
    vi.spyOn(Date, "now").mockReturnValue(secondTimestamp + 1_000);

    const firstSessionId = `SCM-001-${firstTimestamp}`;
    const secondSessionId = `SCM-001-${secondTimestamp}`;
    const sessions = buildSessions(
      [{
        id: "SCM-001",
        name: "Miner 1",
        location: "Shaft A",
        active: true,
        stale: false,
        lastSeen: new Date(secondTimestamp),
        hr: 82,
        spo2: 97,
        temp: 36.5,
        finger: true,
        manual_alert: false,
      }],
      {
        "SCM-001": [
          { timestamp: firstTimestamp, sessionId: firstSessionId, hr: 80, spo2: 97, temp: 36.4, finger: true },
          { timestamp: secondTimestamp, sessionId: secondSessionId, hr: 82, spo2: 97, temp: 36.5, finger: true },
        ],
      },
      [{
        deviceId: "SCM-001",
        type: "session_status",
        sessionId: firstSessionId,
        status: "completed",
        timestamp: firstTimestamp + 30_000,
      }],
      DEFAULT_THRESHOLDS,
    );

    expect(sessions).toHaveLength(2);
    expect(sessions.find((session) => session.sessionStatus === "completed")?.id).toContain(String(firstTimestamp));
    expect(sessions.find((session) => session.sessionStatus === "ongoing")?.id).toContain(String(secondTimestamp));
  });

  it("does not turn legacy per-reading session IDs into duplicate rows", () => {
    const firstTimestamp = 1_700_100_000_000;
    vi.spyOn(Date, "now").mockReturnValue(firstTimestamp + 120_000);
    const sessions = buildSessions(
      [{ id: "SCM-001", name: "Miner 1", active: false, stale: false, lastSeen: new Date(firstTimestamp + 60_000) }],
      {
        "SCM-001": [
          { timestamp: firstTimestamp, sessionId: `SCM-001-${firstTimestamp}`, hr: 80, spo2: 97, temp: 36.4 },
          { timestamp: firstTimestamp + 60_000, sessionId: `SCM-001-${firstTimestamp + 60_000}`, hr: 82, spo2: 97, temp: 36.5 },
        ],
      },
      [],
      DEFAULT_THRESHOLDS,
    );

    expect(sessions).toHaveLength(1);
  });

  it("uses persisted sessions and activity logs as the source of truth for counters", () => {
    const firstTimestamp = 1_700_200_000_000;
    const sessionId = `SCM-001-${firstTimestamp}`;
    const sessions = buildSessions(
      [{ id: "SCM-001", name: "Miner 1", active: false, stale: false, lastSeen: new Date(firstTimestamp + 60_000) }],
      {},
      [
        { deviceId: "SCM-001", type: "manual_alert", buttonPressCount: 1, timestamp: firstTimestamp + 10_000 },
        { deviceId: "SCM-001", type: "manual_alert", buttonPressCount: 2, timestamp: firstTimestamp + 20_000 },
      ],
      DEFAULT_THRESHOLDS,
      {
        "SCM-001": [{
          sessionId,
          startTimestamp: firstTimestamp,
          endTimestamp: firstTimestamp + 60_000,
          avgHr: 80,
          avgSpo2: 97,
          avgTemp: 36.5,
          manualPressCount: 99,
          status: "completed",
        }],
      },
    );

    expect(sessions).toHaveLength(1);
    expect(sessions[0].manualPressCount).toBe(2);
    expect(sessions[0].sessionStatus).toBe("completed");
  });

  it("keeps interrupted and completed sessions separate across a quick reconnect", () => {
    const firstTimestamp = 1_700_300_000_000;
    const secondTimestamp = firstTimestamp + 60_000;
    const firstSessionId = "SCM-001-session-1700300000000";
    const secondSessionId = "SCM-001-session-1700300060000";
    const sessions = buildSessions(
      [{ id: "SCM-001", name: "Miner 1", active: false, stale: false, lastSeen: new Date(secondTimestamp) }],
      {},
      [
        { deviceId: "SCM-001", type: "session_status", sessionId: firstSessionId, status: "interrupted", timestamp: firstTimestamp },
        { deviceId: "SCM-001", type: "status", sessionId: secondSessionId, status: "online", timestamp: secondTimestamp },
      ],
      DEFAULT_THRESHOLDS,
      {
        "SCM-001": [
          { sessionId: firstSessionId, startTimestamp: firstTimestamp - 60_000, endTimestamp: firstTimestamp, avgHr: 80, avgSpo2: 97, avgTemp: 36.5 },
          { sessionId: secondSessionId, startTimestamp: secondTimestamp, endTimestamp: secondTimestamp + 60_000, avgHr: 82, avgSpo2: 98, avgTemp: 36.6, status: "completed" },
        ],
      },
    );

    expect(sessions).toHaveLength(2);
    expect(sessions.find((session) => session.id.includes(firstSessionId))?.sessionStatus).toBe("interrupted");
    expect(sessions.find((session) => session.id.includes(secondSessionId))?.sessionStatus).toBe("completed");
  });

  it("lets a newer interrupted event override a stale completed summary", () => {
    const firstTimestamp = 1_700_400_000_000;
    const sessionId = "SCM-001-session-1700400000000";
    const sessions = buildSessions(
      [{ id: "SCM-001", name: "Miner 1", active: false, stale: false, lastSeen: new Date(firstTimestamp) }],
      {},
      [{
        deviceId: "SCM-001",
        type: "session_status",
        sessionId,
        status: "interrupted",
        timestamp: firstTimestamp,
      }],
      DEFAULT_THRESHOLDS,
      {
        "SCM-001": [{
          sessionId,
          startTimestamp: firstTimestamp - 60_000,
          endTimestamp: firstTimestamp,
          avgHr: 80,
          avgSpo2: 97,
          avgTemp: 36.5,
          status: "completed",
        }],
      },
    );

    expect(sessions[0].sessionStatus).toBe("interrupted");
  });

  it("does not render a status-only document as a fake sensor session", () => {
    const timestamp = 1_700_500_000_000;
    const sessions = buildSessions(
      [{ id: "SCM-001", name: "Miner 1", active: false, stale: true, lastSeen: new Date(timestamp) }],
      {},
      [],
      DEFAULT_THRESHOLDS,
      {
        "SCM-001": [{
          sessionId: "SCM-001-session-1700500000000",
          status: "interrupted",
          statusTimestamp: timestamp,
        }],
      },
    );

    expect(sessions).toHaveLength(0);
  });

  it("hydrates a status-only session with readings into one completed row", () => {
    const start = 1_700_600_000_000;
    const end = start + 120_000;
    const sessionId = "SCM-001-session-1700600000000-1";
    const sessions = buildSessions(
      [{ id: "SCM-001", name: "Miner 1", active: false, stale: false, lastSeen: new Date(end) }],
      {
        "SCM-001": [
          { timestamp: start + 30_000, sessionId, hr: 80, spo2: 97, temp: 36.4 },
          { timestamp: end - 30_000, sessionId, hr: 84, spo2: 98, temp: 36.6 },
        ],
      },
      [{ deviceId: "SCM-001", type: "session_status", sessionId, status: "completed", timestamp: end }],
      DEFAULT_THRESHOLDS,
      { "SCM-001": [{ sessionId, status: "completed", statusTimestamp: end }] },
    );

    expect(sessions).toHaveLength(1);
    expect(sessions[0].sessionStatus).toBe("completed");
    expect(sessions[0].hr.avg).toBe("82");
    expect(sessions[0].spo2.avg).toBe("98");
  });

  it("collapses a legacy summary alias beside its lifecycle summary", () => {
    const start = 1_700_700_000_000;
    const sessions = buildSessions(
      [{ id: "SCM-001", name: "Miner 1", active: false, stale: false, lastSeen: new Date(start + 60_000) }],
      {},
      [],
      DEFAULT_THRESHOLDS,
      {
        "SCM-001": [
          {
            sessionId: `SCM-001-${start}`,
            startTimestamp: start,
            endTimestamp: start + 60_000,
            readingCount: 2,
            avgHr: 83,
            avgSpo2: 100,
            avgTemp: 30.4,
            hrMin: 78,
            hrMax: 87,
            spo2Min: 98,
            spo2Max: 102,
            tempMin: 29.9,
            tempMax: 31,
            status: "completed",
          },
          {
            sessionId: `SCM-001-session-${start}-123`,
            startTimestamp: start,
            endTimestamp: start + 60_000,
            readingCount: 2,
            avgHr: 83,
            avgSpo2: 100,
            avgTemp: 30.4,
            hrMin: 78,
            hrMax: 87,
            spo2Min: 98,
            spo2Max: 102,
            tempMin: 29.9,
            tempMax: 31,
            status: "completed",
          },
        ],
      },
    );

    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toContain(`SCM-001-session-${start}-123`);
  });
});
