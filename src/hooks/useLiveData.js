import { useEffect, useState } from "react";
import { subscribeToDeviceLive } from "../firebase/database";
import { timeLabel } from "../utils/formatters";

export function useLiveData(deviceId) {
  const [buffer, setBuffer] = useState({ hr: [], spo2: [] });
  const [error, setError] = useState("");

  useEffect(() => {
    if (!deviceId) return undefined;

    return subscribeToDeviceLive(
      deviceId,
      (live) => {
        if (!live) return;
        const label = timeLabel(new Date(live.timestamp || Date.now()));
        setBuffer((prev) => ({
          hr: [...prev.hr.slice(-29), { time: label, hr: live.heartRate ?? live.hr ?? 0 }],
          spo2: [...prev.spo2.slice(-29), { time: label, spo2: live.spo2 ?? 0 }],
        }));
      },
      (message) => setError(message),
    );
  }, [deviceId]);

  return { buffer, error };
}
