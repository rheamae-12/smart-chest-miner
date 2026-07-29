export function timeLabel(date = new Date()) {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

export function formatSystemTimestamp(value = new Date()) {
  if (!value) return "NEVER";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "UNKNOWN";

  const month = date.toLocaleString("en-US", { month: "long" }).toUpperCase();
  const day = date.getDate().toString().padStart(2, "0");
  const year = date.getFullYear();
  const time = date.toLocaleString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase();
  return `${month} ${day}, ${year} - ${time}`;
}

// compactTimestamp — short "Jun 12, 6:07 AM" label for chart axes/tooltips where
// the full formatSystemTimestamp string ("JUNE 12, 2026 - 6:07 AM") is too long
// and would overlap on a dense time axis.
export function compactTimestamp(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const md = date.toLocaleString("en-US", { month: "short", day: "numeric" });
  const time = date.toLocaleString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${md}, ${time}`;
}

export function formatLastSeen(value) {
  return formatSystemTimestamp(value);
}

export function formatReading(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "--";
  return number.toFixed(digits);
}

export function average(values, digits = 1) {
  const valid = values.filter((value) => Number.isFinite(value) && value > 0);
  if (valid.length === 0) return 0;
  return Number((valid.reduce((sum, value) => sum + value, 0) / valid.length).toFixed(digits));
}

export function lastSeenValue(miner) {
  return miner.lastSeen?.getTime?.() || Number(miner.lastSeen) || 0;
}

// dedupeConsecutiveLogs — collapses runs of identical activity-log entries (same
// device + same title within 60s) that the system can emit repeatedly (e.g. a
// device flapping offline). Expects the list sorted newest-first; preserves order.
export function dedupeConsecutiveLogs(logs) {
  const seen = new Set();
  return (logs || []).filter((log) => {
    const bucket = Math.floor(Number(log.timestamp || 0) / 60_000);
    const key = `${log.deviceId}|${log.type}|${log.title}|${log.status}|${bucket}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
