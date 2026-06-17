import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Modal from "../components/Modal";
import PageHeader from "../components/PageHeader";
import { C, cardStyle, controlStyle, ghostButtonStyle, pageStyle, primaryButtonStyle } from "../theme";
import { DEFAULT_THRESHOLDS } from "../utils/alertChecker";
import { average, formatReading, formatSystemTimestamp, lastSeenValue } from "../utils/formatters";

const SESSION_GAP_MS = 3 * 60 * 1000;

export default function HealthLogsPage({ miners, analyticsData, activityLogs = [], thresholds = DEFAULT_THRESHOLDS, onClearHealthLogs }) {
  const [selected, setSelected] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [clearOpen, setClearOpen] = useState(false);
  const [clearError, setClearError] = useState("");
  const [clearing, setClearing] = useState(false);
  const sortedMiners = useMemo(() => [...miners].sort((a, b) => lastSeenValue(b) - lastSeenValue(a) || a.id.localeCompare(b.id)), [miners]);
  // One miner is always selected (defaults to the first) — no "all" aggregate view.
  const selectedId = sortedMiners.some((miner) => miner.id === selected) ? selected : (sortedMiners[0]?.id || "");
  const visibleMiners = useMemo(() => sortedMiners.filter((miner) => miner.id === selectedId), [sortedMiners, selectedId]);

  // Date + time range filter — narrow the stored readings to a From / To window.
  const dateRange = useMemo(() => ({
    start: dateFrom ? new Date(dateFrom).getTime() : null,
    end: dateTo ? new Date(dateTo).getTime() : null,
  }), [dateFrom, dateTo]);
  const scopedAnalytics = useMemo(() => {
    if (!dateRange.start && !dateRange.end) return analyticsData;
    const out = {};
    Object.entries(analyticsData || {}).forEach(([id, rows]) => {
      out[id] = (rows || []).filter((row) => {
        const t = Number(row.timestamp || 0);
        if (dateRange.start && t < dateRange.start) return false;
        if (dateRange.end && t > dateRange.end) return false;
        return true;
      });
    });
    return out;
  }, [analyticsData, dateRange]);

  const sessions = useMemo(() => buildSessions(visibleMiners, scopedAnalytics, activityLogs, thresholds), [activityLogs, scopedAnalytics, thresholds, visibleMiners]);
  const chartData = useMemo(() => buildChartData(visibleMiners, scopedAnalytics), [scopedAnalytics, visibleMiners]);
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
        <PageHeader
          label="Miner health records"
          title="Health Logs"
          titleSize={26}
          subtitle="Session history, start and end time, readings, status, and manual alert events."
          right={
            <>
              <FilterLabel text="Miner">
                <select value={selectedId} onChange={(event) => setSelected(event.target.value)} style={{ ...controlStyle, width: 184 }}>
                  {sortedMiners.length === 0 && <option value="">No miners</option>}
                  {sortedMiners.map((miner) => (
                    <option key={miner.id} value={miner.id}>{miner.name} ({miner.id})</option>
                  ))}
                </select>
              </FilterLabel>
              <FilterLabel text="From (date &amp; time)">
                <input type="datetime-local" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} style={{ ...controlStyle, width: 196, padding: "8px 10px" }} />
              </FilterLabel>
              <FilterLabel text="To (date &amp; time)">
                <input type="datetime-local" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} style={{ ...controlStyle, width: 196, padding: "8px 10px" }} />
              </FilterLabel>
              {(dateFrom || dateTo) && (
                <button onClick={() => { setDateFrom(""); setDateTo(""); }} style={{ ...ghostButtonStyle, padding: "9px 13px", fontSize: 11, alignSelf: "end" }}>
                  Clear dates
                </button>
              )}
            </>
          }
        />

        <section style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10 }}>
          <Summary label="Sessions" value={sessions.length} color={C.primary} />
          <Summary label="Manual Alerts" value={manualAlerts} color={manualAlerts ? C.red : C.green} />
          <Summary label="Healthy Miners" value={visibleMiners.length - unhealthy} unit={`/${visibleMiners.length}`} color={unhealthy ? C.amber : C.green} />
          <Summary label="Readings Logged" value={chartData.length} color={C.amber} />
          <Summary label="Avg Body Temp" value={formatReading(average(chartData.map((row) => row.temp).filter(Boolean)), 1)} unit="°C" color={C.teal} />
        </section>

        <section style={{ display: "grid", gridTemplateRows: "220px minmax(0, 1fr)", gap: 12, minHeight: 0 }}>
            <div className="cc-vitals" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, minHeight: 0 }}>
              <SensorChart data={chartData} dataKey="hr" name="Heart Rate" unit="bpm" color={C.red} digits={0} />
              <SensorChart data={chartData} dataKey="spo2" name="SpO2" unit="%" color={C.primary} domain={[80, 100]} digits={0} />
              <SensorChart data={chartData} dataKey="temp" name="Body Temp" unit="°C" color={C.teal} domain={[34, 42]} digits={1} />
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
                <div className="table-header-sticky" style={tableHeader}>
                  <span>Miner</span>
                  <span>Start</span>
                  <span>End</span>
                  <span>Readings</span>
                  <span>Avg Temp</span>
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
                    <span style={{ color: C.teal, fontWeight: 900 }}>{session.avgTemp ? `${session.avgTemp}°C` : "--"}</span>
                    <StatusText session={session} />
                    <span style={{ color: session.manualPressCount ? C.red : C.textMuted, fontWeight: 900 }}>{session.manualPressCount}</span>
                    <span style={{ color: session.manualAlerts ? C.red : C.green, fontWeight: 900 }}>{session.manualAlerts ? "Pressed" : "Clear"}</span>
                    <SpikeText spike={session.spike} />
                  </div>
                ))}
                {sessions.length === 0 && <div style={{ padding: 42, color: C.textMuted, textAlign: "center", fontSize: 13 }}>No miner session logs available for this filter.</div>}
              </div>
            </div>
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
        // Only the newest group of a currently-live miner is "in progress" — and
        // only if its last reading is genuinely recent. A past date-range filter
        // can make the newest in-range group old, which must not show IN PROGRESS.
        const active =
          index === groups.length - 1 &&
          miner.active &&
          Date.now() - Number(last.timestamp || 0) < SESSION_GAP_MS * 2;
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
          avgTemp: formatReading(average(sessionRows.map((row) => row.temp).filter(Boolean)) || (active && miner.temp ? miner.temp : 0), 1) || null,
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

  const temp = Number(latest.temp || miner.temp || 0);
  if (hr > thresholds.hrMax) return { sensor: "Heart Rate", label: `HR high spike: ${formatReading(hr, 0)} bpm`, color: C.red };
  if (hr > 0 && hr < thresholds.hrMin) return { sensor: "Heart Rate", label: `HR low spike: ${formatReading(hr, 0)} bpm`, color: C.amber };
  if (spo2 > 0 && spo2 < thresholds.spo2Min) return { sensor: "SpO2", label: `SpO2 low spike: ${formatReading(spo2, 0)}%`, color: C.red };
  if (temp > 0 && temp > thresholds.tempMax) return { sensor: "Body Temp", label: `Temp high: ${formatReading(temp, 1)}°C`, color: C.red };
  if (temp > 0 && temp < thresholds.tempMin) return { sensor: "Body Temp", label: `Temp low: ${formatReading(temp, 1)}°C`, color: C.amber };

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
      temp: Number(row.temp) || null,
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

// FilterLabel — uppercase label above a filter control, used in the page header
function FilterLabel({ text, children }) {
  return (
    <label style={{ display: "grid", gap: 5 }}>
      <span style={{ fontSize: 10, color: C.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 900 }}>{text}</span>
      {children}
    </label>
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

// SensorChart — single-sensor trend (small multiple). Shows that sensor's average
// over the selected range plus a filled area chart for just that reading.
function SensorChart({ data, dataKey, name, unit, color, domain, digits = 0 }) {
  const valid = (data || []).filter((row) => Number(row[dataKey]) > 0);
  const avg = valid.length ? average(valid.map((row) => Number(row[dataKey]))) : null;
  const gradientId = `sensor-${dataKey}`;
  return (
    <div style={{ ...cardStyle, padding: 13, minHeight: 0, display: "grid", gridTemplateRows: "auto 1fr" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 9 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 8px ${color}`, flexShrink: 0 }} />
          <span style={{ color: C.text, fontSize: 13, fontWeight: 950 }}>{name}</span>
        </div>
        <span style={{ color, fontSize: 15, fontWeight: 950 }}>
          {avg !== null ? formatReading(avg, digits) : "--"}
          <span style={{ color: C.textMuted, fontSize: 10, marginLeft: 3 }}>{unit}</span>
        </span>
      </div>
      <div style={{ minHeight: 0, border: `1px solid ${C.borderSoft}`, borderRadius: 8, background: "#151515", padding: 6 }}>
        {valid.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 6, right: 8, left: -22, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.32} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={C.borderSoft} vertical={false} />
              <XAxis dataKey="time" tick={{ fill: C.textMuted, fontSize: 9 }} axisLine={false} tickLine={false} minTickGap={34} interval="preserveStartEnd" height={16} />
              <YAxis domain={domain || ["auto", "auto"]} tick={{ fill: C.textMuted, fontSize: 9 }} axisLine={false} tickLine={false} width={28} />
              <Tooltip contentStyle={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 12 }} />
              <Area type="monotone" dataKey={dataKey} name={name} stroke={color} fill={`url(#${gradientId})`} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: "100%", display: "grid", placeItems: "center", color: C.textMuted, fontSize: 12 }}>No data yet</div>
        )}
      </div>
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

const tableHeader = {
  display: "grid",
  gridTemplateColumns: "1fr 1.1fr 1.1fr 0.85fr 0.7fr 0.85fr 0.7fr 0.8fr 1fr",
  minWidth: 1260,
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
  gridTemplateColumns: "1fr 1.1fr 1.1fr 0.85fr 0.7fr 0.85fr 0.7fr 0.8fr 1fr",
  minWidth: 1260,
  gap: 12,
  padding: "12px 14px",
  alignItems: "center",
  borderBottom: `1px solid ${C.borderSoft}`,
  fontSize: 12,
};

