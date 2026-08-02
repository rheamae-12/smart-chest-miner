import { getVitalStatus } from "./alertChecker";

const ALERT_SEVERITIES = new Set(["warning", "critical"]);
const ALERT_STATUSES = {
  hr: new Set(["LOW", "HIGH", "CRITICAL"]),
  spo2: new Set(["LOW", "CRITICAL"]),
  temp: new Set(["LOW", "HIGH", "CRITICAL"]),
};

export function isVitalAlertLog(log) {
  return log?.type === "vital" && ALERT_SEVERITIES.has(String(log.severity || "").toLowerCase());
}

export function countVitalAlertLogs(logs, deviceId, startTimestamp = 0, endTimestamp = 0) {
  const seen = new Set();
  return (logs || []).reduce((count, log) => {
    if (!isVitalAlertLog(log) || (deviceId && log.deviceId !== deviceId)) return count;
    const timestamp = Number(log.timestamp || 0);
    if (!timestamp || (startTimestamp && timestamp < startTimestamp) || (endTimestamp && timestamp > endTimestamp)) return count;

    // A second browser can write the same alert event with a different Firebase
    // push key. The event identity is the vital type/status and its minute (or
    // lifecycle session), matching the activity-log writer's dedupe key.
    const key = `${log.deviceId}:${log.type}:${log.status || ""}:${log.sessionId || Math.floor(timestamp / 60000)}`;
    if (seen.has(key)) return count;
    seen.add(key);
    return count + 1;
  }, 0);
}

export function countVitalAlertsInRows(rows, thresholds) {
  const seen = new Set();
  return (rows || []).reduce((count, row) => {
    if (row?.finger === false) return count;
    const timestamp = Number(row?.timestamp || 0);
    if (!timestamp) return count;

    return count + ["hr", "spo2", "temp"].reduce((rowCount, type) => {
      const status = getVitalStatus(Number(row?.[type] || 0), type, thresholds);
      if (!ALERT_STATUSES[type].has(status)) return rowCount;
      const key = `${timestamp}:${type}:${status}`;
      if (seen.has(key)) return rowCount;
      seen.add(key);
      return rowCount + 1;
    }, 0);
  }, 0);
}
