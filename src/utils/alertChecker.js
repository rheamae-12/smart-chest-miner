export const DEFAULT_THRESHOLDS = {
  hrMin: 60,
  hrMax: 110,
  hrCriticalMin: 141,
  spo2Min: 80,
  spo2CriticalMin: 60,
  tempMin: 20.0,
  tempMax: 36.0,
  tempCriticalMin: 15.0,
  tempCriticalMax: 38.0,
};

export function getVitalStatus(value, type, thresholds = DEFAULT_THRESHOLDS) {
  if (!value || value <= 0) return null;
  if (type === "hr") {
    if (value >= thresholds.hrCriticalMin) return "CRITICAL";
    if (value < thresholds.hrMin) return "LOW";
    if (value > thresholds.hrMax) return "HIGH";
    return "NORMAL";
  }
  if (type === "spo2") {
    if (value < thresholds.spo2CriticalMin) return "CRITICAL";
    if (value < thresholds.spo2Min) return "LOW";
    return "NORMAL";
  }
  if (type === "temp") {
    if (value <= thresholds.tempCriticalMin || value >= thresholds.tempCriticalMax) return "CRITICAL";
    if (value < thresholds.tempMin) return "LOW";
    if (value > thresholds.tempMax) return "HIGH";
    return "NORMAL";
  }
  return "NORMAL";
}

export function buildAlerts(miners, thresholds = DEFAULT_THRESHOLDS) {
  return miners.flatMap((miner) => {
    const alerts = [];

    // Going offline is normally just a session ending — the device shows offline in
    // status but raises NO alarm. We only escalate to a critical alert when the device
    // dropped WHILE a critical condition was active (a possible emergency), flagged by
    // `offlineConcern` at the moment of disconnect.
    if (miner.stale) {
      // A completed/offline decision closes the session and removes the
      // temporary lost-device alarm. An interrupted decision remains actionable.
      if (miner.offlineConcern && !["completed", "offline"].includes(miner.sessionStatus)) {
        alerts.push({ id: `${miner.id}-offline`, deviceId: miner.id, severity: "critical", message: `${miner.name}: LOST DURING ALERT` });
      }
      return alerts;
    }

    if (!miner.active) return alerts;

    if (miner.manual_alert) {
      alerts.push({ id: `${miner.id}-manual`, deviceId: miner.id, severity: "critical", message: `${miner.name}: MANUAL ALERT ACTIVE` });
    }
    if (miner.finger === false) {
      alerts.push({ id: `${miner.id}-contact`, deviceId: miner.id, severity: "warning", message: `${miner.name}: NO CHEST CONTACT` });
      return alerts;
    }

    const hrStatus = getVitalStatus(miner.hr, "hr", thresholds);
    const spo2Status = getVitalStatus(miner.spo2, "spo2", thresholds);
    const tempStatus = getVitalStatus(miner.temp, "temp", thresholds);
    if (["LOW", "HIGH", "CRITICAL"].includes(hrStatus)) {
      alerts.push({ id: `${miner.id}-hr`, deviceId: miner.id, severity: hrStatus === "CRITICAL" ? "critical" : "warning", message: `${miner.name}: HR ${hrStatus} (${miner.hr} bpm)` });
    }
    if (spo2Status === "CRITICAL") {
      alerts.push({ id: `${miner.id}-spo2`, deviceId: miner.id, severity: "critical", message: `${miner.name}: SpO2 CRITICAL (${miner.spo2}%)` });
    }
    if (spo2Status === "LOW") {
      alerts.push({ id: `${miner.id}-spo2-low`, deviceId: miner.id, severity: "warning", message: `${miner.name}: SpO2 LOW (${miner.spo2}%)` });
    }
    if (tempStatus === "HIGH" || tempStatus === "CRITICAL") {
      alerts.push({ id: `${miner.id}-temp-high`, deviceId: miner.id, severity: tempStatus === "CRITICAL" ? "critical" : "warning", message: `${miner.name}: TEMP ${tempStatus} (${miner.temp}°C)` });
    }
    if (tempStatus === "LOW") {
      alerts.push({ id: `${miner.id}-temp-low`, deviceId: miner.id, severity: "warning", message: `${miner.name}: TEMP LOW (${miner.temp}°C)` });
    }
    return alerts;
  });
}
