// anomalyDetection — lightweight trend analysis that flags deterioration BEFORE a
// vital crosses its hard threshold. Threshold alerts (in alertChecker) catch the
// breach; this catches the slope heading toward it.

// analyzeSpo2Trend — detects a sustained downward SpO2 trend over the recent window.
// Combines a net-drop check with a least-squares slope so single noisy dips don't
// trigger a warning. Returns { declining, netDrop, slopePerMin, samples }.
export function analyzeSpo2Trend(points, { minSamples = 5, dropThreshold = 3, slopeLimit = -0.5 } = {}) {
  const series = (points || [])
    .map((p) => ({ t: Number(p.timestamp) || 0, v: Number(p.spo2) || 0 }))
    .filter((p) => p.v > 0)
    .sort((a, b) => a.t - b.t)
    .slice(-8);

  if (series.length < minSamples) {
    return { declining: false, netDrop: 0, slopePerMin: 0, samples: series.length };
  }

  const first = series[0].v;
  const last = series[series.length - 1].v;
  const netDrop = first - last;

  // Least-squares slope in %-points per minute.
  const t0 = series[0].t;
  const xs = series.map((p) => (p.t - t0) / 60000);
  const ys = series.map((p) => p.v);
  const n = series.length;
  const sx = xs.reduce((a, b) => a + b, 0);
  const sy = ys.reduce((a, b) => a + b, 0);
  const sxx = xs.reduce((a, b) => a + b * b, 0);
  const sxy = xs.reduce((a, b, i) => a + b * ys[i], 0);
  const denom = n * sxx - sx * sx;
  const slopePerMin = denom !== 0 ? (n * sxy - sx * sy) / denom : 0;

  return {
    declining: netDrop >= dropThreshold && slopePerMin < slopeLimit,
    netDrop: Math.round(netDrop * 10) / 10,
    slopePerMin: Math.round(slopePerMin * 100) / 100,
    samples: n,
  };
}

// buildTrendWatch — fleet-wide early-warning list. `liveData` is the per-device
// series map ({ [deviceId]: { spo2: [...] } }). Only active miners are considered.
export function buildTrendWatch(miners = [], liveData = {}) {
  const watch = [];
  miners.forEach((miner) => {
    if (!miner.active || miner.finger === false) return;
    const trend = analyzeSpo2Trend((liveData[miner.id] || {}).spo2);
    if (trend.declining) {
      watch.push({
        deviceId: miner.id,
        name: miner.name,
        severity: "warning",
        metric: "spo2",
        trend,
        message: `${miner.name}: SpO₂ trending down ${trend.netDrop}% over last ${trend.samples} readings`,
      });
    }
  });
  return watch;
}
