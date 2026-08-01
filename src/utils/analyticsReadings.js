// Counts logical readings instead of raw samples.
// Several samples from one device/session in one minute count once, while a
// restarted session in that same minute is a separate reading record.
export function countMinuteReadings(rows = []) {
  const buckets = new Map();

  rows.forEach((row) => {
    const deviceId = row.minerId || row.miner || "unknown";
    const timestamp = Number(row.timestamp || 0);
    const minute = timestamp > 0 ? Math.floor(timestamp / 60000) : row.time || "unknown";
    const key = `${deviceId}|${minute}`;
    const bucket = buckets.get(key) || { sessionIds: new Set(), hasUnassigned: false };

    if (row.sessionId) {
      bucket.sessionIds.add(String(row.sessionId));
    } else {
      bucket.hasUnassigned = true;
    }
    buckets.set(key, bucket);
  });

  return Array.from(buckets.values()).reduce(
    (total, bucket) => total + (bucket.sessionIds.size || (bucket.hasUnassigned ? 1 : 0)),
    0,
  );
}
