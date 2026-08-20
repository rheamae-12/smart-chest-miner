const SESSION_ID_PATTERN = /-session-(\d+)/;

// Session IDs must be stable across browsers. A random suffix makes two
// monitors classify the same device timeline as different sessions.
export function createSessionId(deviceId, timestamp) {
  const start = Number(timestamp);
  const normalizedStart = Number.isFinite(start) && start > 0 ? Math.trunc(start) : 0;
  return `${deviceId}-session-${normalizedStart}`;
}

// Converts IDs written by older builds (device-timestamp and random-suffix
// lifecycle IDs) to the stable lifecycle ID used by new writes.
export function canonicalSessionId(deviceId, sessionId = "", timestamp = 0) {
  const normalizedDeviceId = String(deviceId || "").trim();
  const value = String(sessionId || "").trim();
  const lifecyclePrefix = `${normalizedDeviceId}-session-`;
  const legacyPrefix = `${normalizedDeviceId}-`;

  if (normalizedDeviceId && value.startsWith(lifecyclePrefix)) {
    const match = /^(\d+)/.exec(value.slice(lifecyclePrefix.length));
    if (match) return createSessionId(normalizedDeviceId, match[1]);
  }

  if (normalizedDeviceId && value.startsWith(legacyPrefix)) {
    const legacyTimestamp = value.slice(legacyPrefix.length);
    if (/^\d+$/.test(legacyTimestamp)) return createSessionId(normalizedDeviceId, legacyTimestamp);
  }

  return value || (normalizedDeviceId ? createSessionId(normalizedDeviceId, timestamp) : "");
}

export function sessionSummaryKey(deviceId, sessionId = "", fallback = "") {
  const canonical = canonicalSessionId(deviceId, sessionId, fallback);
  const match = SESSION_ID_PATTERN.exec(canonical);
  if (match) return match[1];
  return String(canonical || fallback || "").replace(/[.#$]/g, "_").replaceAll("[", "_").replaceAll("]", "_").replaceAll("/", "_");
}

export function isTerminalSessionStatus(status) {
  return ["completed", "interrupted", "offline"].includes(String(status || "").toLowerCase());
}
