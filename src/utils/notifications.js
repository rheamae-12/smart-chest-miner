// notifications — shared mapping that lets a live alert and its recorded activity log
// be recognized as the SAME underlying condition, so the notification bell can dedupe
// and show each event once.

// conditionForAlertId — normalized condition key from a buildAlerts() id.
export function conditionForAlertId(id = "") {
  const s = String(id);
  if (s.endsWith("-offline")) return "offline";
  if (s.endsWith("-manual")) return "manual";
  if (s.endsWith("-contact")) return "contact";
  if (s.endsWith("-battery")) return "battery";
  if (s.endsWith("-spo2-low") || s.endsWith("-spo2")) return "spo2";
  if (s.endsWith("-temp-high") || s.endsWith("-temp-low")) return "temp";
  if (s.endsWith("-hr")) return "hr";
  return "";
}

// conditionForLog — normalized condition key from an activity-log row. Returns "" for
// rows that have no live-alert counterpart (online recovery, device CRUD, …) so
// they are always kept.
export function conditionForLog(log = {}) {
  if (log.type === "status") return log.status === "offline" ? "offline" : "";
  if (log.type === "manual_alert") return "manual";
  if (log.type === "vital") {
    const title = String(log.title || "");
    if (title.includes("SpO2")) return "spo2";
    if (title.includes("Heart")) return "hr";
    if (title.toLowerCase().includes("temp")) return "temp";
  }
  return "";
}

// dedupeNotificationEvents — collapses events that describe the same device+condition,
// keeping the first occurrence. Callers order events by priority (live alerts, then
// logs), so the most actionable representation wins. Events with no condition key
// (history, CRUD, recoveries) are always kept.
export function dedupeNotificationEvents(events) {
  const seen = new Set();
  const out = [];
  for (const event of events) {
    if (!event.condition) {
      out.push(event);
      continue;
    }
    const key = `${event.deviceId || ""}:${event.condition}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(event);
  }
  return out;
}
