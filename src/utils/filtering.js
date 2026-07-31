const DAY_MS = 24 * 60 * 60 * 1000;

export const DATE_RANGE_OPTIONS = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "custom", label: "Custom" },
];

export function resolveDateRange(preset, custom = {}, now = Date.now()) {
  if (preset === "today") {
    const date = new Date(now);
    return {
      start: new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(),
      end: now,
    };
  }
  if (preset === "7d") return { start: now - 7 * DAY_MS, end: now };
  if (preset === "30d") return { start: now - 30 * DAY_MS, end: now };
  if (preset === "custom") {
    return {
      start: parseLocalDate(custom.from, false),
      end: parseLocalDate(custom.to, true),
    };
  }
  return { start: null, end: null };
}

export function isWithinDateRange(timestamp, range) {
  const value = Number(timestamp || 0);
  if (!Number.isFinite(value) || value <= 0) return false;
  if (range?.start && value < range.start) return false;
  if (range?.end && value > range.end) return false;
  return true;
}

export function matchesSearch(query, ...values) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return true;
  return values.some((value) => String(value || "").toLowerCase().includes(needle));
}

export function matchesAlertType(log, type) {
  if (!type || type === "all") return true;
  const severity = String(log?.severity || "").toLowerCase();
  const status = String(log?.status || "").toLowerCase();
  const eventType = String(log?.type || "").toLowerCase();
  const text = `${log?.title || ""} ${log?.detail || ""}`.toLowerCase();

  if (type === "critical") return severity === "critical";
  if (type === "warning") return severity === "warning";
  if (type === "offline") return (eventType === "status" && status === "offline") || /\boffline\b|device lost/.test(text);
  if (type === "high-hr") return /\bheart rate\b|\bhr\b/.test(text) && (status === "high" || /\bhigh\b/.test(text));
  if (type === "low-spo2") return /\bspo2\b/.test(text) && (status === "low" || status === "critical" || /\blow\b|\bcritical\b/.test(text));
  return true;
}

function parseLocalDate(value, endOfDay) {
  if (!value) return null;
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return null;
  return endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999).getTime()
    : new Date(year, month - 1, day).getTime();
}
