import { useEffect, useRef, useState } from "react";
import { MINERS_INIT } from "../data/mockMiners";
import { firebaseConfigured } from "../firebase/config";
import { subscribeToAllAnalytics, subscribeToDevices, writeAnalyticsSnapshot } from "../firebase/database";
import { DEFAULT_THRESHOLDS } from "../utils/alertChecker";
import { timeLabel } from "../utils/formatters";

const SYSTEM_STORAGE_KEY = "smart-chest-miner-system";
const ANALYTICS_WRITE_INTERVAL_MS = 60000;
const DEVICE_ID = "MCM-001";

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

function mapRealtimeDevices(value) {
  return Object.entries(value || {})
    .filter(([id]) => id === DEVICE_ID)
    .map(([id, device]) => {
    const timestamp = device.live?.timestamp || device.lastSeen || Date.now();
    const lastSeen = new Date(Number(timestamp));
    const offlineByTime = Date.now() - lastSeen.getTime() > 60000;
    const live = device.live || {};
    const finger = Boolean(live.finger ?? live.chestDetected ?? true);
    const manualAlert = Boolean(live.manual_alert ?? live.manualAlert ?? false);
    return {
      id,
      name: device.name || device.minerName || id,
      location: device.location || "Unassigned",
      active: Boolean(device.active ?? device.status === "online") && !offlineByTime,
      lastSeen,
      status: offlineByTime ? "offline" : device.status || "online",
      hr: Number(live.heartRate ?? live.hr ?? device.heartRate ?? 0),
      spo2: Number(live.spo2 ?? device.spo2 ?? 0),
      finger,
      manual_alert: manualAlert,
      sim_mode: Boolean(live.sim_mode ?? live.simMode ?? false),
    };
  });
}

function mapRealtimeAnalytics(value) {
  const data = {};
  Object.entries(value || {}).forEach(([deviceId, rows]) => {
    if (deviceId !== DEVICE_ID) return;
    data[deviceId] = Object.values(rows || {})
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
      .slice(-60)
      .map((row) => {
        const date = new Date(row.timestamp || Date.now());
        return {
          time: timeLabel(date),
          hr: Number(row.hr ?? row.heartRate ?? 0),
          spo2: Number(row.spo2 ?? 0),
          timestamp: row.timestamp || Date.now(),
        };
      });
  });
  return data;
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
  const analyticsBucketsRef = useRef({});

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
            if (!miner.active || !miner.finger || (!miner.hr && !miner.spo2)) return;
            const label = timeLabel(miner.lastSeen);
            const cur = next[miner.id] || { hr: [], spo2: [] };
            next[miner.id] = {
              hr: [...cur.hr.slice(-29), { time: label, hr: miner.hr }],
              spo2: [...cur.spo2.slice(-29), { time: label, spo2: miner.spo2 }],
            };
          });
          return next;
        });

        realtimeMiners.forEach((miner) => {
          if (!miner.active || !miner.finger || miner.hr <= 0 || miner.spo2 <= 0) return;

          const bucket = analyticsBucketsRef.current[miner.id] || { hr: [], spo2: [], lastWrite: Date.now() };
          bucket.hr.push(miner.hr);
          bucket.spo2.push(miner.spo2);

          const shouldWrite = Date.now() - bucket.lastWrite >= ANALYTICS_WRITE_INTERVAL_MS && bucket.hr.length > 0;
          if (shouldWrite) {
            const avgHR = Math.round(bucket.hr.reduce((sum, value) => sum + value, 0) / bucket.hr.length);
            const avgSpo2 = Math.round(bucket.spo2.reduce((sum, value) => sum + value, 0) / bucket.spo2.length);
            bucket.lastWrite = Date.now();
            bucket.hr = [];
            bucket.spo2 = [];
            writeAnalyticsSnapshot(miner.id, avgHR, avgSpo2).catch((error) => setConnectionError(error.message));
          }

          analyticsBucketsRef.current[miner.id] = bucket;
        });
      },
      (message) => {
        setConnectionError(message);
        setUsingRealtime(false);
      },
    );

    const unsubscribeAnalytics = subscribeToAllAnalytics(
      (value) => setAnalyticsData((prev) => ({ ...prev, ...mapRealtimeAnalytics(value) })),
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
