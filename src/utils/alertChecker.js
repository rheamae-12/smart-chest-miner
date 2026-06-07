export const DEFAULT_THRESHOLDS = {
  hrMin: 55,
  hrMax: 105,
  spo2Min: 94,
  tempMin: 36.0,
  tempMax: 38.0,
};

export function getVitalStatus(value, type, thresholds = DEFAULT_THRESHOLDS) {
  if (!value || value <= 0) return null;
  if (type === "hr") {
    if (value < thresholds.hrMin) return "LOW";
    if (value > thresholds.hrMax) return "HIGH";
    return "NORMAL";
  }
  if (type === "spo2") {
    if (value < thresholds.spo2Min) return "CRITICAL";
    if (value < thresholds.spo2Min + 2) return "LOW";
    return "NORMAL";
  }
  if (type === "temp") {
    if (value < thresholds.tempMin) return "LOW";
    if (value > thresholds.tempMax) return "HIGH";
    return "NORMAL";
  }
  return "NORMAL";
}

export function buildAlerts(miners, thresholds = DEFAULT_THRESHOLDS) {
  return miners.flatMap((miner) => {
    const alerts = [];

    // Only alert offline if the device was previously active and went stale —
    // not for newly registered devices that have never sent data.
    if (miner.stale) {
      alerts.push({ id: `${miner.id}-offline`, deviceId: miner.id, severity: "critical", message: `${miner.name}: DEVICE OFFLINE` });
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
    if (hrStatus === "LOW" || hrStatus === "HIGH") {
      alerts.push({ id: `${miner.id}-hr`, deviceId: miner.id, severity: "warning", message: `${miner.name}: HR ${hrStatus} (${miner.hr} bpm)` });
    }
    if (spo2Status === "CRITICAL") {
      alerts.push({ id: `${miner.id}-spo2`, deviceId: miner.id, severity: "critical", message: `${miner.name}: SpO2 CRITICAL (${miner.spo2}%)` });
    }
    if (spo2Status === "LOW") {
      alerts.push({ id: `${miner.id}-spo2-low`, deviceId: miner.id, severity: "warning", message: `${miner.name}: SpO2 LOW (${miner.spo2}%)` });
    }
    if (tempStatus === "HIGH") {
      alerts.push({ id: `${miner.id}-temp-high`, deviceId: miner.id, severity: "critical", message: `${miner.name}: TEMP HIGH (${miner.temp}°C)` });
    }
    if (tempStatus === "LOW") {
      alerts.push({ id: `${miner.id}-temp-low`, deviceId: miner.id, severity: "warning", message: `${miner.name}: TEMP LOW (${miner.temp}°C)` });
    }
    return alerts;
  });
}
