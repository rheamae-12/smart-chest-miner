export const NON_FATAL_ERROR_EVENT = "smart-chest-miner:non-fatal-error";

function getStorage(storage) {
  if (typeof window === "undefined") return null;
  return storage || window.localStorage;
}

export function readStoredValue(key, fallback, storage) {
  try {
    const target = getStorage(storage);
    const fallbackValue = fallback === undefined ? null : fallback;
    if (!target) return fallbackValue;
    const raw = target.getItem(key);
    return raw == null ? fallbackValue : JSON.parse(raw);
  } catch {
    return fallback === undefined ? null : fallback;
  }
}

export function writeStoredValue(key, value, storage) {
  try {
    const target = getStorage(storage);
    if (!target) return false;
    target.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeStoredValue(key, storage) {
  try {
    const target = getStorage(storage);
    target?.removeItem(key);
  } catch {
    // Storage is optional; failure must not break monitoring.
  }
}

export function reportNonFatal(error, context = "Application error") {
  if (!import.meta.env.DEV || typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(NON_FATAL_ERROR_EVENT, {
    detail: { context, error, timestamp: Date.now() },
  }));
}
