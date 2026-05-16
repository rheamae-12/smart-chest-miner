import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { C, cardStyle } from "../theme";
import { getVitalStatus } from "../utils/alertChecker";

export default function LiveChartCard({ title, data, color, dataKey, unit, miner, yDomain, thresholds }) {
  const latest = data[data.length - 1]?.[dataKey] ?? "--";
  const status = getVitalStatus(latest, dataKey, thresholds);
  const statusColor = status === "NORMAL" ? C.green : status === "HIGH" || status === "LOW" ? C.amber : C.red;
  const gradientId = `grad-${dataKey}-${String(miner).replace(/\W/g, "")}`;

  return (
    <div style={{ ...cardStyle, padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: C.textMuted, letterSpacing: "0.08em", textTransform: "uppercase" }}>{miner}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{title}</div>
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color }}>
          {latest}
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
          <AreaChart data={data} margin={{ top: 2, right: 2, left: -30, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="time" tick={false} axisLine={false} tickLine={false} />
            <YAxis domain={yDomain} tick={{ fontSize: 9, fill: C.textMuted }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11, color: C.text }} />
            <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} fill={`url(#${gradientId})`} dot={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
