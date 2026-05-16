import { onValue, ref, remove, set, update } from "firebase/database";
import { db } from "./config";

function noopSubscribe(onError) {
  onError?.("Firebase is not configured. Add VITE_FIREBASE_* values to .env.");
  return () => {};
}

export function subscribeToDevices(onData, onError) {
  if (!db) return noopSubscribe(onError);
  return onValue(
    ref(db, "devices"),
    (snapshot) => onData(snapshot.val() || {}),
    (error) => onError?.(error.message),
  );
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
  if (!db) return noopSubscribe(onError);
  return onValue(
    ref(db, "analytics"),
    (snapshot) => onData(snapshot.val() || {}),
    (error) => onError?.(error.message),
  );
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
