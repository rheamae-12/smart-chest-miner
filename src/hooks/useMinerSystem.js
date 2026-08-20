import { useCallback, useEffect, useRef, useState } from "react";
import { firebaseConfigured, firestoreDb } from "../firebase/config";
import { clearActivityLogs as clearActivityLogsRemote, clearHealthLogs as clearHealthLogsRemote, saveHistoricalReadingsToFirestore, saveHistorySummaries, subscribeToActivityLogs, subscribeToAllAnalytics, subscribeToDevices, subscribeToHistoricalReadings, subscribeToSessionSummaries, trimAnalyticsHistory, updateDevice, updateDeviceStatus, updateSessionStatus, writeActivityLog } from "../firebase/database";
import { DEFAULT_THRESHOLDS, getVitalStatus } from "../utils/alertChecker";
import { formatSystemTimestamp, timeLabel } from "../utils/formatters";
import { readStoredValue, reportNonFatal, writeStoredValue } from "../utils/safeStorage";
import { countVitalAlertLogs, countVitalAlertsInRows } from "../utils/sessionAlertCounter";
import { canonicalSessionId, createSessionId, isTerminalSessionStatus } from "../utils/sessionIds";

const SYSTEM_STORAGE_KEY = "smart-chest-miner-system";
const MIN_VALID_EPOCH_MS = 946684800000;
const MAX_LIVE_POINTS = 30;
const MAX_ANALYTICS_POINTS = 120;
const ONLINE_TIMEOUT_MS = 30000;
const MAX_ACTIVITY_LOGS = 160;
const LIVE_SAMPLE_DEDUPE_MS = 900;
const SESSION_GAP_MS = 3 * 60 * 1000;

const DEFAULT_STALE_SECONDS = 30;
const STALE_CHECK_INTERVAL_MS = 2000;

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

function findMinerById(miners, id) {
  for (const miner of miners) {
    if (miner.id === id) return miner;
  }
  return undefined;
}

function processHistoricalDevice(deviceId, rows, context) {
  const { activeSessionIdRef, activityLogsRef, historicalSummaryTimestampRef, minersRef, setConnectionError, sharedSessionIdFor, staleSecondsRef, thresholdsRef } = context;
  const latestTimestamp = rows.at(-1)?.timestamp || 0;
  if (latestTimestamp && isFreshTimestamp(latestTimestamp, staleSecondsRef.current * 1000)) {
    activeSessionIdRef.current[deviceId] = sharedSessionIdFor(deviceId, latestTimestamp) || createSessionId(deviceId, latestTimestamp);
  }
  const sessionSignature = `${latestTimestamp}|${rows.map((row) => row.sessionId || "").join(",")}`;
  if (!latestTimestamp || historicalSummaryTimestampRef.current[deviceId] === sessionSignature) return;
  historicalSummaryTimestampRef.current[deviceId] = sessionSignature;
  const miner = findMinerById(minersRef.current, deviceId);
  const summaries = buildHistorySummariesForDevice(deviceId, rows, miner, thresholdsRef.current, activityLogsRef.current);
  saveHistorySummaries(deviceId, summaries.healthLogs, summaries.miningSessions).catch((error) => {
    if (historicalSummaryTimestampRef.current[deviceId] === sessionSignature) delete historicalSummaryTimestampRef.current[deviceId];
    handleAsyncError(setConnectionError, error, "Saving session history");
  });
}

function processHistoricalSnapshot(mappedHistorical, context) {
  const { historicalAnalyticsRef, historicalReadyRef, realtimeAnalyticsRef, setAnalyticsData } = context;
  historicalReadyRef.current = true;
  historicalAnalyticsRef.current = mappedHistorical;
  setAnalyticsData(mergeAnalyticsData(mappedHistorical, realtimeAnalyticsRef.current));
  for (const [deviceId, rows] of Object.entries(mappedHistorical)) {
    processHistoricalDevice(deviceId, rows, context);
  }
}

function persistStatusEvent(statusEvent, context) {
  const { emittedEventRef, setActivityLogs, setConnectionError } = context;
  const key = activityLogKey(statusEvent);
  if (emittedEventRef.current.has(key)) return;
  addEvent(emittedEventRef.current, key);
  addImmediateActivityLog(setActivityLogs, statusEvent, key);
  writeActivityLog({ ...statusEvent, id: key }).catch((error) => handleAsyncError(setConnectionError, error, "Saving status log"));
}

function persistVitalEvents(miner, thresholds, context) {
  const { emittedEventRef, setActivityLogs, setConnectionError } = context;
  for (const event of buildVitalLogs(miner, thresholds)) {
    const key = event.type === "manual_alert"
      ? `${event.type}:${event.deviceId}:${event.buttonPressCount || 0}`
      : `${event.type}:${event.deviceId}:${event.status}:${Math.floor(event.timestamp / 60000)}`;
    if (emittedEventRef.current.has(key)) continue;
    addEvent(emittedEventRef.current, key);
    addImmediateActivityLog(setActivityLogs, event, key);
    writeActivityLog({ ...event, id: key }).catch((error) => handleAsyncError(setConnectionError, error, "Saving alert log"));
  }
}

function realtimeMinerStatus(miner, value) {
  const expectedStatus = miner.active ? "online" : "offline";
  const raw = value?.[miner.id] || {};
  const rawStatus = String(raw.status || "").toLowerCase();
  const rawLiveStatus = String(raw.live?.status || "").toLowerCase();
  const rawActive = toBoolean(raw.active, false);
  const lastSeen = miner.lastSeen?.getTime?.() || raw.lastSeen || Date.now();
  const liveStatusNeedsSync = rawLiveStatus === "online" || rawLiveStatus === "offline";
  return { expectedStatus, lastSeen, needsStatusSync: rawStatus !== expectedStatus || rawActive !== miner.active || (liveStatusNeedsSync && rawLiveStatus !== expectedStatus) };
}

function syncRealtimeDeviceStatus(miner, status, context) {
  if (!status.needsStatusSync) return;
  context.updateDeviceStatus(miner.id, status.expectedStatus, status.lastSeen)
    .catch((error) => handleAsyncError(context.setConnectionError, error, "Updating device status"));
}

function syncRealtimeMinerSession(miner, status, context) {
  const { activeSessionIdRef, knownStatusDeviceIdsRef, previousStatusRef, queueSessionPrompt, sharedSessionIdFor } = context;
  const previousStatus = previousStatusRef.current[miner.id];
  const firstSeenDevice = !knownStatusDeviceIdsRef.current.has(miner.id);
  knownStatusDeviceIdsRef.current.add(miner.id);
  if (firstSeenDevice) {
    previousStatusRef.current[miner.id] = status.expectedStatus;
    if (status.expectedStatus === "online" && !activeSessionIdRef.current[miner.id]) {
      const sharedSessionId = sharedSessionIdFor(miner.id, status.lastSeen);
      if (sharedSessionId) activeSessionIdRef.current[miner.id] = sharedSessionId;
    }
  } else if (previousStatus !== status.expectedStatus) {
    previousStatusRef.current[miner.id] = status.expectedStatus;
    if (status.expectedStatus === "online") activeSessionIdRef.current[miner.id] = sharedSessionIdFor(miner.id, status.lastSeen) || createSessionId(miner.id, status.lastSeen);
    const sessionId = sharedSessionIdFor(miner.id, status.lastSeen) || activeSessionIdRef.current[miner.id] || createSessionId(miner.id, status.lastSeen);
    activeSessionIdRef.current[miner.id] = sessionId;
    if (previousStatus === "online" && status.expectedStatus === "offline") queueSessionPrompt(miner, sessionId);
    persistStatusEvent(buildStatusLog(miner, previousStatus, sessionId), context);
  }
}

function processRealtimeMiner(miner, value, context) {
  const { lastConcernRef, thresholdsRef } = context;
  if (miner.active) lastConcernRef.current[miner.id] = isConcerningState(miner, thresholdsRef.current);
  const status = realtimeMinerStatus(miner, value);
  syncRealtimeDeviceStatus(miner, status, context);
  syncRealtimeMinerSession(miner, status, context);
  persistVitalEvents(miner, thresholdsRef.current, context);
}

function processRealtimeMiners(realtimeMiners, value, context) {
  for (const miner of realtimeMiners) processRealtimeMiner(miner, value, context);
}

function appendRealtimeSamples(previous, realtimeMiners) {
  const next = { ...previous };
  let changed = false;
  for (const miner of realtimeMiners) {
    if (!miner.active || miner.stale || miner.finger === false || (!miner.hr && !miner.spo2 && !miner.temp)) continue;
    changed = appendLiveSample(next, miner.id, {
      time: timeLabel(miner.lastSeen),
      timestamp: miner.lastSeen.getTime(),
      hr: miner.hr,
      spo2: miner.spo2,
      temp: miner.temp,
    }) || changed;
  }
  return changed ? next : previous;
}

function processAnalyticsDevice(deviceId, rows, context) {
  const { activityLogsRef, historicalAnalyticsRef, historicalReadingKeysRef, historicalReadingSessionRef, minersRef, persistedHistoryRef, setConnectionError, thresholdsRef } = context;
  const pendingReadings = [];
  const sharedRows = mergeAnalyticsData(
    { [deviceId]: historicalAnalyticsRef.current[deviceId] || [] },
    { [deviceId]: rows },
  )[deviceId] || rows;
  const sessionRows = rows.map((row) => ({
    ...row,
    sessionId: sessionIdForTimestamp(deviceId, sharedRows, row.timestamp, activityLogsRef.current),
  }));
  for (const [index, row] of rows.entries()) {
    const readingKey = `${deviceId}:${row.timestamp}`;
    const sessionRow = sessionRows[index];
    const sessionId = sessionRow.sessionId || "";
    if (historicalReadingKeysRef.current.has(readingKey) && historicalReadingSessionRef.current[readingKey] === sessionId) continue;
    historicalReadingKeysRef.current.add(readingKey);
    historicalReadingSessionRef.current[readingKey] = sessionId;
    pendingReadings.push(sessionRow);
  }
  if (pendingReadings.length > 0) {
    saveHistoricalReadingsToFirestore(deviceId, pendingReadings).catch((error) => {
      for (const reading of pendingReadings) {
        const readingKey = `${deviceId}:${reading.timestamp}`;
        if (historicalReadingSessionRef.current[readingKey] === (reading.sessionId || "")) {
          historicalReadingKeysRef.current.delete(readingKey);
          delete historicalReadingSessionRef.current[readingKey];
        }
      }
      handleAsyncError(setConnectionError, error, "Saving historical readings");
    });
  }
  if (firestoreDb) return;
  const latestTimestamp = rows.at(-1)?.timestamp || 0;
  const sessionSignature = `${latestTimestamp}|${sessionRows.map((row) => row.sessionId || "").join(",")}`;
  if (!latestTimestamp || persistedHistoryRef.current[deviceId] === sessionSignature) return;
  persistedHistoryRef.current[deviceId] = sessionSignature;
  const miner = findMinerById(minersRef.current, deviceId);
  const summaries = buildHistorySummariesForDevice(deviceId, sessionRows, miner, thresholdsRef.current, activityLogsRef.current);
  saveHistorySummaries(deviceId, summaries.healthLogs, summaries.miningSessions).catch((error) => {
    if (persistedHistoryRef.current[deviceId] === sessionSignature) delete persistedHistoryRef.current[deviceId];
    handleAsyncError(setConnectionError, error, "Saving session history");
  });
}

function processRealtimeAnalyticsSnapshot(mappedAnalytics, context) {
  const { activeSessionIdRef, archivedDeviceIdsRef, historicalAnalyticsRef, historicalReadyRef, hasDeviceSnapshotRef, lastTrimRef, metadataOverridesRef, minersRef, setMiners, realtimeAnalyticsRef, setAnalyticsData, setConnectionError, staleSecondsRef, subscribeHistoricalReadings } = context;
  realtimeAnalyticsRef.current = mappedAnalytics;
  for (const [deviceId, rows] of Object.entries(mappedAnalytics)) {
    const latestTimestamp = rows.at(-1)?.timestamp || 0;
    if (latestTimestamp && isFreshTimestamp(latestTimestamp, staleSecondsRef.current * 1000)) {
      activeSessionIdRef.current[deviceId] = context.sharedSessionIdFor(deviceId, latestTimestamp) || createSessionId(deviceId, latestTimestamp);
    }
  }
  subscribeHistoricalReadings([...Object.keys(mappedAnalytics), ...minersRef.current.map((miner) => miner.id)]);
  const analyticsMiners = applyLocalDeviceOverrides(latestAnalyticsMiners(mappedAnalytics, staleSecondsRef.current * 1000), metadataOverridesRef.current, archivedDeviceIdsRef.current);
  setAnalyticsData(historicalReadyRef.current ? mergeAnalyticsData(historicalAnalyticsRef.current, mappedAnalytics) : mappedAnalytics);
  if (analyticsMiners.length > 0 && !hasDeviceSnapshotRef.current && !minersRef.current.some((miner) => miner.active)) {
  setMiners(analyticsMiners);
    minersRef.current = analyticsMiners;
  }
  if (Date.now() - lastTrimRef.current > 60000) {
    lastTrimRef.current = Date.now();
    for (const deviceId of Object.keys(mappedAnalytics)) {
      trimAnalyticsHistory(deviceId, MAX_ANALYTICS_POINTS).catch((error) => handleAsyncError(setConnectionError, error, "Trimming analytics history"));
    }
  }
  for (const [deviceId, rows] of Object.entries(mappedAnalytics)) processAnalyticsDevice(deviceId, rows, context);
}

function filterActivityPrompts(current, mapped) {
  return current.filter((prompt) => !promptMatchesActivityStatus(prompt, mapped));
}

function filterStoredPrompts(current, mapped) {
  return current.filter((prompt) => !promptMatchesStoredStatus(prompt, mapped[prompt.deviceId]));
}

function staleMinersFrom(miners, staleSeconds) {
  const staleMiners = [];
  for (const miner of miners) {
    const timestamp = miner.lastSeen?.getTime?.() || 0;
    if (miner.active && !isFreshTimestamp(timestamp, staleSeconds * 1000)) staleMiners.push(miner);
  }
  return staleMiners;
}

function patchStaleMiner(miner, staleIds, thresholds) {
  if (!staleIds.has(miner.id)) return miner;
  return { ...miner, active: false, status: "offline", stale: true, offlineConcern: isConcerningState(miner, thresholds) };
}

function processStaleMiners(staleMiners, context) {
  const { activeSessionIdRef, emittedEventRef, minersRef, previousStatusRef, queueSessionPrompt, setMiners, setConnectionError, sharedSessionIdFor, updateDeviceStatus } = context;
  const staleIds = new Set(staleMiners.map((miner) => miner.id));
  const patch = (miner) => patchStaleMiner(miner, staleIds, context.thresholdsRef.current);
  setMiners((previous) => previous.map(patch));
  minersRef.current = minersRef.current.map(patch);
  for (const miner of staleMiners) {
    previousStatusRef.current[miner.id] = "offline";
    const timestamp = miner.lastSeen?.getTime?.() || Date.now();
    updateDeviceStatus(miner.id, "offline", timestamp).catch((error) => handleAsyncError(setConnectionError, error, "Updating offline status"));
    const offlineMiner = patchStaleMiner(miner, staleIds, context.thresholdsRef.current);
    const sessionId = sharedSessionIdFor(miner.id, timestamp) || activeSessionIdRef.current[miner.id] || createSessionId(miner.id, timestamp);
    activeSessionIdRef.current[miner.id] = sessionId;
    queueSessionPrompt(offlineMiner, sessionId);
    const event = buildStatusLog(offlineMiner, "online", sessionId);
    const key = activityLogKey(event);
    if (emittedEventRef.current.has(key)) continue;
    addEvent(emittedEventRef.current, key);
    writeActivityLog(event).catch((error) => handleAsyncError(setConnectionError, error, "Saving disconnect log"));
  }
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
    .filter(([, device]) => !toBoolean(device?.archived, false) && !toBoolean(device?.deleted, false))
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
      .map(([key, row]) => ({ ...row, timestamp: normalizeTimestamp(row?.timestamp) || normalizeTimestamp(key) }))
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

function mapSessionSummaries(value) {
  return Object.fromEntries(
    Object.entries(value || {}).map(([deviceId, rows]) => [
      deviceId,
      (Array.isArray(rows) ? rows : Object.entries(rows || {}).map(([id, row]) => ({ id, ...row })))
        .filter((row) => Number(row.startTimestamp || row.timestamp || row.statusTimestamp || 0) > 0)
        .sort((a, b) => Number(a.startTimestamp || a.timestamp || a.statusTimestamp || 0) - Number(b.startTimestamp || b.timestamp || b.statusTimestamp || 0)),
    ]),
  );
}

export function mergeAnalyticsData(...sources) {
  const merged = {};
  sources.forEach((source) => {
    Object.entries(source || {}).forEach(([deviceId, rows]) => {
      const byTimestamp = new Map((merged[deviceId] || []).map((row) => [Number(row.timestamp), row]));
      (rows || []).forEach((row) => {
        const timestamp = Number(row.timestamp || 0);
        if (timestamp > 0) {
          const previous = byTimestamp.get(timestamp);
          // Realtime rows may not carry the Firestore-assigned sessionId.
          // Preserve it when the same timestamp is merged again.
          byTimestamp.set(timestamp, previous
            ? mergeAnalyticsRow(previous, row)
            : row);
        }
      });
      merged[deviceId] = [...byTimestamp.values()].sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
    });
  });
  return merged;
}

function mergeAnalyticsRow(previous, next) {
  const positiveValue = (nextValue, previousValue) => Number(nextValue) > 0 ? nextValue : previousValue;
  return {
    ...previous,
    ...next,
    hr: positiveValue(next.hr, previous.hr),
    spo2: positiveValue(next.spo2, previous.spo2),
    temp: positiveValue(next.temp, previous.temp),
    sessionId: next.sessionId || previous.sessionId || "",
    manual_alert: Boolean(next.manual_alert || previous.manual_alert),
    button_pressed: Boolean(next.button_pressed || previous.button_pressed),
    button_press_count: Math.max(Number(previous.button_press_count || 0), Number(next.button_press_count || 0)),
  };
}

function isApplicationSessionId(deviceId, sessionId) {
  const value = String(sessionId || "");
  const prefix = `${deviceId}-`;
  if (!value.startsWith(prefix)) return false;
  const suffix = value.slice(prefix.length);
  return /^\d+$/.test(suffix) || suffix.startsWith("session-");
}

function hasSessionBoundary(activityLogs, deviceId, previousTimestamp, currentTimestamp) {
  return (activityLogs || []).some((log) => {
    if (log.deviceId !== deviceId) return false;
    const timestamp = Number(log.timestamp || 0);
    const status = String(log.status || "").toLowerCase();
    if (log.type === "session_status") {
      // A terminal decision is timestamped at the final live reading. It
      // ends that reading's session, so it must split the next row, not the
      // row carrying the same timestamp (which caused reloads to create a
      // one-reading duplicate session).
      return isTerminalSessionStatus(status)
        && timestamp >= previousTimestamp
        && timestamp < currentTimestamp;
    }
    // An online event belongs to the first row of the new session.
    return log.type === "status"
      && status === "online"
      && timestamp > previousTimestamp
      && timestamp <= currentTimestamp;
  });
}

function sessionStartFromId(sessionId) {
  const match = /-session-(\d+)/.exec(String(sessionId || ""));
  return match ? Number(match[1]) : 0;
}

function sessionIdForTimestamp(deviceId, rows, timestamp, activityLogs = []) {
  const sortedRows = [...(rows || [])]
    .filter((row) => Number(row.timestamp || 0) > 0)
    .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
  let sessionStart = 0;
  let currentSessionId = "";
  for (let index = 0; index < sortedRows.length; index++) {
    const row = sortedRows[index];
    const previous = sortedRows[index - 1];
    const gap = Number(row.timestamp) - Number(previous?.timestamp || 0);
    const hasRawSessionId = Boolean(row.sessionId);
    const rowSessionId = sessionIdForAnalyticsRow(deviceId, row, hasRawSessionId);
    const explicitSessionChanged = Boolean(
      rowSessionId
      && !isApplicationSessionId(deviceId, row.sessionId)
      && currentSessionId
      && rowSessionId !== currentSessionId,
    );
    const lifecycleBoundary = index > 0 && hasSessionBoundary(activityLogs, deviceId, Number(previous?.timestamp || 0), Number(row.timestamp));
    if (index === 0 || gap > SESSION_GAP_MS || lifecycleBoundary || explicitSessionChanged) {
      sessionStart = Number(sortedRows[index].timestamp);
      currentSessionId = rowSessionId && !isApplicationSessionId(deviceId, row.sessionId)
        ? rowSessionId
        : createSessionId(deviceId, sessionStart);
    } else if (rowSessionId && !isApplicationSessionId(deviceId, row.sessionId)) {
      currentSessionId = rowSessionId;
    }
    if (Number(sortedRows[index].timestamp) >= Number(timestamp)) break;
  }
  return currentSessionId || (sessionStart > 0 ? createSessionId(deviceId, sessionStart) : createSessionId(deviceId, timestamp));
}

// latestAnalyticsMiner — builds a minimal miner object from the last analytics row for a device
function latestAnalyticsMiner(rows, timeoutMs) {
  const latest = rows?.at(-1);
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

export function buildHistorySummariesForDevice(deviceId, rows, miner, thresholds, activityLogs = []) {
  const sortedRows = [...(rows || [])]
    .filter((row) => Number(row.timestamp || 0) > 0)
    .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
  if (sortedRows.length === 0) return { healthLogs: {}, miningSessions: {} };

  const normalizedRows = sortedRows.map((row) => ({
    ...row,
    sessionId: sessionIdForTimestamp(deviceId, sortedRows, Number(row.timestamp), activityLogs),
  }));

  const groups = normalizedRows.reduce((sessions, row) => {
    const current = sessions.at(-1);
    const previous = current?.at(-1);
    const currentSessionId = current?.[0]?.sessionId || "";
    const rowSessionId = row.sessionId || "";
    const legacyRowSessionIds = isPerReadingSessionId(deviceId, current?.[0]) && isPerReadingSessionId(deviceId, row);
    const sessionChanged = Boolean(current && currentSessionId && rowSessionId && currentSessionId !== rowSessionId && !legacyRowSessionIds);
    if (!current || sessionChanged || Number(row.timestamp || 0) - Number(previous?.timestamp || 0) > SESSION_GAP_MS) {
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
    const last = sessionRows.at(-1);
    const id = String(first.timestamp);
    const sessionId = first.sessionId || `${deviceId}-${id}`;
    const counts = uniquePressCounts(sessionRows);
    const maxCount = Math.max(...counts, 0);
    const minCount = Math.min(...counts, maxCount);
    const firstCountIsPress = sessionRows.some((row) => {
      const count = Number(row.button_press_count ?? row.buttonPressCount ?? 0);
      return count === minCount && count > 0 && row.manual_alert;
    });
    const firstPressBonus = firstCountIsPress ? 1 : 0;
    const counterPresses = counts.length ? Math.max(0, maxCount - minCount + firstPressBonus) : 0;
    const activationRows = sessionRows.filter((row, index, all) => row.manual_alert && !all[index - 1]?.manual_alert);
    const manualPressCount = Math.max(counterPresses, activationRows.length);
    const avgHr = averageReading(sessionRows, "hr");
    const avgSpo2 = averageReading(sessionRows, "spo2");
    const avgTemp = averageReading(sessionRows, "temp");
    const hrValues = sessionRows.map((row) => Number(row.hr || 0)).filter((value) => value > 0);
    const spo2Values = sessionRows.map((row) => Number(row.spo2 || 0)).filter((value) => value > 0);
    const tempValues = sessionRows.map((row) => Number(row.temp || 0)).filter((value) => value > 0);
    const alertCount = Math.max(
      countVitalAlertsInRows(sessionRows, thresholds),
      countVitalAlertLogs(activityLogs, deviceId, Number(first.timestamp), Number(last.timestamp)),
    );
    const payload = {
      id,
      sessionId,
      deviceId,
      miner: miner?.name || deviceId,
      location: miner?.location || "Unassigned",
      startTimestamp: Number(first.timestamp),
      endTimestamp: Number(last.timestamp),
      readingCount: sessionRows.length,
      avgHr,
      avgSpo2,
      avgTemp,
      hrMin: hrValues.length ? Math.min(...hrValues) : 0,
      hrMax: hrValues.length ? Math.max(...hrValues) : 0,
      spo2Min: spo2Values.length ? Math.min(...spo2Values) : 0,
      spo2Max: spo2Values.length ? Math.max(...spo2Values) : 0,
      tempMin: tempValues.length ? Math.min(...tempValues) : 0,
      tempMax: tempValues.length ? Math.max(...tempValues) : 0,
      manualPressCount,
      alertCount,
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

function isPerReadingSessionId(deviceId, row) {
  const timestamp = Number(row?.timestamp || 0);
  return Boolean(timestamp && row?.sessionId && row.sessionId === `${deviceId}-${timestamp}`);
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

  const existing = next[deviceId] || { hr: [], spo2: [], temp: [] };
  const lastTimestamp = Math.max(
    Number(existing.hr.at(-1)?.timestamp || 0),
    Number(existing.spo2.at(-1)?.timestamp || 0),
    Number((existing.temp || []).at(-1)?.timestamp || 0),
  );
  if (timestamp <= lastTimestamp) return false;

  // Live monitoring is session-scoped. Do not carry yesterday's last 30 points
  // into a newly resumed session after the device has been offline.
  const cur = timestamp - lastTimestamp > SESSION_GAP_MS
    ? { hr: [], spo2: [], temp: [] }
    : existing;
  if (lastTimestamp > 0 && timestamp - lastTimestamp < LIVE_SAMPLE_DEDUPE_MS) return false;

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
    .map(([id, row]) => {
      const rawReading = row?.reading ?? row?.readingValue ?? row?.value ?? null;
      return {
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
        reading: toNullableReading(rawReading),
        readingValue: rawReading,
        unit: row?.unit || row?.readingUnit || "",
        timestamp: normalizeTimestamp(row?.timestamp) || Date.now(),
      };
    })
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_ACTIVITY_LOGS);
}

function sessionIdForAnalyticsRow(deviceId, row, hasRawSessionId) {
  if (isPerReadingSessionId(deviceId, row)) return "";
  if (!hasRawSessionId) return "";
  return canonicalSessionId(deviceId, row.sessionId, row.timestamp);
}

function toNullableReading(value) {
  if (value === null || value === undefined || value === "") return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function activityLogKey(log) {
  if (log.type === "manual_alert") {
    return `${log.type}:${log.deviceId}:${log.buttonPressCount || log.button_press_count || 0}`;
  }
  return `${log.type}:${log.deviceId}:${log.status || ""}:${log.sessionId || Math.floor(Number(log.timestamp || 0) / 60000)}`;
}

function promptMatchesActivityStatus(prompt, logs) {
  const promptSessionId = canonicalSessionId(prompt.deviceId, prompt.sessionId, prompt.lastSeen);
  return (logs || []).some((log) => (
    log.deviceId === prompt.deviceId
    && log.type === "session_status"
    && isTerminalSessionStatus(log.status)
    && log.sessionId
    && canonicalSessionId(prompt.deviceId, log.sessionId, prompt.lastSeen) === promptSessionId
  ));
}

function promptMatchesStoredStatus(prompt, storedSessions) {
  const promptSessionId = canonicalSessionId(prompt.deviceId, prompt.sessionId, prompt.lastSeen);
  return (storedSessions || []).some((row) => (
    row.sessionId
    && canonicalSessionId(prompt.deviceId, row.sessionId, prompt.lastSeen) === promptSessionId
    && isTerminalSessionStatus(row.status)
  ));
}

function addImmediateActivityLog(setActivityLogs, event, id) {
  const localEvent = { ...event, id };
  setActivityLogs((current) => [
    localEvent,
    ...current.filter((log) => activityLogKey(log) !== activityLogKey(localEvent)),
  ].sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0)).slice(0, MAX_ACTIVITY_LOGS));
}

// buildStatusLog — builds an activity log entry when a miner transitions between online/offline
// isConcerningState — true when a miner is in a state worth alarming about if it
// drops offline (manual alert, no chest contact, SpO2 critical, or temperature high).
// Used to tell a normal session-end apart from a possible emergency disconnect.
function isConcerningState(miner, thresholds) {
  if (!miner?.active) return false;
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
function buildStatusLog(miner, previousStatus, sessionId = "") {
  if (miner.active) {
    return {
      deviceId: miner.id,
      sessionId,
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
    sessionId,
    miner: miner.name,
    type: "status",
    status: "offline",
    // The timeout itself is informational. The operator's session decision is
    // recorded separately; this prevents a normal completed session from being
    // stored as a critical alert just because the last live state was concerning.
    severity: "info",
    title: offlineStatusTitle(concerning, explicitlyCompleted),
    detail: offlineStatusDetail(miner, concerning, explicitlyCompleted, previousStatus),
    timestamp: miner.lastSeen?.getTime?.() || Date.now(),
  };
}

function offlineStatusTitle(concerning, explicitlyCompleted) {
  if (concerning) return "Device lost during alert";
  if (explicitlyCompleted) return "Session completed";
  return "Connection lost";
}

function offlineStatusDetail(miner, concerning, explicitlyCompleted, status = "online") {
  if (concerning) return `${miner.name} went offline while a critical condition was active \u2014 verify the miner immediately.`;
  if (explicitlyCompleted) return `${miner.name} reported an explicit session end after being ${status}.`;
  return `${miner.name} stopped sending live data after being ${status}. No explicit session-end signal was received.`;
}

// buildVitalLogs — generates activity log entries for out-of-range HR, SpO2, temperature, and manual alerts
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
      reading: Number(miner.hr),
      unit: "bpm",
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
      reading: Number(miner.spo2),
      unit: "%",
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
      reading: Number(miner.temp),
      unit: "°C",
      title: `Temperature ${tempStatus.toLowerCase()}`,
      detail: `${miner.name} recorded temperature ${miner.temp}°C at ${formatSystemTimestamp(miner.lastSeen)}.`,
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
      reading: Number(miner.temp),
      unit: "°C",
      title: "Temperature low",
      detail: `${miner.name} recorded temperature ${miner.temp}°C at ${formatSystemTimestamp(miner.lastSeen)}.`,
      timestamp: miner.lastSeen?.getTime?.() || Date.now(),
    });
  }

  return rows;
}

// useMinerSystem — main data hook: subscribes to Firebase /devices, /analytics, and /activityLogs;
// manages live chart data, stale detection interval, threshold state, and localStorage persistence
export function useMinerSystem(enabled) {
  const stored = readStoredSystem();
  const [miners, setMiners] = useState(() => (firebaseConfigured ? [] : stored?.miners || []));
  const [liveData, setLiveData] = useState({});
  const [analyticsData, setAnalyticsData] = useState({});
  const [sessionData, setSessionData] = useState({});
  const [activityLogs, setActivityLogs] = useState([]);
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);
  const [pollingInterval, setPollingInterval] = useState(stored?.pollingInterval || 5);
  const staleSeconds = DEFAULT_STALE_SECONDS;
  const [usingRealtime, setUsingRealtime] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [sessionPrompts, setSessionPrompts] = useState([]);
  const minersRef = useRef(miners);
  const lastTrimRef = useRef(0);
  const persistedHistoryRef = useRef({});
  const hasDeviceSnapshotRef = useRef(false);
  const previousStatusRef = useRef({});
  const knownStatusDeviceIdsRef = useRef(new Set());
  const emittedEventRef = useRef(new Set());
  const realtimeAnalyticsRef = useRef({});
  const historicalAnalyticsRef = useRef({});
  const historicalReadingKeysRef = useRef(new Set());
  const historicalReadingSessionRef = useRef({});
  const historicalSummaryTimestampRef = useRef({});
  const historicalReadyRef = useRef(false);
  const activityLogsRef = useRef([]);
  const sessionDataRef = useRef({});
  const thresholdsRef = useRef(thresholds);
  const staleSecondsRef = useRef(staleSeconds);
  const metadataOverridesRef = useRef({});
  const archivedDeviceIdsRef = useRef(new Set());
  const lastConcernRef = useRef({}); // { deviceId: bool } — concern state at last active reading
  const promptedSessionRef = useRef(new Set());
  const activeSessionIdRef = useRef({});
  const sessionDeviceKey = [...new Set([
    ...miners.map((miner) => miner.id),
    ...Object.keys(analyticsData || {}),
  ])].filter(Boolean).sort((a, b) => a.localeCompare(b)).join(",");

  const sharedSessionIdFor = useCallback((deviceId, timestamp) => {
    const stored = (sessionDataRef.current[deviceId] || [])
      .filter((row) => !isTerminalSessionStatus(row.status))
      .filter((row) => {
        const start = Number(row.startTimestamp || row.timestamp || 0);
        const end = Number(row.endTimestamp || row.statusTimestamp || start);
        return start > 0 && timestamp >= start && timestamp <= end + SESSION_GAP_MS;
      })
      .sort((a, b) => Number(a.startTimestamp || a.timestamp || 0) - Number(b.startTimestamp || b.timestamp || 0));
    const storedSessionId = stored[0]?.sessionId
      ? canonicalSessionId(deviceId, stored[0].sessionId, stored[0].startTimestamp)
      : "";

    const rows = mergeAnalyticsData(
      { [deviceId]: historicalAnalyticsRef.current[deviceId] || [] },
      { [deviceId]: realtimeAnalyticsRef.current[deviceId] || [] },
    )[deviceId] || [];
    const timelineSessionId = sessionIdForTimestamp(deviceId, rows, timestamp, activityLogsRef.current);
    if (!storedSessionId) return timelineSessionId;
    if (!timelineSessionId || sessionStartFromId(storedSessionId) <= sessionStartFromId(timelineSessionId)) return storedSessionId;
    return timelineSessionId;
  }, []);

  const queueSessionPrompt = useCallback((miner, sessionId = "") => {
    const lastSeen = miner.lastSeen?.getTime?.() || Number(miner.lastSeen) || 0;
    const resolvedSessionId = sharedSessionIdFor(miner.id, lastSeen)
      || canonicalSessionId(miner.id, sessionId, lastSeen)
      || createSessionId(miner.id, lastSeen);
    const key = `${miner.id}:${resolvedSessionId || lastSeen}`;
    if (promptedSessionRef.current.has(key)) return;
    promptedSessionRef.current.add(key);
    setSessionPrompts((current) => current.some((prompt) => prompt.key === key)
      ? current
      : [...current, { key, deviceId: miner.id, name: miner.name, lastSeen, sessionId: resolvedSessionId }]);
  }, [sharedSessionIdFor]);

  const resolveSessionStatus = async (prompt, sessionStatus) => {
    setSessionPrompts((current) => current.filter((item) => item.key !== prompt.key));
    const sessionTimestamp = Number(prompt.lastSeen) || Date.now();
    const sessionId = canonicalSessionId(
      prompt.deviceId,
      prompt.sessionId || sessionIdForTimestamp(prompt.deviceId, analyticsData[prompt.deviceId], sessionTimestamp),
      sessionTimestamp,
    );
    let statusResult;
    try {
      // This is an atomic first-terminal-status-wins operation. Every browser
      // may display the prompt, but only one can finalize the shared session.
      statusResult = await updateSessionStatus(prompt.deviceId, sessionId, sessionStatus, sessionTimestamp);
    } catch (error) {
      handleAsyncError(setConnectionError, error, "Saving session status");
      setSessionPrompts((current) => current.some((item) => item.key === prompt.key) ? current : [prompt, ...current]);
      return;
    }

    const effectiveStatus = statusResult?.status || sessionStatus;
    const sessionEvent = {
      id: `session-status-${prompt.deviceId}-${sessionTimestamp}`,
      deviceId: prompt.deviceId,
      sessionId,
      miner: prompt.name,
      type: "session_status",
      status: effectiveStatus,
      severity: effectiveStatus === "interrupted" ? "warning" : "info",
      title: `Session marked ${effectiveStatus}`,
      detail: `${prompt.name} session was marked ${effectiveStatus} by the operator after live data stopped.`,
      timestamp: sessionTimestamp,
    };
    // Update the local activity stream immediately. This gives the session log
    // an exact end-timestamp status before the Firebase subscription refreshes.
    setActivityLogs((current) => [
      sessionEvent,
      ...current.filter((log) => !(log.deviceId === sessionEvent.deviceId && log.type === "session_status" && Number(log.timestamp) === sessionTimestamp)),
    ].slice(0, MAX_ACTIVITY_LOGS));
    setMiners((current) => current.map((miner) => (
      miner.id === prompt.deviceId ? { ...miner, sessionStatus: effectiveStatus } : miner
    )));
    minersRef.current = minersRef.current.map((miner) => (
      miner.id === prompt.deviceId ? { ...miner, sessionStatus: effectiveStatus } : miner
    ));

    // Reflect the operator decision immediately, even before Firestore sends
    // the updated session document back through its subscription.
    setSessionData((current) => {
      const rows = current[prompt.deviceId] || [];
      let matched = false;
      const updated = rows.map((row) => {
        if (row.sessionId !== sessionId) return row;
        matched = true;
        return { ...row, status: effectiveStatus, statusTimestamp: sessionTimestamp };
      });
      if (matched) return { ...current, [prompt.deviceId]: updated };
      return {
        ...current,
        [prompt.deviceId]: [
          ...rows,
          {
            sessionId,
            startTimestamp: sessionTimestamp,
            endTimestamp: sessionTimestamp,
            status: effectiveStatus,
            statusTimestamp: sessionTimestamp,
          },
        ],
      };
    });

    if (statusResult?.accepted !== false) {
      try {
        await updateDevice(prompt.deviceId, { sessionStatus: effectiveStatus });
      } catch (error) {
        handleAsyncError(setConnectionError, error, "Updating device session status");
      }
      try {
        await writeActivityLog(sessionEvent);
      } catch (error) {
        handleAsyncError(setConnectionError, error, "Saving session status event");
      }
    }
  };

  useEffect(() => {
    minersRef.current = miners;
  }, [miners]);

  const updateMiners = (updater) => {
    setMiners((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      const nextIds = new Set(next.map((miner) => miner.id));

      prev.forEach((miner) => {
        if (!nextIds.has(miner.id)) {
          archivedDeviceIdsRef.current.add(miner.id);
        }
      });

      next.forEach((miner) => {
        const previous = findMinerById(prev, miner.id);
        if (!previous || previous.name !== miner.name || previous.location !== miner.location) {
          metadataOverridesRef.current[miner.id] = {
            name: miner.name,
            location: miner.location,
          };
        }
        archivedDeviceIdsRef.current.delete(miner.id);
      });

      prev.forEach((miner) => {
        if (!nextIds.has(miner.id)) {
          delete previousStatusRef.current[miner.id];
          knownStatusDeviceIdsRef.current.delete(miner.id);
        }
      });

      minersRef.current = next;
      return next;
    });
  };

  // recordActivityLog — persists an operator activity and updates the local feed
  // immediately, so registry changes are visible in notifications without waiting
  // for the next activity-log subscription snapshot.
  const recordActivityLog = async (event = {}) => {
    const timestamp = Number(event.timestamp) || Date.now();
    const payload = {
      ...event,
      id: event.id || `operator-${event.type || "activity"}-${event.deviceId || "system"}-${timestamp}`,
      timestamp,
    };
    await writeActivityLog(payload);
    setActivityLogs((current) => [
      payload,
      ...current.filter((log) => log.id !== payload.id),
    ].sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0)).slice(0, MAX_ACTIVITY_LOGS));
    return payload;
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
      const nextKey = [...new Set(deviceIds.filter(Boolean))].sort((a, b) => a.localeCompare(b)).join(",");
      if (!nextKey || nextKey === historicalDeviceKey) return;
      historicalDeviceKey = nextKey;
      stopHistoricalReadings?.();
      stopHistoricalReadings = subscribeToHistoricalReadings(
        nextKey.split(","),
        (value) => {
          const mappedHistorical = mapHistoricalAnalytics(value);
          processHistoricalSnapshot(mappedHistorical, {
            activeSessionIdRef,
            activityLogsRef,
            historicalAnalyticsRef,
            historicalReadyRef,
            historicalSummaryTimestampRef,
            minersRef,
            realtimeAnalyticsRef,
            setAnalyticsData,
            setConnectionError,
            sharedSessionIdFor,
            staleSecondsRef,
            thresholdsRef,
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
          // RTDB may contain only metadata/offline devices while the actual
          // readings live in Firestore. Keep the historical subscription
          // alive even when there is no current live device to display.
          subscribeHistoricalReadings(Object.keys(value || {}));
          setUsingRealtime(Boolean(value && Object.keys(value).length > 0));
          setMiners([]);
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
          setMiners((previous) => (areMinersEquivalent(previous, realtimeMiners) ? previous : realtimeMiners));
        minersRef.current = realtimeMiners;
        subscribeHistoricalReadings(realtimeMiners.map((miner) => miner.id));

        processRealtimeMiners(realtimeMiners, value, {
          activeSessionIdRef,
          emittedEventRef,
          knownStatusDeviceIdsRef,
          lastConcernRef,
          previousStatusRef,
          queueSessionPrompt,
          setActivityLogs,
          setConnectionError,
          sharedSessionIdFor,
          thresholdsRef,
          updateDeviceStatus,
        });
        setLiveData((prev) => appendRealtimeSamples(prev, realtimeMiners));

      },
      (message) => {
        setConnectionError(message);
      },
    );

    const unsubscribeAnalytics = subscribeToAllAnalytics(
      (value) => {
        setConnectionError("");
        const mappedAnalytics = mapRealtimeAnalytics(value);
        processRealtimeAnalyticsSnapshot(mappedAnalytics, {
          activeSessionIdRef,
          activityLogsRef,
          archivedDeviceIdsRef,
          hasDeviceSnapshotRef,
          historicalAnalyticsRef,
          historicalReadingKeysRef,
          historicalReadingSessionRef,
          historicalReadyRef,
          lastTrimRef,
          metadataOverridesRef,
          minersRef,
          persistedHistoryRef,
          setMiners,
          realtimeAnalyticsRef,
          setAnalyticsData,
          setConnectionError,
          sharedSessionIdFor,
          staleSecondsRef,
          subscribeHistoricalReadings,
          thresholdsRef,
        });
      },
      (message) => setConnectionError(message),
    );

    const unsubscribeActivity = subscribeToActivityLogs(
      (value) => {
        setConnectionError("");
        const mapped = mapActivityLogs(value);
        activityLogsRef.current = mapped;
        setActivityLogs(mapped);
        setSessionPrompts((current) => {
          const next = filterActivityPrompts(current, mapped);
          return next.length === current.length ? current : next;
        });
      },
      (message) => setConnectionError(message),
    );

    return () => {
      unsubscribeDevices();
      unsubscribeAnalytics();
      unsubscribeActivity();
      stopHistoricalReadings?.();
    };
  }, [enabled, queueSessionPrompt, sharedSessionIdFor]);

  useEffect(() => {
    if (!enabled || !firebaseConfigured || !sessionDeviceKey) {
      return undefined;
    }

    return subscribeToSessionSummaries(
      sessionDeviceKey.split(","),
      (value) => {
        const mapped = mapSessionSummaries(value);
        sessionDataRef.current = mapped;
        setSessionData(mapped);
        setSessionPrompts((current) => {
          const next = filterStoredPrompts(current, mapped);
          return next.length === current.length ? current : next;
        });
      },
      (message) => setConnectionError(message),
    );
  }, [enabled, sessionDeviceKey]);

  useEffect(() => {
    if (!enabled) return undefined;

    const interval = window.setInterval(() => {
      const staleMiners = staleMinersFrom(minersRef.current, staleSecondsRef.current);
      if (staleMiners.length === 0) return;
      processStaleMiners(staleMiners, {
        activeSessionIdRef,
        emittedEventRef,
        minersRef,
        previousStatusRef,
        queueSessionPrompt,
        setMiners,
        setConnectionError,
        sharedSessionIdFor,
        staleSecondsRef,
        thresholdsRef,
        updateDeviceStatus,
      });
    }, STALE_CHECK_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [enabled, queueSessionPrompt, sharedSessionIdFor]);

  return {
    miners,
    setMiners: updateMiners,
    recordActivityLog,
    liveData,
    analyticsData,
    sessionData,
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
      // Delete Firestore documents through each known device path. This uses
      // the deployed per-device delete rule and avoids a collection-group
      // discovery query that many Firebase projects reject.
      const deviceIds = [...new Set([...Object.keys(analyticsData), ...minersRef.current.map((miner) => miner.id)])];
      await clearHealthLogsRemote(deviceIds);
      setAnalyticsData({});
      setSessionData({});
      setLiveData({});
      realtimeAnalyticsRef.current = {};
      historicalAnalyticsRef.current = {};
      historicalReadingKeysRef.current.clear();
      historicalReadingSessionRef.current = {};
      persistedHistoryRef.current = {};
      historicalSummaryTimestampRef.current = {};
      historicalReadyRef.current = false;
    },
  };
}
