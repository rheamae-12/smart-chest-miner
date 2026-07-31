import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import FilterToolbar, { FilterField, FilterTabs } from "../components/FilterToolbar";
import Modal from "../components/Modal";
import { C, cardStyle, controlStyle, ghostButtonStyle, pageStyle, primaryButtonStyle } from "../theme";
import { DEFAULT_THRESHOLDS, getVitalStatus } from "../utils/alertChecker";
import { DATE_RANGE_OPTIONS, isWithinDateRange, resolveDateRange } from "../utils/filtering";
import { average, compactTimestamp, formatReading, formatSystemTimestamp, lastSeenValue, uniqueChartLabels } from "../utils/formatters";
import { compareMinersActiveFirst } from "../utils/minerOrdering";

const SESSION_GAP_MS = 3 * 60 * 1000;

export default function HealthLogsPage({ miners, analyticsData, liveData = {}, activityLogs = [], thresholds = DEFAULT_THRESHOLDS, onClearHealthLogs }) {
  const [selected, setSelected] = useState(() => findLatestMinerId(miners, analyticsData, liveData));
  const [minerChanged, setMinerChanged] = useState(false);
  const [rangePreset, setRangePreset] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [clearOpen, setClearOpen] = useState(false);
  const [clearError, setClearError] = useState("");
  const [clearing, setClearing] = useState(false);
  const sortedMiners = useMemo(() => buildMinerOptions(miners, analyticsData, liveData), [analyticsData, liveData, miners]);
  const latestMinerId = useMemo(
    () => findLatestMinerId(sortedMiners, analyticsData, liveData),
    [analyticsData, liveData, sortedMiners],
  );

  // One miner is always selected, defaulting to the device with the latest data.
  const selectedId = sortedMiners.some((miner) => miner.id === selected) ? selected : latestMinerId;
  const visibleMiners = useMemo(() => sortedMiners.filter((miner) => miner.id === selectedId), [sortedMiners, selectedId]);

  // Date + time range filter — narrow the stored readings to a From / To window.
  const dateRange = useMemo(
    () => resolveDateRange(rangePreset, { from: dateFrom, to: dateTo }),
    [dateFrom, dateTo, rangePreset],
  );
  const combinedAnalytics = useMemo(() => mergeAnalyticsWithLive(sortedMiners, analyticsData, liveData), [analyticsData, liveData, sortedMiners]);
  const scopedAnalytics = useMemo(() => {
    if (!dateRange.start && !dateRange.end) return combinedAnalytics;
    const out = {};
    Object.entries(combinedAnalytics || {}).forEach(([id, rows]) => {
      out[id] = (rows || []).filter((row) => {
        const t = Number(row.timestamp || 0);
        return isWithinDateRange(t, dateRange);
      });
    });
    return out;
  }, [combinedAnalytics, dateRange]);

  const sessions = useMemo(() => buildSessions(visibleMiners, scopedAnalytics, activityLogs, thresholds), [activityLogs, scopedAnalytics, thresholds, visibleMiners]);
  const chartData = useMemo(() => buildChartData(visibleMiners, scopedAnalytics), [scopedAnalytics, visibleMiners]);
  const manualAlerts = sessions.reduce((sum, session) => sum + session.manualPressCount, 0);
  const activeFilterCount = Number(minerChanged) + Number(rangePreset !== "all");
  const selectedMinerName = visibleMiners[0]?.name || "No miner selected";
  const rangeLabel = DATE_RANGE_OPTIONS.find((option) => option.value === rangePreset)?.label || "All time";

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
      <div className="health-logs-layout page-layout" style={{ display: "grid", gridTemplateRows: "auto auto minmax(0, 1fr)", gap: 12, height: "100%", minHeight: 0 }}>
        <FilterToolbar
          summary={`${selectedMinerName} · ${rangeLabel}`}
          activeCount={activeFilterCount}
          onReset={() => { setSelected(latestMinerId); setMinerChanged(false); setRangePreset("all"); setDateFrom(""); setDateTo(""); }}
        >
          <FilterField label="Miner">
            <select
              value={selectedId}
              onChange={(event) => {
                setSelected(event.target.value);
                setMinerChanged(true);
              }}
              style={{ ...controlStyle, minWidth: 220 }}
            >
              {sortedMiners.length === 0 && <option value="">No miners</option>}
              {sortedMiners.map((miner) => (
                <option key={miner.id} value={miner.id}>
                  {miner.name} ({miner.id}){miner.id === latestMinerId ? " · latest" : ""}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Date range">
            <FilterTabs ariaLabel="Health log date range" value={rangePreset} onChange={setRangePreset} options={DATE_RANGE_OPTIONS} />
          </FilterField>
          {rangePreset === "custom" && (
            <>
              <FilterField label="Start date" className="filter-field-date">
                <input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} style={{ ...controlStyle, width: 158, padding: "8px 10px" }} />
              </FilterField>
              <FilterField label="End date" className="filter-field-date">
                <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} style={{ ...controlStyle, width: 158, padding: "8px 10px" }} />
              </FilterField>
            </>
          )}
        </FilterToolbar>

        <section className="health-summary-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
          <Summary label="Sessions" value={sessions.length} color={C.primary} />
          <Summary label="Manual SOS" value={manualAlerts} color={manualAlerts ? C.red : C.green} />
          <Summary label="Readings Logged" value={chartData.length} color={C.amber} />
        </section>

        <section className="health-content-grid" style={{ display: "grid", gridTemplateRows: "minmax(0, 220px) minmax(0, 1fr)", gap: 12, minHeight: 0 }}>
            <div className="cc-vitals health-chart-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, minHeight: 0, height: "100%" }}>
              <SensorChart data={chartData} dataKey="hr" name="Heart Rate" color={C.red} yLabel="bpm" />
              <SensorChart data={chartData} dataKey="spo2" name="SpO2" color={C.oxygen} domain={dynamicDomain(chartData, "spo2", 2)} yLabel="%" />
              <SensorChart data={chartData} dataKey="temp" name="Body Temp" color={C.teal} domain={dynamicDomain(chartData, "temp", 0.4)} yLabel="°C" />
            </div>

            <div style={{ ...cardStyle, minHeight: 0, overflow: "hidden", display: "grid", gridTemplateRows: "auto 1fr" }}>
              <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.borderSoft}`, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <PanelHeader title="Mining Session Logs" meta="Session time, duration, vital ranges, alerts, SOS, status" />
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
                  <span>Session Time</span>
                  <span>Duration</span>
                  <span>Heart Rate</span>
                  <span>SpO₂</span>
                  <span>Body Temperature</span>
                  <span>Alerts</span>
                  <span>SOS Presses</span>
                  <span>Session Status</span>
                </div>
                {sessions.map((session) => (
                  <div key={session.id} className="health-session-table-row" style={tableRow}>
                    <div>
                      <div style={{ color: C.text, fontWeight: 900 }}>{session.name}</div>
                      <div style={{ color: C.textMuted, fontSize: 10 }}>{session.deviceId}</div>
                    </div>
                    <div style={{ display: "grid", gap: 3, color: C.textDim }}>
                      <span>{session.start}</span>
                      <span style={{ color: C.textMuted, fontSize: 10 }}>to {session.end}</span>
                    </div>
                    <span style={{ color: C.textDim, fontWeight: 800 }}>{session.duration}</span>
                    <ReadingRange value={session.hr} color={C.red} unit="bpm" />
                    <ReadingRange value={session.spo2} color={C.oxygen} unit="%" />
                    <ReadingRange value={session.temp} color={C.teal} unit="°C" />
                    <AlertsText alerts={session.alerts} />
                    <span style={{ color: session.manualPressCount ? C.red : C.textMuted, fontWeight: 900 }}>{session.manualPressCount}</span>
                    <StatusText session={session} />
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
      .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0))
      .filter((row, index, all) => index === 0 || Number(row.timestamp || 0) !== Number(all[index - 1].timestamp || 0));

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
        const isCurrentSession = index === groups.length - 1 && Math.abs(lastSeenValue(miner) - Number(last.timestamp || 0)) < SESSION_GAP_MS * 2;
        const nextSessionStart = Number(groups[index + 1]?.[0]?.timestamp || 0);
        const statusLog = findSessionStatusLog(activityLogs, miner.id, Number(first.timestamp), Number(last.timestamp), nextSessionStart);
        // A device stores only its latest session status. Never apply that value
        // to older grouped sessions; historical rows use their own status log.
        const latestDeviceStatus = index === groups.length - 1 ? String(miner.sessionStatus || "").toLowerCase() : "";
        const recordedStatus = statusLog?.status || latestDeviceStatus;
        const manualPressCount = countManualPresses(miner, sessionRows, activityLogs, Number(first.timestamp), Number(last.timestamp), active);
        const alerts = detectSessionAlerts(miner, sessionRows, thresholds);
        const sessionStatus = active
          ? "active"
          : ["completed", "interrupted", "offline"].includes(recordedStatus)
            ? recordedStatus
            : isCurrentSession && miner.offlineConcern
              ? "interrupted"
              : isCurrentSession && (!miner.active || miner.stale)
                ? "offline"
                : "completed";

        return {
          id: `${miner.id}-${first.timestamp}-${index}`,
          deviceId: miner.id,
          name: miner.name,
          active,
          sessionStatus,
          manualPressCount,
          alerts,
          sortTimestamp: active ? Date.now() : Number(last.timestamp || 0),
          start: formatSystemTimestamp(first.timestamp),
          end: active ? "Now" : formatSystemTimestamp(last.timestamp),
          duration: formatDuration(Number(first.timestamp), active ? Date.now() : Number(last.timestamp)),
          hr: summarizeReading(sessionRows, "hr", 0, active ? miner.hr : 0),
          spo2: summarizeReading(sessionRows, "spo2", 0, active ? miner.spo2 : 0),
          temp: summarizeReading(sessionRows, "temp", 1, active ? miner.temp : 0),
        };
      })
      .sort((a, b) => sessionSortValue(b) - sessionSortValue(a));
  }).sort((a, b) => sessionSortValue(b) - sessionSortValue(a));
}

function findSessionStatusLog(activityLogs, deviceId, startTimestamp, endTimestamp, nextSessionStart) {
  const logs = (activityLogs || [])
    .filter((log) => log.deviceId === deviceId && log.type === "session_status" && ["completed", "interrupted", "offline"].includes(String(log.status || "").toLowerCase()))
    .map((log) => ({ ...log, status: String(log.status).toLowerCase(), timestamp: Number(log.timestamp || 0) }))
    .filter((log) => log.timestamp > 0);
  const exactMatch = logs.find((log) => log.timestamp === endTimestamp);
  if (exactMatch) return exactMatch;

  return logs
    .filter((log) => {
      const nearSessionEnd = log.timestamp >= endTimestamp - SESSION_GAP_MS && (!nextSessionStart || log.timestamp < nextSessionStart + SESSION_GAP_MS);
      const insideSessionWindow = log.timestamp >= startTimestamp && (!nextSessionStart || log.timestamp < nextSessionStart);
      return nearSessionEnd || insideSessionWindow;
    })
    .sort((a, b) => Math.abs(a.timestamp - endTimestamp) - Math.abs(b.timestamp - endTimestamp))[0] || null;
}

function sessionSortValue(session) {
  if (Number(session.sortTimestamp) > 0) return Number(session.sortTimestamp);
  if (session.end === "Now") return Date.now();
  const parsed = Date.parse(session.end);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function countManualPresses(miner, rows, activityLogs, startTimestamp, endTimestamp, includeLive) {
  const buttonCounts = uniquePressCounts(rows);
  const liveCount = includeLive ? Number(miner.button_press_count || miner.buttonPressCount || 0) : 0;
  const maxCount = Math.max(...buttonCounts, liveCount, 0);
  const minCount = Math.min(...buttonCounts, maxCount);
  const firstCountIsPress = rows.some((row) => {
    const count = Number(row.button_press_count ?? row.buttonPressCount ?? 0);
    return count === minCount && count > 0 && (row.button_pressed || row.manual_alert);
  });
  const counterPresses = buttonCounts.length
    ? Math.max(0, maxCount - minCount + (firstCountIsPress ? 1 : 0))
    : 0;
  const analyticsPresses = rows.filter((row, index, all) => {
    const pressed = row.button_pressed || row.manual_alert;
    if (!pressed) return false;
    const previous = all[index - 1];
    return !(previous?.button_pressed || previous?.manual_alert);
  }).length;
  const logPresses = activityLogs.filter((log) => {
    const timestamp = Number(log.timestamp || 0);
    const isManual = log.type === "manual_alert" || /manual alert|button pressed|sos/i.test(`${log.title} ${log.detail}`);
    const inSession = !startTimestamp || (timestamp >= startTimestamp && timestamp <= endTimestamp + SESSION_GAP_MS);
    return log.deviceId === miner.id && isManual && inSession;
  }).length;
  const livePress = includeLive && (miner.button_pressed || miner.manual_alert) ? 1 : 0;
  return Math.max(counterPresses, analyticsPresses + livePress, logPresses);
}

function uniquePressCounts(rows) {
  return [...new Set(
    rows
      .map((row) => Number(row.button_press_count ?? row.buttonPressCount ?? 0))
      .filter((count) => Number.isFinite(count) && count > 0),
  )].sort((a, b) => a - b);
}

function buildMinerOptions(miners, analyticsData, liveData) {
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
      finger: latest.finger ?? true,
      manual_alert: latest.manual_alert ?? false,
      button_pressed: latest.button_pressed ?? false,
      button_press_count: latest.button_press_count ?? 0,
    });
  });
  return Array.from(byId.values()).sort(compareMinersActiveFirst);
}

function latestDataTimestamp(miner, analyticsData, liveData) {
  const storedLatest = (analyticsData?.[miner.id] || []).reduce(
    (latest, row) => Math.max(latest, Number(row.timestamp || 0)),
    0,
  );
  const liveLatest = ["hr", "spo2", "temp"].reduce(
    (latest, key) => (liveData?.[miner.id]?.[key] || []).reduce(
      (seriesLatest, point) => Math.max(seriesLatest, Number(point.timestamp || 0)),
      latest,
    ),
    0,
  );
  return Math.max(lastSeenValue(miner), storedLatest, liveLatest);
}

function findLatestMinerId(miners, analyticsData, liveData) {
  return miners.reduce(
    (latest, miner) => {
      const timestamp = latestDataTimestamp(miner, analyticsData, liveData);
      return !latest || timestamp > latest.timestamp ? { id: miner.id, timestamp } : latest;
    },
    null,
  )?.id || "";
}

function mergeAnalyticsWithLive(miners, analyticsData, liveData) {
  const merged = { ...(analyticsData || {}) };
  miners.forEach((miner) => {
    const rows = [...(merged[miner.id] || []), ...liveRowsForMiner(miner, liveData[miner.id] || {})];
    const current = liveRowFromMiner(miner);
    if (current) rows.push(current);
    merged[miner.id] = dedupeRows(rows).sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
  });
  return merged;
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
      };
      row[key] = Number(point[key]) || null;
      byTimestamp.set(timestamp, row);
    });
  });
  return Array.from(byTimestamp.values());
}

function liveRowFromMiner(miner) {
  const timestamp = lastSeenValue(miner);
  if (!miner.active || timestamp <= 0 || (!miner.hr && !miner.spo2 && !miner.temp && !miner.manual_alert && !miner.button_pressed)) return null;
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
  };
}

function dedupeRows(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = Number(row.timestamp || 0);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function summarizeReading(rows, key, digits, fallback = 0) {
  const values = rows.map((row) => Number(row[key])).filter((value) => Number.isFinite(value) && value > 0);
  if (!values.length && Number(fallback) > 0) values.push(Number(fallback));
  if (!values.length) return { avg: "--", min: "--", max: "--" };
  return {
    avg: formatReading(average(values), digits),
    min: formatReading(Math.min(...values), digits),
    max: formatReading(Math.max(...values), digits),
  };
}

function formatDuration(startTimestamp, endTimestamp) {
  const durationMs = Math.max(0, Number(endTimestamp || 0) - Number(startTimestamp || 0));
  const totalMinutes = Math.floor(durationMs / 60_000);
  if (totalMinutes < 1) return "< 1 min";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function detectSessionAlerts(miner, rows, thresholds) {
  const alerts = [];
  const add = (key, label, color) => {
    if (!alerts.some((alert) => alert.key === key)) alerts.push({ key, label, color });
  };

  rows.forEach((row) => {
    const hr = Number(row.hr);
    const spo2 = Number(row.spo2);
    const temp = Number(row.temp);
    const hrStatus = getVitalStatus(hr, "hr", thresholds);
    const spo2Status = getVitalStatus(spo2, "spo2", thresholds);
    const tempStatus = getVitalStatus(temp, "temp", thresholds);
    if (hrStatus === "LOW" || hrStatus === "HIGH") add(`hr-${hrStatus}`, `HR ${hrStatus.toLowerCase()} threshold`, hrStatus === "HIGH" ? C.red : C.amber);
    if (spo2Status === "CRITICAL" || spo2Status === "LOW") add(`spo2-${spo2Status}`, `SpO₂ ${spo2Status.toLowerCase()} threshold`, spo2Status === "CRITICAL" ? C.red : C.amber);
    if (tempStatus === "HIGH" || tempStatus === "LOW") add(`temp-${tempStatus}`, `Temperature ${tempStatus.toLowerCase()} threshold`, tempStatus === "HIGH" ? C.red : C.amber);
  });

  const spike = detectSensorSpike(miner, rows, thresholds);
  if (spike.sensor !== "No Spike") add(`spike-${spike.sensor}`, spike.label, spike.color);
  return alerts;
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
  const rows = miners
    .flatMap((miner) => (analyticsData[miner.id] || []).map((row) => ({ ...row, miner: miner.name })))
    .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0))
    .slice(-36);
  const labels = uniqueChartLabels(rows);
  return rows.map((row, index) => ({
      timestamp: Number(row.timestamp || 0),
      time: labels[index] || compactTimestamp(row.timestamp),
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
function SensorChart({ data, dataKey, name, color, domain, yLabel = "" }) {
  const valid = (data || []).filter((row) => Number(row[dataKey]) > 0);
  const gradientId = `sensor-${dataKey}`;
  return (
    <div style={{ ...cardStyle, padding: 13, minHeight: 0, overflow: "hidden", display: "grid", gridTemplateRows: "auto minmax(0, 1fr)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 9 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 8px ${color}`, flexShrink: 0 }} />
          <span style={{ color: C.text, fontSize: 13, fontWeight: 950 }}>{name}</span>
        </div>
      </div>
              <div className="health-chart-frame" style={{ minHeight: 0, height: "auto", border: `1px solid ${C.borderSoft}`, borderRadius: 8, background: "#151515", padding: 6 }}>
                {valid.length ? (
          <ResponsiveContainer key={`${dataKey}-${data.length}-${data[0]?.timestamp || 0}-${data[data.length - 1]?.timestamp || 0}`} width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 10, left: 2, bottom: 28 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.32} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={C.borderSoft} vertical={false} />
              <XAxis
                dataKey="time"
                tick={{ fill: C.textMuted, fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                minTickGap={34}
                interval="preserveStartEnd"
                height={38}
                label={{ value: "Time", fill: C.textMuted, fontSize: 9, position: "insideBottom", offset: -6 }}
              />
              <YAxis
                domain={domain || ["auto", "auto"]}
                tick={{ fill: C.textMuted, fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                width={34}
                label={{ value: yLabel, angle: -90, fill: C.textMuted, fontSize: 9, position: "insideLeft" }}
              />
              <Tooltip
                allowEscapeViewBox={{ x: false, y: false }}
                wrapperStyle={{ maxWidth: "calc(100% - 12px)", zIndex: 5 }}
                contentStyle={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 12 }}
              />
              <Area type="monotone" dataKey={dataKey} name={name} stroke={color} fill={`url(#${gradientId})`} strokeWidth={2} dot={valid.length < 2 ? { r: 3 } : false} isAnimationActive={false} connectNulls />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: "100%", display: "grid", placeItems: "center", color: C.textMuted, fontSize: 12 }}>No data yet</div>
        )}
      </div>
    </div>
  );
}

function dynamicDomain(data, key, padding = 1) {
  const values = (data || []).map((row) => Number(row[key])).filter((value) => Number.isFinite(value) && value > 0);
  if (!values.length) return ["auto", "auto"];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [Number((min - padding).toFixed(1)), Number((max + padding).toFixed(1))];
  return [Number((min - padding).toFixed(1)), Number((max + padding).toFixed(1))];
}

function StatusText({ session }) {
  const tones = {
    active: [C.green, "Active"],
    completed: [C.primary, "Completed"],
    offline: [C.offline, "Offline"],
    interrupted: [C.red, "Interrupted"],
  };
  const [color, text] = tones[session.sessionStatus] || tones.offline;
  return <span style={{ color, fontWeight: 900, textTransform: "capitalize" }}>{text}</span>;
}

function ReadingRange({ value, color, unit }) {
  return (
    <div style={{ display: "grid", gap: 3 }}>
      <span style={{ color, fontWeight: 900 }}>{value.avg} {unit}</span>
      <span style={{ color: C.textMuted, fontSize: 10 }}>min {value.min} · max {value.max}</span>
    </div>
  );
}

function AlertsText({ alerts }) {
  if (!alerts.length) return <span style={{ color: C.green, fontWeight: 900 }}>None</span>;
  return (
    <div style={{ display: "grid", gap: 3 }}>
      {alerts.slice(0, 3).map((alert) => (
        <span key={alert.key} style={{ color: alert.color, fontSize: 10, fontWeight: 900 }}>{alert.label}</span>
      ))}
      {alerts.length > 3 && <span style={{ color: C.textMuted, fontSize: 10 }}>+{alerts.length - 3} more</span>}
    </div>
  );
}

const tableHeader = {
  display: "grid",
  gridTemplateColumns: "1.05fr 1.2fr 0.65fr 1fr 1fr 1.15fr 1.5fr 0.7fr 0.85fr",
  minWidth: 1480,
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
  gridTemplateColumns: "1.05fr 1.2fr 0.65fr 1fr 1fr 1.15fr 1.5fr 0.7fr 0.85fr",
  minWidth: 1480,
  gap: 12,
  padding: "12px 14px",
  alignItems: "center",
  borderBottom: `1px solid ${C.borderSoft}`,
  fontSize: 12,
};

