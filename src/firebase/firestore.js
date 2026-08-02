import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  limitToLast,
  onSnapshot,
  orderBy,
  runTransaction,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { firestoreDb } from "./config";
import { canonicalSessionId, isTerminalSessionStatus } from "../utils/sessionIds";

const HISTORY_READ_LIMIT = 5000;
const ACTIVITY_LOG_LIMIT = 500;

function safeDocumentId(value) {
  return String(value || "")
    .trim()
    .replace(/[\\/#?]/g, "_")
    .replaceAll("[", "_")
    .replaceAll("]", "_");
}

function readingDocumentId(deviceId, timestamp) {
  return `${safeDocumentId(deviceId)}-${Number(timestamp)}`;
}

export async function getUserProfile(uid) {
  if (!firestoreDb || !uid) return null;
  const snapshot = await getDoc(doc(firestoreDb, "users", uid));
  return snapshot.exists() ? snapshot.data() : null;
}

export async function saveUserProfile(uid, profile) {
  if (!firestoreDb || !uid) return false;
  await setDoc(
    doc(firestoreDb, "users", uid),
    {
      ...profile,
      updatedAt: serverTimestamp(),
      createdAt: profile.createdAt || serverTimestamp(),
    },
    { merge: true },
  );
  return true;
}

export async function updateUserProfile(uid, patch) {
  if (!firestoreDb || !uid) return false;
  await updateDoc(doc(firestoreDb, "users", uid), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
  return true;
}

export async function saveHistoricalReading(deviceId, reading, sessionId = "") {
  const timestamp = Number(reading?.timestamp || 0);
  if (!firestoreDb || !deviceId || timestamp <= 0) return false;

  await setDoc(
    doc(firestoreDb, "miners", deviceId, "readings", readingDocumentId(deviceId, timestamp)),
    {
      deviceId,
      sessionId: sessionId || reading.sessionId || "",
      timestamp,
      hr: Number(reading.hr || 0),
      spo2: Number(reading.spo2 || 0),
      temp: Number(reading.temp || 0),
      finger: reading.finger !== false,
      status: reading.status || "online",
      manual_alert: reading.manual_alert === true,
      button_pressed: reading.button_pressed === true,
      button_press_count: Number(reading.button_press_count || 0),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  return true;
}

export async function saveHistoricalReadings(deviceId, readings = []) {
  if (!firestoreDb || !deviceId) return false;
  const validRows = readings.filter((reading) => Number(reading?.timestamp || 0) > 0);
  if (validRows.length === 0) return true;

  // Firestore batches cap at 500 writes. Keep a lower ceiling so retries do
  // not create oversized requests when a device reconnects with a full cache.
  for (let start = 0; start < validRows.length; start += 400) {
    const batch = writeBatch(firestoreDb);
    validRows.slice(start, start + 400).forEach((reading) => {
      const timestamp = Number(reading.timestamp);
      batch.set(
        doc(firestoreDb, "miners", deviceId, "readings", readingDocumentId(deviceId, timestamp)),
        {
          deviceId,
          sessionId: reading.sessionId || "",
          timestamp,
          hr: Number(reading.hr || 0),
          spo2: Number(reading.spo2 || 0),
          temp: Number(reading.temp || 0),
          finger: reading.finger !== false,
          status: reading.status || "online",
          manual_alert: reading.manual_alert === true,
          button_pressed: reading.button_pressed === true,
          button_press_count: Number(reading.button_press_count || 0),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    });
    await batch.commit();
  }
  return true;
}

export function subscribeToHistoricalReadings(deviceIds, onData, onError) {
  if (!firestoreDb) return () => {};

  const ids = [...new Set((deviceIds || []).filter(Boolean))];
  const rowsByDevice = {};
  const unsubscribe = ids.map((deviceId) => {
    const readingsQuery = query(
      collection(firestoreDb, "miners", deviceId, "readings"),
      orderBy("timestamp", "asc"),
      limitToLast(HISTORY_READ_LIMIT),
    );

    return onSnapshot(
      readingsQuery,
      (snapshot) => {
        rowsByDevice[deviceId] = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        onData({ ...rowsByDevice });
      },
      (error) => onError?.(`Firestore readings read failed: ${error.message}`),
    );
  });

  return () => unsubscribe.forEach((stop) => stop());
}

export function subscribeToStoredSessionSummaries(deviceIds, onData, onError) {
  if (!firestoreDb) return () => {};

  const ids = [...new Set((deviceIds || []).filter(Boolean))];
  const rowsByDevice = {};
  const unsubscribe = ids.map((deviceId) => onSnapshot(
    collection(firestoreDb, "miners", deviceId, "sessions"),
    (snapshot) => {
      rowsByDevice[deviceId] = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .sort((a, b) => Number(a.startTimestamp || 0) - Number(b.startTimestamp || 0));
      onData({ ...rowsByDevice });
    },
    (error) => onError?.(`Firestore session summary read failed: ${error.message}`),
  ));

  return () => unsubscribe.forEach((stop) => stop());
}

export async function saveSessionSummaries(deviceId, healthLogs = {}, miningSessions = {}) {
  if (!firestoreDb || !deviceId) return false;

  const entries = Object.entries(miningSessions || {});
  for (let start = 0; start < entries.length; start += 400) {
    const batch = writeBatch(firestoreDb);
    entries.slice(start, start + 400).forEach(([id, summary]) => {
      const sessionId = canonicalSessionId(deviceId, summary?.sessionId, summary?.startTimestamp || id);
      const health = healthLogs?.[id] || {};
      batch.set(
        doc(firestoreDb, "miners", deviceId, "sessions", safeDocumentId(sessionId)),
        {
          ...summary,
          ...health,
          deviceId,
          sessionId,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    });
    await batch.commit();
  }

  return true;
}

export async function updateSessionStatus(deviceId, sessionId, status, statusTimestamp = Date.now()) {
  if (!firestoreDb || !deviceId || !sessionId) return false;

  const canonicalId = canonicalSessionId(deviceId, sessionId, statusTimestamp);
  const sessionRef = doc(firestoreDb, "miners", deviceId, "sessions", safeDocumentId(canonicalId));
  const nextStatus = String(status || "").toLowerCase();
  const timestamp = Number(statusTimestamp) || Date.now();

  return runTransaction(firestoreDb, async (transaction) => {
    const snapshot = await transaction.get(sessionRef);
    const current = snapshot.exists() ? snapshot.data() : {};
    const currentStatus = String(current.status || "").toLowerCase();
    if (isTerminalSessionStatus(currentStatus)) {
      return { accepted: false, status: currentStatus, statusTimestamp: Number(current.statusTimestamp) || timestamp };
    }

    const payload = {
      deviceId,
      sessionId: canonicalId,
      status: nextStatus,
      statusTimestamp: timestamp,
      updatedAt: serverTimestamp(),
    };
    transaction.set(sessionRef, payload, { merge: true });
    return { accepted: true, status: nextStatus, statusTimestamp: timestamp };
  });
}

export async function saveActivityLog(event) {
  if (!firestoreDb) return false;

  const timestamp = Number(event?.timestamp) || Date.now();
  const payload = {
    deviceId: event?.deviceId || "",
    sessionId: event?.sessionId || "",
    buttonPressCount: Number(event?.buttonPressCount || event?.button_press_count || 0),
    miner: event?.miner || event?.deviceId || "Unknown miner",
    type: event?.type || "activity",
    status: event?.status || "",
    severity: event?.severity || "info",
    title: event?.title || "Miner activity",
    detail: event?.detail || "",
    reading: Number.isFinite(Number(event?.reading)) ? Number(event.reading) : null,
    unit: event?.unit || "",
    timestamp,
    createdAt: serverTimestamp(),
  };
  const logRef = event?.id
    ? doc(firestoreDb, "activityLogs", safeDocumentId(event.id))
    : doc(collection(firestoreDb, "activityLogs"));

  await setDoc(logRef, payload, { merge: true });
  return true;
}

export function subscribeToStoredActivityLogs(onData, onError) {
  if (!firestoreDb) return () => {};

  const logsQuery = query(
    collection(firestoreDb, "activityLogs"),
    orderBy("timestamp", "desc"),
    limit(ACTIVITY_LOG_LIMIT),
  );

  return onSnapshot(
    logsQuery,
    (snapshot) => onData(Object.fromEntries(snapshot.docs.map((item) => [item.id, { id: item.id, ...item.data() }]))),
    (error) => onError?.(`Firestore activity log read failed: ${error.message}`),
  );
}

async function deleteCollectionDocuments(collectionQuery) {
  while (true) {
    const snapshot = await getDocs(query(collectionQuery, limit(400)));
    if (snapshot.empty) return;
    const batch = writeBatch(firestoreDb);
    snapshot.docs.forEach((item) => batch.delete(item.ref));
    await batch.commit();
  }
}

export async function clearActivityLogs() {
  if (!firestoreDb) return false;
  await deleteCollectionDocuments(collection(firestoreDb, "activityLogs"));
  return true;
}

export async function clearHistoricalData(deviceIds = []) {
  if (!firestoreDb) return false;
  const ids = [...new Set((deviceIds || []).filter(Boolean))];
  if (ids.length === 0) {
    await Promise.all([
      deleteCollectionDocuments(collectionGroup(firestoreDb, "readings")),
      deleteCollectionDocuments(collectionGroup(firestoreDb, "sessions")),
    ]);
    return true;
  }
  await Promise.all(ids.flatMap((deviceId) => [
    deleteCollectionDocuments(collection(firestoreDb, "miners", deviceId, "readings")),
    deleteCollectionDocuments(collection(firestoreDb, "miners", deviceId, "sessions")),
  ]));
  return true;
}

export async function saveWifiHistoryRecord(record) {
  if (!firestoreDb || !record?.deviceId) return false;
  const id = safeDocumentId(record.id || `${record.deviceId}-${Date.now()}`);
  const safeRecord = { ...record };
  delete safeRecord.password;
  await setDoc(
    doc(firestoreDb, "wifiConnectionHistory", id),
    { ...safeRecord, id, updatedAt: serverTimestamp() },
    { merge: true },
  );
  return true;
}

export function subscribeToWifiHistory(onData, onError) {
  if (!firestoreDb) return () => {};
  return onSnapshot(
    query(collection(firestoreDb, "wifiConnectionHistory"), orderBy("updatedAt", "desc")),
    (snapshot) => onData(Object.fromEntries(snapshot.docs.map((item) => [item.id, { id: item.id, ...item.data() }]))),
    (error) => onError?.(`Firestore WiFi history read failed: ${error.message}`),
  );
}

export async function removeWifiHistoryRecord(recordId) {
  if (!firestoreDb || !recordId) return false;
  await deleteDoc(doc(firestoreDb, "wifiConnectionHistory", safeDocumentId(recordId)));
  return true;
}
