import { useEffect, useState } from "react";
import { subscribeToDeviceStatus } from "../firebase/database";

export function useDeviceStatus(deviceId) {
  const [status, setStatus] = useState("offline");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!deviceId) return undefined;
    return subscribeToDeviceStatus(deviceId, setStatus, setError);
  }, [deviceId]);

  return { online: status === "online", status, error };
}
