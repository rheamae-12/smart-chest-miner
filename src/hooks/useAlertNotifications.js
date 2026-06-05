import { useEffect, useRef } from "react";

const PUSH_ENABLED_KEY = "smart-chest-miner-push-enabled";

function playAlertBeep(critical) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.type = "square";
    oscillator.frequency.value = critical ? 880 : 660;
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.5);
  } catch {
    // Audio context may be unavailable in some environments.
  }
}

function fireNotification(title, body, critical) {
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, {
      body,
      icon: "/favicon.svg",
      tag: `scm-alert-${critical ? "critical" : "warning"}`,
      renotify: true,
    });
  } catch {
    // Notifications may be blocked by the OS.
  }
}

export function useAlertNotifications(alerts) {
  const seenIdsRef = useRef(new Set());
  const permissionRequestedRef = useRef(false);

  useEffect(() => {
    if (!permissionRequestedRef.current && "Notification" in window && Notification.permission === "default") {
      permissionRequestedRef.current = true;
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!alerts.length) return;

    const newCritical = alerts.filter((a) => a.severity === "critical" && !seenIdsRef.current.has(a.id));
    const newWarning = alerts.filter((a) => a.severity !== "critical" && !seenIdsRef.current.has(a.id));

    const pushEnabled = localStorage.getItem(PUSH_ENABLED_KEY) !== "false";
    if (newCritical.length > 0) {
      if (pushEnabled) {
        playAlertBeep(true);
        fireNotification(
          "Smart Chest Miner — Critical Alert",
          newCritical.map((a) => a.message).join("\n"),
          true,
        );
      }
    } else if (newWarning.length > 0) {
      if (pushEnabled) {
        playAlertBeep(false);
        fireNotification(
          "Smart Chest Miner — Warning",
          newWarning.map((a) => a.message).join("\n"),
          false,
        );
      }
    }

    alerts.forEach((a) => seenIdsRef.current.add(a.id));
  }, [alerts]);

  // Clear seen IDs when an alert disappears so it can re-fire if it comes back.
  useEffect(() => {
    const currentIds = new Set(alerts.map((a) => a.id));
    seenIdsRef.current.forEach((id) => {
      if (!currentIds.has(id)) seenIdsRef.current.delete(id);
    });
  }, [alerts]);
}
