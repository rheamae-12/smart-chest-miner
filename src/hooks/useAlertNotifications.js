import { useEffect, useRef } from "react";
import { readStoredValue, writeStoredValue } from "../utils/safeStorage";

const PUSH_ENABLED_KEY = "smart-chest-miner-push-enabled";
// Seen-alert ids are kept in sessionStorage so a page reload within the same tab
// does NOT re-notify conditions that were already active before the reload. They
// clear when the tab closes, so a fresh session still surfaces current conditions.
const SEEN_ALERTS_SESSION_KEY = "smart-chest-miner-seen-alerts";

function readSeenAlerts() {
  const value = readStoredValue(SEEN_ALERTS_SESSION_KEY, [], sessionStorage);
  return new Set(Array.isArray(value) ? value : []);
}

function writeSeenAlerts(set) {
  try {
    writeStoredValue(SEEN_ALERTS_SESSION_KEY, [...set], sessionStorage);
  } catch {
    // Storage may be full or unavailable — non-fatal.
  }
}

function playAlertBeep(critical) {
  try {
    if (typeof window === "undefined") return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
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
    oscillator.onended = () => ctx.close();
  } catch {
    // Audio context may be unavailable in some environments.
  }
}

function fireNotification(title, body, critical) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
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
  const seenIdsRef = useRef(null);
  if (seenIdsRef.current === null) seenIdsRef.current = readSeenAlerts();
  // Tracks whether real alert data has arrived, so the initial empty render (before
  // Firebase loads) is not mistaken for "every condition cleared".
  const dataSeenRef = useRef(false);
  const permissionRequestedRef = useRef(false);

  useEffect(() => {
    if (!permissionRequestedRef.current && "Notification" in window && Notification.permission === "default") {
      permissionRequestedRef.current = true;
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!alerts.length) return;
    dataSeenRef.current = true;

    const newCritical = alerts.filter((a) => a.severity === "critical" && !seenIdsRef.current.has(a.id));
    const newWarning = alerts.filter((a) => a.severity !== "critical" && !seenIdsRef.current.has(a.id));

    const pushEnabled = readStoredValue(PUSH_ENABLED_KEY, true) !== false;
    if (newCritical.length > 0) {
      if (pushEnabled) {
        playAlertBeep(true);
        fireNotification("Smart MinerGuard — Critical Alert", newCritical.map((a) => a.message).join("\n"), true);
      }
    } else if (newWarning.length > 0) {
      if (pushEnabled) {
        playAlertBeep(false);
        fireNotification("Smart MinerGuard — Warning", newWarning.map((a) => a.message).join("\n"), false);
      }
    }

    if (newCritical.length || newWarning.length) {
      alerts.forEach((a) => seenIdsRef.current.add(a.id));
      writeSeenAlerts(seenIdsRef.current);
    }
  }, [alerts]);

  // Clear seen IDs when an alert disappears so it can re-fire if it comes back.
  // Skipped until real data has loaded so the initial empty render doesn't wipe the
  // persisted set (which would re-notify everything once data arrives).
  useEffect(() => {
    if (!dataSeenRef.current) return;
    const currentIds = new Set(alerts.map((a) => a.id));
    let changed = false;
    seenIdsRef.current.forEach((id) => {
      if (!currentIds.has(id)) {
        seenIdsRef.current.delete(id);
        changed = true;
      }
    });
    if (changed) writeSeenAlerts(seenIdsRef.current);
  }, [alerts]);
}
