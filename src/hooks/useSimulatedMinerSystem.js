import { useEffect, useRef, useState } from "react";
import { MINERS_INIT } from "../data/mockMiners";
import { firebaseConfigured } from "../firebase/config";
import { subscribeToAllAnalytics, subscribeToDevices, trimAnalyticsHistory } from "../firebase/database";
import { DEFAULT_THRESHOLDS } from "../utils/alertChecker";
import { timeLabel } from "../utils/formatters";

const SYSTEM_STORAGE_KEY = "smart-chest-miner-system";
const MIN_VALID_EPOCH_MS = 946684800000;
const MAX_LIVE_POINTS = 30;
const MAX_ANALYTICS_POINTS = 120;
const ONLINE_TIMEOUT_MS = 75000;

function readStoredSystem() {
  try {
    const stored = JSON.parse(localStorage.getItem(SYSTEM_STORAGE_KEY));
    if (!stored) return null;
    return {
      thresholds: stored.thresholds,
      pollingInterval: stored.pollingInterval,
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

function isFreshTimestamp(timestamp) {
  return timestamp > 0 && Date.now() - timestamp <= ONLINE_TIMEOUT_MS;
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

function mapRealtimeDevices(value) {
  return Object.entries(value || {})
    .map(([id, device]) => {
      const live = device?.live || device || {};
      const timestamp = normalizeTimestamp(live.timestamp ?? device?.lastSeen);
      const lastSeen = timestamp ? new Date(timestamp) : null;
      const fresh = isFreshTimestamp(timestamp);
      const firebaseStatus = String(device?.status ?? live.status ?? "").toLowerCase();
      const firebaseActive = toBoolean(device?.active, false) || firebaseStatus === "online";
      const hasSensorPayload = live.heartRate !== undefined || live.hr !== undefined || live.spo2 !== undefined;
      const active = (firebaseActive || hasSensorPayload) && fresh;
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

function latestAnalyticsMiner(rows) {
  const latest = rows?.[rows.length - 1];
  if (!latest) return null;
  const active = isFreshTimestamp(latest.timestamp);

  return {
    ...MINERS_INIT[0],
    active,
    status: active ? "online" : "offline",
    lastSeen: new Date(latest.timestamp),
    hr: latest.hr,
    spo2: latest.spo2,
    finger: latest.finger,
    manual_alert: latest.manual_alert,
    stale: !active,
  };
}

function latestAnalyticsMiners(mappedAnalytics) {
  return Object.entries(mappedAnalytics)
    .map(([deviceId, rows]) => {
      const miner = latestAnalyticsMiner(rows);
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

export function useSimulatedMinerSystem(enabled) {
  const stored = readStoredSystem();
  const [miners, setMiners] = useState(MINERS_INIT);
  const [liveData, setLiveData] = useState(initialLiveData);
  const [analyticsData, setAnalyticsData] = useState(initialAnalyticsData);
  const [thresholds, setThresholds] = useState(stored?.thresholds || DEFAULT_THRESHOLDS);
  const [pollingInterval, setPollingInterval] = useState(stored?.pollingInterval || 5);
  const [usingRealtime, setUsingRealtime] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const minersRef = useRef(miners);
  const lastTrimRef = useRef(0);
  const hasDeviceSnapshotRef = useRef(false);

  useEffect(() => {
    minersRef.current = miners;
  }, [miners]);

  useEffect(() => {
    localStorage.setItem(
      SYSTEM_STORAGE_KEY,
      JSON.stringify({
        miners,
        thresholds,
        pollingInterval,
      }),
    );
  }, [miners, thresholds, pollingInterval]);

  useEffect(() => {
    if (!enabled || !firebaseConfigured) return undefined;

    const unsubscribeDevices = subscribeToDevices(
      (value) => {
        const realtimeMiners = mapRealtimeDevices(value);
        hasDeviceSnapshotRef.current = realtimeMiners.length > 0;
        if (realtimeMiners.length === 0) {
          setUsingRealtime(false);
          setMiners(MINERS_INIT);
          minersRef.current = MINERS_INIT;
          return;
        }

        setUsingRealtime(true);
        setConnectionError("");
        setMiners(realtimeMiners);
        minersRef.current = realtimeMiners;

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
        const analyticsMiners = latestAnalyticsMiners(mappedAnalytics);

        setAnalyticsData((prev) => ({ ...prev, ...mappedAnalytics }));
        if (analyticsMiners.length > 0 && !hasDeviceSnapshotRef.current && !minersRef.current.some((miner) => miner.active)) {
          setMiners(analyticsMiners);
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

    return () => {
      unsubscribeDevices();
      unsubscribeAnalytics();
    };
  }, [enabled]);

  return {
    miners,
    setMiners,
    liveData,
    analyticsData,
    thresholds,
    setThresholds,
    pollingInterval,
    setPollingInterval,
    usingRealtime,
    connectionError,
  };
}
