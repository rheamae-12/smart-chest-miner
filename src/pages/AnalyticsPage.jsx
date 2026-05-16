import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import StatCard from "../components/StatCard";
import { C, cardStyle } from "../theme";
import { average } from "../utils/formatters";

export default function AnalyticsPage({ miners, analyticsData }) {
  const [filter, setFilter] = useState({ miner: "all", sensor: "both", range: "30" });
  const visibleMiners = filter.miner === "all" ? miners : miners.filter((miner) => miner.id === filter.miner);
  const rangeStart = getRangeStart(filter.range);

  const flattened = useMemo(
    () =>
      visibleMiners.flatMap((miner) =>
        (analyticsData[miner.id] || [])
          .filter((point) => !rangeStart || Number(point.timestamp || 0) >= rangeStart)
          .map((point) => ({
            ...point,
            minerId: miner.id,
            miner: miner.name,
          })),
      ),
    [analyticsData, rangeStart, visibleMiners],
  );

  const comparison = visibleMiners.map((miner) => {
    const rows = (analyticsData[miner.id] || []).filter((point) => !rangeStart || Number(point.timestamp || 0) >= rangeStart);
    return {
      miner: miner.name,
      hr: average(rows.map((row) => row.hr)),
      spo2: average(rows.map((row) => row.spo2)),
    };
  });

  return (
    <div style={{ padding: "20px 24px", overflow: "auto", height: "100%" }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <Select label="Miner" value={filter.miner} onChange={(miner) => setFilter({ ...filter, miner })}>
          <option value="all">All Miners</option>
          {miners.map((miner) => (
            <option key={miner.id} value={miner.id}>
              {miner.name}
            </option>
          ))}
        </Select>
        <Select label="Sensor" value={filter.sensor} onChange={(sensor) => setFilter({ ...filter, sensor })}>
          <option value="both">Both</option>
          <option value="hr">Heart Rate only</option>
          <option value="spo2">SpO2 only</option>
        </Select>
        <Select label="Range" value={filter.range} onChange={(range) => setFilter({ ...filter, range })}>
          <option value="30">Last 30 min</option>
          <option value="60">Last 60 min</option>
          <option value="today">Today</option>
        </Select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(140px, 1fr))", gap: 12, marginBottom: 20 }}>
        <StatCard label="Avg HR" value={average(flattened.map((row) => row.hr)) || "--"} unit="bpm" color={C.red} />
        <StatCard label="Avg SpO2" value={average(flattened.map((row) => row.spo2)) || "--"} unit="%" color={C.cyan} />
        <StatCard label="Tracked" value={visibleMiners.length} unit="miners" color={C.green} />
        <StatCard label="Total Readings" value={flattened.length} color={C.amber} />
      </div>

      {(filter.sensor === "both" || filter.sensor === "hr") && <LinePanel title="Heart Rate History" miners={visibleMiners} analyticsData={analyticsData} rangeStart={rangeStart} dataKey="hr" color={C.red} unit="bpm" />}
      {(filter.sensor === "both" || filter.sensor === "spo2") && <LinePanel title="SpO2 History" miners={visibleMiners} analyticsData={analyticsData} rangeStart={rangeStart} dataKey="spo2" color={C.cyan} unit="%" />}

      <div style={{ ...cardStyle, padding: 18, marginTop: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 14 }}>Miner Comparison</div>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={comparison}>
              <CartesianGrid stroke={C.border} vertical={false} />
              <XAxis dataKey="miner" tick={{ fontSize: 10, fill: C.textMuted }} />
              <YAxis tick={{ fontSize: 9, fill: C.textMuted }} axisLine={false} />
              <Tooltip contentStyle={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11 }} />
              <Legend />
              {(filter.sensor === "both" || filter.sensor === "hr") && <Bar dataKey="hr" fill={C.red} radius={[4, 4, 0, 0]} name="HR (bpm)" />}
              {(filter.sensor === "both" || filter.sensor === "spo2") && <Bar dataKey="spo2" fill={C.cyan} radius={[4, 4, 0, 0]} name="SpO2 (%)" />}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function getRangeStart(range) {
  const now = Date.now();
  if (range === "30") return now - 30 * 60 * 1000;
  if (range === "60") return now - 60 * 60 * 1000;
  if (range === "today") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return start.getTime();
  }
  return 0;
}

function Select({ label, value, onChange, children }) {
  return (
    <label style={{ display: "grid", gap: 5 }}>
      <span style={{ fontSize: 10, color: C.textMuted, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} style={{ background: C.bg2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 7, padding: "8px 12px", fontSize: 12 }}>
        {children}
      </select>
    </label>
  );
}

function LinePanel({ title, miners, analyticsData, rangeStart, dataKey, color, unit }) {
  const filteredData = Object.fromEntries(
    miners.map((miner) => [miner.id, (analyticsData[miner.id] || []).filter((point) => !rangeStart || Number(point.timestamp || 0) >= rangeStart)]),
  );
  const chartData = [];
  const longest = Math.max(0, ...miners.map((miner) => (filteredData[miner.id] || []).length));
  for (let index = 0; index < longest; index += 1) {
    const row = { time: filteredData[miners[0]?.id]?.[index]?.time || "" };
    miners.forEach((miner) => {
      row[miner.name] = filteredData[miner.id]?.[index]?.[dataKey] ?? null;
    });
    chartData.push(row);
  }

  return (
    <div style={{ ...cardStyle, padding: 18, marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 14 }}>
        {title} ({unit})
      </div>
      <div style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid stroke={C.border} vertical={false} />
            <XAxis dataKey="time" tick={{ fontSize: 9, fill: C.textMuted }} />
            <YAxis tick={{ fontSize: 9, fill: C.textMuted }} axisLine={false} />
            <Tooltip contentStyle={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11 }} />
            <Legend />
            {miners.map((miner, index) => (
              <Line key={miner.id} type="monotone" dataKey={miner.name} stroke={index === 0 ? color : index % 2 ? C.amber : C.green} dot={false} strokeWidth={1.6} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
