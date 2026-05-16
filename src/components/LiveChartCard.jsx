import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { C, cardStyle } from "../theme";
import { getVitalStatus } from "../utils/alertChecker";
import { formatReading } from "../utils/formatters";

export default function LiveChartCard({ title, data, color, dataKey, unit, miner, yDomain, thresholds }) {
  const latest = data[data.length - 1]?.[dataKey] ?? 0;
  const status = getVitalStatus(latest, dataKey, thresholds);
  const statusColor = status === "NORMAL" ? C.green : status === "HIGH" || status === "LOW" ? C.amber : C.red;
  const chartData = data.slice(-20);

  return (
    <div style={{ ...cardStyle, padding: "16px 18px", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 170px", minWidth: 0 }}>
          <div style={{ fontSize: 11, color: C.textMuted, letterSpacing: "0.08em", textTransform: "uppercase" }}>{miner}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{title}</div>
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color, whiteSpace: "nowrap", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" }}>
          {formatReading(latest)}
          {unit}
        </div>
        {status && (
          <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, background: `${statusColor}18`, color: statusColor, border: `1px solid ${statusColor}40`, fontWeight: 700, letterSpacing: "0.06em" }}>
            {status}
          </span>
        )}
      </div>
      <div style={{ height: 90 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
            <XAxis dataKey="time" tick={false} axisLine={false} tickLine={false} />
            <YAxis domain={yDomain} tick={{ fontSize: 9, fill: C.textMuted }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11, color: C.text }} />
            <Line
              type="linear"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={1.8}
              dot={{ r: 2, strokeWidth: 1, fill: C.bg1 }}
              activeDot={{ r: 3 }}
              isAnimationActive={false}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
