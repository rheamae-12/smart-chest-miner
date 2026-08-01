function getStorage(storage) {
  if (typeof window === "undefined") return null;
  return storage || window.localStorage;
}

export function readStoredValue(key, fallback = null, storage) {
  try {
    const target = getStorage(storage);
    if (!target) return fallback;
    const raw = target.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
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
  if (import.meta.env.DEV) {
    console.warn(`[${context}]`, error);
  }
}
