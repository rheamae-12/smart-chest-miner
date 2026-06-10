import { useEffect, useState } from "react";
import { subscribeToAnalytics, writeAnalyticsSnapshot } from "../firebase/database";

export function useAnalytics(deviceId) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!deviceId) return undefined;
    return subscribeToAnalytics(deviceId, setRows, setError);
  }, [deviceId]);

  const writeSnapshot = (avgHR, avgSpo2, avgTemp) => writeAnalyticsSnapshot(deviceId, avgHR, avgSpo2, avgTemp);

  return { rows, error, writeSnapshot };
}
