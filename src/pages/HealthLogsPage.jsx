import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Modal from "../components/Modal";
import { C, cardStyle, controlStyle, ghostButtonStyle, moduleLabel, pageStyle, primaryButtonStyle } from "../theme";
import { DEFAULT_THRESHOLDS } from "../utils/alertChecker";
import { average, formatLastSeen, formatReading, formatSystemTimestamp, lastSeenValue } from "../utils/formatters";

const SESSION_GAP_MS = 3 * 60 * 1000;

export default function HealthLogsPage({ miners, analyticsData, activityLogs = [], thresholds = DEFAULT_THRESHOLDS, onClearHealthLogs }) {
  const [selected, setSelected] = useState("all");
  const [clearOpen, setClearOpen] = useState(false);
  const [clearError, setClearError] = useState("");
  const [clearing, setClearing] = useState(false);
  const sortedMiners = useMemo(() => [...miners].sort((a, b) => lastSeenValue(b) - lastSeenValue(a) || a.id.localeCompare(b.id)), [miners]);
  const visibleMiners = selected === "all" ? sortedMiners : sortedMiners.filter((miner) => miner.id === selected);
  const sessions = useMemo(() => buildSessions(visibleMiners, analyticsData, activityLogs, thresholds), [activityLogs, analyticsData, thresholds, visibleMiners]);
  const chartData = useMemo(() => buildChartData(visibleMiners, analyticsData), [analyticsData, visibleMiners]);
  const manualAlerts = sessions.reduce((sum, session) => sum + session.manualPressCount, 0);
  const unhealthy = visibleMiners.filter((miner) => !miner.active || miner.stale || miner.finger === false || miner.manual_alert).length;

  const confirmClear = async () => {
    setClearing(true);
    setClearError("");

    try {
      await onClearHealthLogs?.();
      setClearOpen(false);
    } catch (error) {
      setClearError(error.message || "Unable to clear health logs.");
    } finally {
      setClearing(false);
    }
  };

  return (
    <div style={pageStyle}>
      {clearOpen && (
        <Modal
          title="Clear Mining Session Logs"
          onClose={() => {
            if (!clearing) setClearOpen(false);
          }}
          actions={
            <>
              <button disabled={clearing} onClick={() => setClearOpen(false)} style={{ ...ghostButtonStyle, padding: "9px 15px", opacity: clearing ? 0.5 : 1 }}>Cancel</button>
              <button disabled={clearing} onClick={confirmClear} style={{ ...primaryButtonStyle, padding: "9px 15px", opacity: clearing ? 0.75 : 1 }}>{clearing ? "Clearing..." : "Confirm Clear"}</button>
            </>
          }
        >
          <div style={{ color: C.textMuted, fontSize: 13, lineHeight: 1.55 }}>
            Clear all stored analytics used by Mining Session Logs? New device analytics will create new session rows again.
          </div>
          {clearError && <div style={{ color: C.amber, fontSize: 12, marginTop: 10 }}>{clearError}</div>}
        </Modal>
      )}
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
              {sortedMiners.map((miner) => (
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
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, color: C.textMuted, fontSize: 10, marginTop: 8 }}>
                <span>TIME AXIS: {chartData[chartData.length - 1]?.time || "NO TIMESTAMP"}</span>
                <span><b style={{ color: C.red }}>HR</b> BPM | <b style={{ color: C.primary }}>SpO2</b> %</span>
              </div>
            </div>

            <div style={{ ...cardStyle, minHeight: 0, overflow: "hidden", display: "grid", gridTemplateRows: "auto 1fr" }}>
              <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.borderSoft}`, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <PanelHeader title="Mining Session Logs" meta="Start time, end time, readings, status, alerts, sensor spikes" />
                <button
                  disabled={!sessions.length || !onClearHealthLogs}
                  onClick={() => {
                    setClearError("");
                    setClearOpen(true);
                  }}
                  style={{ ...ghostButtonStyle, padding: "8px 11px", fontSize: 11, opacity: sessions.length && onClearHealthLogs ? 1 : 0.5, cursor: sessions.length && onClearHealthLogs ? "pointer" : "not-allowed" }}
                >
                  Clear All Logs
                </button>
              </div>
              <div className="hide-scrollbar" style={{ overflow: "auto", minHeight: 0 }}>
                <div style={tableHeader}>
                  <span>Miner</span>
                  <span>Start</span>
                  <span>End</span>
                  <span>Readings</span>
                  <span>Status</span>
                  <span>Press Count</span>
                  <span>Manual Alert</span>
                  <span>Sensor Spike</span>
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
                    <span style={{ color: session.manualPressCount ? C.red : C.textMuted, fontWeight: 900 }}>{session.manualPressCount}</span>
                    <span style={{ color: session.manualAlerts ? C.red : C.green, fontWeight: 900 }}>{session.manualAlerts ? "Pressed" : "Clear"}</span>
                    <SpikeText spike={session.spike} />
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
              <div className="hide-scrollbar" style={{ overflow: "auto", flex: 1, display: "grid", gap: 8, alignContent: "start", minHeight: 0 }}>
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

function buildSessions(miners, analyticsData, activityLogs, thresholds) {
  return miners.flatMap((miner) => {
    const rows = [...(analyticsData[miner.id] || [])]
      .filter((row) => Number(row.timestamp) > 0)
      .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));

    if (rows.length === 0) return [];

    const groups = rows.reduce((sessions, row) => {
      const timestamp = Number(row.timestamp || 0);
      const current = sessions[sessions.length - 1];
      const previous = current?.[current.length - 1];

      if (!current || timestamp - Number(previous?.timestamp || 0) > SESSION_GAP_MS) {
        sessions.push([row]);
      } else {
        current.push(row);
      }

      return sessions;
    }, []);

    return groups
      .map((sessionRows, index) => {
        const first = sessionRows[0];
        const last = sessionRows[sessionRows.length - 1];
        const active = index === groups.length - 1 && miner.active;
        const manualPressCount = countManualPresses(miner, sessionRows, activityLogs, Number(first.timestamp), Number(last.timestamp), active);
        const spike = detectSensorSpike(miner, sessionRows, thresholds);

        return {
          id: `${miner.id}-${first.timestamp}-${index}`,
          deviceId: miner.id,
          name: miner.name,
          active,
          stale: active ? miner.stale : true,
          contact: active ? miner.finger !== false : true,
          manualAlerts: manualPressCount,
          manualPressCount,
          spike,
          sortTimestamp: active ? Date.now() : Number(last.timestamp || 0),
          start: formatSystemTimestamp(first.timestamp),
          end: active ? "IN PROGRESS" : formatSystemTimestamp(last.timestamp),
          avgHr: formatReading(average(sessionRows.map((row) => row.hr)) || (active ? miner.hr : 0), 0),
          avgSpo2: formatReading(average(sessionRows.map((row) => row.spo2)) || (active ? miner.spo2 : 0), 0),
        };
      })
      .sort((a, b) => sessionSortValue(b) - sessionSortValue(a));
  }).sort((a, b) => sessionSortValue(b) - sessionSortValue(a));
}

function sessionSortValue(session) {
  if (Number(session.sortTimestamp) > 0) return Number(session.sortTimestamp);
  if (session.end === "IN PROGRESS") return Date.now();
  const parsed = Date.parse(session.end);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function countManualPresses(miner, rows, activityLogs, startTimestamp, endTimestamp, includeLive) {
  const analyticsPresses = rows.filter((row) => row.manual_alert).length;
  const logPresses = activityLogs.filter((log) => {
    const timestamp = Number(log.timestamp || 0);
    const isManual = log.type === "manual_alert" || /manual alert/i.test(`${log.title} ${log.detail}`);
    const inSession = !startTimestamp || (timestamp >= startTimestamp && timestamp <= endTimestamp + SESSION_GAP_MS);
    return log.deviceId === miner.id && isManual && inSession;
  }).length;
  const livePress = includeLive && miner.manual_alert ? 1 : 0;
  return Math.max(analyticsPresses + livePress, logPresses);
}

function detectSensorSpike(miner, rows, thresholds) {
  const validRows = rows.filter((row) => Number(row.hr) > 0 || Number(row.spo2) > 0);
  const latest = validRows[validRows.length - 1] || miner;
  const hr = Number(latest.hr || miner.hr || 0);
  const spo2 = Number(latest.spo2 || miner.spo2 || 0);

  if (hr > thresholds.hrMax) return { sensor: "Heart Rate", label: `HR high spike: ${formatReading(hr, 0)} bpm`, color: C.red };
  if (hr > 0 && hr < thresholds.hrMin) return { sensor: "Heart Rate", label: `HR low spike: ${formatReading(hr, 0)} bpm`, color: C.amber };
  if (spo2 > 0 && spo2 < thresholds.spo2Min) return { sensor: "SpO2", label: `SpO2 low spike: ${formatReading(spo2, 0)}%`, color: C.red };

  for (let index = 1; index < validRows.length; index += 1) {
    const previous = validRows[index - 1];
    const current = validRows[index];
    const hrJump = Math.abs(Number(current.hr || 0) - Number(previous.hr || 0));
    const spo2Drop = Number(previous.spo2 || 0) - Number(current.spo2 || 0);

    if (hrJump >= 15) return { sensor: "Heart Rate", label: `HR spike detected: ${formatReading(current.hr, 0)} bpm`, color: C.amber };
    if (spo2Drop >= 4) return { sensor: "SpO2", label: `SpO2 drop detected: ${formatReading(current.spo2, 0)}%`, color: C.amber };
  }

  return { sensor: "No Spike", label: "HR and SpO2 stable", color: C.green };
}

function buildChartData(miners, analyticsData) {
  return miners
    .flatMap((miner) => (analyticsData[miner.id] || []).map((row) => ({ ...row, miner: miner.name })))
    .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0))
    .slice(-36)
    .map((row) => ({
      time: row.time || formatSystemTimestamp(row.timestamp),
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
  const color = session.active ? C.green : C.offline;
  const text = session.active ? "Mining active" : "Ended / offline";
  return <span style={{ color, fontWeight: 900 }}>{text}</span>;
}

function SpikeText({ spike }) {
  return (
    <div style={{ display: "grid", gap: 3 }}>
      <span style={{ color: spike.color, fontWeight: 900 }}>{spike.sensor}</span>
      <span style={{ color: C.textMuted, fontSize: 10 }}>{spike.label}</span>
    </div>
  );
}

function InfoCard({ title, children }) {
  return (
    <section style={{ ...cardStyle, padding: 15, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ color: C.text, fontSize: 14, fontWeight: 950, marginBottom: 12, flexShrink: 0 }}>{title}</div>
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
  gridTemplateColumns: "1fr 1.15fr 1.15fr 0.9fr 0.9fr 0.75fr 0.85fr 1fr",
  minWidth: 1120,
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
  gridTemplateColumns: "1fr 1.15fr 1.15fr 0.9fr 0.9fr 0.75fr 0.85fr 1fr",
  minWidth: 1120,
  gap: 12,
  padding: "12px 14px",
  alignItems: "center",
  borderBottom: `1px solid ${C.borderSoft}`,
  fontSize: 12,
};

