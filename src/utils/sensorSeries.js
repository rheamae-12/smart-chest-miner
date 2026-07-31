const DEFAULT_LIMIT = 30;

// Merge independently sampled sensor streams by timestamp. Sensors can skip
// readings, so zipping the arrays by index makes unrelated moments appear on
// the same chart row.
export function mergeSensorSeries(series = {}, limit = DEFAULT_LIMIT) {
  const rowsByKey = new Map();
  const streams = [
    ["hr", series?.hr || []],
    ["spo2", series?.spo2 || []],
    ["temp", series?.temp || []],
  ];

  streams.forEach(([metric, points]) => {
    points.forEach((point, index) => {
      const timestamp = Number(point?.timestamp);
      const hasTimestamp = Number.isFinite(timestamp) && timestamp > 0;
      const key = hasTimestamp ? `t:${timestamp}` : `i:${index}`;
      const current = rowsByKey.get(key) || {
        time: point?.time || "",
        timestamp: hasTimestamp ? timestamp : 0,
        hr: null,
        spo2: null,
        temp: null,
      };
      const value = Number(point?.[metric]);

      if (!current.time && point?.time) current.time = point.time;
      if (Number.isFinite(value) && value > 0) current[metric] = value;
      rowsByKey.set(key, current);
    });
  });

  return [...rowsByKey.values()]
    .filter((row) => row.hr !== null || row.spo2 !== null || row.temp !== null)
    .sort((a, b) => {
      if (a.timestamp && b.timestamp) return a.timestamp - b.timestamp;
      if (a.timestamp) return -1;
      if (b.timestamp) return 1;
      return 0;
    })
    .slice(-Math.max(1, Number(limit) || DEFAULT_LIMIT));
}
