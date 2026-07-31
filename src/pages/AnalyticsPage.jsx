import { useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import FilterToolbar, { FilterField, FilterTabs } from "../components/FilterToolbar";
import PageHeader from "../components/PageHeader";
import { C, cardStyle, controlStyle, pageStyle } from "../theme";
import { average, compactTimestamp, dedupeConsecutiveLogs, formatReading, formatSystemTimestamp, lastSeenValue } from "../utils/formatters";
import { compareMinersActiveFirst } from "../utils/minerOrdering";

// AnalyticsPage — trend charts and miner comparison for HR, SpO2, and body temperature analytics
export default function AnalyticsPage({ miners, analyticsData, liveData = {}, activityLogs = [] }) {
  const [filter, setFilter] = useState({ miner: "all", range: "ALL", bucket: "1" });
  const sortedMiners = useMemo(() => buildMinerOptions(miners, analyticsData, liveData), [analyticsData, liveData, miners]);
  const visibleMiners = useMemo(
    () => (filter.miner === "all" ? sortedMiners : sortedMiners.filter((miner) => miner.id === filter.miner)),
    [filter.miner, sortedMiners],
  );
  const rows = useMemo(() => buildRows(visibleMiners, analyticsData, liveData, filter.range), [analyticsData, liveData, filter.range, visibleMiners]);
  const chartData = useMemo(() => bucketRows(rows, Number(filter.bucket)), [filter.bucket, rows]);
  const logs = useMemo(
    () => buildActivityLogEntries(activityLogs, filter.miner, filter.range),
    [activityLogs, filter.miner, filter.range],
  );
  const activeFilterCount = Number(filter.miner !== "all") + Number(filter.range !== "ALL") + Number(filter.bucket !== "1");
  const selectedMinerName = filter.miner === "all" ? "All miners" : visibleMiners[0]?.name || "Selected miner";
  const rangeLabel = RANGE_OPTIONS.find((option) => option.value === filter.range)?.longLabel || "All recorded data";
  const detailLabel = filter.bucket === "1" ? "1-minute detail" : `${filter.bucket}-minute averages`;

  return (
    <div style={pageStyle}>
      <div style={{ display: "grid", gridTemplateRows: "auto auto auto minmax(0, 1fr)", gap: 12, height: "100%", minHeight: 0 }}>
        <PageHeader
          label="Sensor analytics"
          title="Reading Trends"
          titleSize={26}
          subtitle="Filter HR, SpO2, and body temperature readings by miner and interval."
        />

        <FilterToolbar
          summary={`${selectedMinerName} · ${rangeLabel} · ${detailLabel}`}
          activeCount={activeFilterCount}
          onReset={() => setFilter({ miner: "all", range: "ALL", bucket: "1" })}
        >
          <FilterField label="Miner">
            <select value={filter.miner} onChange={(event) => setFilter({ ...filter, miner: event.target.value })} style={{ ...controlStyle, minWidth: 190 }}>
              <option value="all">All miners</option>
              {sortedMiners.map((miner) => (
                <option key={miner.id} value={miner.id}>{miner.name} ({miner.id})</option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Time range">
            <FilterTabs
              ariaLabel="Analytics time range"
              value={filter.range}
              onChange={(range) => setFilter({ ...filter, range })}
              options={RANGE_OPTIONS}
            />
          </FilterField>
          <FilterField label="Chart detail">
            <select value={filter.bucket} onChange={(event) => setFilter({ ...filter, bucket: event.target.value })} style={{ ...controlStyle, minWidth: 158 }}>
              <option value="1">Every minute</option>
              <option value="5">5-minute average</option>
              <option value="15">15-minute average</option>
            </select>
          </FilterField>
        </FilterToolbar>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10 }}>
          <Metric label="Avg Heart Rate" value={formatReading(average(rows.map((row) => row.hr)), 0)} unit="bpm" color={C.red} />
          <Metric label="Avg SpO2" value={formatReading(average(rows.map((row) => row.spo2)), 0)} unit="%" color={C.oxygen} />
          <Metric label="Avg Body Temp" value={formatReading(average(rows.map((row) => row.temp)), 1)} unit="°C" color={C.teal} />
          <Metric label="Tracked Miners" value={visibleMiners.length} unit={`/${miners.length}`} color={C.green} />
          <Metric label="Total Readings" value={rows.length} unit="records" color={C.amber} />
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 12, minHeight: 0 }}>
          <main style={{ display: "grid", gridTemplateRows: "minmax(0, 1fr) auto", gap: 12, minHeight: 0 }}>
            <div style={{ ...cardStyle, padding: 16, minHeight: 0, display: "grid", gridTemplateRows: "auto 1fr auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", paddingBottom: 11, marginBottom: 13, borderBottom: `1px solid ${C.borderSoft}` }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: C.text, fontSize: 15, fontWeight: 950 }}>Reading History</div>
                  <div style={{ color: C.textMuted, fontSize: 11, marginTop: 2 }}>
                    {filter.miner === "all" ? "HR, SpO2 & body temp aggregated across miners" : `Readings for ${visibleMiners[0]?.name || "selected miner"}`}
                  </div>
                </div>
                <Legend />
              </div>
              <div style={{ minHeight: 0, borderRadius: 8, border: `1px solid ${C.borderSoft}`, background: "#151515", padding: 8 }}>
                {chartData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 12, right: 52, left: 4, bottom: 18 }}>
                      <defs>
                        <linearGradient id="analyticsHr" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={C.red} stopOpacity={0.22} />
                          <stop offset="100%" stopColor={C.red} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke={C.borderSoft} vertical={false} />
                      <XAxis dataKey="time" tick={{ fill: C.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={26} label={{ value: "Time", fill: C.textMuted, fontSize: 10, position: "insideBottom", offset: -4 }} />
                      <YAxis yAxisId="vital" tick={{ fill: C.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} width={42} label={{ value: "bpm / %", angle: -90, fill: C.textMuted, fontSize: 10, position: "insideLeft" }} />
                      <YAxis yAxisId="temp" orientation="right" domain={dynamicDomain(chartData, "temp", 0.4)} tick={{ fill: C.teal, fontSize: 10 }} axisLine={false} tickLine={false} width={46} unit="°C" label={{ value: "°C", angle: 90, fill: C.teal, fontSize: 10, position: "insideRight" }} />
                      <Tooltip contentStyle={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 12 }} />
                      <Area yAxisId="vital" type="monotone" dataKey="hr" name="Heart Rate" stroke={C.red} fill="url(#analyticsHr)" strokeWidth={2.2} dot={false} isAnimationActive={false} />
                      <Area yAxisId="vital" type="monotone" dataKey="spo2" name="SpO2" stroke={C.oxygen} fill="transparent" strokeWidth={2} dot={false} isAnimationActive={false} />
                      <Line yAxisId="temp" type="monotone" dataKey="temp" name="Body Temp" stroke={C.teal} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState />
                )}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, color: C.textMuted, fontSize: 10, marginTop: 8 }}>
                <span>TIME AXIS: {chartData[chartData.length - 1]?.time || "NO TIMESTAMP"}</span>
                <span><b style={{ color: C.red }}>HR</b> BPM | <b style={{ color: C.oxygen }}>SpO2</b> % | <b style={{ color: C.teal }}>Temp</b> °C</span>
              </div>
            </div>

            <div style={{ ...cardStyle, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", paddingBottom: 10, marginBottom: 12, borderBottom: `1px solid ${C.borderSoft}` }}>
                <div style={{ color: C.text, fontSize: 14, fontWeight: 950 }}>Latest Per-Miner Readings</div>
                <span style={{ color: C.textMuted, fontSize: 11 }}>{visibleMiners.length} miner{visibleMiners.length === 1 ? "" : "s"}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
                {visibleMiners.map((miner) => (
                  <MinerReading key={miner.id} miner={miner} />
                ))}
              </div>
            </div>
          </main>

          <aside style={{ ...cardStyle, minHeight: 0, overflow: "hidden", display: "grid", gridTemplateRows: "auto 1fr" }}>
            <div style={{ padding: "13px 15px", borderBottom: `1px solid ${C.borderSoft}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div style={{ color: C.text, fontSize: 14, fontWeight: 950 }}>Signal Anomalies</div>
              <span style={{ color: C.textMuted, fontSize: 11 }}>{logs.length} finding{logs.length === 1 ? "" : "s"}</span>
            </div>
            <div className="hide-scrollbar" style={{ overflow: "auto", display: "grid", gap: 8, alignContent: "start", padding: 12 }}>
              {logs.length === 0 ? (
                <div style={{ color: C.textMuted, fontSize: 12, padding: "12px 4px", lineHeight: 1.55 }}>No warning or critical signal events match this filter.</div>
              ) : (
                logs.map((log) => (
                  <ActivityLog key={`${log.id}-${log.timestamp}`} log={log} />
                ))
              )}
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}

// buildRows — flattens per-miner analyticsData into a flat array filtered by time range
function buildRows(miners, analyticsData, liveData, range) {
  const start = getRangeStart(range);
  const rows = miners
    .flatMap((miner) => {
      const storedRows = (analyticsData[miner.id] || [])
        .filter((point) => !start || Number(point.timestamp || 0) >= start)
        .map((point) => ({ ...point, minerId: miner.id, miner: miner.name, source: "analytics" }));
      const liveRows = liveRowsForMiner(miner, liveData[miner.id] || {})
        .filter((point) => !start || Number(point.timestamp || 0) >= start);
      const currentRow = liveRowFromMiner(miner);
      return [...storedRows, ...liveRows, ...(currentRow && (!start || currentRow.timestamp >= start) ? [currentRow] : [])];
    })
    .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
  return dedupeRows(rows);
}

function buildMinerOptions(miners, analyticsData, liveData) {
  // Registered devices are the source of truth. Historical keys can outlive a
  // renamed device and previously produced impossible counts such as 4/3.
  if (miners.length) {
    return [...miners].sort(compareMinersActiveFirst);
  }
  const byId = new Map(miners.map((miner) => [miner.id, miner]));
  [...Object.keys(analyticsData || {}), ...Object.keys(liveData || {})].forEach((id) => {
    if (!id || byId.has(id)) return;
    const rows = analyticsData[id] || [];
    const latest = rows[rows.length - 1] || {};
    byId.set(id, {
      id,
      name: latest.miner || id,
      location: "Historical",
      active: false,
      status: "offline",
      lastSeen: latest.timestamp ? new Date(latest.timestamp) : null,
      hr: latest.hr || 0,
      spo2: latest.spo2 || 0,
      temp: latest.temp || 0,
    });
  });
  return Array.from(byId.values()).sort(compareMinersActiveFirst);
}

function liveRowsForMiner(miner, series) {
  const byTimestamp = new Map();
  ["hr", "spo2", "temp"].forEach((key) => {
    (series[key] || []).forEach((point) => {
      const timestamp = Number(point.timestamp || 0);
      if (!timestamp) return;
      const row = byTimestamp.get(timestamp) || {
        minerId: miner.id,
        miner: miner.name,
        timestamp,
        time: point.time || compactTimestamp(timestamp),
        source: "live",
      };
      row[key] = Number(point[key]) || null;
      byTimestamp.set(timestamp, row);
    });
  });
  return Array.from(byTimestamp.values());
}

function liveRowFromMiner(miner) {
  const timestamp = lastSeenValue(miner);
  if (!miner.active || timestamp <= 0 || (!miner.hr && !miner.spo2 && !miner.temp)) return null;
  return {
    minerId: miner.id,
    miner: miner.name,
    timestamp,
    time: compactTimestamp(timestamp),
    hr: Number(miner.hr) || null,
    spo2: Number(miner.spo2) || null,
    temp: Number(miner.temp) || null,
    manual_alert: miner.manual_alert,
    button_pressed: miner.button_pressed,
    button_press_count: miner.button_press_count,
    source: "current",
  };
}

function dedupeRows(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.minerId}|${Number(row.timestamp || 0)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// bucketRows — aggregates flat rows into time buckets of N minutes, averaging HR/SpO2/temp per bucket
function bucketRows(rows, minutes) {
  if (!rows.length) return [];
  const bucketMs = Math.max(1, minutes) * 60 * 1000;
  const buckets = new Map();
  rows.forEach((row) => {
    const timestamp = Number(row.timestamp || 0);
    const key = timestamp ? Math.floor(timestamp / bucketMs) * bucketMs : row.time;
    const current = buckets.get(key) || { timestamp: Number(key) || 0, hrs: [], spo2s: [], temps: [] };
    if (Number(row.hr) > 0) current.hrs.push(Number(row.hr));
    if (Number(row.spo2) > 0) current.spo2s.push(Number(row.spo2));
    if (Number(row.temp) > 0) current.temps.push(Number(row.temp));
    buckets.set(key, current);
  });
  return Array.from(buckets.values())
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-42)
    .map((bucket) => ({
      time: bucket.timestamp ? compactTimestamp(bucket.timestamp) : "",
      hr: average(bucket.hrs),
      spo2: average(bucket.spo2s),
      temp: average(bucket.temps),
    }));
}

// getRangeStart — returns a Unix ms timestamp for the start of the selected range (or 0 for all-time)
function dynamicDomain(data, key, padding = 1) {
  const values = (data || []).map((row) => Number(row[key])).filter((value) => Number.isFinite(value) && value > 0);
  if (!values.length) return ["auto", "auto"];
  const min = Math.min(...values);
  const max = Math.max(...values);
  return [Number((min - padding).toFixed(1)), Number((max + padding).toFixed(1))];
}

function getRangeStart(range) {
  const now = Date.now();
  if (range === "30M") return now - 30 * 60 * 1000;
  if (range === "1H") return now - 60 * 60 * 1000;
  if (range === "24H") return now - 24 * 60 * 60 * 1000;
  if (range === "7D") return now - 7 * 24 * 60 * 60 * 1000;
  return 0;
}

// buildActivityLogEntries — maps raw Firebase activity logs to display-ready objects,
// filtered by miner and de-duplicated (collapses repeated identical events).
function buildActivityLogEntries(activityLogs, minerFilter, range) {
  const start = getRangeStart(range);
  const matchingLogs = activityLogs
    .filter((log) => {
      const selected = minerFilter === "all" || log.deviceId === minerFilter;
      const anomalous = log.severity === "critical" || log.severity === "warning";
      const withinRange = !start || Number(log.timestamp || 0) >= start;
      return selected && anomalous && withinRange;
    })
    .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));

  return dedupeConsecutiveLogs(matchingLogs)
    .slice(0, 40)
    .map((log) => ({
      id: log.id,
      name: log.miner || log.deviceId,
      title: log.title,
      detail: log.detail,
      color: log.severity === "critical" ? C.red : log.severity === "warning" ? C.amber : log.status === "online" ? C.green : C.offline,
      timestamp: log.timestamp,
      time: formatSystemTimestamp(log.timestamp),
    }));
}

// Select — labelled select dropdown used for Miner / Range / Bucket filter controls
// Metric — summary stat card showing an averaged reading over the selected filter range
function Metric({ label, value, unit, color }) {
  return (
    <div style={{ ...cardStyle, padding: 14, borderLeft: `3px solid ${color}` }}>
      <div style={{ color: C.textMuted, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ color, fontSize: 27, fontWeight: 950, marginTop: 8, lineHeight: 1 }}>{value}<span style={{ color: C.textMuted, fontSize: 11, marginLeft: 5 }}>{unit}</span></div>
    </div>
  );
}

// Legend — inline chart legend showing the color mapping for HR, SpO2, and Temp lines
function Legend() {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", color: C.textMuted, fontSize: 11 }}>
      <span><b style={{ color: C.red }}>--</b> HR bpm</span>
      <span><b style={{ color: C.oxygen }}>--</b> SpO2 %</span>
      <span><b style={{ color: C.teal }}>--</b> Temp °C</span>
    </div>
  );
}

// MinerReading — per-miner card showing latest HR, SpO2, and Temp readings in the comparison strip
function MinerReading({ miner }) {
  const color = miner.active ? C.green : C.offline;
  return (
    <div style={{ border: `1px solid ${C.borderSoft}`, borderRadius: 7, padding: 10, background: "rgba(255,255,255,0.02)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <strong style={{ color: C.text, fontSize: 12 }}>{miner.name}</strong>
        <span style={{ color, fontSize: 10, fontWeight: 900 }}>{miner.active ? "ONLINE" : "OFFLINE"}</span>
      </div>
      <div style={{ color: C.textMuted, fontSize: 10, marginTop: 3 }}>{miner.id}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 7, marginTop: 10 }}>
        <MiniValue label="HR" value={miner.active ? formatReading(miner.hr, 0) : "--"} color={C.red} />
        <MiniValue label="SpO2" value={miner.active ? formatReading(miner.spo2, 0) : "--"} color={C.oxygen} />
        <MiniValue label="Temp" value={miner.active ? `${formatReading(miner.temp, 1)}°C` : "--"} color={C.teal} />
      </div>
    </div>
  );
}

// MiniValue — tiny label+value pair inside a MinerReading card
function MiniValue({ label, value, color }) {
  return (
    <div>
      <div style={{ color: C.textMuted, fontSize: 9 }}>{label}</div>
      <div style={{ color, fontSize: 15, fontWeight: 900, marginTop: 3 }}>{value}</div>
    </div>
  );
}

// ActivityLog — single event row in the Miner Events aside panel
function ActivityLog({ log }) {
  return (
    <div style={{ borderLeft: `3px solid ${log.color}`, borderRadius: 6, background: "rgba(255,255,255,0.02)", padding: "10px 10px 10px 12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <strong style={{ color: C.text, fontSize: 12 }}>{log.name}</strong>
        <span style={{ color: log.color, fontSize: 10, fontWeight: 900, textTransform: "uppercase" }}>{log.title}</span>
      </div>
      <div style={{ color: C.textMuted, fontSize: 11, lineHeight: 1.4, marginTop: 5 }}>{log.detail}</div>
      <div style={{ color: C.textMuted, fontSize: 10, marginTop: 7 }}>{log.time}</div>
    </div>
  );
}

// EmptyState — shown inside the chart area when the selected filter returns no data points
function EmptyState() {
  return <div style={{ height: "100%", display: "grid", placeItems: "center", color: C.textMuted, fontSize: 13 }}>No valid analytics for this filter yet.</div>;
}

const RANGE_OPTIONS = [
  { value: "ALL", label: "All", longLabel: "All recorded data" },
  { value: "30M", label: "30 min", longLabel: "Last 30 minutes" },
  { value: "1H", label: "1 hour", longLabel: "Last hour" },
  { value: "24H", label: "24 hours", longLabel: "Last 24 hours" },
  { value: "7D", label: "7 days", longLabel: "Last 7 days" },
];

