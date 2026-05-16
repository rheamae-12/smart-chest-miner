import { onValue, ref, remove, set, update } from "firebase/database";
import { db, firebaseDatabaseSecret, firebaseDatabaseUrl } from "./config";

function noopSubscribe(onError) {
  onError?.("Firebase is not configured. Add VITE_FIREBASE_* values to .env.");
  return () => {};
}

export function subscribeToDevices(onData, onError) {
  const stopRestPolling = subscribeToDevicesRest(onData, onError);
  if (!db) return stopRestPolling;

  const unsubscribeSdk = onValue(
    ref(db, "devices"),
    (snapshot) => onData(snapshot.val() || {}),
    (error) => onError?.(`SDK read failed, using REST fallback: ${error.message}`),
  );

  return () => {
    unsubscribeSdk();
    stopRestPolling();
  };
}

export function subscribeToDeviceLive(deviceId, onData, onError) {
  if (!db) return noopSubscribe(onError);
  return onValue(
    ref(db, `devices/${deviceId}/live`),
    (snapshot) => onData(snapshot.val()),
    (error) => onError?.(error.message),
  );
}

export function subscribeToDeviceStatus(deviceId, onData, onError) {
  if (!db) return noopSubscribe(onError);
  return onValue(
    ref(db, `devices/${deviceId}/status`),
    (snapshot) => onData(snapshot.val() || "offline"),
    (error) => onError?.(error.message),
  );
}

export function subscribeToAnalytics(deviceId, onData, onError) {
  if (!db) return noopSubscribe(onError);
  return onValue(
    ref(db, `analytics/${deviceId}`),
    (snapshot) => {
      const value = snapshot.val() || {};
      onData(Object.values(value).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)));
    },
    (error) => onError?.(error.message),
  );
}

export function subscribeToAllAnalytics(onData, onError) {
  const stopRestPolling = subscribeToAnalyticsRest(onData, onError);
  if (!db) return stopRestPolling;

  const unsubscribeSdk = onValue(
    ref(db, "analytics"),
    (snapshot) => onData(snapshot.val() || {}),
    (error) => onError?.(`SDK analytics read failed, using REST fallback: ${error.message}`),
  );

  return () => {
    unsubscribeSdk();
    stopRestPolling();
  };
}

function firebaseRestUrl(path) {
  if (!firebaseDatabaseUrl || !firebaseDatabaseSecret) return "";
  if (firebaseDatabaseSecret.includes("YOUR_")) return "";
  const base = firebaseDatabaseUrl.replace(/\/$/, "");
  return `${base}/${path}.json?auth=${encodeURIComponent(firebaseDatabaseSecret)}`;
}

function pollFirebasePath(path, onData, onError, intervalMs = 2000) {
  const url = firebaseRestUrl(path);
  if (!url) {
    onError?.("Firebase REST fallback is missing VITE_FIREBASE_DATABASE_URL or VITE_FIREBASE_DATABASE_SECRET.");
    return () => {};
  }

  let stopped = false;
  const load = async () => {
    try {
      const response = await fetch(url);
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

export async function trimAnalyticsHistory(deviceId, keepCount = 120) {
  const url = firebaseRestUrl(`analytics/${deviceId}`);
  if (!url) return false;

  const response = await fetch(url);
  if (!response.ok) return false;

  const rows = (await response.json()) || {};
  const keysToDelete = Object.keys(rows)
    .sort((a, b) => Number(a) - Number(b))
    .slice(0, Math.max(0, Object.keys(rows).length - keepCount));

  if (keysToDelete.length === 0) return true;

  const updates = Object.fromEntries(keysToDelete.map((key) => [key, null]));
  const patchResponse = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });

  return patchResponse.ok;
}

export async function registerDevice(device) {
  if (!db) return false;
  await set(ref(db, `devices/${device.id}`), {
    name: device.name,
    location: device.location,
    active: device.active ?? false,
    status: device.status || (device.active ? "online" : "offline"),
    lastSeen: Number(device.lastSeen) || Date.now(),
    live: {
      heartRate: device.hr || 0,
      spo2: device.spo2 || 0,
      timestamp: Number(device.lastSeen) || Date.now(),
      finger: device.finger ?? false,
      manual_alert: device.manual_alert ?? false,
    },
  });
  return true;
}

export async function updateDevice(deviceId, patch) {
  if (!db) return false;
  await update(ref(db, `devices/${deviceId}`), patch);
  return true;
}

export async function removeDevice(deviceId) {
  if (!db) return false;
  await remove(ref(db, `devices/${deviceId}`));
  return true;
}

export async function writeAnalyticsSnapshot(deviceId, avgHR, avgSpo2) {
  if (!db || !deviceId) return false;
  const timestamp = Date.now();
  await set(ref(db, `analytics/${deviceId}/${timestamp}`), {
    heartRate: avgHR,
    hr: avgHR,
    spo2: avgSpo2,
    timestamp,
  });
  return true;
}
