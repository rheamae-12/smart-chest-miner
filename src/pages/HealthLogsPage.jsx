import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import FilterToolbar, { FilterField, FilterTabs } from "../components/FilterToolbar";
import Modal from "../components/Modal";
import { C, cardStyle, controlStyle, ghostButtonStyle, pageStyle, primaryButtonStyle } from "../theme";
import { DEFAULT_THRESHOLDS, getVitalStatus } from "../utils/alertChecker";
import { countMinuteReadings } from "../utils/analyticsReadings";
import { DATE_RANGE_OPTIONS, isWithinDateRange, resolveDateRange } from "../utils/filtering";
import { average, compactTimestamp, formatReading, formatSystemTimestamp, lastSeenValue, uniqueChartLabels } from "../utils/formatters";
import { compareMinersActiveFirst } from "../utils/minerOrdering";
import { countVitalAlertLogs, countVitalAlertsInRows } from "../utils/sessionAlertCounter";

const SESSION_GAP_MS = 3 * 60 * 1000;

export default function HealthLogsPage({ miners, analyticsData, liveData = {}, sessionData = {}, activityLogs = [], thresholds = DEFAULT_THRESHOLDS, onClearHealthLogs }) {
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

  const sessions = useMemo(() => buildSessions(visibleMiners, scopedAnalytics, activityLogs, thresholds, sessionData, dateRange), [activityLogs, dateRange, scopedAnalytics, sessionData, thresholds, visibleMiners]);
  const chartData = useMemo(() => buildChartData(visibleMiners, scopedAnalytics), [scopedAnalytics, visibleMiners]);
  const readingCount = useMemo(
    () => countMinuteReadings(visibleMiners.flatMap((miner) => (scopedAnalytics[miner.id] || []).map((row) => ({ ...row, minerId: miner.id })))),
    [scopedAnalytics, visibleMiners],
  );
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
            Permanently delete all mining readings and session summaries from Firebase? This also removes legacy realtime analytics and cannot be undone. New device readings will create new session rows again.
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
          <Summary label="Readings Logged" value={readingCount} unit="minute records" color={C.amber} />
        </section>

        <section className="health-content-grid" style={{ display: "grid", gridTemplateRows: "minmax(0, 220px) minmax(0, 1fr)", gap: 12, minHeight: 0 }}>
            <div className="cc-vitals health-chart-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, minHeight: 0, height: "100%" }}>
              <SensorChart data={chartData} dataKey="hr" name="Heart Rate" color={C.red} yLabel="bpm" />
              <SensorChart data={chartData} dataKey="spo2" name="SpO2" color={C.oxygen} domain={dynamicDomain(chartData, "spo2", 2)} yLabel="%" />
              <SensorChart data={chartData} dataKey="temp" name="Temperature" color={C.teal} domain={dynamicDomain(chartData, "temp", 0.4)} yLabel="°C" />
            </div>

            <div style={{ ...cardStyle, minHeight: 0, overflow: "hidden", display: "grid", gridTemplateRows: "auto 1fr" }}>
              <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.borderSoft}`, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <PanelHeader title="Mining Session Logs" meta="Session time, duration, vital ranges, SOS, alerts, status" />
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
              <div className="health-session-table-scroll hide-scrollbar" style={{ overflow: "auto", minHeight: 0 }}>
                <div className="health-session-table-header table-header-sticky" style={tableHeader}>
                  <span>Miner</span>
                  <span>Session Time</span>
                  <span>Duration</span>
                  <span>Heart Rate</span>
                  <span>SpO₂</span>
                  <span>Temperature</span>
                  <span>SOS Presses</span>
                  <span>Alert Counter</span>
                  <span>Session Status</span>
                </div>
                {sessions.map((session) => (
                  <div key={session.id} className="health-session-table-row" style={tableRow}>
                    <div data-label="Miner">
                      <div style={{ color: C.text, fontWeight: 900 }}>{session.name}</div>
                      <div style={{ color: C.textMuted, fontSize: 10 }}>{session.deviceId}</div>
                    </div>
                    <div data-label="Session time" style={{ display: "grid", gap: 3, color: C.textDim }}>
                      <span>{session.start}</span>
                      <span style={{ color: C.textMuted, fontSize: 10 }}>to {session.end}</span>
                    </div>
                    <span data-label="Duration" style={{ color: C.textDim, fontWeight: 800 }}>{session.duration}</span>
                    <div data-label="Heart rate"><ReadingRange value={session.hr} color={C.red} unit="bpm" /></div>
                    <div data-label="SpO2"><ReadingRange value={session.spo2} color={C.oxygen} unit="%" /></div>
                    <div data-label="Temperature"><ReadingRange value={session.temp} color={C.teal} unit="°C" /></div>
                    <span data-label="SOS presses" style={{ color: session.manualPressCount ? C.red : C.textMuted, fontWeight: 900 }}>{session.manualPressCount}</span>
                    <span data-label="Alert counter" style={{ color: session.alertCount ? C.amber : C.textMuted, fontWeight: 900 }}>{session.alertCount}</span>
                    <span data-label="Session status"><StatusText session={session} /></span>
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

// eslint-disable-next-line react-refresh/only-export-components
export function buildSessions(miners, analyticsData, activityLogs, thresholds, storedSessionData = {}, dateRange = {}) {
  return miners.flatMap((miner) => {
    const storedRows = (storedSessionData[miner.id] || [])
      .filter((session) => isSessionInDateRange(session, dateRange));
    const storedSessions = storedRows.length > 0
      ? buildStoredSessions(miner, storedRows, activityLogs, thresholds, analyticsData[miner.id] || [])
      : [];
    if (storedSessions.length > 0) {
      return storedSessions;
    }

    const rows = [...(analyticsData[miner.id] || [])]
      .filter((row) => Number(row.timestamp) > 0)
      .filter((row) => isWithinDateRange(row.timestamp, dateRange))
      .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0))
      .filter((row, index, all) => index === 0 || Number(row.timestamp || 0) !== Number(all[index - 1].timestamp || 0));

    if (rows.length === 0) return [];

    const groups = rows.reduce((sessions, row) => {
      const timestamp = Number(row.timestamp || 0);
      const current = sessions[sessions.length - 1];
      const previous = current?.[current.length - 1];
      const currentSessionId = current?.[0]?.sessionId || "";
      const rowSessionId = row.sessionId || "";
      // Older persisted readings could receive a synthetic session ID based
      // on their own timestamp. Treat those as legacy row IDs, not as a new
      // mining session, or one real session appears as many table rows.
      const legacyRowSessionIds = isPerReadingSessionId(miner.id, current?.[0]) && isPerReadingSessionId(miner.id, row);
      const sessionChanged = Boolean(current && currentSessionId && rowSessionId && currentSessionId !== rowSessionId && !legacyRowSessionIds);
      const sessionRestarted = Boolean(current && previous && hasSessionRestart(
        activityLogs,
        miner.id,
        Number(previous.timestamp || 0),
        timestamp,
      ));

      if (!current || sessionChanged || sessionRestarted || timestamp - Number(previous?.timestamp || 0) > SESSION_GAP_MS) {
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
        const sessionId = first.sessionId || `${miner.id}-${first.timestamp}`;
        const statusLog = findSessionStatusLog(activityLogs, miner.id, Number(last.timestamp), nextSessionStart, sessionId);
        // The device sessionStatus field is only the latest device-wide value.
        // Historical groups must use their own timestamped status event.
        const recordedStatus = statusLog?.status || "";
        // Use the latest device reading as the end of an active session. The
        // browser clock can be ahead of the device timeline and was making the
        // displayed duration drift during a live session.
        const sessionEndTimestamp = active
          ? Math.max(Number(last.timestamp || 0), lastSeenValue(miner))
          : Number(last.timestamp || 0);
        const manualPressCount = countManualPresses(miner, sessionRows, activityLogs, Number(first.timestamp), Number(last.timestamp), active);
        const alertCount = Math.max(
          countVitalAlertsInRows(sessionRows, thresholds),
          countVitalAlertLogs(activityLogs, miner.id, Number(first.timestamp), sessionEndTimestamp),
        );
        const alerts = detectSessionAlerts(miner, sessionRows, thresholds);
        const sessionStatus = active
          ? "ongoing"
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
          alertCount,
          alerts,
          sortTimestamp: sessionEndTimestamp,
          start: formatSystemTimestamp(first.timestamp),
          end: active ? "Now" : formatSystemTimestamp(last.timestamp),
          duration: formatDuration(Number(first.timestamp), sessionEndTimestamp),
          hr: summarizeReading(sessionRows, "hr", 0, active ? miner.hr : 0),
          spo2: summarizeReading(sessionRows, "spo2", 0, active ? miner.spo2 : 0),
          temp: summarizeReading(sessionRows, "temp", 1, active ? miner.temp : 0),
        };
      })
      .sort((a, b) => sessionSortValue(b) - sessionSortValue(a));
  }).sort((a, b) => sessionSortValue(b) - sessionSortValue(a));
}

function buildStoredSessions(miner, storedRows, activityLogs, thresholds, analyticsRows = []) {
  const summariesWithReadings = hydrateStoredSummaries(storedRows, analyticsRows)
    .filter(hasStoredVitalReading);
  return coalesceStoredSessionSummaries(miner.id, summariesWithReadings, activityLogs).map((summary) => {
    const provisionalEnd = Number(summary.endTimestamp || summary.statusTimestamp || summary.updatedAt || summary.startTimestamp || summary.timestamp || 0);
    const statusLog = findSessionStatusLog(activityLogs, miner.id, provisionalEnd, 0, summary.sessionId);
    const sessionStart = sessionStartFromId(summary.sessionId);
    const startTimestamp = Number(sessionStart || summary.startTimestamp || summary.timestamp || summary.statusTimestamp || 0);
    const endTimestamp = Number(statusLog?.timestamp || summary.endTimestamp || summary.statusTimestamp || summary.updatedAt || startTimestamp);
    // The operator's timestamped status event is authoritative. A stale
    // summary status must never overwrite a newer Interrupted/Completed choice.
    const explicitStatus = String(statusLog?.status || summary.status || summary.sessionStatus || "").toLowerCase();
    const active = !explicitStatus && miner.active && Date.now() - endTimestamp < SESSION_GAP_MS * 2;
    const sessionStatus = ["completed", "interrupted", "offline", "ongoing"].includes(explicitStatus)
      ? explicitStatus
      : active ? "ongoing" : "completed";
    const manualPressCount = countLoggedSosPresses(activityLogs, miner.id, startTimestamp, endTimestamp)
      || Number(summary.manualPressCount || 0);
    const matchingRows = analyticsRows.filter((row) => {
      const timestamp = Number(row.timestamp || 0);
      return (summary.sessionId && row.sessionId === summary.sessionId)
        || (timestamp >= startTimestamp && timestamp <= endTimestamp);
    });
    const alertCount = Math.max(
      countVitalAlertLogs(activityLogs, miner.id, startTimestamp, endTimestamp),
      countVitalAlertsInRows(matchingRows, thresholds),
      Number(summary.alertCount || 0),
    );
    const avgHr = Number(summary.avgHr || 0);
    const avgSpo2 = Number(summary.avgSpo2 || 0);
    const avgTemp = Number(summary.avgTemp || 0);

    return {
      id: `${miner.id}-${summary.sessionId || startTimestamp}`,
      deviceId: miner.id,
      name: miner.name,
      active,
      sessionStatus,
      manualPressCount,
      alertCount,
      alerts: summary.alerts || detectSummaryAlerts(summary, thresholds),
      sortTimestamp: endTimestamp,
      start: formatSystemTimestamp(startTimestamp),
      end: active ? "Now" : formatSystemTimestamp(endTimestamp),
      duration: formatDuration(startTimestamp, active ? Math.max(endTimestamp, lastSeenValue(miner)) : endTimestamp),
      hr: storedRange(summary, "hr", avgHr, 0),
      spo2: storedRange(summary, "spo2", avgSpo2, 0),
      temp: storedRange(summary, "temp", avgTemp, 1),
    };
  }).sort((a, b) => sessionSortValue(b) - sessionSortValue(a));
}

function hydrateStoredSummaries(summaries, analyticsRows) {
  const rows = (analyticsRows || []).filter((row) => Number(row.timestamp || 0) > 0);
  return (summaries || []).map((summary) => {
    const start = Number(summary.startTimestamp || summary.timestamp || 0);
    const end = Number(summary.endTimestamp || summary.statusTimestamp || summary.updatedAt || start);
    const sessionStart = sessionStartFromId(summary.sessionId);
    const windowStart = sessionStart || start;
    const matchingRows = rows.filter((row) => {
      const timestamp = Number(row.timestamp || 0);
      const exactSession = summary.sessionId && row.sessionId && row.sessionId === summary.sessionId;
      const inWindow = windowStart > 0 && timestamp >= windowStart && (!end || timestamp <= end);
      return exactSession || inWindow;
    });
    if (matchingRows.length === 0) return summary;

    const values = (key) => matchingRows.map((row) => Number(row[key] || 0)).filter((value) => value > 0);
    const avg = (key, digits) => {
      const list = values(key);
      return list.length ? Number((list.reduce((sum, value) => sum + value, 0) / list.length).toFixed(digits)) : 0;
    };
    const range = (key) => {
      const list = values(key);
      return { min: list.length ? Math.min(...list) : 0, max: list.length ? Math.max(...list) : 0 };
    };
    const hr = range("hr");
    const spo2 = range("spo2");
    const temp = range("temp");
    return {
      ...summary,
      startTimestamp: Math.min(...matchingRows.map((row) => Number(row.timestamp)), start || Number.MAX_SAFE_INTEGER),
      endTimestamp: Math.max(...matchingRows.map((row) => Number(row.timestamp)), end || 0),
      readingCount: matchingRows.length,
      avgHr: avg("hr", 0),
      avgSpo2: avg("spo2", 0),
      avgTemp: avg("temp", 1),
      hrMin: hr.min,
      hrMax: hr.max,
      spo2Min: spo2.min,
      spo2Max: spo2.max,
      tempMin: temp.min,
      tempMax: temp.max,
      manualPressCount: Math.max(Number(summary.manualPressCount || 0), ...matchingRows.map((row) => Number(row.button_press_count || 0))),
    };
  });
}

function sessionStartFromId(sessionId) {
  const match = String(sessionId || "").match(/-session-(\d+)(?:-|$)/);
  return match ? Number(match[1]) : 0;
}

function coalesceStoredSessionSummaries(deviceId, rows, activityLogs = []) {
  const groups = [];
  [...rows]
    .sort((a, b) => Number(a.startTimestamp || a.timestamp || 0) - Number(b.startTimestamp || b.timestamp || 0))
    .forEach((row) => {
      const current = groups[groups.length - 1];
      const currentEnd = Number(current?.endTimestamp || current?.timestamp || 0);
      const rowStart = Number(row.startTimestamp || row.timestamp || 0);
      const sameSession = current && current.sessionId && row.sessionId && current.sessionId === row.sessionId;
      const legacyPerReading = current && isPerReadingSessionId(deviceId, {
        timestamp: current.startTimestamp || current.timestamp,
        sessionId: current.sessionId,
      }) && isPerReadingSessionId(deviceId, {
        timestamp: row.startTimestamp || row.timestamp,
        sessionId: row.sessionId,
      });
      // A summary written before the lifecycle ID was attached can remain in
      // Firestore beside the newer summary for the same session. They have
      // different document IDs, but the same start and sensor fingerprint.
      // Collapse only this well-defined alias case; distinct sessions keep
      // their immutable IDs and remain separate rows.
      const duplicateAlias = current && areDuplicateStoredSessionAliases(deviceId, current, row);
      const terminal = ["completed", "interrupted", "offline"].includes(String(current?.status || "").toLowerCase());
      // Two monitors can persist different windows of the same live timeline
      // (for example 3:13–3:14 and 3:14–3:14). Overlapping summaries cannot be
      // separate chronological sessions; collapse them unless a real lifecycle
      // boundary exists between the summaries.
      const overlappingAlias = current && !sameSession && rowStart <= currentEnd;
      const lifecycleBoundary = current && rowStart > currentEnd
        && hasStoredSessionBoundary(activityLogs, deviceId, currentEnd, rowStart);

      if (!current || lifecycleBoundary || (!sameSession && !duplicateAlias && !overlappingAlias && !(legacyPerReading && rowStart - currentEnd <= SESSION_GAP_MS && !terminal))) {
        groups.push({ ...row });
        return;
      }

      groups[groups.length - 1] = mergeStoredSessionSummaries(current, row, deviceId);
    });
  return groups;
}

function hasStoredSessionBoundary(activityLogs, deviceId, previousTimestamp, currentTimestamp) {
  if (currentTimestamp < previousTimestamp) return false;
  return (activityLogs || []).some((log) => {
    if (log.deviceId !== deviceId) return false;
    const timestamp = Number(log.timestamp || 0);
    if (timestamp <= previousTimestamp || timestamp > currentTimestamp) return false;
    if (log.type === "session_status") return ["completed", "interrupted", "offline"].includes(String(log.status || "").toLowerCase());
    return log.type === "status" && String(log.status || "").toLowerCase() === "online";
  });
}

function mergeStoredSessionSummaries(first, next, deviceId = "") {
  const firstCount = Number(first.readingCount || 0);
  const nextCount = Number(next.readingCount || 0);
  const totalCount = firstCount + nextCount;
  const weightedAverage = (key) => {
    const firstValue = Number(first[key] || 0);
    const nextValue = Number(next[key] || 0);
    if (!firstValue) return nextValue;
    if (!nextValue) return firstValue;
    return totalCount > 0
      ? Number(((firstValue * firstCount + nextValue * nextCount) / totalCount).toFixed(key === "avgTemp" ? 1 : 0))
      : nextValue;
  };
  return {
    ...first,
    ...next,
    sessionId: canonicalStoredSessionId(deviceId, first, next),
    startTimestamp: Math.min(Number(first.startTimestamp || first.timestamp || 0), Number(next.startTimestamp || next.timestamp || 0)),
    endTimestamp: Math.max(Number(first.endTimestamp || first.timestamp || 0), Number(next.endTimestamp || next.timestamp || 0)),
    readingCount: Math.max(firstCount, nextCount),
    avgHr: weightedAverage("avgHr"),
    avgSpo2: weightedAverage("avgSpo2"),
    avgTemp: weightedAverage("avgTemp"),
    hrMin: minPositive(first.hrMin, next.hrMin),
    hrMax: Math.max(Number(first.hrMax || 0), Number(next.hrMax || 0)),
    spo2Min: minPositive(first.spo2Min, next.spo2Min),
    spo2Max: Math.max(Number(first.spo2Max || 0), Number(next.spo2Max || 0)),
    tempMin: minPositive(first.tempMin, next.tempMin),
    tempMax: Math.max(Number(first.tempMax || 0), Number(next.tempMax || 0)),
    manualPressCount: Math.max(Number(first.manualPressCount || 0), Number(next.manualPressCount || 0)),
    alertCount: Math.max(Number(first.alertCount || 0), Number(next.alertCount || 0)),
    status: next.status || first.status || "",
    alerts: [...new Map([...(first.alerts || []), ...(next.alerts || [])].map((alert) => [alert.key, alert])).values()],
  };
}

function canonicalStoredSessionId(deviceId, first, next) {
  const firstId = first.sessionId || "";
  const nextId = next.sessionId || "";
  if (deviceId && isPerReadingSessionId(deviceId, { timestamp: first.startTimestamp || first.timestamp, sessionId: firstId })) return nextId || firstId;
  if (deviceId && isPerReadingSessionId(deviceId, { timestamp: next.startTimestamp || next.timestamp, sessionId: nextId })) return firstId || nextId;
  return firstId || nextId;
}

function areDuplicateStoredSessionAliases(deviceId, first, next) {
  const firstId = first.sessionId || "";
  const nextId = next.sessionId || "";
  if (!firstId || !nextId || firstId === nextId) return false;

  const firstStart = Number(first.startTimestamp || first.timestamp || 0);
  const nextStart = Number(next.startTimestamp || next.timestamp || 0);
  if (!firstStart || firstStart !== nextStart) return false;

  const firstEnd = Number(first.endTimestamp || first.statusTimestamp || firstStart);
  const nextEnd = Number(next.endTimestamp || next.statusTimestamp || nextStart);
  if (Math.abs(firstEnd - nextEnd) > SESSION_GAP_MS) return false;

  const fields = ["avgHr", "avgSpo2", "avgTemp", "hrMin", "hrMax", "spo2Min", "spo2Max", "tempMin", "tempMax"];
  const comparable = fields.filter((field) => Number(first[field] || 0) > 0 && Number(next[field] || 0) > 0);
  if (comparable.length < 2) return false;
  return comparable.every((field) => {
    const tolerance = field === "avgTemp" || field.startsWith("temp") ? 0.1 : 1;
    return Math.abs(Number(first[field]) - Number(next[field])) <= tolerance;
  });
}

function minPositive(first, next) {
  const values = [Number(first || 0), Number(next || 0)].filter((value) => value > 0);
  return values.length ? Math.min(...values) : 0;
}

function isSessionInDateRange(session, dateRange = {}) {
  const start = Number(session.startTimestamp || session.timestamp || session.statusTimestamp || 0);
  const end = Number(session.endTimestamp || session.statusTimestamp || start);
  if (dateRange.start && end < dateRange.start) return false;
  if (dateRange.end && start > dateRange.end) return false;
  return true;
}

function storedRange(summary, key, fallback, digits) {
  const averageValue = Number(summary[`avg${key[0].toUpperCase()}${key.slice(1)}`] || fallback);
  const min = Number(summary[`${key}Min`] || averageValue);
  const max = Number(summary[`${key}Max`] || averageValue);
  if (!(averageValue > 0) && !(min > 0) && !(max > 0)) return { avg: "--", min: "--", max: "--" };
  return {
    avg: formatReading(averageValue || (min + max) / 2, digits),
    min: formatReading(min, digits),
    max: formatReading(max, digits),
  };
}

function hasStoredVitalReading(summary) {
  return [
    summary.avgHr, summary.hrMin, summary.hrMax,
    summary.avgSpo2, summary.spo2Min, summary.spo2Max,
    summary.avgTemp, summary.tempMin, summary.tempMax,
  ].some((value) => Number(value) > 0);
}

function detectSummaryAlerts(summary, thresholds) {
  const alerts = [];
  // Zero means that no valid sensor value was recorded; it is not a
  // threshold violation. Do not show false alerts for status-only sessions.
  const hasReading = [
    summary.avgHr, summary.hrMin, summary.hrMax,
    summary.avgSpo2, summary.spo2Min, summary.spo2Max,
    summary.avgTemp, summary.tempMin, summary.tempMax,
  ].some((value) => Number(value) > 0);
  if (!hasReading) return alerts;
  if (getVitalStatus(Number(summary.avgHr || 0), "hr", thresholds) !== "NORMAL") alerts.push({ key: "hr-summary", label: "Heart rate threshold", color: C.amber });
  if (getVitalStatus(Number(summary.avgSpo2 || 0), "spo2", thresholds) !== "NORMAL") alerts.push({ key: "spo2-summary", label: "SpO₂ threshold", color: C.amber });
  if (getVitalStatus(Number(summary.avgTemp || 0), "temp", thresholds) !== "NORMAL") alerts.push({ key: "temp-summary", label: "Temperature threshold", color: C.amber });
  return alerts;
}

function isPerReadingSessionId(deviceId, row) {
  const timestamp = Number(row?.timestamp || 0);
  return Boolean(timestamp && row?.sessionId && row.sessionId === `${deviceId}-${timestamp}`);
}

function hasSessionRestart(activityLogs, deviceId, previousTimestamp, currentTimestamp) {
  return (activityLogs || []).some((log) => {
    if (log.deviceId !== deviceId) return false;
    const timestamp = Number(log.timestamp || 0);
    if (timestamp <= previousTimestamp || timestamp > currentTimestamp + SESSION_GAP_MS) return false;
    if (log.type === "session_status" && ["completed", "interrupted", "offline"].includes(String(log.status || "").toLowerCase())) return true;
    return log.type === "status" && String(log.status || "").toLowerCase() === "online";
  });
}

function findSessionStatusLog(activityLogs, deviceId, endTimestamp, nextSessionStart = 0, sessionId = "") {
  const logs = (activityLogs || [])
    .filter((log) => log.deviceId === deviceId && log.type === "session_status" && ["completed", "interrupted", "offline"].includes(String(log.status || "").toLowerCase()))
    .map((log) => ({ ...log, status: String(log.status).toLowerCase(), timestamp: Number(log.timestamp || 0) }))
    .filter((log) => log.timestamp > 0);
  // Session status prompts use the last live timestamp, which can be slightly
  // after the final persisted analytics point. Stay within this session's end
  // window, but never cross into the next session's reading timeline.
  const sessionMatch = logs
    .filter((log) => sessionId && log.sessionId === sessionId)
    .sort((a, b) => Math.abs(a.timestamp - endTimestamp) - Math.abs(b.timestamp - endTimestamp))[0];
  if (sessionMatch) return sessionMatch;

  const exactMatch = logs.find((log) => log.timestamp === endTimestamp);
  if (exactMatch) return exactMatch;

  return logs
    .filter((log) => log.timestamp >= endTimestamp && log.timestamp - endTimestamp <= SESSION_GAP_MS)
    .filter((log) => !nextSessionStart || log.timestamp < nextSessionStart)
    .sort((a, b) => a.timestamp - b.timestamp)[0] || null;
}

function sessionSortValue(session) {
  if (Number(session.sortTimestamp) > 0) return Number(session.sortTimestamp);
  if (session.end === "Now") return Date.now();
  const parsed = Date.parse(session.end);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function countManualPresses(miner, rows, activityLogs, startTimestamp, endTimestamp, includeLive) {
  const buttonCounts = uniquePressCounts(rows);
  const maxCount = Math.max(...buttonCounts, 0);
  const minCount = Math.min(...buttonCounts, maxCount);
  const firstCountIsPress = rows.some((row) => {
    const count = Number(row.button_press_count ?? row.buttonPressCount ?? 0);
    return count === minCount && count > 0 && row.manual_alert;
  });
  const counterPresses = buttonCounts.length
    ? Math.max(0, maxCount - minCount + (firstCountIsPress ? 1 : 0))
    : 0;
  const analyticsPresses = rows.filter((row, index, all) => {
    if (!row.manual_alert) return false;
    const previous = all[index - 1];
    return !previous?.manual_alert;
  }).length;
  const matchingLogs = activityLogs.filter((log) => {
    const timestamp = Number(log.timestamp || 0);
    const isManual = log.type === "manual_alert" || /manual alert|button pressed|sos/i.test(`${log.title} ${log.detail}`);
    const inSession = !startTimestamp || (timestamp >= startTimestamp && timestamp <= endTimestamp + SESSION_GAP_MS);
    return log.deviceId === miner.id && isManual && inSession;
  });
  const logPresses = new Set(matchingLogs.map((log) => (
    Number(log.buttonPressCount || 0) > 0
      ? `count-${Number(log.buttonPressCount)}`
      : `time-${Math.floor(Number(log.timestamp || 0) / 60000)}`
  ))).size;
  const livePress = includeLive && miner.manual_alert && !analyticsPresses && !counterPresses ? 1 : 0;
  return Math.max(counterPresses, analyticsPresses, logPresses, livePress);
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

function countLoggedSosPresses(activityLogs, deviceId, startTimestamp, endTimestamp) {
  const matchingLogs = (activityLogs || []).filter((log) => {
    const timestamp = Number(log.timestamp || 0);
    const isManual = log.type === "manual_alert" || /manual alert|button pressed|sos/i.test(`${log.title} ${log.detail}`);
    return log.deviceId === deviceId && isManual && timestamp >= startTimestamp && timestamp <= endTimestamp;
  });
  return new Set(matchingLogs.map((log) => {
    const count = Number(log.buttonPressCount || log.button_press_count || 0);
    return count > 0 ? `count-${count}` : `time-${Math.floor(Number(log.timestamp || 0) / 60000)}`;
  })).size;
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
    if (["LOW", "HIGH", "CRITICAL"].includes(hrStatus)) add(`hr-${hrStatus}`, `HR ${hrStatus.toLowerCase()} threshold`, hrStatus === "CRITICAL" ? C.red : C.amber);
    if (spo2Status === "CRITICAL" || spo2Status === "LOW") add(`spo2-${spo2Status}`, `SpO₂ ${spo2Status.toLowerCase()} threshold`, spo2Status === "CRITICAL" ? C.red : C.amber);
    if (["HIGH", "LOW", "CRITICAL"].includes(tempStatus)) add(`temp-${tempStatus}`, `Temperature ${tempStatus.toLowerCase()} threshold`, tempStatus === "CRITICAL" ? C.red : C.amber);
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
  if (hr >= thresholds.hrCriticalMin) return { sensor: "Heart Rate", label: `HR critical spike: ${formatReading(hr, 0)} bpm`, color: C.red };
  if (hr > thresholds.hrMax) return { sensor: "Heart Rate", label: `HR high spike: ${formatReading(hr, 0)} bpm`, color: C.amber };
  if (hr > 0 && hr < thresholds.hrMin) return { sensor: "Heart Rate", label: `HR low spike: ${formatReading(hr, 0)} bpm`, color: C.amber };
  if (spo2 > 0 && spo2 < thresholds.spo2CriticalMin) return { sensor: "SpO2", label: `SpO2 critical spike: ${formatReading(spo2, 0)}%`, color: C.red };
  if (spo2 > 0 && spo2 < thresholds.spo2Min) return { sensor: "SpO2", label: `SpO2 low spike: ${formatReading(spo2, 0)}%`, color: C.amber };
  if (temp > 0 && (temp <= thresholds.tempCriticalMin || temp >= thresholds.tempCriticalMax)) return { sensor: "Temperature", label: `Temperature critical: ${formatReading(temp, 1)}°C`, color: C.red };
  if (temp > 0 && temp > thresholds.tempMax) return { sensor: "Temperature", label: `Temperature high: ${formatReading(temp, 1)}°C`, color: C.amber };
  if (temp > 0 && temp < thresholds.tempMin) return { sensor: "Temperature", label: `Temperature low: ${formatReading(temp, 1)}°C`, color: C.amber };

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
    ongoing: [C.green, "Ongoing"],
    active: [C.green, "Ongoing"],
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

const tableHeader = {
  display: "grid",
  gridTemplateColumns: "minmax(130px, 1.05fr) minmax(150px, 1.2fr) minmax(64px, 0.65fr) minmax(84px, 1fr) minmax(74px, 1fr) minmax(100px, 1.15fr) minmax(58px, 0.7fr) minmax(64px, 0.75fr) minmax(82px, 0.85fr)",
  minWidth: "100%",
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
  gridTemplateColumns: "minmax(130px, 1.05fr) minmax(150px, 1.2fr) minmax(64px, 0.65fr) minmax(84px, 1fr) minmax(74px, 1fr) minmax(100px, 1.15fr) minmax(58px, 0.7fr) minmax(64px, 0.75fr) minmax(82px, 0.85fr)",
  minWidth: "100%",
  gap: 12,
  padding: "12px 14px",
  alignItems: "center",
  borderBottom: `1px solid ${C.borderSoft}`,
  fontSize: 12,
};

