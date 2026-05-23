import { useMemo, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import AlertBanner from "../components/AlertBanner";
import StatCard from "../components/StatCard";
import StatusBadge from "../components/StatusBadge";
import { C, cardStyle, pageStyle } from "../theme";
import { buildAlerts, getVitalStatus } from "../utils/alertChecker";
import { average, formatLastSeen, formatReading } from "../utils/formatters";

export default function DashboardPage({ miners, liveData, thresholds }) {
  const [selected, setSelected] = useState(miners[0]?.id || "");
  const selectedId = miners.some((item) => item.id === selected) ? selected : miners[0]?.id;
  const miner = miners.find((item) => item.id === selectedId) || miners[0];
  const activeMiners = miners.filter((item) => item.active);
  const alerts = buildAlerts(miners, thresholds);
  const chartData = useMemo(() => mergeLiveSeries(liveData[miner?.id] || { hr: [], spo2: [] }), [liveData, miner?.id]);
  const activeVital = Boolean(miner?.active && miner.finger !== false);
  const contactCount = miners.filter((item) => item.active && item.finger !== false).length;

  return (
    <div style={pageStyle}>
      <div style={{ display: "grid", gridTemplateRows: "auto auto minmax(0, 1fr)", gap: 12, height: "100%", minHeight: 0 }}>
        <AlertBanner miners={miners} thresholds={thresholds} />

        <section style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
          <StatCard label="Active Miners" value={activeMiners.length} unit={`/${miners.length}`} color={C.green} sub={`${contactCount} with chest contact`} />
          <StatCard label="Avg Heart Rate" value={formatReading(average(activeMiners.map((item) => item.hr)), 0)} unit="bpm" color={C.red} sub={`${thresholds.hrMin}-${thresholds.hrMax} normal range`} />
          <StatCard label="Avg SpO2" value={formatReading(average(activeMiners.map((item) => item.spo2)), 0)} unit="%" color={C.primary} sub={`minimum ${thresholds.spo2Min}%`} />
          <StatCard label="Warnings" value={alerts.length ? alerts.length : "Clear"} color={alerts.length ? C.amber : C.green} sub="live conditions" />
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 288px", gap: 12, minHeight: 0 }}>
          <main style={{ display: "grid", gridTemplateRows: "minmax(250px, 1fr) auto", gap: 12, minHeight: 0 }}>
            <div style={{ ...cardStyle, padding: 16, minHeight: 0, display: "grid", gridTemplateRows: "auto 1fr" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 14, marginBottom: 12 }}>
                <div>
                  <div style={moduleLabel}>Realtime HR + SpO2 telemetry</div>
                  <div style={{ color: C.text, fontSize: 22, fontWeight: 950, marginTop: 4 }}>Live Sensor Monitoring</div>
                  <div style={{ color: C.textMuted, fontSize: 12, marginTop: 5 }}>
                    {miner ? `${miner.name} (${miner.id}) - ${miner.location}` : "Waiting for registered miner devices"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <StatusBadge active={Boolean(miner?.active)} />
                  <span style={{ color: C.textMuted, fontSize: 11 }}>Last seen {formatLastSeen(miner?.lastSeen)}</span>
                </div>
              </div>

              <div style={{ minHeight: 0, border: `1px solid ${C.borderSoft}`, borderRadius: 8, background: "#151515", padding: 8 }}>
                {activeVital && chartData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 12, right: 16, left: -20, bottom: 0 }}>
                      <XAxis dataKey="time" tick={{ fill: C.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={22} />
                      <YAxis yAxisId="hr" domain={[40, 140]} tick={{ fill: C.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} width={36} />
                      <YAxis yAxisId="spo2" orientation="right" domain={[85, 100]} tick={{ fill: C.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} width={34} />
                      <Tooltip contentStyle={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 12 }} />
                      <Line yAxisId="hr" type="monotone" dataKey="hr" name="Heart Rate (bpm)" stroke={C.red} strokeWidth={2.4} dot={false} isAnimationActive={false} connectNulls />
                      <Line yAxisId="spo2" type="monotone" dataKey="spo2" name="SpO2 (%)" stroke={C.primary} strokeWidth={2.2} dot={false} isAnimationActive={false} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState
                    title={miner?.active ? "Waiting for valid chest contact" : "Device offline"}
                    text={miner?.active ? "The graph starts once both heart-rate and SpO2 readings are valid." : "No live HR or SpO2 telemetry is being received from this miner."}
                  />
                )}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
              <VitalCard label="Heart Rate" value={activeVital ? formatReading(miner.hr, 0) : "--"} unit="bpm" color={C.red} status={activeVital ? getVitalStatus(miner.hr, "hr", thresholds) : "OFFLINE"} />
              <VitalCard label="SpO2" value={activeVital ? formatReading(miner.spo2, 0) : "--"} unit="%" color={C.primary} status={activeVital ? getVitalStatus(miner.spo2, "spo2", thresholds) : "OFFLINE"} />
              <VitalCard label="Chest Contact" value={miner?.finger === false ? "No" : miner?.active ? "Yes" : "--"} color={miner?.finger === false ? C.amber : C.green} status={miner?.finger === false ? "WARNING" : miner?.active ? "NORMAL" : "OFFLINE"} />
              <VitalCard label="Manual Alert" value={miner?.manual_alert ? "Active" : "Clear"} color={miner?.manual_alert ? C.red : C.green} status={miner?.manual_alert ? "CRITICAL" : "NORMAL"} />
            </div>
          </main>

          <aside style={{ display: "grid", gridTemplateRows: "auto minmax(0, 1fr) auto", gap: 12, minHeight: 0 }}>
            <section style={{ ...cardStyle, padding: 14 }}>
              <div style={moduleLabel}>Selected miner</div>
              <div style={{ color: C.text, fontSize: 18, fontWeight: 950, marginTop: 8 }}>{miner?.name || "No miner"}</div>
              <div style={{ color: C.textMuted, fontSize: 12, marginTop: 4 }}>{miner?.id || "--"} / {miner?.location || "Unassigned"}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 14 }}>
                <MiniMetric label="Status" value={miner?.active ? "Online" : "Offline"} color={miner?.active ? C.green : C.offline} />
                <MiniMetric label="Signal" value={miner?.stale ? "Stale" : miner?.active ? "Fresh" : "None"} color={miner?.stale ? C.amber : miner?.active ? C.green : C.offline} />
              </div>
            </section>

            <section style={{ minHeight: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ color: C.textMuted, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 900 }}>Miner stream</div>
                <span style={{ color: C.textMuted, fontSize: 11 }}>{miners.length} devices</span>
              </div>
              <div className="hide-scrollbar" style={{ display: "grid", gap: 8, overflow: "auto", maxHeight: "100%" }}>
                {miners.map((item) => (
                  <button key={item.id} onClick={() => setSelected(item.id)} style={{ ...cardStyle, padding: 11, textAlign: "left", cursor: "pointer", borderColor: selectedId === item.id ? C.primary : C.border, background: selectedId === item.id ? "rgba(255,106,0,0.08)" : cardStyle.background }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "start" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: C.text, fontSize: 12, fontWeight: 900 }}>{item.name}</div>
                        <div style={{ color: C.textMuted, fontSize: 10, marginTop: 3 }}>{item.id}</div>
                      </div>
                      <StatusBadge active={item.active} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginTop: 9 }}>
                      <SmallReading label="HR" value={item.active ? formatReading(item.hr, 0) : "--"} color={C.red} />
                      <SmallReading label="SpO2" value={item.active ? formatReading(item.spo2, 0) : "--"} color={C.primary} />
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <section style={{ ...cardStyle, padding: 13 }}>
              <div style={moduleLabel}>Warning indicators</div>
              <Indicator color={miner?.active ? C.green : C.offline} label={miner?.active ? "Telemetry online" : "Telemetry offline"} />
              <Indicator color={miner?.finger === false ? C.amber : C.green} label={miner?.finger === false ? "Chest contact missing" : "Chest contact normal"} />
              <Indicator color={miner?.manual_alert ? C.red : C.green} label={miner?.manual_alert ? "Manual alert pressed" : "Manual alert clear"} />
            </section>
          </aside>
        </section>
      </div>
    </div>
  );
}

function mergeLiveSeries(series) {
  const max = Math.max(series.hr?.length || 0, series.spo2?.length || 0);
  const rows = [];
  for (let index = 0; index < max; index += 1) {
    const hrPoint = series.hr?.[index];
    const spo2Point = series.spo2?.[index];
    rows.push({
      time: hrPoint?.time || spo2Point?.time || "",
      hr: Number.isFinite(Number(hrPoint?.hr)) ? Number(hrPoint.hr) : null,
      spo2: Number.isFinite(Number(spo2Point?.spo2)) ? Number(spo2Point.spo2) : null,
    });
  }
  return rows.slice(-30);
}

function EmptyState({ title, text }) {
  return (
    <div style={{ height: "100%", display: "grid", placeItems: "center", border: `1px dashed ${C.border}`, borderRadius: 8 }}>
      <div style={{ textAlign: "center", maxWidth: 360 }}>
        <div style={{ color: C.red, fontSize: 13, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" }}>{title}</div>
        <div style={{ color: C.textMuted, fontSize: 12, marginTop: 8, lineHeight: 1.5 }}>{text}</div>
      </div>
    </div>
  );
}

function VitalCard({ label, value, unit, color, status }) {
  const statusColor = status === "NORMAL" ? C.green : status === "OFFLINE" ? C.offline : status === "CRITICAL" || status === "HIGH" ? C.red : C.amber;
  return (
    <div style={{ ...cardStyle, padding: 13 }}>
      <div style={{ color: C.textMuted, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ color, fontSize: 27, fontWeight: 950, marginTop: 8, lineHeight: 1 }}>{value}<span style={{ color: C.textMuted, fontSize: 11, marginLeft: 4 }}>{unit}</span></div>
      <div style={{ color: statusColor, fontSize: 10, fontWeight: 900, marginTop: 8 }}>{status || "NO DATA"}</div>
    </div>
  );
}

function MiniMetric({ label, value, color }) {
  return (
    <div style={{ border: `1px solid ${C.borderSoft}`, borderRadius: 7, padding: 9, background: "rgba(255,255,255,0.02)" }}>
      <div style={{ color: C.textMuted, fontSize: 10 }}>{label}</div>
      <div style={{ color, fontSize: 13, fontWeight: 900, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function SmallReading({ label, value, color }) {
  return (
    <div style={{ border: `1px solid ${C.borderSoft}`, borderRadius: 6, padding: "6px 7px" }}>
      <span style={{ color: C.textMuted, fontSize: 9 }}>{label}</span>
      <span style={{ color, fontSize: 12, fontWeight: 900, marginLeft: 6 }}>{value}</span>
    </div>
  );
}

function Indicator({ color, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: `1px solid ${C.borderSoft}` }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, boxShadow: `0 0 12px ${color}` }} />
      <span style={{ color: C.textDim, fontSize: 12 }}>{label}</span>
    </div>
  );
}

const moduleLabel = { color: C.primary, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 900 };
