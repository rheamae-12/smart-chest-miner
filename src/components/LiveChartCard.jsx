import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { C, cardStyle } from "../theme";
import { getVitalStatus } from "../utils/alertChecker";
import { formatReading } from "../utils/formatters";

export default function LiveChartCard({ title, data, color, dataKey, unit, miner, yDomain, thresholds }) {
  const chartData = data.slice(-24);
  const latest = chartData[chartData.length - 1]?.[dataKey] ?? 0;
  const previous = chartData[chartData.length - 2]?.[dataKey] ?? latest;
  const delta = Number(latest) - Number(previous);
  const status = getVitalStatus(latest, dataKey, thresholds);
  const statusColor = status === "NORMAL" ? C.green : status === "HIGH" || status === "LOW" ? C.amber : C.red;
  const gradientId = `grad-${dataKey}-${String(miner).replace(/\W/g, "")}`;
  const warningLine = dataKey === "hr" ? thresholds?.hrMax : thresholds?.spo2Min;
  const lowLine = dataKey === "hr" ? thresholds?.hrMin : null;

  return (
    <div style={{ ...cardStyle, padding: 18, minWidth: 0, overflow: "hidden", position: "relative" }}>
      <div style={{ position: "absolute", inset: "0 0 auto", height: 2, background: color }} />
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: C.textMuted, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" }}>{miner}</div>
          <div style={{ color: C.text, fontSize: 16, fontWeight: 900, marginTop: 4 }}>{title}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color, fontSize: 34, fontWeight: 900, lineHeight: 0.95 }}>
            {formatReading(latest)}
            <span style={{ color: C.textMuted, fontSize: 13, marginLeft: 4 }}>{unit}</span>
          </div>
          <div style={{ color: Math.abs(delta) < 0.1 ? C.textMuted : delta > 0 ? C.amber : C.green, fontSize: 11, marginTop: 7, fontWeight: 800 }}>{formatDelta(delta, unit)}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <Chip color={statusColor}>{status || "NO DATA"}</Chip>
        <Chip color={C.textMuted}>{chartData.length} live points</Chip>
        {warningLine && <Chip color={C.amber}>Limit {warningLine}</Chip>}
      </div>

      <div style={{ height: 178, minWidth: 0 }}>
        {chartData.length === 0 ? (
          <div style={{ height: "100%", border: `1px dashed ${C.border}`, borderRadius: 8, display: "grid", placeItems: "center", color: C.textMuted, fontSize: 13 }}>Waiting for sensor stream</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.34} />
                  <stop offset="90%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={C.borderSoft} vertical={false} />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: C.textMuted }} minTickGap={18} axisLine={false} tickLine={false} />
              <YAxis domain={yDomain} tick={{ fontSize: 10, fill: C.textMuted }} axisLine={false} tickLine={false} width={38} />
              {warningLine && <ReferenceLine y={warningLine} stroke={C.amber} strokeDasharray="4 4" ifOverflow="extendDomain" />}
              {lowLine && <ReferenceLine y={lowLine} stroke={C.amber} strokeDasharray="4 4" ifOverflow="extendDomain" />}
              <Tooltip contentStyle={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 12 }} />
              <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2.4} fill={`url(#${gradientId})`} dot={{ r: 2, fill: C.bg1, stroke: color, strokeWidth: 1.5 }} activeDot={{ r: 4 }} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function formatDelta(delta, unit) {
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.1) return "Stable";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}${unit} from last`;
}

function Chip({ color, children }) {
  return <span style={{ color, background: `${color}12`, border: `1px solid ${color}35`, borderRadius: 999, padding: "5px 8px", fontSize: 10, fontWeight: 900, letterSpacing: "0.04em" }}>{children}</span>;
}
