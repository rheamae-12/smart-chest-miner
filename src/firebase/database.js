import { get, onValue, push, ref, remove, serverTimestamp, set, update } from "firebase/database";
import { auth, db, firebaseDatabaseUrl } from "./config";

// restAuthParam — returns "&auth=<idToken>" for the signed-in user so the REST
// fallback obeys the same security rules as the SDK. Never uses an admin secret.
async function restAuthParam() {
  try {
    const token = await auth?.currentUser?.getIdToken?.();
    return token ? `&auth=${encodeURIComponent(token)}` : "";
  } catch {
    return "";
  }
}

export function subscribeToDevices(onData, onError) {
  if (!db) return subscribeToDevicesRest(onData, onError);

  let stopRestPolling = null;

  const unsubscribeSdk = onValue(
    ref(db, "devices"),
    (snapshot) => onData(snapshot.val() || {}),
    (error) => {
      onError?.(`SDK read failed, using REST fallback: ${error.message}`);
      stopRestPolling ||= subscribeToDevicesRest(onData, onError);
    },
  );

  return () => {
    unsubscribeSdk();
    stopRestPolling?.();
  };
}

// testFirebaseConnection — performs one read-only database check for the
// Settings page. It deliberately reads the devices collection only and never
// writes test records or changes device state.
export async function testFirebaseConnection() {
  if (db) {
    const snapshot = await get(ref(db, "devices"));
    const devices = snapshot.val() || {};
    return {
      connected: true,
      source: "Realtime Database SDK",
      devices,
    };
  }

  const url = firebaseRestUrl("devices");
  if (!url) throw new Error("Firebase is not configured. Add VITE_FIREBASE_* values to .env.");

  const response = await fetch(`${url}?print=pretty${await restAuthParam()}`);
  if (!response.ok) throw new Error(`Firebase device check failed: HTTP ${response.status}`);
  return {
    connected: true,
    source: "Realtime Database REST",
    devices: (await response.json()) || {},
  };
}

export function subscribeToAllAnalytics(onData, onError) {
  if (!db) return subscribeToAnalyticsRest(onData, onError);

  let stopRestPolling = null;

  const unsubscribeSdk = onValue(
    ref(db, "analytics"),
    (snapshot) => onData(snapshot.val() || {}),
    (error) => {
      onError?.(`SDK analytics read failed, using REST fallback: ${error.message}`);
      stopRestPolling ||= subscribeToAnalyticsRest(onData, onError);
    },
  );

  return () => {
    unsubscribeSdk();
    stopRestPolling?.();
  };
}

export function subscribeToActivityLogs(onData, onError) {
  if (!db) return subscribeToActivityLogsRest(onData, onError);

  let stopRestPolling = null;

  const unsubscribeSdk = onValue(
    ref(db, "activityLogs"),
    (snapshot) => onData(snapshot.val() || {}),
    (error) => {
      onError?.(`SDK activity read failed, using REST fallback: ${error.message}`);
      stopRestPolling ||= subscribeToActivityLogsRest(onData, onError);
    },
  );

  return () => {
    unsubscribeSdk();
    stopRestPolling?.();
  };
}

export function subscribeToWifiConfigurations(onData, onError) {
  if (!db) return pollFirebasePath("wifiConfigurations", onData, onError, 3000);
  return onValue(
    ref(db, "wifiConfigurations"),
    (snapshot) => onData(snapshot.val() || {}),
    (error) => onError?.(error.message),
  );
}

export function subscribeToWifiConnectionHistory(onData, onError) {
  if (!db) return pollFirebasePath("wifiConnectionHistory", onData, onError, 3000);
  return onValue(
    ref(db, "wifiConnectionHistory"),
    (snapshot) => onData(snapshot.val() || {}),
    (error) => onError?.(error.message),
  );
}

// firebaseRestUrl — builds the base `.json` REST URL for a path (no auth token).
// Auth is appended per-request via restAuthParam() so tokens stay fresh.
function firebaseRestUrl(path) {
  if (!firebaseDatabaseUrl) return "";
  const safePath = String(path)
    .split("/")
    .map((seg) => seg.replace(/\.\./g, "").trim())
    .filter(Boolean)
    .join("/");
  const base = firebaseDatabaseUrl.replace(/\/$/, "");
  return `${base}/${safePath}.json`;
}

function pollFirebasePath(path, onData, onError, intervalMs = 2000) {
  const url = firebaseRestUrl(path);
  if (!url) {
    onError?.("Firebase REST fallback is missing VITE_FIREBASE_DATABASE_URL.");
    return () => {};
  }

  let stopped = false;
  const load = async () => {
    try {
      const response = await fetch(`${url}?print=pretty${await restAuthParam()}`);
      if (!response.ok) {
        throw new Error(`REST ${path} failed: HTTP ${response.status}`);
      }
      const value = await response.json();
      if (!stopped) onData(value || {});
    } catch (error) {
      if (!stopped) onError?.(error.message);
    }
  };

  load();
  const interval = window.setInterval(load, intervalMs);
  return () => {
    stopped = true;
    window.clearInterval(interval);
  };
}

function subscribeToDevicesRest(onData, onError) {
  return pollFirebasePath("devices", onData, onError);
}

function subscribeToAnalyticsRest(onData, onError) {
  return pollFirebasePath("analytics", onData, onError);
}

function subscribeToActivityLogsRest(onData, onError) {
  return pollFirebasePath("activityLogs", onData, onError, 3000);
}

async function writeFirebasePath(path, method, payload) {
  const url = firebaseRestUrl(path);
  if (!url) return false;

  const response = await fetch(`${url}?${(await restAuthParam()).replace(/^&/, "")}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`REST ${method} ${path} failed: HTTP ${response.status}`);
  }

  return true;
}

async function writeWithSdkFallback(sdkWrite, path, method, payload) {
  if (!db) return writeFirebasePath(path, method, payload);

  try {
    await sdkWrite();
    return true;
  } catch (error) {
    const savedWithRest = await writeFirebasePath(path, method, payload);
    if (savedWithRest) return true;
    throw error;
  }
}

async function updateMultiPath(updates) {
  return writeWithSdkFallback(
    () => update(ref(db), updates),
    "",
    "PATCH",
    updates,
  );
}

export async function trimAnalyticsHistory(deviceId, keepCount = 120) {
  const url = firebaseRestUrl(`analytics/${deviceId}`);
  if (!url) return false;

  const authParam = await restAuthParam();
  const response = await fetch(`${url}?shallow=true${authParam}`);
  if (!response.ok) return false;

  const rows = (await response.json()) || {};
  const keysToDelete = Object.keys(rows)
    .sort((a, b) => Number(a) - Number(b))
    .slice(0, Math.max(0, Object.keys(rows).length - keepCount));

  if (keysToDelete.length === 0) return true;

  const updates = Object.fromEntries(keysToDelete.map((key) => [key, null]));
  const patchResponse = await fetch(`${url}?${authParam.replace(/^&/, "")}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });

  return patchResponse.ok;
}

export async function registerDevice(device) {
  const timestamp = Date.now();
  const payload = {
    name: device.name,
    location: device.location,
    archived: false,
    deletedAt: null,
    active: device.active ?? false,
    status: device.status || (device.active ? "online" : "offline"),
    registeredAt: timestamp,
    lastSeen: Number(device.lastSeen) || 0,
    live: {
      heartRate: device.hr || 0,
      hr: device.hr || 0,
      spo2: device.spo2 || 0,
      temp: device.temp || 0,
      status: device.status || "offline",
      timestamp: Number(device.lastSeen) || 0,
      finger: device.finger ?? false,
      manual_alert: device.manual_alert ?? false,
      button_pressed: device.button_pressed ?? false,
      button_press_count: device.button_press_count ?? 0,
    },
  };

  return writeWithSdkFallback(
    () => set(ref(db, `devices/${device.id}`), payload),
    `devices/${device.id}`,
    "PUT",
    payload,
  );
}

export async function updateDevice(deviceId, patch) {
  return writeWithSdkFallback(
    () => update(ref(db, `devices/${deviceId}`), patch),
    `devices/${deviceId}`,
    "PATCH",
    patch,
  );
}

export async function updateDeviceStatus(deviceId, status, lastSeen = Date.now()) {
  const active = status === "online";
  const lastSeenMs = Number(lastSeen) || 0;
  const patch = {
    active,
    status,
    lastSeen: lastSeenMs,
  };

  if (!active) {
    Object.assign(patch, {
      live: {
        heartRate: 0,
        hr: 0,
        spo2: 0,
        temp: 0,
        status: "offline",
        timestamp: lastSeenMs,
        finger: false,
        manual_alert: false,
        button_pressed: false,
        button_press_count: 0,
        offlineAt: Date.now(),
      },
    });
  } else {
    Object.assign(patch, {
      "live/status": "online",
      "live/timestamp": lastSeenMs,
    });
  }

  return writeWithSdkFallback(
    () => update(ref(db, `devices/${deviceId}`), patch),
    `devices/${deviceId}`,
    "PATCH",
    patch,
  );
}

export async function removeDevice(deviceId) {
  const timestamp = Date.now();
  const patch = {
    archived: true,
    deletedAt: timestamp,
    active: false,
    status: "offline",
    live: {
      heartRate: 0,
      hr: 0,
      spo2: 0,
      temp: 0,
      status: "offline",
      timestamp,
      finger: false,
      manual_alert: false,
      button_pressed: false,
      button_press_count: 0,
      offlineAt: timestamp,
    },
  };

  return writeWithSdkFallback(
    () => update(ref(db, `devices/${deviceId}`), patch),
    `devices/${deviceId}`,
    "PATCH",
    patch,
  );
}

export async function writeActivityLog(event) {
  const timestamp = Number(event.timestamp) || Date.now();
  const payload = {
    deviceId: event.deviceId || "",
    miner: event.miner || event.deviceId || "Unknown miner",
    type: event.type || "activity",
    status: event.status || "",
    severity: event.severity || "info",
    title: event.title || "Miner activity",
    detail: event.detail || "",
    timestamp,
  };

  if (!db) return writeFirebasePath("activityLogs", "POST", payload);

  const row = push(ref(db, "activityLogs"));
  return writeWithSdkFallback(
    () => set(row, { ...payload, createdAt: serverTimestamp() }),
    "activityLogs",
    "POST",
    payload,
  );
}

export async function clearActivityLogs() {
  return writeWithSdkFallback(
    () => remove(ref(db, "activityLogs")),
    "activityLogs",
    "DELETE",
  );
}

export async function clearHealthLogs() {
  return updateMultiPath({
    analytics: null,
    healthLogs: null,
    miningSessions: null,
  });
}

export async function saveWifiConfiguration(deviceId, config, recordId = "") {
  const timestamp = Date.now();
  const id = recordId || `${deviceId}-${timestamp}`;
  const payload = {
    deviceId,
    ssid: config.ssid || "",
    password: config.password || "",
    security: config.security || "WPA2",
    applyOnNextBoot: config.applyOnNextBoot ?? true,
    status: "pending",
    createdAt: Number(config.createdAt) || timestamp,
    updatedAt: timestamp,
    sourceRecordId: id,
  };

  return updateMultiPath({
    [`wifiConfigurations/${deviceId}`]: payload,
    [`wifiConnectionHistory/${id}`]: { ...payload, id },
  });
}

export async function removeWifiConnection(record, removeDeviceQueue = false) {
  const updates = {
    [`wifiConnectionHistory/${record.id}`]: null,
  };

  if (removeDeviceQueue) {
    updates[`wifiConfigurations/${record.deviceId}`] = null;
  }

  return updateMultiPath(updates);
}

export async function saveHistorySummaries(deviceId, healthLogs = {}, miningSessions = {}) {
  if (!deviceId) return false;
  const updates = {};

  Object.entries(healthLogs || {}).forEach(([id, payload]) => {
    updates[`healthLogs/${deviceId}/${id}`] = payload;
  });

  Object.entries(miningSessions || {}).forEach(([id, payload]) => {
    updates[`miningSessions/${deviceId}/${id}`] = payload;
  });

  if (Object.keys(updates).length === 0) return true;
  return updateMultiPath(updates);
}
