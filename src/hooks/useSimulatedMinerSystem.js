import { useEffect, useRef, useState } from "react";
import { MINERS_INIT } from "../data/mockMiners";
import { firebaseConfigured } from "../firebase/config";
import { clearActivityLogs as clearActivityLogsRemote, clearHealthLogs as clearHealthLogsRemote, subscribeToActivityLogs, subscribeToAllAnalytics, subscribeToDevices, trimAnalyticsHistory, updateDeviceStatus, writeActivityLog } from "../firebase/database";
import { DEFAULT_THRESHOLDS, getVitalStatus } from "../utils/alertChecker";
import { formatSystemTimestamp, timeLabel } from "../utils/formatters";

const SYSTEM_STORAGE_KEY = "smart-chest-miner-system";
const MIN_VALID_EPOCH_MS = 946684800000;
const MAX_LIVE_POINTS = 30;
const MAX_ANALYTICS_POINTS = 120;
const ONLINE_TIMEOUT_MS = 75000;
const MAX_ACTIVITY_LOGS = 160;

const DEFAULT_STALE_SECONDS = 75;

function readStoredSystem() {
  try {
    const stored = JSON.parse(localStorage.getItem(SYSTEM_STORAGE_KEY));
    if (!stored) return null;
    return {
      miners: Array.isArray(stored.miners) ? stored.miners : null,
      thresholds: stored.thresholds,
      pollingInterval: stored.pollingInterval,
      staleSeconds: Number.isFinite(Number(stored.staleSeconds)) ? Number(stored.staleSeconds) : DEFAULT_STALE_SECONDS,
    };
  } catch {
    return null;
  }
}

function initialLiveData() {
  const data = {};
  MINERS_INIT.forEach((miner) => {
    data[miner.id] = { hr: [], spo2: [] };
  });
  return data;
}

function initialAnalyticsData() {
  const data = {};
  MINERS_INIT.forEach((miner) => {
    data[miner.id] = [];
  });
  return data;
}

function normalizeTimestamp(value) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp < MIN_VALID_EPOCH_MS) {
    return 0;
  }

  return timestamp;
}

function isFreshTimestamp(timestamp, timeoutMs = ONLINE_TIMEOUT_MS) {
  return timestamp > 0 && Date.now() - timestamp <= timeoutMs;
}

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;

  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "online"].includes(normalized)) return true;
  if (["false", "0", "no", "offline"].includes(normalized)) return false;
  return fallback;
}

function toReading(value) {
  const reading = Number(value);
  return Number.isFinite(reading) ? reading : 0;
}

function mapRealtimeDevices(value, timeoutMs = ONLINE_TIMEOUT_MS) {
  return Object.entries(value || {})
    .filter(([, device]) => !toBoolean(device?.archived ?? device?.deleted, false))
    .map(([id, device]) => {
      const live = device?.live || device || {};
      const timestamp = normalizeTimestamp(live.timestamp ?? device?.lastSeen);
      const lastSeen = timestamp ? new Date(timestamp) : null;
      const fresh = isFreshTimestamp(timestamp, timeoutMs);
      const firebaseStatus = String(device?.status ?? live.status ?? "").toLowerCase();
      const firebaseActive = toBoolean(device?.active, false) || firebaseStatus === "online";
      const hasSensorPayload = live.heartRate !== undefined || live.hr !== undefined || live.spo2 !== undefined;
      const hasValidSensorPayload = toReading(live.heartRate ?? live.hr ?? device?.heartRate) > 0 || toReading(live.spo2 ?? device?.spo2) > 0;
      const forcedOffline = firebaseStatus === "offline" || String(live.status || "").toLowerCase() === "offline";
      const active = !forcedOffline && (firebaseActive || hasValidSensorPayload) && fresh;
      const finger = toBoolean(live.finger ?? live.chestDetected, true);
      const manualAlert = toBoolean(live.manual_alert ?? live.manualAlert, false);

      return {
        id,
        name: device?.name || device?.minerName || id,
        location: device?.location || "Unassigned",
        active,
        lastSeen,
        status: active ? "online" : "offline",
        stale: !fresh && (hasSensorPayload || firebaseActive),
        hr: toReading(live.heartRate ?? live.hr ?? device?.heartRate),
        spo2: toReading(live.spo2 ?? device?.spo2),
        finger,
        manual_alert: manualAlert,
        sim_mode: toBoolean(live.sim_mode ?? live.simMode, false),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function mapRealtimeAnalytics(value) {
  const data = {};
  Object.entries(value || {}).forEach(([deviceId, rows]) => {
    data[deviceId] = Object.values(rows || {})
      .filter((row) => {
        const timestamp = normalizeTimestamp(row.timestamp);
        const hr = toReading(row.hr ?? row.heartRate);
        const spo2 = toReading(row.spo2);
        const finger = toBoolean(row.finger, true);
        return timestamp > 0 && finger && hr > 0 && spo2 > 0;
      })
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
      .slice(-MAX_ANALYTICS_POINTS)
      .map((row) => {
        const timestamp = normalizeTimestamp(row.timestamp);
        const date = new Date(timestamp);
        return {
          time: timeLabel(date),
          hr: toReading(row.hr ?? row.heartRate),
          spo2: toReading(row.spo2),
          finger: toBoolean(row.finger, true),
          manual_alert: toBoolean(row.manual_alert, false),
          status: row.status || "online",
          timestamp,
        };
      });
  });
  return data;
}

function latestAnalyticsMiner(rows, timeoutMs) {
  const latest = rows?.[rows.length - 1];
  if (!latest) return null;
  const active = isFreshTimestamp(latest.timestamp, timeoutMs);

  return {
    id: "",
    name: "",
    location: "Unassigned",
    active,
    status: active ? "online" : "offline",
    lastSeen: new Date(latest.timestamp),
    hr: latest.hr,
    spo2: latest.spo2,
    finger: latest.finger ?? true,
    manual_alert: latest.manual_alert ?? false,
    stale: !active,
    sim_mode: false,
  };
}

function latestAnalyticsMiners(mappedAnalytics, timeoutMs) {
  return Object.entries(mappedAnalytics)
    .map(([deviceId, rows]) => {
      const miner = latestAnalyticsMiner(rows, timeoutMs);
      return miner ? { ...miner, id: deviceId, name: deviceId } : null;
    })
    .filter(Boolean);
}

function clearLiveDataForDevice(prev, deviceId) {
  const current = prev[deviceId] || { hr: [], spo2: [] };
  if (current.hr.length === 0 && current.spo2.length === 0) return prev;

  return {
    ...prev,
    [deviceId]: { hr: [], spo2: [] },
  };
}

function applyLocalDeviceOverrides(miners, metadataOverrides, archivedDeviceIds) {
  return miners
    .filter((miner) => !archivedDeviceIds.has(miner.id))
    .map((miner) => {
      const override = metadataOverrides[miner.id];
      return override ? { ...miner, ...override } : miner;
    });
}

function mapActivityLogs(value) {
  return Object.entries(value || {})
    .map(([id, row]) => ({
      id,
      deviceId: row?.deviceId || "",
      miner: row?.miner || row?.deviceId || "Unknown miner",
      type: row?.type || "activity",
      status: row?.status || "",
      severity: row?.severity || "info",
      title: row?.title || "Miner activity",
      detail: row?.detail || "",
      timestamp: normalizeTimestamp(row?.timestamp) || Date.now(),
    }))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_ACTIVITY_LOGS);
}

function buildStatusLog(miner, previousStatus) {
  const status = miner.active ? "online" : "offline";
  return {
    deviceId: miner.id,
    miner: miner.name,
    type: "status",
    status,
    severity: status === "online" ? "info" : "warning",
    title: `Device ${status}`,
    detail:
      status === "online"
        ? `${miner.name} started sending live HR and SpO2 readings.`
        : `${miner.name} stopped sending live data${previousStatus ? ` after being ${previousStatus}` : ""}.`,
    timestamp: miner.lastSeen?.getTime?.() || Date.now(),
  };
}

function buildVitalLogs(miner, thresholds) {
  if (!miner.active || miner.finger === false) return [];
  const hrStatus = getVitalStatus(miner.hr, "hr", thresholds);
  const spo2Status = getVitalStatus(miner.spo2, "spo2", thresholds);
  const rows = [];

  if (hrStatus === "HIGH" || hrStatus === "LOW") {
    rows.push({
      deviceId: miner.id,
      miner: miner.name,
      type: "vital",
      status: hrStatus.toLowerCase(),
      severity: "warning",
      title: `Heart rate ${hrStatus.toLowerCase()}`,
      detail: `${miner.name} recorded HR ${miner.hr} bpm at ${formatSystemTimestamp(miner.lastSeen)}.`,
      timestamp: miner.lastSeen?.getTime?.() || Date.now(),
    });
  }

  if (spo2Status === "CRITICAL" || spo2Status === "LOW") {
    rows.push({
      deviceId: miner.id,
      miner: miner.name,
      type: "vital",
      status: spo2Status.toLowerCase(),
      severity: spo2Status === "CRITICAL" ? "critical" : "warning",
      title: `SpO2 ${spo2Status.toLowerCase()}`,
      detail: `${miner.name} recorded SpO2 ${miner.spo2}% at ${formatSystemTimestamp(miner.lastSeen)}.`,
      timestamp: miner.lastSeen?.getTime?.() || Date.now(),
    });
  }

  if (miner.manual_alert) {
    rows.push({
      deviceId: miner.id,
      miner: miner.name,
      type: "manual_alert",
      status: "pressed",
      severity: "critical",
      title: "Manual alert pressed",
      detail: `${miner.name} activated the manual alert button.`,
      timestamp: miner.lastSeen?.getTime?.() || Date.now(),
    });
  }

  return rows;
}

export function useSimulatedMinerSystem(enabled) {
  const stored = readStoredSystem();
  const [miners, rawSetMiners] = useState(() => (firebaseConfigured ? [] : stored?.miners || MINERS_INIT));
  const [liveData, setLiveData] = useState(initialLiveData);
  const [analyticsData, setAnalyticsData] = useState(initialAnalyticsData);
  const [activityLogs, setActivityLogs] = useState([]);
  const [thresholds, setThresholds] = useState(stored?.thresholds || DEFAULT_THRESHOLDS);
  const [pollingInterval, setPollingInterval] = useState(stored?.pollingInterval || 5);
  const [staleSeconds, setStaleSeconds] = useState(stored?.staleSeconds || DEFAULT_STALE_SECONDS);
  const [usingRealtime, setUsingRealtime] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const minersRef = useRef(miners);
  const lastTrimRef = useRef(0);
  const hasDeviceSnapshotRef = useRef(false);
  const previousStatusRef = useRef({});
  const emittedEventRef = useRef(new Set());
  const thresholdsRef = useRef(thresholds);
  const staleSecondsRef = useRef(staleSeconds);
  const metadataOverridesRef = useRef({});
  const archivedDeviceIdsRef = useRef(new Set());

  useEffect(() => {
    minersRef.current = miners;
  }, [miners]);

  const setMiners = (updater) => {
    rawSetMiners((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      const nextIds = new Set(next.map((miner) => miner.id));

      prev.forEach((miner) => {
        if (!nextIds.has(miner.id)) {
          archivedDeviceIdsRef.current.add(miner.id);
        }
      });

      next.forEach((miner) => {
        const previous = prev.find((item) => item.id === miner.id);
        if (!previous || previous.name !== miner.name || previous.location !== miner.location) {
          metadataOverridesRef.current[miner.id] = {
            name: miner.name,
            location: miner.location,
          };
        }
        archivedDeviceIdsRef.current.delete(miner.id);
      });

      minersRef.current = next;
      return next;
    });
  };

  useEffect(() => {
    thresholdsRef.current = thresholds;
  }, [thresholds]);

  useEffect(() => {
    staleSecondsRef.current = staleSeconds;
  }, [staleSeconds]);

  useEffect(() => {
    localStorage.setItem(
      SYSTEM_STORAGE_KEY,
      JSON.stringify({
        miners,
        thresholds,
        pollingInterval,
        staleSeconds,
      }),
    );
  }, [miners, thresholds, pollingInterval, staleSeconds]);

  useEffect(() => {
    if (!enabled || !firebaseConfigured) return undefined;

    const unsubscribeDevices = subscribeToDevices(
      (value) => {
        const realtimeMiners = applyLocalDeviceOverrides(mapRealtimeDevices(value, staleSecondsRef.current * 1000), metadataOverridesRef.current, archivedDeviceIdsRef.current);
        hasDeviceSnapshotRef.current = Object.keys(value || {}).length > 0;
        if (realtimeMiners.length === 0) {
          setUsingRealtime(Boolean(value && Object.keys(value).length > 0));
          rawSetMiners([]);
          minersRef.current = [];
          return;
        }

        setUsingRealtime(true);
        setConnectionError("");
        rawSetMiners(realtimeMiners);
        minersRef.current = realtimeMiners;

        realtimeMiners.forEach((miner) => {
          const expectedStatus = miner.active ? "online" : "offline";
          const raw = value?.[miner.id] || {};
          const rawStatus = String(raw.status || "").toLowerCase();
          const rawLiveStatus = String(raw.live?.status || "").toLowerCase();
          const rawActive = toBoolean(raw.active, false);
          const lastSeen = miner.lastSeen?.getTime?.() || raw.lastSeen || Date.now();

          const liveStatusNeedsSync = rawLiveStatus === "online" || rawLiveStatus === "offline";
          if (rawStatus !== expectedStatus || rawActive !== miner.active || (liveStatusNeedsSync && rawLiveStatus !== expectedStatus)) {
            updateDeviceStatus(miner.id, expectedStatus, lastSeen).catch(() => {});
          }

          const previousStatus = previousStatusRef.current[miner.id];
          if (previousStatus !== expectedStatus) {
            previousStatusRef.current[miner.id] = expectedStatus;
            const statusEvent = buildStatusLog(miner, previousStatus);
            const key = `${statusEvent.type}:${statusEvent.deviceId}:${statusEvent.status}:${Math.floor(statusEvent.timestamp / 60000)}`;
            if (!emittedEventRef.current.has(key)) {
              emittedEventRef.current.add(key);
              writeActivityLog(statusEvent).catch(() => {});
            }
          }

          buildVitalLogs(miner, thresholdsRef.current).forEach((event) => {
            const key = `${event.type}:${event.deviceId}:${event.status}:${Math.floor(event.timestamp / 60000)}`;
            if (!emittedEventRef.current.has(key)) {
              emittedEventRef.current.add(key);
              writeActivityLog(event).catch(() => {});
            }
          });
        });

        setLiveData((prev) => {
          const next = { ...prev };
          realtimeMiners.forEach((miner) => {
            if (!miner.active || miner.stale || !miner.finger || (!miner.hr && !miner.spo2)) {
              next[miner.id] = { hr: [], spo2: [] };
              return;
            }
            const label = timeLabel(miner.lastSeen);
            const cur = next[miner.id] || { hr: [], spo2: [] };
            const timestamp = miner.lastSeen.getTime();
            const lastHr = cur.hr[cur.hr.length - 1];
            if (lastHr?.timestamp === timestamp) return;
            next[miner.id] = {
              hr: [...cur.hr.slice(-(MAX_LIVE_POINTS - 1)), { time: label, hr: miner.hr, timestamp }],
              spo2: [...cur.spo2.slice(-(MAX_LIVE_POINTS - 1)), { time: label, spo2: miner.spo2, timestamp }],
            };
          });
          return next;
        });

      },
      (message) => {
        setConnectionError(message);
      },
    );

    const unsubscribeAnalytics = subscribeToAllAnalytics(
      (value) => {
        setConnectionError("");
        const mappedAnalytics = mapRealtimeAnalytics(value);
        const analyticsMiners = applyLocalDeviceOverrides(latestAnalyticsMiners(mappedAnalytics, staleSecondsRef.current * 1000), metadataOverridesRef.current, archivedDeviceIdsRef.current);

        setAnalyticsData((prev) => ({ ...prev, ...mappedAnalytics }));
        if (analyticsMiners.length > 0 && !hasDeviceSnapshotRef.current && !minersRef.current.some((miner) => miner.active)) {
          rawSetMiners(analyticsMiners);
          minersRef.current = analyticsMiners;
        }

        setLiveData((prev) =>
          Object.keys(mappedAnalytics).reduce((next, deviceId) => {
            if ((mappedAnalytics[deviceId] || []).length > 0) return next;
            return clearLiveDataForDevice(next, deviceId);
          }, prev),
        );

        if (Date.now() - lastTrimRef.current > 60000) {
          lastTrimRef.current = Date.now();
          Object.keys(mappedAnalytics).forEach((deviceId) => {
            trimAnalyticsHistory(deviceId, MAX_ANALYTICS_POINTS).catch(() => {});
          });
        }
      },
      (message) => setConnectionError(message),
    );

    const unsubscribeActivity = subscribeToActivityLogs(
      (value) => {
        setConnectionError("");
        setActivityLogs(mapActivityLogs(value));
      },
      (message) => setConnectionError(message),
    );

    return () => {
      unsubscribeDevices();
      unsubscribeAnalytics();
      unsubscribeActivity();
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;

    const interval = window.setInterval(() => {
      const staleMiners = minersRef.current.filter((miner) => {
        const timestamp = miner.lastSeen?.getTime?.() || 0;
        return miner.active && !isFreshTimestamp(timestamp, staleSecondsRef.current * 1000);
      });

      if (staleMiners.length === 0) return;

      rawSetMiners((prev) =>
        prev.map((miner) => {
          if (!staleMiners.some((stale) => stale.id === miner.id)) return miner;
          return {
            ...miner,
            active: false,
            status: "offline",
            stale: true,
          };
        }),
      );

      staleMiners.forEach((miner) => {
        previousStatusRef.current[miner.id] = "offline";
        const timestamp = miner.lastSeen?.getTime?.() || Date.now();
        updateDeviceStatus(miner.id, "offline", timestamp).catch(() => {});
        const event = buildStatusLog({ ...miner, active: false, status: "offline", stale: true }, "online");
        const key = `${event.type}:${event.deviceId}:${event.status}:${Math.floor(Date.now() / 60000)}`;
        if (!emittedEventRef.current.has(key)) {
          emittedEventRef.current.add(key);
          writeActivityLog(event).catch(() => {});
        }
      });
    }, 10000);

    return () => window.clearInterval(interval);
  }, [enabled]);

  return {
    miners,
    setMiners,
    liveData,
    analyticsData,
    activityLogs,
    thresholds,
    setThresholds,
    pollingInterval,
    setPollingInterval,
    staleSeconds,
    setStaleSeconds,
    usingRealtime,
    connectionError,
    clearActivityLogs: async () => {
      await clearActivityLogsRemote();
      setActivityLogs([]);
    },
    clearHealthLogs: async () => {
      await clearHealthLogsRemote();
      setAnalyticsData({});
      setLiveData({});
    },
  };
}
