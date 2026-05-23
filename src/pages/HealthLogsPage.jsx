import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { C, cardStyle, controlStyle, pageStyle } from "../theme";
import { average, formatLastSeen, formatReading } from "../utils/formatters";

export default function HealthLogsPage({ miners, analyticsData }) {
  const [selected, setSelected] = useState("all");
  const visibleMiners = selected === "all" ? miners : miners.filter((miner) => miner.id === selected);
  const sessions = useMemo(() => buildSessions(visibleMiners, analyticsData), [analyticsData, visibleMiners]);
  const chartData = useMemo(() => buildChartData(visibleMiners, analyticsData), [analyticsData, visibleMiners]);
  const manualAlerts = visibleMiners.filter((miner) => miner.manual_alert).length + sessions.filter((session) => session.manualAlerts > 0).length;
  const unhealthy = visibleMiners.filter((miner) => !miner.active || miner.stale || miner.finger === false || miner.manual_alert).length;

  return (
    <div style={pageStyle}>
      <div style={{ display: "grid", gridTemplateRows: "auto auto minmax(0, 1fr)", gap: 12, height: "100%", minHeight: 0 }}>
        <section style={{ ...cardStyle, padding: 16, display: "flex", justifyContent: "space-between", gap: 14, alignItems: "end" }}>
          <div>
            <div style={moduleLabel}>Miner health records</div>
            <div style={{ color: C.text, fontSize: 26, fontWeight: 950, marginTop: 4 }}>Health Logs</div>
            <div style={{ color: C.textMuted, fontSize: 12, marginTop: 5 }}>Session history, start and end time, readings, status, and manual alert events.</div>
          </div>
          <label style={{ display: "grid", gap: 5 }}>
            <span style={{ fontSize: 10, color: C.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 900 }}>Miner</span>
            <select value={selected} onChange={(event) => setSelected(event.target.value)} style={{ ...controlStyle, width: 190 }}>
              <option value="all">All miners</option>
              {miners.map((miner) => (
                <option key={miner.id} value={miner.id}>{miner.name} ({miner.id})</option>
              ))}
            </select>
          </label>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
          <Summary label="Sessions" value={sessions.length} color={C.primary} />
          <Summary label="Manual Alerts" value={manualAlerts} color={manualAlerts ? C.red : C.green} />
          <Summary label="Healthy Miners" value={visibleMiners.length - unhealthy} unit={`/${visibleMiners.length}`} color={unhealthy ? C.amber : C.green} />
          <Summary label="Readings Logged" value={chartData.length} color={C.amber} />
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 300px", gap: 12, minHeight: 0 }}>
          <main style={{ display: "grid", gridTemplateRows: "220px minmax(0, 1fr)", gap: 12, minHeight: 0 }}>
            <div style={{ ...cardStyle, padding: 16, minHeight: 0, display: "grid", gridTemplateRows: "auto 1fr" }}>
              <PanelHeader title="Reading History" meta="Heart rate and SpO2 trend" />
              <div style={{ minHeight: 0, border: `1px solid ${C.borderSoft}`, borderRadius: 8, background: "#151515", padding: 8 }}>
                {chartData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 8, right: 16, left: -18, bottom: 0 }}>
                      <defs>
                        <linearGradient id="healthHr" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={C.red} stopOpacity={0.2} />
                          <stop offset="100%" stopColor={C.red} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke={C.borderSoft} vertical={false} />
                      <XAxis dataKey="time" tick={{ fill: C.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={24} />
                      <YAxis tick={{ fill: C.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} width={36} />
                      <Tooltip contentStyle={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 12 }} />
                      <Area type="monotone" dataKey="hr" name="Heart Rate" stroke={C.red} fill="url(#healthHr)" strokeWidth={2} dot={false} isAnimationActive={false} />
                      <Area type="monotone" dataKey="spo2" name="SpO2" stroke={C.primary} fill="transparent" strokeWidth={1.8} dot={false} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height: "100%", display: "grid", placeItems: "center", color: C.textMuted, fontSize: 13 }}>No historical readings yet.</div>
                )}
              </div>
            </div>

            <div style={{ ...cardStyle, minHeight: 0, overflow: "hidden", display: "grid", gridTemplateRows: "auto 1fr" }}>
              <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.borderSoft}` }}>
                <PanelHeader title="Mining Session Logs" meta="Start time, end time, readings, status" />
              </div>
              <div className="hide-scrollbar" style={{ overflow: "auto", minHeight: 0 }}>
                <div style={tableHeader}>
                  <span>Miner</span>
                  <span>Start</span>
                  <span>End</span>
                  <span>Readings</span>
                  <span>Status</span>
                  <span>Manual Alert</span>
                </div>
                {sessions.map((session) => (
                  <div key={session.id} style={tableRow}>
                    <div>
                      <div style={{ color: C.text, fontWeight: 900 }}>{session.name}</div>
                      <div style={{ color: C.textMuted, fontSize: 10 }}>{session.deviceId}</div>
                    </div>
                    <span style={{ color: C.textDim }}>{session.start}</span>
                    <span style={{ color: C.textDim }}>{session.end}</span>
                    <div style={{ display: "grid", gap: 3 }}>
                      <span style={{ color: C.red, fontWeight: 900 }}>HR {session.avgHr} bpm</span>
                      <span style={{ color: C.primary, fontWeight: 900 }}>SpO2 {session.avgSpo2}%</span>
                    </div>
                    <StatusText session={session} />
                    <span style={{ color: session.manualAlerts ? C.red : C.green, fontWeight: 900 }}>{session.manualAlerts ? "Pressed" : "Clear"}</span>
                  </div>
                ))}
                {sessions.length === 0 && <div style={{ padding: 42, color: C.textMuted, textAlign: "center", fontSize: 13 }}>No miner session logs available for this filter.</div>}
              </div>
            </div>
          </main>

          <aside style={{ display: "grid", gridTemplateRows: "auto auto 1fr", gap: 12, minHeight: 0 }}>
            <InfoCard title="Miner Health">
              {visibleMiners.map((miner) => (
                <HealthRow key={miner.id} miner={miner} />
              ))}
            </InfoCard>
            <InfoCard title="Current Status">
              <StatusMetric label="Online" value={visibleMiners.filter((miner) => miner.active).length} color={C.green} />
              <StatusMetric label="Offline" value={visibleMiners.filter((miner) => !miner.active).length} color={C.offline} />
              <StatusMetric label="Chest contact warnings" value={visibleMiners.filter((miner) => miner.finger === false).length} color={C.amber} />
              <StatusMetric label="Manual alerts" value={visibleMiners.filter((miner) => miner.manual_alert).length} color={C.red} />
            </InfoCard>
            <InfoCard title="Recent Alert Notes">
              <div className="hide-scrollbar" style={{ overflow: "auto", maxHeight: "100%", display: "grid", gap: 8 }}>
                {visibleMiners.map((miner) => (
                  <AlertNote key={miner.id} miner={miner} />
                ))}
              </div>
            </InfoCard>
          </aside>
        </section>
      </div>
    </div>
  );
}

function buildSessions(miners, analyticsData) {
  return miners.map((miner) => {
    const rows = analyticsData[miner.id] || [];
    const first = rows[0];
    const last = rows[rows.length - 1];
    return {
      id: `${miner.id}-${first?.timestamp || "current"}`,
      deviceId: miner.id,
      name: miner.name,
      active: miner.active,
      stale: miner.stale,
      contact: miner.finger !== false,
      manualAlerts: rows.filter((row) => row.manual_alert).length + (miner.manual_alert ? 1 : 0),
      start: first?.timestamp ? new Date(first.timestamp).toLocaleString() : "Not started",
      end: miner.active ? "In progress" : last?.timestamp ? new Date(last.timestamp).toLocaleString() : "No end time",
      avgHr: formatReading(average(rows.map((row) => row.hr)) || miner.hr, 0),
      avgSpo2: formatReading(average(rows.map((row) => row.spo2)) || miner.spo2, 0),
    };
  });
}

function buildChartData(miners, analyticsData) {
  return miners
    .flatMap((miner) => (analyticsData[miner.id] || []).map((row) => ({ ...row, miner: miner.name })))
    .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0))
    .slice(-36)
    .map((row) => ({
      time: row.time || new Date(row.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      hr: Number(row.hr) || null,
      spo2: Number(row.spo2) || null,
    }));
}

function Summary({ label, value, unit, color }) {
  return (
    <div style={{ ...cardStyle, padding: 14, borderLeft: `3px solid ${color}` }}>
      <div style={{ color: C.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ color, fontSize: 26, fontWeight: 950, marginTop: 8 }}>{value}<span style={{ color: C.textMuted, fontSize: 12, marginLeft: 4 }}>{unit}</span></div>
    </div>
  );
}

function PanelHeader({ title, meta }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
      <div style={{ color: C.text, fontSize: 14, fontWeight: 950 }}>{title}</div>
      <div style={{ color: C.textMuted, fontSize: 10 }}>{meta}</div>
    </div>
  );
}

function StatusText({ session }) {
  const color = session.active ? C.green : session.stale ? C.amber : C.offline;
  const text = session.active ? "Mining active" : session.stale ? "Signal stale" : "Ended / offline";
  return <span style={{ color, fontWeight: 900 }}>{text}</span>;
}

function InfoCard({ title, children }) {
  return (
    <section style={{ ...cardStyle, padding: 15, minHeight: 0 }}>
      <div style={{ color: C.text, fontSize: 14, fontWeight: 950, marginBottom: 12 }}>{title}</div>
      {children}
    </section>
  );
}

function HealthRow({ miner }) {
  const color = miner.active && miner.finger !== false && !miner.manual_alert ? C.green : miner.manual_alert ? C.red : C.amber;
  const status = miner.active && miner.finger !== false && !miner.manual_alert ? "Healthy" : miner.manual_alert ? "Manual alert" : miner.active ? "Needs check" : "Offline";
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.borderSoft}` }}>
      <div>
        <div style={{ color: C.text, fontSize: 12, fontWeight: 900 }}>{miner.name}</div>
        <div style={{ color: C.textMuted, fontSize: 10 }}>{miner.id}</div>
      </div>
      <strong style={{ color, fontSize: 11 }}>{status}</strong>
    </div>
  );
}

function StatusMetric({ label, value, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.borderSoft}` }}>
      <span style={{ color: C.textMuted, fontSize: 12 }}>{label}</span>
      <strong style={{ color }}>{value}</strong>
    </div>
  );
}

function AlertNote({ miner }) {
  const text = miner.manual_alert ? "Manual alert button was pressed." : miner.finger === false ? "Chest contact warning was recorded." : miner.active ? "Miner is currently within monitoring window." : `Offline. Last seen ${formatLastSeen(miner.lastSeen)}.`;
  const color = miner.manual_alert ? C.red : miner.finger === false ? C.amber : miner.active ? C.green : C.offline;
  return <div style={{ color: C.textMuted, fontSize: 12, lineHeight: 1.45, borderLeft: `3px solid ${color}`, padding: "7px 0 7px 10px", background: "rgba(255,255,255,0.02)", borderRadius: 6 }}>{miner.name}: {text}</div>;
}

const tableHeader = {
  display: "grid",
  gridTemplateColumns: "1fr 1.2fr 1.2fr 1fr 1fr 0.9fr",
  minWidth: 920,
  gap: 12,
  padding: "10px 14px",
  color: C.textMuted,
  fontSize: 10,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  borderBottom: `1px solid ${C.borderSoft}`,
};

const tableRow = {
  display: "grid",
  gridTemplateColumns: "1fr 1.2fr 1.2fr 1fr 1fr 0.9fr",
  minWidth: 920,
  gap: 12,
  padding: "12px 14px",
  alignItems: "center",
  borderBottom: `1px solid ${C.borderSoft}`,
  fontSize: 12,
};

const moduleLabel = { color: C.primary, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 900 };
