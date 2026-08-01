import { useEffect, useRef, useState } from "react";
import { firebaseConfigured, firestoreDb } from "../firebase/config";
import { clearActivityLogs as clearActivityLogsRemote, clearHealthLogs as clearHealthLogsRemote, saveHistoricalReadingsToFirestore, saveHistorySummaries, subscribeToActivityLogs, subscribeToAllAnalytics, subscribeToDevices, subscribeToHistoricalReadings, trimAnalyticsHistory, updateDevice, updateDeviceStatus, updateSessionStatus, writeActivityLog } from "../firebase/database";
import { DEFAULT_THRESHOLDS, getVitalStatus } from "../utils/alertChecker";
import { formatSystemTimestamp, timeLabel } from "../utils/formatters";
import { readStoredValue, reportNonFatal, writeStoredValue } from "../utils/safeStorage";

const SYSTEM_STORAGE_KEY = "smart-chest-miner-system";
const MIN_VALID_EPOCH_MS = 946684800000;
const MAX_LIVE_POINTS = 30;
const MAX_ANALYTICS_POINTS = 120;
const ONLINE_TIMEOUT_MS = 75000;
const MAX_ACTIVITY_LOGS = 160;
const LIVE_SAMPLE_DEDUPE_MS = 900;
const SESSION_GAP_MS = 3 * 60 * 1000;

const DEFAULT_STALE_SECONDS = 75;

// addEvent — adds a key to the event Set, pruning the oldest 100 entries when the cap is exceeded
function addEvent(set, key) {
  if (set.size >= 500) {
    const iter = set.values();
    for (let i = 0; i < 100; i++) set.delete(iter.next().value);
  }
  set.add(key);
}

// readStoredSystem — reads miners/thresholds/staleSeconds from localStorage; returns null on parse error
function readStoredSystem() {
  const stored = readStoredValue(SYSTEM_STORAGE_KEY, null);
  if (!stored || typeof stored !== "object") return null;
  return {
    miners: Array.isArray(stored.miners) ? stored.miners : null,
    thresholds: stored.thresholds,
    pollingInterval: stored.pollingInterval,
    staleSeconds: Number.isFinite(Number(stored.staleSeconds)) ? Number(stored.staleSeconds) : DEFAULT_STALE_SECONDS,
  };
}

function handleAsyncError(setConnectionError, error, operation) {
  reportNonFatal(error, operation);
  setConnectionError(`${operation} failed. Check the connection and try again.`);
}

// normalizeTimestamp — converts a raw timestamp value to a valid Unix ms number; returns 0 if invalid
function normalizeTimestamp(value) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp < MIN_VALID_EPOCH_MS) {
    return 0;
  }

  return timestamp;
}

// isFreshTimestamp — true if timestamp is within timeoutMs of now (used to determine active/stale state)
function isFreshTimestamp(timestamp, timeoutMs = ONLINE_TIMEOUT_MS) {
  return timestamp > 0 && Date.now() - timestamp <= timeoutMs;
}

// toBoolean — coerces Firebase values (true/false/"true"/"1"/"yes"/"online") to a boolean
function toBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;

  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "online"].includes(normalized)) return true;
  if (["false", "0", "no", "offline"].includes(normalized)) return false;
  return fallback;
}

// toReading — converts a raw sensor value to a finite number; returns 0 if non-numeric or NaN
function toReading(value) {
  const reading = Number(value);
  return Number.isFinite(reading) ? reading : 0;
}

// mapRealtimeDevices — maps the raw Firebase /devices snapshot to normalized miner objects
// Filters archived devices, resolves active/stale/offline status, and normalizes all sensor readings
export function mapRealtimeDevices(value, timeoutMs = ONLINE_TIMEOUT_MS) {
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
      const reportedOffline = firebaseStatus === "offline" || String(live.status || "").toLowerCase() === "offline";
      // A stale-state sync writes "offline" to Firebase. A later, fresh sensor
      // payload must be allowed to recover the device even if that old status
      // value is still present in the same snapshot.
      const active = fresh
        && (firebaseActive || hasValidSensorPayload)
        && (!reportedOffline || hasValidSensorPayload);
      const finger = toBoolean(live.finger ?? live.chestDetected, true);
      const manualAlert = toBoolean(live.manual_alert ?? live.manualAlert, false);
      const buttonPressed = toBoolean(live.button_pressed ?? live.buttonPressed, false);
      const buttonPressCount = toReading(live.button_press_count ?? live.buttonPressCount ?? device?.button_press_count ?? device?.buttonPressCount);

      return {
        id,
        name: device?.name || device?.minerName || id,
        location: device?.location || "Unassigned",
        active,
        lastSeen,
        status: active ? "online" : "offline",
        sessionStatus: active ? "active" : String(live.sessionStatus ?? device?.sessionStatus ?? "").toLowerCase(),
        stale: !fresh && (hasSensorPayload || firebaseActive),
        hr: finger ? toReading(live.heartRate ?? live.hr ?? device?.heartRate) : 0,
        spo2: finger ? toReading(live.spo2 ?? device?.spo2) : 0,
        temp: toReading(live.temp ?? live.temperature ?? live.bodyTemp ?? device?.temp),
        finger,
        manual_alert: manualAlert,
        button_pressed: buttonPressed,
        button_press_count: buttonPressCount,
        battery: toReading(live.battery ?? device?.battery),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

// mapRealtimeAnalytics — maps raw Firebase /analytics snapshot to per-device sorted reading arrays
// Filters invalid rows (no finger contact, zero HR/SpO2) and caps to MAX_ANALYTICS_POINTS per device
function mapAnalyticsValue(value, maxPoints = MAX_ANALYTICS_POINTS) {
  const data = {};
  Object.entries(value || {}).forEach(([deviceId, rows]) => {
    const entries = Array.isArray(rows)
      ? rows.map((row, index) => [row?.id || row?.timestamp || index, row])
      : Object.entries(rows || {});
    const sortedRows = entries
      .map(([key, row]) => ({ ...(row || {}), timestamp: normalizeTimestamp(row?.timestamp) || normalizeTimestamp(key) }))
      .filter((row) => {
        const timestamp = normalizeTimestamp(row.timestamp);
        const hr = toReading(row.hr ?? row.heartRate);
        const spo2 = toReading(row.spo2);
        const temp = toReading(row.temp ?? row.temperature ?? row.bodyTemp);
        const manualAlert = toBoolean(row.manual_alert, false);
        const buttonPressed = toBoolean(row.button_pressed ?? row.buttonPressed, false);
        const buttonPressCount = toReading(row.button_press_count ?? row.buttonPressCount);
        return timestamp > 0 && (hr > 0 || spo2 > 0 || temp > 0 || manualAlert || buttonPressed || buttonPressCount > 0);
      })
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    data[deviceId] = (maxPoints > 0 ? sortedRows.slice(-maxPoints) : sortedRows)
      .map((row) => {
        const timestamp = normalizeTimestamp(row.timestamp);
        const date = new Date(timestamp);
        const finger = toBoolean(row.finger, true);
        return {
          time: timeLabel(date),
          hr: finger ? toReading(row.hr ?? row.heartRate) : 0,
          spo2: finger ? toReading(row.spo2) : 0,
          temp: toReading(row.temp ?? row.temperature ?? row.bodyTemp),
          finger,
          manual_alert: toBoolean(row.manual_alert, false),
          button_pressed: toBoolean(row.button_pressed ?? row.buttonPressed, false),
          button_press_count: toReading(row.button_press_count ?? row.buttonPressCount),
          sessionId: row.sessionId || "",
          status: row.status || "online",
          timestamp,
        };
      });
  });
  return data;
}

function mapRealtimeAnalytics(value) {
  return mapAnalyticsValue(value, MAX_ANALYTICS_POINTS);
}

function mapHistoricalAnalytics(value) {
  return mapAnalyticsValue(value, 0);
}

function mergeAnalyticsData(...sources) {
  const merged = {};
  sources.forEach((source) => {
    Object.entries(source || {}).forEach(([deviceId, rows]) => {
      const byTimestamp = new Map((merged[deviceId] || []).map((row) => [Number(row.timestamp), row]));
      (rows || []).forEach((row) => {
        const timestamp = Number(row.timestamp || 0);
        if (timestamp > 0) byTimestamp.set(timestamp, row);
      });
      merged[deviceId] = [...byTimestamp.values()].sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
    });
  });
  return merged;
}

function sessionIdForReading(deviceId, rows, index) {
  const sortedRows = [...(rows || [])].sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
  let firstTimestamp = Number(sortedRows[0]?.timestamp || 0);
  for (let i = 1; i <= index && i < sortedRows.length; i++) {
    if (Number(sortedRows[i].timestamp || 0) - Number(sortedRows[i - 1].timestamp || 0) > SESSION_GAP_MS) {
      firstTimestamp = Number(sortedRows[i].timestamp || 0);
    }
  }
  return firstTimestamp > 0 ? `${deviceId}-${firstTimestamp}` : "";
}

function sessionIdForTimestamp(deviceId, rows, timestamp) {
  const sortedRows = [...(rows || [])]
    .filter((row) => Number(row.timestamp || 0) > 0)
    .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
  let sessionStart = 0;
  for (let index = 0; index < sortedRows.length; index++) {
    if (index === 0 || Number(sortedRows[index].timestamp) - Number(sortedRows[index - 1].timestamp) > SESSION_GAP_MS) {
      sessionStart = Number(sortedRows[index].timestamp);
    }
    if (Number(sortedRows[index].timestamp) >= Number(timestamp)) break;
  }
  return sessionStart > 0 ? `${deviceId}-${sessionStart}` : `${deviceId}-${Number(timestamp)}`;
}

// latestAnalyticsMiner — builds a minimal miner object from the last analytics row for a device
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
    temp: latest.temp ?? 0,
    finger: latest.finger ?? true,
    manual_alert: latest.manual_alert ?? false,
    button_pressed: latest.button_pressed ?? false,
    button_press_count: latest.button_press_count ?? 0,
    stale: !active,
  };
}

// latestAnalyticsMiners — builds miner objects from analytics for all devices (fallback when /devices is empty)
function latestAnalyticsMiners(mappedAnalytics, timeoutMs) {
  return Object.entries(mappedAnalytics)
    .map(([deviceId, rows]) => {
      const miner = latestAnalyticsMiner(rows, timeoutMs);
      return miner ? { ...miner, id: deviceId, name: deviceId } : null;
    })
    .filter(Boolean);
}

// clearLiveDataForDevice — resets hr/spo2/temp arrays for a device; skips if already empty
function averageReading(rows, key) {
  const values = rows.map((row) => Number(row[key] || 0)).filter((value) => Number.isFinite(value) && value > 0);
  if (values.length === 0) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(key === "temp" ? 1 : 0));
}

function buildHistorySummariesForDevice(deviceId, rows, miner, thresholds) {
  const sortedRows = [...(rows || [])]
    .filter((row) => Number(row.timestamp || 0) > 0)
    .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
  if (sortedRows.length === 0) return { healthLogs: {}, miningSessions: {} };

  const groups = sortedRows.reduce((sessions, row) => {
    const current = sessions[sessions.length - 1];
    const previous = current?.[current.length - 1];
    if (!current || Number(row.timestamp || 0) - Number(previous?.timestamp || 0) > SESSION_GAP_MS) {
      sessions.push([row]);
    } else {
      current.push(row);
    }
    return sessions;
  }, []);

  const healthLogs = {};
  const miningSessions = {};
  groups.forEach((sessionRows) => {
    const first = sessionRows[0];
    const last = sessionRows[sessionRows.length - 1];
    const id = String(first.timestamp);
    const counts = uniquePressCounts(sessionRows);
    const maxCount = Math.max(...counts, 0);
    const minCount = Math.min(...counts, maxCount);
    const firstCountIsPress = sessionRows.some((row) => {
      const count = Number(row.button_press_count ?? row.buttonPressCount ?? 0);
      return count === minCount && count > 0 && row.manual_alert;
    });
    const counterPresses = counts.length ? Math.max(0, maxCount - minCount + (firstCountIsPress ? 1 : 0)) : 0;
    const activationRows = sessionRows.filter((row, index, all) => row.manual_alert && !all[index - 1]?.manual_alert);
    const manualPressCount = Math.max(counterPresses, activationRows.length);
    const avgHr = averageReading(sessionRows, "hr");
    const avgSpo2 = averageReading(sessionRows, "spo2");
    const avgTemp = averageReading(sessionRows, "temp");
    const payload = {
      id,
      sessionId: `${deviceId}-${id}`,
      deviceId,
      miner: miner?.name || deviceId,
      location: miner?.location || "Unassigned",
      startTimestamp: Number(first.timestamp),
      endTimestamp: Number(last.timestamp),
      readingCount: sessionRows.length,
      avgHr,
      avgSpo2,
      avgTemp,
      manualPressCount,
      hasManualAlert: manualPressCount > 0,
      updatedAt: Date.now(),
    };
    miningSessions[id] = payload;
    healthLogs[id] = {
      ...payload,
      hrStatus: getVitalStatus(avgHr, "hr", thresholds) || "NORMAL",
      spo2Status: getVitalStatus(avgSpo2, "spo2", thresholds) || "NORMAL",
      tempStatus: getVitalStatus(avgTemp, "temp", thresholds) || "NORMAL",
    };
  });

  return { healthLogs, miningSessions };
}

function uniquePressCounts(rows) {
  return [...new Set(
    rows
      .map((row) => Number(row.button_press_count ?? row.buttonPressCount ?? 0))
      .filter((count) => Number.isFinite(count) && count > 0),
  )].sort((a, b) => a - b);
}

function appendLiveSample(next, deviceId, sample) {
  const timestamp = Number(sample.timestamp || 0);
  if (!deviceId || timestamp <= 0) return false;

  const cur = next[deviceId] || { hr: [], spo2: [], temp: [] };
  const lastTimestamp = Math.max(
    Number(cur.hr[cur.hr.length - 1]?.timestamp || 0),
    Number(cur.spo2[cur.spo2.length - 1]?.timestamp || 0),
    Number((cur.temp || [])[(cur.temp || []).length - 1]?.timestamp || 0),
  );
  if (Math.abs(timestamp - lastTimestamp) < LIVE_SAMPLE_DEDUPE_MS) return false;

  const label = sample.time || timeLabel(new Date(timestamp));
  next[deviceId] = {
    hr: Number(sample.hr) > 0 ? [...cur.hr.slice(-(MAX_LIVE_POINTS - 1)), { time: label, hr: Number(sample.hr), timestamp }] : cur.hr,
    spo2: Number(sample.spo2) > 0 ? [...cur.spo2.slice(-(MAX_LIVE_POINTS - 1)), { time: label, spo2: Number(sample.spo2), timestamp }] : cur.spo2,
    temp: Number(sample.temp) > 0 ? [...(cur.temp || []).slice(-(MAX_LIVE_POINTS - 1)), { time: label, temp: Number(sample.temp), timestamp }] : (cur.temp || []),
  };
  return true;
}

function areMinersEquivalent(previous, next) {
  if (previous.length !== next.length) return false;
  return previous.every((miner, index) => {
    const candidate = next[index];
    return candidate
      && miner.id === candidate.id
      && miner.name === candidate.name
      && miner.location === candidate.location
      && miner.active === candidate.active
      && miner.status === candidate.status
      && miner.stale === candidate.stale
      && miner.sessionStatus === candidate.sessionStatus
      && miner.hr === candidate.hr
      && miner.spo2 === candidate.spo2
      && miner.temp === candidate.temp
      && miner.finger === candidate.finger
      && miner.manual_alert === candidate.manual_alert
      && miner.button_press_count === candidate.button_press_count
      && miner.lastSeen?.getTime?.() === candidate.lastSeen?.getTime?.();
  });
}

// applyLocalDeviceOverrides — applies name/location edits from DevicesPage and filters archived devices
function applyLocalDeviceOverrides(miners, metadataOverrides, archivedDeviceIds) {
  return miners
    .filter((miner) => !archivedDeviceIds.has(miner.id))
    .map((miner) => {
      const override = metadataOverrides[miner.id];
      return override ? { ...miner, ...override } : miner;
    });
}

// mapActivityLogs — maps raw Firebase /activityLogs to normalized display objects, sorted newest-first
function mapActivityLogs(value) {
  return Object.entries(value || {})
    .map(([id, row]) => ({
      id,
      deviceId: row?.deviceId || "",
      sessionId: row?.sessionId || "",
      buttonPressCount: Number(row?.buttonPressCount || row?.button_press_count || 0),
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

// buildStatusLog — builds an activity log entry when a miner transitions between online/offline
// isConcerningState — true when a miner is in a state worth alarming about if it
// drops offline (manual alert, no chest contact, SpO2 critical, or body temp high).
// Used to tell a normal session-end apart from a possible emergency disconnect.
function isConcerningState(miner, thresholds) {
  if (!miner || !miner.active) return false;
  if (miner.manual_alert) return true;
  if (miner.finger === false) return true;
  if (getVitalStatus(miner.hr, "hr", thresholds) === "CRITICAL") return true;
  if (getVitalStatus(miner.spo2, "spo2", thresholds) === "CRITICAL") return true;
  if (getVitalStatus(miner.temp, "temp", thresholds) === "CRITICAL") return true;
  return false;
}

// buildStatusLog — activity log for an online/offline transition. A timeout is not
// enough evidence that a miner intentionally ended its session, so record it as a
// connection loss. A disconnect during a critical condition is escalated.
function buildStatusLog(miner, previousStatus) {
  if (miner.active) {
    return {
      deviceId: miner.id,
      miner: miner.name,
      type: "status",
      status: "online",
      severity: "info",
      title: "Device online",
      detail: `${miner.name} started sending live HR and SpO2 readings.`,
      timestamp: miner.lastSeen?.getTime?.() || Date.now(),
    };
  }

  const concerning = Boolean(miner.offlineConcern);
  const explicitlyCompleted = miner.sessionStatus === "completed";
  return {
    deviceId: miner.id,
    miner: miner.name,
    type: "status",
    status: "offline",
    // The timeout itself is informational. The operator's session decision is
    // recorded separately; this prevents a normal completed session from being
    // stored as a critical alert just because the last live state was concerning.
    severity: "info",
    title: concerning ? "Device lost during alert" : explicitlyCompleted ? "Session completed" : "Connection lost",
    detail: concerning
      ? `${miner.name} went offline while a critical condition was active — verify the miner immediately.`
      : explicitlyCompleted
        ? `${miner.name} reported an explicit session end after being ${previousStatus || "online"}.`
        : `${miner.name} stopped sending live data after being ${previousStatus || "online"}. No explicit session-end signal was received.`,
    timestamp: miner.lastSeen?.getTime?.() || Date.now(),
  };
}

// buildVitalLogs — generates activity log entries for out-of-range HR, SpO2, body temp, and manual alerts
export function buildVitalLogs(miner, thresholds) {
  if (!miner.active) return [];
  const rows = [];

  // SOS is independent of optical/chest contact and must still be recorded when
  // the wearable has lost its sensor signal.
  if (miner.manual_alert) {
    rows.push({
      deviceId: miner.id,
      miner: miner.name,
      type: "manual_alert",
      status: "pressed",
      buttonPressCount: Number(miner.button_press_count || 0),
      severity: "critical",
      title: "Manual SOS pressed",
      detail: miner.button_pressed
        ? `${miner.name} pressed the manual SOS button (${miner.button_press_count || 1} total).`
        : `${miner.name} activated the manual SOS alert.`,
      timestamp: miner.lastSeen?.getTime?.() || Date.now(),
    });
  }

  if (miner.finger === false) return rows;
  const hrStatus = getVitalStatus(miner.hr, "hr", thresholds);
  const spo2Status = getVitalStatus(miner.spo2, "spo2", thresholds);
  const tempStatus = getVitalStatus(miner.temp, "temp", thresholds);

  if (["HIGH", "LOW", "CRITICAL"].includes(hrStatus)) {
    rows.push({
      deviceId: miner.id,
      miner: miner.name,
      type: "vital",
      status: hrStatus.toLowerCase(),
      severity: hrStatus === "CRITICAL" ? "critical" : "warning",
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

  if (tempStatus === "HIGH" || tempStatus === "CRITICAL") {
    rows.push({
      deviceId: miner.id,
      miner: miner.name,
      type: "vital",
      status: tempStatus.toLowerCase(),
      severity: tempStatus === "CRITICAL" ? "critical" : "warning",
      title: `Body temperature ${tempStatus.toLowerCase()}`,
      detail: `${miner.name} recorded body temp ${miner.temp}°C at ${formatSystemTimestamp(miner.lastSeen)}.`,
      timestamp: miner.lastSeen?.getTime?.() || Date.now(),
    });
  }

  if (tempStatus === "LOW") {
    rows.push({
      deviceId: miner.id,
      miner: miner.name,
      type: "vital",
      status: "low",
      severity: "warning",
      title: "Body temperature low",
      detail: `${miner.name} recorded body temp ${miner.temp}°C at ${formatSystemTimestamp(miner.lastSeen)}.`,
      timestamp: miner.lastSeen?.getTime?.() || Date.now(),
    });
  }

  return rows;
}

// useMinerSystem — main data hook: subscribes to Firebase /devices, /analytics, and /activityLogs;
// manages live chart data, stale detection interval, threshold state, and localStorage persistence
export function useMinerSystem(enabled) {
  const stored = readStoredSystem();
  const [miners, rawSetMiners] = useState(() => (firebaseConfigured ? [] : stored?.miners || []));
  const [liveData, setLiveData] = useState({});
  const [analyticsData, setAnalyticsData] = useState({});
  const [activityLogs, setActivityLogs] = useState([]);
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);
  const [pollingInterval, setPollingInterval] = useState(stored?.pollingInterval || 5);
  const [staleSeconds] = useState(DEFAULT_STALE_SECONDS);
  const [usingRealtime, setUsingRealtime] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [sessionPrompts, setSessionPrompts] = useState([]);
  const minersRef = useRef(miners);
  const lastTrimRef = useRef(0);
  const persistedHistoryRef = useRef({});
  const hasDeviceSnapshotRef = useRef(false);
  const previousStatusRef = useRef({});
  const emittedEventRef = useRef(new Set());
  const realtimeAnalyticsRef = useRef({});
  const historicalAnalyticsRef = useRef({});
  const historicalReadingKeysRef = useRef(new Set());
  const historicalSummaryTimestampRef = useRef({});
  const historicalReadyRef = useRef(false);
  const thresholdsRef = useRef(thresholds);
  const staleSecondsRef = useRef(staleSeconds);
  const metadataOverridesRef = useRef({});
  const archivedDeviceIdsRef = useRef(new Set());
  const lastConcernRef = useRef({}); // { deviceId: bool } — concern state at last active reading
  const promptedSessionRef = useRef(new Set());

  const queueSessionPrompt = (miner) => {
    const lastSeen = miner.lastSeen?.getTime?.() || Number(miner.lastSeen) || 0;
    const key = `${miner.id}:${lastSeen}`;
    if (promptedSessionRef.current.has(key)) return;
    promptedSessionRef.current.add(key);
    setSessionPrompts((current) => current.some((prompt) => prompt.key === key)
      ? current
      : [...current, { key, deviceId: miner.id, name: miner.name, lastSeen }]);
  };

  const resolveSessionStatus = async (prompt, sessionStatus) => {
    setSessionPrompts((current) => current.filter((item) => item.key !== prompt.key));
    const sessionTimestamp = Number(prompt.lastSeen) || Date.now();
    const sessionId = sessionIdForTimestamp(prompt.deviceId, analyticsData[prompt.deviceId], sessionTimestamp);
    const sessionEvent = {
      id: `session-status-${prompt.deviceId}-${sessionTimestamp}`,
      deviceId: prompt.deviceId,
      sessionId,
      miner: prompt.name,
      type: "session_status",
      status: sessionStatus,
      severity: sessionStatus === "interrupted" ? "warning" : "info",
      title: `Session marked ${sessionStatus}`,
      detail: `${prompt.name} session was marked ${sessionStatus} by the operator after live data stopped.`,
      timestamp: sessionTimestamp,
    };
    // Update the local activity stream immediately. This gives the session log
    // an exact end-timestamp status before the Firebase subscription refreshes.
    setActivityLogs((current) => [
      sessionEvent,
      ...current.filter((log) => !(log.deviceId === sessionEvent.deviceId && log.type === "session_status" && Number(log.timestamp) === sessionTimestamp)),
    ].slice(0, MAX_ACTIVITY_LOGS));
    rawSetMiners((current) => current.map((miner) => (
      miner.id === prompt.deviceId ? { ...miner, sessionStatus } : miner
    )));
    minersRef.current = minersRef.current.map((miner) => (
      miner.id === prompt.deviceId ? { ...miner, sessionStatus } : miner
    ));

    try {
      await updateDevice(prompt.deviceId, { sessionStatus });
      await updateSessionStatus(prompt.deviceId, sessionId, sessionStatus, sessionTimestamp);
      await writeActivityLog(sessionEvent);
    } catch (error) {
      handleAsyncError(setConnectionError, error, "Saving session status");
    }
  };

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

  // Persist settings locally. When Firebase is the source of truth we deliberately
  // do NOT cache the live miners array — it would go stale and rewrite on every
  // reading tick. Only thresholds/timing are cached there. Offline/demo mode keeps
  // locally registered devices so they survive a reload when Firebase is unavailable.
  useEffect(() => {
    writeStoredValue(SYSTEM_STORAGE_KEY, {
      miners: firebaseConfigured ? undefined : miners,
      thresholds,
      pollingInterval,
    });
  }, [miners, thresholds, pollingInterval]);

  useEffect(() => {
    if (!enabled || !firebaseConfigured) return undefined;

    let stopHistoricalReadings = null;
    let historicalDeviceKey = "";
    const subscribeHistoricalReadings = (deviceIds) => {
      if (!firestoreDb) return;
      const nextKey = [...new Set(deviceIds.filter(Boolean))].sort().join(",");
      if (!nextKey || nextKey === historicalDeviceKey) return;
      historicalDeviceKey = nextKey;
      stopHistoricalReadings?.();
      stopHistoricalReadings = subscribeToHistoricalReadings(
        nextKey.split(","),
        (value) => {
          historicalReadyRef.current = true;
          const mappedHistorical = mapHistoricalAnalytics(value);
          historicalAnalyticsRef.current = mappedHistorical;
          setAnalyticsData(mergeAnalyticsData(mappedHistorical, realtimeAnalyticsRef.current));

          Object.entries(mappedHistorical).forEach(([deviceId, rows]) => {
            const latestTimestamp = rows[rows.length - 1]?.timestamp || 0;
            if (!latestTimestamp || historicalSummaryTimestampRef.current[deviceId] === latestTimestamp) return;
            historicalSummaryTimestampRef.current[deviceId] = latestTimestamp;
            const miner = minersRef.current.find((item) => item.id === deviceId);
            const summaries = buildHistorySummariesForDevice(deviceId, rows, miner, thresholdsRef.current);
            saveHistorySummaries(deviceId, summaries.healthLogs, summaries.miningSessions).catch((error) => handleAsyncError(setConnectionError, error, "Saving session history"));
          });
        },
        (message) => setConnectionError(message),
      );
    };

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

        // Carry the "was this concerning when it dropped?" flag onto offline miners,
        // using the concern recorded at their last active reading.
        realtimeMiners.forEach((miner) => {
          miner.offlineConcern = miner.active ? false : Boolean(lastConcernRef.current[miner.id]);
        });

        setUsingRealtime(true);
        setConnectionError("");
        rawSetMiners((previous) => (areMinersEquivalent(previous, realtimeMiners) ? previous : realtimeMiners));
        minersRef.current = realtimeMiners;

        realtimeMiners.forEach((miner) => {
          if (miner.active) lastConcernRef.current[miner.id] = isConcerningState(miner, thresholdsRef.current);
          const expectedStatus = miner.active ? "online" : "offline";
          const raw = value?.[miner.id] || {};
          const rawStatus = String(raw.status || "").toLowerCase();
          const rawLiveStatus = String(raw.live?.status || "").toLowerCase();
          const rawActive = toBoolean(raw.active, false);
          const lastSeen = miner.lastSeen?.getTime?.() || raw.lastSeen || Date.now();

          const liveStatusNeedsSync = rawLiveStatus === "online" || rawLiveStatus === "offline";
          if (rawStatus !== expectedStatus || rawActive !== miner.active || (liveStatusNeedsSync && rawLiveStatus !== expectedStatus)) {
            updateDeviceStatus(miner.id, expectedStatus, lastSeen).catch((error) => handleAsyncError(setConnectionError, error, "Updating device status"));
          }

          const previousStatus = previousStatusRef.current[miner.id];
          if (previousStatus !== expectedStatus) {
            previousStatusRef.current[miner.id] = expectedStatus;
            if (previousStatus === "online" && expectedStatus === "offline") queueSessionPrompt(miner);
            const statusEvent = buildStatusLog(miner, previousStatus);
            const key = `${statusEvent.type}:${statusEvent.deviceId}:${statusEvent.status}:${Math.floor(statusEvent.timestamp / 60000)}`;
            if (!emittedEventRef.current.has(key)) {
              addEvent(emittedEventRef.current, key);
              writeActivityLog(statusEvent).catch((error) => handleAsyncError(setConnectionError, error, "Saving status log"));
            }
          }

          buildVitalLogs(miner, thresholdsRef.current).forEach((event) => {
            const key = event.type === "manual_alert"
              ? `${event.type}:${event.deviceId}:${event.buttonPressCount || 0}`
              : `${event.type}:${event.deviceId}:${event.status}:${Math.floor(event.timestamp / 60000)}`;
            if (!emittedEventRef.current.has(key)) {
              addEvent(emittedEventRef.current, key);
              writeActivityLog(event).catch((error) => handleAsyncError(setConnectionError, error, "Saving alert log"));
            }
          });
        });

        setLiveData((prev) => {
          const next = { ...prev };
          let changed = false;
          realtimeMiners.forEach((miner) => {
            if (!miner.active || miner.stale || miner.finger === false || (!miner.hr && !miner.spo2 && !miner.temp)) {
              return;
            }
            changed = appendLiveSample(next, miner.id, {
              time: timeLabel(miner.lastSeen),
              timestamp: miner.lastSeen.getTime(),
              hr: miner.hr,
              spo2: miner.spo2,
              temp: miner.temp,
            }) || changed;
          });
          return changed ? next : prev;
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
        realtimeAnalyticsRef.current = mappedAnalytics;
        subscribeHistoricalReadings(Object.keys(mappedAnalytics));
        const analyticsMiners = applyLocalDeviceOverrides(latestAnalyticsMiners(mappedAnalytics, staleSecondsRef.current * 1000), metadataOverridesRef.current, archivedDeviceIdsRef.current);

        setAnalyticsData(() => historicalReadyRef.current
          ? mergeAnalyticsData(historicalAnalyticsRef.current, mappedAnalytics)
          : mappedAnalytics);
        if (analyticsMiners.length > 0 && !hasDeviceSnapshotRef.current && !minersRef.current.some((miner) => miner.active)) {
          rawSetMiners(analyticsMiners);
          minersRef.current = analyticsMiners;
        }

        setLiveData((prev) => {
          let changed = false;
          const next = Object.keys(mappedAnalytics).reduce((result, deviceId) => {
            const rows = mappedAnalytics[deviceId] || [];
            if (rows.length > 0) {
              rows.slice(-MAX_LIVE_POINTS).forEach((row) => {
                changed = appendLiveSample(result, deviceId, row) || changed;
              });
            }
            return result;
          }, { ...prev });
          return changed ? next : prev;
        });

        if (Date.now() - lastTrimRef.current > 60000) {
          lastTrimRef.current = Date.now();
          Object.keys(mappedAnalytics).forEach((deviceId) => {
            trimAnalyticsHistory(deviceId, MAX_ANALYTICS_POINTS).catch((error) => handleAsyncError(setConnectionError, error, "Trimming analytics history"));
          });
        }

        Object.entries(mappedAnalytics).forEach(([deviceId, rows]) => {
          const pendingReadings = [];
          rows.forEach((row, index) => {
            const readingKey = `${deviceId}:${row.timestamp}`;
            if (historicalReadingKeysRef.current.has(readingKey)) return;
            historicalReadingKeysRef.current.add(readingKey);
            pendingReadings.push({ ...row, sessionId: sessionIdForReading(deviceId, rows, index) });
          });
          if (pendingReadings.length > 0) {
            saveHistoricalReadingsToFirestore(deviceId, pendingReadings).catch((error) => handleAsyncError(setConnectionError, error, "Saving historical readings"));
          }
          const latestTimestamp = rows[rows.length - 1]?.timestamp || 0;
          if (!latestTimestamp || persistedHistoryRef.current[deviceId] === latestTimestamp) return;
          persistedHistoryRef.current[deviceId] = latestTimestamp;
          const miner = minersRef.current.find((item) => item.id === deviceId);
          const summaries = buildHistorySummariesForDevice(deviceId, rows, miner, thresholdsRef.current);
          saveHistorySummaries(deviceId, summaries.healthLogs, summaries.miningSessions).catch((error) => handleAsyncError(setConnectionError, error, "Saving session history"));
        });
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
      stopHistoricalReadings?.();
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

      const patched = (m) =>
        staleMiners.some((s) => s.id === m.id)
          ? { ...m, active: false, status: "offline", stale: true, offlineConcern: isConcerningState(m, thresholdsRef.current) }
          : m;

      rawSetMiners((prev) => prev.map(patched));
      // Update the ref immediately so the next interval tick sees active:false
      // and won't re-emit the same offline event (edge-trigger guard).
      minersRef.current = minersRef.current.map(patched);

      staleMiners.forEach((miner) => {
        previousStatusRef.current[miner.id] = "offline";
        const timestamp = miner.lastSeen?.getTime?.() || Date.now();
        updateDeviceStatus(miner.id, "offline", timestamp).catch((error) => handleAsyncError(setConnectionError, error, "Updating offline status"));
        const offlineMiner = { ...miner, active: false, status: "offline", stale: true, offlineConcern: isConcerningState(miner, thresholdsRef.current) };
        queueSessionPrompt(offlineMiner);
        const event = buildStatusLog(offlineMiner, "online");
        const key = `${event.type}:${event.deviceId}:${event.status}:${Math.floor(event.timestamp / 60000)}`;
        if (!emittedEventRef.current.has(key)) {
          addEvent(emittedEventRef.current, key);
          writeActivityLog(event).catch((error) => handleAsyncError(setConnectionError, error, "Saving disconnect log"));
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
    sessionPrompt: sessionPrompts[0] || null,
    resolveSessionStatus,
    usingRealtime,
    connectionError,
    clearActivityLogs: async () => {
      await clearActivityLogsRemote();
      setActivityLogs([]);
    },
    clearHealthLogs: async () => {
      const deviceIds = [...new Set([...Object.keys(analyticsData), ...minersRef.current.map((miner) => miner.id)])];
      await clearHealthLogsRemote(deviceIds);
      setAnalyticsData({});
      setLiveData({});
      realtimeAnalyticsRef.current = {};
      historicalAnalyticsRef.current = {};
      historicalReadingKeysRef.current.clear();
      historicalSummaryTimestampRef.current = {};
    },
  };
}
