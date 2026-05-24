import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { C, cardStyle, controlStyle, pageStyle } from "../theme";
import { average, formatLastSeen, formatReading, formatSystemTimestamp } from "../utils/formatters";

export default function AnalyticsPage({ miners, analyticsData }) {
  const [filter, setFilter] = useState({ miner: "all", range: "24H", bucket: "1" });
  const sortedMiners = useMemo(() => [...miners].sort((a, b) => lastSeenValue(b) - lastSeenValue(a) || a.id.localeCompare(b.id)), [miners]);
  const visibleMiners = filter.miner === "all" ? sortedMiners : sortedMiners.filter((miner) => miner.id === filter.miner);
  const rows = useMemo(() => buildRows(visibleMiners, analyticsData, filter.range), [analyticsData, filter.range, visibleMiners]);
  const chartData = useMemo(() => bucketRows(rows, Number(filter.bucket)), [filter.bucket, rows]);
  const logs = useMemo(() => buildDeviceLogs(miners), [miners]);

  return (
    <div style={pageStyle}>
      <div style={{ display: "grid", gridTemplateRows: "auto auto minmax(0, 1fr)", gap: 12, height: "100%", minHeight: 0 }}>
        <section style={{ ...cardStyle, padding: 16, display: "flex", alignItems: "end", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div style={moduleLabel}>Sensor analytics</div>
            <div style={{ color: C.text, fontSize: 25, fontWeight: 950, marginTop: 4 }}>Telemetry Trends</div>
            <div style={{ color: C.textMuted, fontSize: 12, marginTop: 5 }}>Filter HR and SpO2 readings by miner and readings-per-minute interval.</div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Select label="Miner" value={filter.miner} onChange={(miner) => setFilter({ ...filter, miner })}>
              <option value="all">All miners</option>
              {sortedMiners.map((miner) => (
                <option key={miner.id} value={miner.id}>{miner.name} ({miner.id})</option>
              ))}
            </Select>
            <Select label="Range" value={filter.range} onChange={(range) => setFilter({ ...filter, range })}>
              <option value="30M">Last 30 min</option>
              <option value="1H">Last 1 hour</option>
              <option value="24H">Last 24 hours</option>
              <option value="7D">Last 7 days</option>
            </Select>
            <Select label="Readings / min" value={filter.bucket} onChange={(bucket) => setFilter({ ...filter, bucket })}>
              <option value="1">1 minute</option>
              <option value="5">5 minutes</option>
              <option value="15">15 minutes</option>
            </Select>
          </div>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
          <Metric label="Avg Heart Rate" value={formatReading(average(rows.map((row) => row.hr)), 0)} unit="bpm" color={C.red} />
          <Metric label="Avg SpO2" value={formatReading(average(rows.map((row) => row.spo2)), 0)} unit="%" color={C.primary} />
          <Metric label="Tracked Miners" value={visibleMiners.length} unit={`/${miners.length}`} color={C.green} />
          <Metric label="Total Readings" value={rows.length} unit="records" color={C.amber} />
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 12, minHeight: 0 }}>
          <main style={{ display: "grid", gridTemplateRows: "minmax(0, 1fr) auto", gap: 12, minHeight: 0 }}>
            <div style={{ ...cardStyle, padding: 16, minHeight: 0, display: "grid", gridTemplateRows: "auto 1fr" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", marginBottom: 12 }}>
                <div>
                  <div style={moduleLabel}>Reading history</div>
                  <div style={{ color: C.text, fontSize: 18, fontWeight: 950, marginTop: 4 }}>Heart Rate and SpO2</div>
                  <div style={{ color: C.textMuted, fontSize: 12, marginTop: 4 }}>
                    {filter.miner === "all" ? "Aggregated across selected miners" : `Separate readings for ${visibleMiners[0]?.name || "selected miner"}`}
                  </div>
                </div>
                <Legend />
              </div>
              <div style={{ minHeight: 0, borderRadius: 8, border: `1px solid ${C.borderSoft}`, background: "#151515", padding: 8 }}>
                {chartData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 12, right: 18, left: -18, bottom: 0 }}>
                      <defs>
                        <linearGradient id="analyticsHr" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={C.red} stopOpacity={0.22} />
                          <stop offset="100%" stopColor={C.red} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke={C.borderSoft} vertical={false} />
                      <XAxis dataKey="time" tick={{ fill: C.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={26} />
                      <YAxis tick={{ fill: C.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} width={36} />
                      <Tooltip contentStyle={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 12 }} />
                      <Area type="monotone" dataKey="hr" name="Heart Rate" stroke={C.red} fill="url(#analyticsHr)" strokeWidth={2.2} dot={false} isAnimationActive={false} />
                      <Area type="monotone" dataKey="spo2" name="SpO2" stroke={C.primary} fill="transparent" strokeWidth={2} dot={false} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState />
                )}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, color: C.textMuted, fontSize: 10, marginTop: 8 }}>
                <span>TIME AXIS: {chartData[chartData.length - 1]?.time || "NO TIMESTAMP"}</span>
                <span><b style={{ color: C.red }}>HR</b> BPM | <b style={{ color: C.primary }}>SpO2</b> %</span>
              </div>
            </div>

            <div style={{ ...cardStyle, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 8 }}>
                <div>
                  <div style={moduleLabel}>Miner comparison</div>
                  <div style={{ color: C.text, fontSize: 14, fontWeight: 900, marginTop: 3 }}>Latest per-miner readings</div>
                </div>
                <span style={{ color: C.textMuted, fontSize: 11 }}>{visibleMiners.length} labeled miner series</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
                {visibleMiners.map((miner) => (
                  <MinerReading key={miner.id} miner={miner} />
                ))}
              </div>
            </div>
          </main>

          <aside style={{ ...cardStyle, padding: 15, minHeight: 0, display: "grid", gridTemplateRows: "auto 1fr" }}>
            <div style={{ marginBottom: 10 }}>
              <div style={moduleLabel}>Device activity logs</div>
              <div style={{ color: C.text, fontSize: 16, fontWeight: 950, marginTop: 4 }}>Online / Offline Events</div>
              <div style={{ color: C.textMuted, fontSize: 11, marginTop: 4 }}>Status history based on the latest device telemetry window.</div>
            </div>
            <div className="hide-scrollbar" style={{ overflow: "auto", display: "grid", gap: 8, alignContent: "start" }}>
              {logs.map((log) => (
                <ActivityLog key={`${log.id}-${log.status}`} log={log} />
              ))}
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}

function buildRows(miners, analyticsData, range) {
  const start = getRangeStart(range);
  return miners
    .flatMap((miner) =>
      (analyticsData[miner.id] || [])
        .filter((point) => !start || Number(point.timestamp || 0) >= start)
        .map((point) => ({ ...point, minerId: miner.id, miner: miner.name })),
    )
    .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
}

function bucketRows(rows, minutes) {
  if (!rows.length) return [];
  const bucketMs = Math.max(1, minutes) * 60 * 1000;
  const buckets = new Map();
  rows.forEach((row) => {
    const timestamp = Number(row.timestamp || 0);
    const key = timestamp ? Math.floor(timestamp / bucketMs) * bucketMs : row.time;
    const current = buckets.get(key) || { timestamp: Number(key) || 0, hrs: [], spo2s: [] };
    if (Number(row.hr) > 0) current.hrs.push(Number(row.hr));
    if (Number(row.spo2) > 0) current.spo2s.push(Number(row.spo2));
    buckets.set(key, current);
  });
  return Array.from(buckets.values())
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-42)
    .map((bucket) => ({
      time: bucket.timestamp ? formatSystemTimestamp(bucket.timestamp) : "",
      hr: average(bucket.hrs),
      spo2: average(bucket.spo2s),
    }));
}

function getRangeStart(range) {
  const now = Date.now();
  if (range === "30M") return now - 30 * 60 * 1000;
  if (range === "1H") return now - 60 * 60 * 1000;
  if (range === "24H") return now - 24 * 60 * 60 * 1000;
  if (range === "7D") return now - 7 * 24 * 60 * 60 * 1000;
  return 0;
}

function buildDeviceLogs(miners) {
  return [...miners]
    .sort((a, b) => lastSeenValue(b) - lastSeenValue(a) || a.id.localeCompare(b.id))
    .map((miner) => ({
      id: miner.id,
      name: miner.name,
      status: miner.active ? "Online" : "Offline",
      color: miner.active ? C.green : C.offline,
      detail: miner.active ? "Receiving fresh HR and SpO2 telemetry." : "No live readings are currently available.",
      time: formatLastSeen(miner.lastSeen),
    }));
}

function lastSeenValue(miner) {
  return miner.lastSeen?.getTime?.() || Number(miner.lastSeen) || 0;
}

function Select({ label, value, onChange, children }) {
  return (
    <label style={{ display: "grid", gap: 5 }}>
      <span style={{ fontSize: 10, color: C.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 900 }}>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} style={{ ...controlStyle, minWidth: 138 }}>
        {children}
      </select>
    </label>
  );
}

function Metric({ label, value, unit, color }) {
  return (
    <div style={{ ...cardStyle, padding: 14, borderLeft: `3px solid ${color}` }}>
      <div style={{ color: C.textMuted, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ color, fontSize: 27, fontWeight: 950, marginTop: 8, lineHeight: 1 }}>{value}<span style={{ color: C.textMuted, fontSize: 11, marginLeft: 5 }}>{unit}</span></div>
    </div>
  );
}

function Legend() {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", color: C.textMuted, fontSize: 11 }}>
      <span><b style={{ color: C.red }}>--</b> HR bpm</span>
      <span><b style={{ color: C.primary }}>--</b> SpO2 %</span>
    </div>
  );
}

function MinerReading({ miner }) {
  const color = miner.active ? C.green : C.offline;
  return (
    <div style={{ border: `1px solid ${C.borderSoft}`, borderRadius: 7, padding: 10, background: "rgba(255,255,255,0.02)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <strong style={{ color: C.text, fontSize: 12 }}>{miner.name}</strong>
        <span style={{ color, fontSize: 10, fontWeight: 900 }}>{miner.active ? "ONLINE" : "OFFLINE"}</span>
      </div>
      <div style={{ color: C.textMuted, fontSize: 10, marginTop: 3 }}>{miner.id}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginTop: 10 }}>
        <MiniValue label="HR" value={miner.active ? formatReading(miner.hr, 0) : "--"} color={C.red} />
        <MiniValue label="SpO2" value={miner.active ? formatReading(miner.spo2, 0) : "--"} color={C.primary} />
      </div>
    </div>
  );
}

function MiniValue({ label, value, color }) {
  return (
    <div>
      <div style={{ color: C.textMuted, fontSize: 9 }}>{label}</div>
      <div style={{ color, fontSize: 15, fontWeight: 900, marginTop: 3 }}>{value}</div>
    </div>
  );
}

function ActivityLog({ log }) {
  return (
    <div style={{ borderLeft: `3px solid ${log.color}`, borderRadius: 6, background: "rgba(255,255,255,0.02)", padding: "10px 10px 10px 12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <strong style={{ color: C.text, fontSize: 12 }}>{log.name}</strong>
        <span style={{ color: log.color, fontSize: 10, fontWeight: 900, textTransform: "uppercase" }}>{log.status}</span>
      </div>
      <div style={{ color: C.textMuted, fontSize: 11, lineHeight: 1.4, marginTop: 5 }}>{log.detail}</div>
      <div style={{ color: C.textMuted, fontSize: 10, marginTop: 7 }}>{log.id} / {log.time}</div>
    </div>
  );
}

function EmptyState() {
  return <div style={{ height: "100%", display: "grid", placeItems: "center", color: C.textMuted, fontSize: 13 }}>No valid HR or SpO2 analytics for this filter yet.</div>;
}

const moduleLabel = { color: C.primary, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 900 };
