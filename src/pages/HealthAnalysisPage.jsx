import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import PageHeader from "../components/PageHeader";
import { C, cardStyle, controlStyle, pageStyle } from "../theme";
import { DEFAULT_THRESHOLDS, getVitalStatus } from "../utils/alertChecker";
import { DATE_RANGE_OPTIONS, isWithinDateRange, resolveDateRange } from "../utils/filtering";
import { average, compactTimestamp, formatLastSeen, formatReading, formatSystemTimestamp, lastSeenValue, uniqueChartLabels } from "../utils/formatters";
import { compareMinersActiveFirst } from "../utils/minerOrdering";
import { buildSessions } from "./HealthLogsPage";

const METRICS = [
  { key: "hr", label: "Heart rate", unit: "bpm", color: C.red, digits: 0 },
  { key: "spo2", label: "SpO2", unit: "%", color: C.oxygen, digits: 0 },
  { key: "temp", label: "Temperature", unit: "°C", color: C.teal, digits: 1 },
];

const MAX_SESSION_X_AXIS_VALUES = 6;

export default function HealthAnalysisPage({ miners = [], analyticsData = {}, liveData = {}, sessionData = {}, activityLogs = [], thresholds = DEFAULT_THRESHOLDS }) {
  const [selectedId, setSelectedId] = useState("");
  const [rangePreset, setRangePreset] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [throughDateTime, setThroughDateTime] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const sortedMiners = useMemo(() => [...miners].sort(compareMinersActiveFirst), [miners]);
  const currentId = sortedMiners.some((miner) => miner.id === selectedId) ? selectedId : sortedMiners[0]?.id || "";
  const selectedMiner = sortedMiners.find((miner) => miner.id === currentId) || null;
  const sessionOptions = useMemo(() => {
    if (!selectedMiner) return [];
    const rows = normalizeRows(selectedMiner, analyticsData[selectedMiner.id], liveData[selectedMiner.id]);
    const built = buildSessions(
      [selectedMiner],
      { [selectedMiner.id]: rows },
      activityLogs,
      thresholds,
      sessionData,
      {},
    );
    return built.sort((a, b) => Number(b.sortTimestamp || 0) - Number(a.sortTimestamp || 0));
  }, [activityLogs, analyticsData, liveData, selectedMiner, sessionData, thresholds]);
  const effectiveSessionId = sessionOptions.some((session) => session.id === selectedSessionId)
    ? selectedSessionId
    : sessionOptions[0]?.id || "";
  const selectedSession = sessionOptions.find((session) => session.id === effectiveSessionId) || null;
  const presetDateRange = useMemo(() => resolveDateRange(rangePreset, { from: dateFrom, to: dateTo }), [dateFrom, dateTo, rangePreset]);
  const dateTimeRange = useMemo(() => rangeThroughDateTime(throughDateTime), [throughDateTime]);
  const dateRange = useMemo(
    () => intersectDateRanges(
      presetDateRange,
      dateTimeRange,
      selectedSession ? { start: sessionTimestamp(selectedSession, "start"), end: sessionTimestamp(selectedSession, "end") } : {},
    ),
    [dateTimeRange, presetDateRange, selectedSession],
  );
  const rangeLabel = selectedSession
    ? `${selectedSession.id === sessionOptions[0]?.id ? "Latest session" : "Selected session"} · ${DATE_RANGE_OPTIONS.find((option) => option.value === rangePreset)?.label || "All time"}`
    : DATE_RANGE_OPTIONS.find((option) => option.value === rangePreset)?.label || "All time";
  const summaries = useMemo(
    () => sortedMiners.map((miner) => ({
      miner,
      analysis: buildHealthFindings(miner, analyticsData[miner.id], liveData[miner.id], activityLogs, thresholds, dateRange),
    })),
    [activityLogs, analyticsData, dateRange, liveData, sortedMiners, thresholds],
  );
  const selectedAnalysis = useMemo(
    () => selectedMiner
      ? buildHealthFindings(selectedMiner, analyticsData[selectedMiner.id], liveData[selectedMiner.id], activityLogs, thresholds, dateRange)
      : emptyAnalysis(),
    [activityLogs, analyticsData, dateRange, liveData, selectedMiner, thresholds],
  );
  const sessionChart = useMemo(
    () => selectedMiner && selectedSession
      ? buildSessionChartData(selectedMiner, selectedSession, analyticsData[selectedMiner.id], liveData[selectedMiner.id], activityLogs, thresholds)
      : emptySessionChart(),
    [activityLogs, analyticsData, liveData, selectedMiner, selectedSession, thresholds],
  );

  return (
    <div style={pageStyle}>
      <div className="health-analysis-layout page-layout" style={{ display: "grid", gridTemplateRows: "auto auto minmax(0, 1fr)", gap: 12, height: "100%", minHeight: 0 }}>
        <PageHeader
          label="Personnel health review"
          title="Health Analysis"
          subtitle="Sensor-pattern findings to support an early wellbeing check for each miner."
        />

        <section className="health-analysis-filterbar" aria-label="Health analysis date filter">
          <div className="health-analysis-filter-copy">
            <span>Analysis window</span>
            <strong>{rangeLabel}</strong>
          </div>
          <label className="health-analysis-date-field">
            <span>Date range</span>
            <select value={rangePreset} onChange={(event) => setRangePreset(event.target.value)} style={{ ...controlStyle, minWidth: 142 }}>
              {DATE_RANGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          {rangePreset === "custom" && (
            <>
              <label className="health-analysis-date-field"><span>From</span><input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} style={{ ...controlStyle, minWidth: 142 }} /></label>
              <label className="health-analysis-date-field"><span>To</span><input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} style={{ ...controlStyle, minWidth: 142 }} /></label>
            </>
          )}
          <label className="health-analysis-date-field health-analysis-session-field">
            <span>Session</span>
            <select value={effectiveSessionId} onChange={(event) => setSelectedSessionId(event.target.value)} style={{ ...controlStyle, minWidth: 250 }}>
              {sessionOptions.length === 0 ? <option value="">No sessions available</option> : sessionOptions.map((session) => (
                <option key={session.id} value={session.id}>{session.start} · {session.duration} · {capitalize(session.sessionStatus)}</option>
              ))}
            </select>
          </label>
          <label className="health-analysis-date-field health-analysis-datetime-field">
            <span>Through date &amp; time</span>
            <input type="datetime-local" value={throughDateTime} onChange={(event) => setThroughDateTime(event.target.value)} style={{ ...controlStyle, minWidth: 190 }} />
          </label>
          <span className="health-analysis-filter-note">Findings recalculate for every personnel profile.</span>
        </section>

        <section className="health-analysis-main" style={{ display: "grid", gridTemplateColumns: "minmax(250px, 0.72fr) minmax(0, 1.55fr)", gap: 12, minHeight: 0, overflow: "hidden" }}>
          <aside className="health-analysis-personnel" style={{ ...cardStyle, minHeight: 0, overflow: "hidden", display: "grid", gridTemplateRows: "auto minmax(0, 1fr)" }}>
            <PanelHeader inset title="Personnel signals" subtitle="Select a profile to review its reading behavior." meta={`${summaries.length} tracked`} />
            <div className="health-analysis-personnel-list hide-scrollbar" style={{ overflow: "auto", minHeight: 0, padding: 10, display: "grid", alignContent: "start", gap: 8 }}>
              {summaries.length === 0 ? (
                <EmptyState title="No personnel data" text="Register a miner and collect readings to begin a review." />
              ) : summaries.map(({ miner, analysis }) => (
                <button
                  type="button"
                  key={miner.id}
                  className={`health-analysis-personnel-card${miner.id === currentId ? " is-selected" : ""}`}
                  onClick={() => setSelectedId(miner.id)}
                  style={{ borderLeftColor: analysis.posture.color }}
                >
                  <span className="health-analysis-personnel-copy">
                    <strong>{miner.name}</strong>
                    <small>{miner.id} · {miner.location || "Unassigned"}</small>
                  </span>
                  <span className="health-analysis-personnel-status" style={{ color: analysis.posture.color }}>
                    <span className="health-analysis-status-dot" style={{ background: analysis.posture.color }} />
                    {analysis.posture.shortLabel}
                  </span>
                  <span className="health-analysis-personnel-meta">{analysis.flaggedCount} flagged · {analysis.sampleCount} readings</span>
                </button>
              ))}
            </div>
          </aside>

          <main className="health-analysis-detail hide-scrollbar" style={{ minHeight: 0, overflow: "auto", display: "grid", alignContent: "start", gap: 12 }}>
            {!selectedMiner ? (
              <div style={{ ...cardStyle, minHeight: 260, display: "grid", placeItems: "center" }}><EmptyState title="Waiting for readings" text="Health findings will appear when a personnel profile is available." /></div>
            ) : (
              <>
                <section className="health-analysis-hero" style={{ ...cardStyle, padding: 16, borderTop: `2px solid ${selectedAnalysis.posture.color}` }}>
                  <div className="health-analysis-hero-top">
                    <div>
                      <div style={{ color: C.primary, fontSize: 10, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase" }}>Current review</div>
                      <h2>{selectedMiner.name}</h2>
                      <div className="health-analysis-subline">{selectedMiner.id} · Last contact {formatLastSeen(selectedMiner.lastSeen)}</div>
                    </div>
                    <PostureBadge posture={selectedAnalysis.posture} />
                  </div>
                  <div className="health-analysis-stat-grid">
                    <AnalysisStat label="Readings analyzed" value={selectedAnalysis.sampleCount} color={C.cyan} />
                    <AnalysisStat label="Readings with flags" value={selectedAnalysis.flaggedCount} color={selectedAnalysis.posture.color} />
                    <AnalysisStat label="SOS activations" value={selectedAnalysis.sosCount} color={selectedAnalysis.sosCount ? C.red : C.green} />
                  </div>
                </section>

                <SessionTrendCard session={selectedSession} chart={sessionChart} />

                <section style={{ ...cardStyle, padding: 15 }}>
                  <PanelHeader title="Findings and next checks" subtitle="Exact signals that need attention, with the next action beside each one." meta={`${selectedAnalysis.findings.length} finding${selectedAnalysis.findings.length === 1 ? "" : "s"}`} />
                  <FactorLegend />
                  <div className="health-analysis-findings">
                    {selectedAnalysis.findings.map((finding) => <FindingCard key={finding.id} finding={finding} />)}
                  </div>
                </section>

                <section style={{ ...cardStyle, padding: 15 }}>
                  <PanelHeader title="Reading behavior" subtitle={`Metric cards use all ${selectedAnalysis.sampleCount} readings. The status preview below shows the latest ${Math.min(18, selectedAnalysis.sampleCount)}.`} meta={selectedAnalysis.windowLabel} />
                  <div className="health-analysis-metric-grid">
                    {METRICS.map((metric) => <BehaviorMetric key={metric.key} metric={metric} data={selectedAnalysis.metrics[metric.key]} />)}
                  </div>
                </section>
              </>
            )}
          </main>
        </section>
      </div>
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function buildSessionChartData(miner, session, analyticsRows = [], liveSeries = {}, activityLogs = [], thresholds = DEFAULT_THRESHOLDS) {
  if (!miner || !session) return emptySessionChart();

  const start = Number(session.startTimestamp || 0);
  const end = Number(session.endTimestamp || session.sortTimestamp || 0);
  const sessionKey = String(session.sessionId || "");
  const allRows = normalizeRows(miner, analyticsRows, liveSeries);
  const rows = allRows
    .filter((row) => {
      const timestamp = Number(row.timestamp || 0);
      const sameSession = sessionKey && row.sessionId && row.sessionId === sessionKey;
      const inWindow = timestamp >= start && (!end || timestamp <= end);
      return sameSession || inWindow;
    })
    .filter((row) => row.hr > 0 || row.spo2 > 0 || row.temp > 0);
  const logs = (activityLogs || [])
    .filter((log) => log.deviceId === miner.id && isSessionAlertLog(log))
    .filter((log) => {
      const timestamp = Number(log.timestamp || 0);
      return timestamp >= start && (!end || timestamp <= end) || Boolean(sessionKey && log.sessionId === sessionKey);
    })
    .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
  const labels = uniqueChartLabels(rows);
  const chartRows = rows.map((row, index) => ({
    ...row,
    time: labels[index] || compactTimestamp(row.timestamp),
    hr: row.hr > 0 ? row.hr : null,
    spo2: row.spo2 > 0 ? row.spo2 : null,
    temp: row.temp > 0 ? row.temp : null,
    statuses: Object.fromEntries(METRICS.map((metric) => [metric.key, getVitalStatus(row[metric.key], metric.key, thresholds)])),
    indicators: rowIndicators(row, thresholds),
  }));

  logs.forEach((log) => {
    if (!chartRows.length) return;
    const timestamp = Number(log.timestamp || 0);
    const nearestIndex = chartRows.reduce((closest, row, index) => (
      Math.abs(Number(row.timestamp) - timestamp) < Math.abs(Number(chartRows[closest].timestamp) - timestamp) ? index : closest
    ), 0);
    const indicator = indicatorFromAlertLog(log);
    chartRows[nearestIndex].indicators = addUniqueIndicator(chartRows[nearestIndex].indicators, indicator);
    chartRows[nearestIndex].statuses = { ...chartRows[nearestIndex].statuses, [indicator.metric]: indicator.status || chartRows[nearestIndex].statuses[indicator.metric] };
  });

  const indicators = chartRows.flatMap((row) => row.indicators);
  return {
    rows: chartRows,
    xAxisTicks: evenlySpacedTicks(chartRows, MAX_SESSION_X_AXIS_VALUES),
    recordedReadingCount: Math.max(Number(session.readingCount || 0), chartRows.length),
    flaggedPointCount: chartRows.filter((row) => row.indicators.length > 0).length,
    criticalCount: indicators.filter((indicator) => indicator.severity === "critical").length,
    warningCount: indicators.filter((indicator) => indicator.severity === "warning").length,
  };
}

function SessionTrendCard({ session, chart }) {
  const recordedReadingCount = Number(chart.recordedReadingCount || chart.rows.length);
  const hasUnavailableReadings = Boolean(session && recordedReadingCount > chart.rows.length);
  return (
    <section className="health-analysis-session-chart" style={{ ...cardStyle, padding: 15 }}>
      <PanelHeader
        title="Session reading timeline"
        subtitle={session ? "Hover any point to see the readings and the warning or critical signals recorded there." : "Select a session above to inspect its readings and alert points."}
        meta={session
          ? hasUnavailableReadings
            ? `${recordedReadingCount} recorded · ${chart.rows.length} plotted`
            : `${chart.rows.length} readings`
          : "No session selected"}
      />
      {!session ? (
        <EmptyState title="Choose a session to inspect" text="The chart will show up to six time labels while keeping every recorded point available on hover." />
      ) : chart.rows.length === 0 ? (
        <EmptyState title="No raw readings in this session" text="A session summary exists, but there are no timestamped sensor readings available for the chart." />
      ) : (
        <>
          <div className="health-analysis-session-chart-frame">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart.rows} margin={{ top: 12, right: 28, left: 0, bottom: 20 }}>
                <CartesianGrid stroke={C.borderSoft} vertical={false} />
                <XAxis dataKey="time" ticks={chart.xAxisTicks} tick={{ fill: C.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={18} height={28} />
                <YAxis yAxisId="vital" domain={chartDomain(chart.rows, ["hr", "spo2"], 10, [0, 120])} tick={{ fill: C.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} width={42} allowDecimals={false} label={{ value: "bpm / %", angle: -90, fill: C.textMuted, fontSize: 10, position: "insideLeft" }} />
                <YAxis yAxisId="temp" orientation="right" domain={chartDomain(chart.rows, ["temp"], 2, [20, 40])} tick={{ fill: C.teal, fontSize: 10 }} axisLine={false} tickLine={false} width={40} allowDecimals label={{ value: "°C", angle: 90, fill: C.teal, fontSize: 10, position: "insideRight" }} />
                <Tooltip content={<SessionTooltip />} cursor={{ stroke: C.primary, strokeDasharray: "4 4" }} />
                <Line yAxisId="vital" type="monotone" dataKey="hr" name="Heart rate" stroke={C.red} strokeWidth={2.5} connectNulls dot={(props) => <SessionStatusDot {...props} metricKey="hr" />} isAnimationActive={false} />
                <Line yAxisId="vital" type="monotone" dataKey="spo2" name="SpO2" stroke={C.oxygen} strokeWidth={2.5} connectNulls dot={(props) => <SessionStatusDot {...props} metricKey="spo2" />} isAnimationActive={false} />
                <Line yAxisId="temp" type="monotone" dataKey="temp" name="Temperature" stroke={C.teal} strokeWidth={2.5} connectNulls dot={(props) => <SessionStatusDot {...props} metricKey="temp" />} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="health-analysis-session-chart-footer">
            <span>{chart.flaggedPointCount} reading point{chart.flaggedPointCount === 1 ? "" : "s"} with attention signals</span>
            <span><b style={{ color: C.red }}>HR</b> · <b style={{ color: C.oxygen }}>SpO2</b> · <b style={{ color: C.teal }}>Temp</b> · <b style={{ color: C.red }}>{chart.criticalCount} critical</b> · <b style={{ color: C.amber }}>{chart.warningCount} warning</b> · {MAX_SESSION_X_AXIS_VALUES} time labels max</span>
          </div>
          {hasUnavailableReadings && (
            <div className="health-analysis-session-chart-note">
              The session record contains {recordedReadingCount} readings, but only {chart.rows.length} timestamped sensor points are available to plot. The missing points need to be restored from the source history.
            </div>
          )}
        </>
      )}
    </section>
  );
}

function SessionTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload.find((entry) => entry?.payload)?.payload;
  if (!row) return null;
  return (
    <div className="health-analysis-session-tooltip">
      <strong>{formatSystemTimestamp(row.timestamp)}</strong>
      <div className="health-analysis-tooltip-values">
        {METRICS.map((metric) => (
          <span key={metric.key} style={{ color: metric.color }}>
            {metric.label}: {formatReading(row[metric.key], metric.digits)} {metric.unit}
          </span>
        ))}
      </div>
      <div className="health-analysis-tooltip-indicators">
        <span className="health-analysis-tooltip-label">Recorded indicators</span>
        {row.indicators.length ? row.indicators.map((indicator, index) => (
          <span key={`${indicator.key}-${index}`} style={{ color: indicator.severity === "critical" ? C.red : C.amber }}>
            {indicator.severity === "critical" ? "Critical" : "Warning"}: {indicator.label}{indicator.detail ? ` — ${indicator.detail}` : ""}
          </span>
        )) : <span>Within configured review bands</span>}
      </div>
    </div>
  );
}

function SessionStatusDot({ cx, cy, payload, metricKey, stroke }) {
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || payload?.[metricKey] == null) return null;
  const status = payload.statuses?.[metricKey];
  const flagged = ["LOW", "HIGH", "CRITICAL"].includes(status);
  const color = status === "CRITICAL" ? C.red : flagged ? C.amber : stroke;
  return <circle cx={cx} cy={cy} r={flagged ? 5 : 2.3} fill={flagged ? color : stroke} fillOpacity={flagged ? 1 : 0.9} stroke={flagged ? C.bg0 : "none"} strokeWidth={flagged ? 2 : 0} />;
}

function emptySessionChart() {
  return { rows: [], xAxisTicks: [], recordedReadingCount: 0, flaggedPointCount: 0, criticalCount: 0, warningCount: 0 };
}

function rowIndicators(row, thresholds) {
  return METRICS.reduce((indicators, metric) => {
    const status = getVitalStatus(row[metric.key], metric.key, thresholds);
    if (!["LOW", "HIGH", "CRITICAL"].includes(status)) return indicators;
    return [...indicators, {
      key: `${metric.key}:${status}`,
      metric: metric.key,
      status,
      severity: status === "CRITICAL" ? "critical" : "warning",
      label: `${metric.label} ${status === "HIGH" ? "high" : status === "LOW" ? "low" : "critical"}`,
      detail: `${formatReading(row[metric.key], metric.digits)} ${metric.unit}`,
    }];
  }, []);
}

function indicatorFromAlertLog(log) {
  const text = `${log.title || ""} ${log.detail || ""}`.toLowerCase();
  const metric = text.includes("spo2") ? "spo2" : text.includes("temp") ? "temp" : "hr";
  const status = String(log.status || "").toUpperCase();
  const severity = log.type === "manual_alert" || log.severity === "critical" ? "critical" : "warning";
  return {
    key: `log:${log.id || log.timestamp || log.title}`,
    metric,
    status: ["LOW", "HIGH", "CRITICAL"].includes(status) ? status : undefined,
    severity,
    label: log.type === "manual_alert" ? "Manual SOS activation" : log.title || `${metric.toUpperCase()} alert`,
    detail: log.reading != null ? `${log.reading} ${log.unit || ""}`.trim() : log.detail || "Recorded alert event",
  };
}

function addUniqueIndicator(indicators, indicator) {
  const duplicate = indicators.some((current) => (
    current.key === indicator.key
      || (current.metric === indicator.metric && current.status && indicator.status && current.status === indicator.status)
  ));
  return duplicate ? indicators : [...indicators, indicator];
}

function isSessionAlertLog(log = {}) {
  return log.type === "vital" || log.type === "manual_alert";
}

function chartDomain(rows, keys, padding, fallback) {
  const values = rows.flatMap((row) => keys.map((key) => Number(row[key] || 0))).filter((value) => value > 0);
  if (!values.length) return fallback;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return [Math.max(0, min - padding), max + padding || min + padding];
}

function evenlySpacedTicks(rows, maxCount) {
  if (rows.length <= maxCount) return rows.map((row) => row.time);
  const indexes = new Set([0, rows.length - 1]);
  for (let index = 1; index < maxCount - 1; index += 1) indexes.add(Math.round((index * (rows.length - 1)) / (maxCount - 1)));
  return [...indexes].sort((a, b) => a - b).map((index) => rows[index].time);
}

// eslint-disable-next-line react-refresh/only-export-components
export function buildHealthFindings(miner, analyticsRows = [], liveSeries = {}, activityLogs = [], thresholds = DEFAULT_THRESHOLDS, dateRange = {}) {
  const rows = normalizeRows(miner, analyticsRows, liveSeries).filter((row) => isWithinDateRange(row.timestamp, dateRange));
  const validRows = rows.filter((row) => row.hr > 0 || row.spo2 > 0 || row.temp > 0);
  const scopedActivityLogs = (activityLogs || []).filter((log) => isWithinDateRange(log.timestamp, dateRange));
  const metrics = Object.fromEntries(METRICS.map((metric) => [metric.key, summarizeMetric(validRows, metric, thresholds)]));
  const sosCount = countSosSignals(miner, rows, scopedActivityLogs);
  const contactGaps = rows.filter((row) => row.finger === false).length + (miner.finger === false ? 1 : 0);
  const context = { miner, rows, validRows, scopedActivityLogs, metrics, thresholds, sosCount, contactGaps };
  const findings = buildHealthFindingList(context);

  const criticalCount = findings.filter((finding) => finding.severity === "critical").length;
  const warningCount = findings.filter((finding) => finding.severity === "warning").length;
  const posture = buildPosture(criticalCount, warningCount, findings);
  const lastValidRow = validRows.at(-1);
  return {
    metrics,
    findings,
    posture,
    sampleCount: validRows.length,
    flaggedCount: validRows.filter((row) => rowHasFlag(row, thresholds)).length,
    sosCount,
    behaviorLabel: behaviorLabel(metrics, validRows.length),
    windowLabel: validRows.length > 1 ? `${formatWindow(validRows[0].timestamp)} → ${formatWindow(lastValidRow.timestamp)}` : "Available window",
  };
}

function buildHealthFindingList(context) {
  const findings = [
    ...buildSosFindings(context),
    ...buildSpo2Findings(context),
    ...buildHeartRateFindings(context),
    ...buildTemperatureFindings(context),
    ...buildTrendFindings(context),
  ];
  const fallback = findings.length ? findings : buildFallbackFindings(context);
  return fallback.map((finding) => ({
    ...finding,
    timestamp: finding.timestamp || findingTimestamp(finding.id, context.miner, context.rows, context.scopedActivityLogs, context.thresholds),
  }));
}

function buildSosFindings({ sosCount }) {
  if (sosCount <= 0) return [];
  return [{
    id: "manual-sos",
    severity: "critical",
    title: "Manual SOS recorded",
    reading: `${sosCount} activation${sosCount === 1 ? "" : "s"}`,
    context: `${sosCount} manual SOS activation${sosCount === 1 ? " was" : "s were"} recorded in this review window. Sensor readings cannot explain or dismiss an SOS.` ,
    factors: "Treat this as a human safety signal first; accidental activation is also possible.",
    action: "Check the miner immediately and follow the site emergency response procedure.",
  }];
}

function buildSpo2Findings({ metrics }) {
  if (metrics.spo2.criticalCount > 0) {
    return [{ id: "spo2-critical", severity: "critical", title: "SpO2 crossed the critical threshold", reading: `${metrics.spo2.criticalCount} sample${metrics.spo2.criticalCount === 1 ? "" : "s"} · min ${formatReading(metrics.spo2.min, 0)}%`, context: `${metrics.spo2.criticalCount} SpO2 sample${metrics.spo2.criticalCount === 1 ? " was" : "s were"} below the critical threshold.`, factors: "Low oxygen values can also be caused by poor optical contact or movement, so confirm the signal.", action: "Verify placement and assess the person immediately; escalate persistent or symptomatic readings." }];
  }
  if (metrics.spo2.lowCount > 0) {
    return [{ id: "spo2-low", severity: "warning", title: "SpO2 is below the review range", reading: `${metrics.spo2.lowCount} sample${metrics.spo2.lowCount === 1 ? "" : "s"} · avg ${formatReading(metrics.spo2.average, 0)}%`, context: `${metrics.spo2.lowCount} of ${metrics.spo2.count} valid SpO2 samples were below the configured review range.`, factors: "Exertion, breathing strain, environmental conditions, or poor optical contact can produce this pattern.", action: "Pause, confirm a stable sensor fit, and repeat the reading during rest." }];
  }
  return [];
}

function buildHeartRateFindings({ metrics }) {
  if (metrics.hr.criticalCount > 0) {
    return [{ id: "hr-critical", severity: "critical", title: "Heart rate crossed the critical threshold", reading: `${metrics.hr.criticalCount} sample${metrics.hr.criticalCount === 1 ? "" : "s"} · max ${formatReading(metrics.hr.max, 0)} bpm`, context: `${metrics.hr.criticalCount} heart-rate sample${metrics.hr.criticalCount === 1 ? " was" : "s were"} at or above the configured critical threshold.`, factors: "Workload, heat, dehydration, stress, or sensor noise can affect the reading.", action: "Stop work, assess the person, and repeat the reading with good sensor contact." }];
  }
  if (metrics.hr.highCount > 0 || metrics.hr.lowCount > 0) {
    const direction = metrics.hr.highCount >= metrics.hr.lowCount ? "elevated" : "low";
    return [{ id: "hr-out-of-range", severity: "warning", title: `${direction[0].toUpperCase()}${direction.slice(1)} heart-rate readings`, reading: `${metrics.hr.outOfRangeCount} sample${metrics.hr.outOfRangeCount === 1 ? "" : "s"} · ${formatReading(metrics.hr.min, 0)}–${formatReading(metrics.hr.max, 0)} bpm`, context: `${metrics.hr.outOfRangeCount} of ${metrics.hr.count} valid heart-rate samples were outside the configured review range.`, factors: "The pattern may follow workload, heat, hydration, stress, recovery, or sensor contact.", action: "Allow a rest re-check with good contact and escalate the pattern if it remains unusual." }];
  }
  return [];
}

function buildTemperatureFindings({ metrics }) {
  if (metrics.temp.criticalCount > 0) {
    return [{ id: "temp-critical", severity: "critical", title: "Temperature crossed the critical threshold", reading: `${metrics.temp.criticalCount} sample${metrics.temp.criticalCount === 1 ? "" : "s"} · ${formatReading(metrics.temp.min, 1)}–${formatReading(metrics.temp.max, 1)}°C`, context: `${metrics.temp.criticalCount} temperature sample${metrics.temp.criticalCount === 1 ? " was" : "s were"} outside the configured critical band.`, factors: "Heat or cold exposure, illness, or probe placement can affect the signal.", action: "Move the person to a safer environment, verify the probe, and follow the site response protocol." }];
  }
  if (metrics.temp.highCount > 0 || metrics.temp.lowCount > 0) {
    return [{ id: "temp-out-of-range", severity: "warning", title: "Temperature is outside the review range", reading: `${metrics.temp.outOfRangeCount} sample${metrics.temp.outOfRangeCount === 1 ? "" : "s"} · ${formatReading(metrics.temp.min, 1)}–${formatReading(metrics.temp.max, 1)}°C`, context: `${metrics.temp.outOfRangeCount} of ${metrics.temp.count} valid temperature samples were outside the configured review range.`, factors: "Ambient exposure, heat strain, illness, or probe placement can affect the signal.", action: "Move out of exposure, confirm probe placement, and repeat the reading." }];
  }
  return [];
}

function buildTrendFindings({ metrics }) {
  if (metrics.spo2.trend !== "falling" || metrics.spo2.count < 3 || metrics.spo2.criticalCount > 0) return [];
  return [{ id: "spo2-trend", severity: "warning", title: "SpO2 is trending down", reading: `${formatReading(metrics.spo2.firstAverage, 0)}% → ${formatReading(metrics.spo2.lastAverage, 0)}%`, context: `The average moved down across the available samples without crossing the critical threshold.`, factors: "Increasing exertion, breathing strain, or changing sensor fit can produce this direction.", action: "Check the person and sensor contact now; repeat readings during rest." }];
}

function buildFallbackFindings({ contactGaps, validRows }) {
  if (contactGaps > 0) {
    return [{ id: "contact", severity: "observe", title: "Sensor contact is inconsistent", reading: `${contactGaps} contact gap${contactGaps === 1 ? "" : "s"}`, context: "Gaps can make HR and SpO2 findings less reliable.", factors: "Loose fit, sweat, movement, or sensor placement can interrupt contact.", action: "Re-seat the chest or optical sensor and collect a clean reading before drawing conclusions." }];
  }
  return [{ id: "stable", severity: "stable", title: "No concerning pattern detected", reading: stableReadingLabel(validRows.length), context: validRows.length ? "The available readings stayed within the configured review bands." : "There is not enough sensor data to form a finding.", factors: validRows.length ? "A stable sensor pattern is reassuring but is not a medical clearance." : "Offline devices, missing contact, or incomplete samples can limit the review.", action: validRows.length ? "Continue routine monitoring and investigate any symptoms reported by the miner." : "Restore contact or connectivity and collect readings before relying on this review." }];
}

function normalizeRows(miner, analyticsRows = [], liveSeries = {}) {
  const rows = (analyticsRows || [])
    .map((row) => normalizeReadingRow(row))
    .filter((row) => row.timestamp > 0);

  // Analytics rows are the persisted samples and must remain one row each.
  // Live series are only merged into an existing row at the exact timestamp;
  // they must not collapse separate persisted samples that share a timestamp.
  ["hr", "spo2", "temp"].forEach((key) => (liveSeries?.[key] || []).forEach((point) => {
    const timestamp = Number(point.timestamp || 0);
    if (!timestamp) return;
    const existing = rows.findLast((row) => Number(row.timestamp) === timestamp);
    if (existing) {
      mergeReadingFields(existing, { ...point, [key]: point[key] });
    } else {
      rows.push(normalizeReadingRow({ ...point, [key]: point[key] }));
    }
  }));

  if (!rows.length && lastSeenValue(miner)) {
    rows.push(normalizeReadingRow({ timestamp: lastSeenValue(miner), hr: miner.hr, spo2: miner.spo2, temp: miner.temp, finger: miner.finger, manual_alert: miner.manual_alert, button_press_count: miner.button_press_count }));
  }
  return rows.sort((a, b) => a.timestamp - b.timestamp);
}

function normalizeReadingRow(row = {}) {
  const normalized = { ...row, timestamp: Number(row.timestamp || 0) };
  mergeReadingFields(normalized, row);
  return normalized;
}

function mergeReadingFields(current, row = {}) {
  const timestamp = Number(row.timestamp || 0);
  if (timestamp) current.timestamp = timestamp;
  ["hr", "spo2", "temp"].forEach((key) => {
    if (Number(row[key]) > 0) current[key] = Number(row[key]);
  });
  ["finger", "manual_alert", "button_pressed", "button_press_count", "sessionId"].forEach((key) => {
    if (row[key] !== undefined) current[key] = row[key];
  });
}

function summarizeMetric(rows, metric, thresholds) {
  const values = rows.map((row) => row[metric.key]).filter((value) => Number(value) > 0).map(Number);
  const statuses = values.map((value) => getVitalStatus(value, metric.key, thresholds));
  const midpoint = Math.max(1, Math.floor(values.length / 2));
  const firstAverage = values.length ? average(values.slice(0, midpoint)) : 0;
  const lastAverage = values.length ? average(values.slice(-midpoint)) : 0;
  const trend = metricTrend(values.length, firstAverage, lastAverage, metric.key);
  return {
    count: values.length,
    average: average(values, metric.digits),
    min: values.length ? Math.min(...values) : 0,
    max: values.length ? Math.max(...values) : 0,
    outOfRangeCount: statuses.filter((status) => ["LOW", "HIGH", "CRITICAL"].includes(status)).length,
    lowCount: statuses.filter((status) => status === "LOW").length,
    highCount: statuses.filter((status) => status === "HIGH").length,
    criticalCount: statuses.filter((status) => status === "CRITICAL").length,
    firstAverage,
    lastAverage,
    trend,
  };
}

function countSosSignals(miner, rows, activityLogs) {
  const logSignals = (activityLogs || []).filter((log) => log.deviceId === miner.id && (log.type === "manual_alert" || /manual alert|button pressed|sos/i.test(`${log.title} ${log.detail}`)));
  const rowSignals = rows.filter((row, index, all) => row.manual_alert && !all[index - 1]?.manual_alert).length;
  const counter = rows.map((row) => Number(row.button_press_count || 0)).filter(Boolean);
  const counterSignals = counter.length ? Math.max(...counter) - Math.min(...counter) : 0;
  return Math.max(logSignals.length, rowSignals, counterSignals, miner.manual_alert ? 1 : 0);
}

function findingTimestamp(id, miner, rows, activityLogs, thresholds) {
  if (id === "manual-sos") return latestSosTimestamp(miner, rows, activityLogs);
  if (id === "spo2-critical") return latestMetricTimestamp(rows, "spo2", thresholds, "CRITICAL");
  if (id === "spo2-low") return latestMetricTimestamp(rows, "spo2", thresholds, "LOW");
  if (id === "hr-critical") return latestMetricTimestamp(rows, "hr", thresholds, "CRITICAL");
  if (id === "hr-out-of-range") return latestMetricTimestamp(rows, "hr", thresholds);
  if (id === "temp-critical") return latestMetricTimestamp(rows, "temp", thresholds, "CRITICAL");
  if (id === "temp-out-of-range") return latestMetricTimestamp(rows, "temp", thresholds);
  if (id === "contact") return rows.findLast((row) => row.finger === false)?.timestamp || lastSeenValue(miner);
  return rows.at(-1)?.timestamp || lastSeenValue(miner) || 0;
}

function latestMetricTimestamp(rows, key, thresholds, status) {
  return rows.findLast((row) => {
    const currentStatus = getVitalStatus(row[key], key, thresholds);
    return status ? currentStatus === status : ["LOW", "HIGH", "CRITICAL"].includes(currentStatus);
  })?.timestamp || rows.at(-1)?.timestamp || 0;
}

function latestSosTimestamp(miner, rows, activityLogs) {
  const latestLog = (activityLogs || []).findLast((log) => log.deviceId === miner.id && (log.type === "manual_alert" || /manual alert|button pressed|sos/i.test(`${log.title} ${log.detail}`)));
  const logTimestamp = Number(latestLog?.timestamp || 0);
  const rowTimestamp = rows.findLast((row) => row.manual_alert || Number(row.button_press_count || 0) > 0)?.timestamp || 0;
  return Math.max(logTimestamp, rowTimestamp, miner.manual_alert ? lastSeenValue(miner) : 0);
}

function rowHasFlag(row, thresholds) {
  return ["hr", "spo2", "temp"].some((key) => ["LOW", "HIGH", "CRITICAL"].includes(getVitalStatus(row[key], key, thresholds)));
}

function behaviorLabel(metrics, sampleCount) {
  if (!sampleCount) return "Insufficient data";
  if (metrics.hr.trend === "rising" || metrics.temp.trend === "rising") return "Rising load";
  if (metrics.spo2.trend === "falling") return "Oxygen trend down";
  if (Object.values(metrics).some((metric) => metric.outOfRangeCount > 0)) return "Variable";
  return "Steady";
}

function formatWindow(timestamp) {
  if (!timestamp) return "Unknown";
  return new Date(timestamp).toLocaleString("en-US", { month: "short", day: "numeric" });
}

function rangeThroughDateTime(value) {
  if (!value) return {};
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return {};
  const date = new Date(timestamp);
  return {
    start: new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(),
    end: timestamp,
  };
}

function intersectDateRanges(...ranges) {
  const startValues = ranges.map((range) => Number(range?.start || 0)).filter(Boolean);
  const endValues = ranges.map((range) => Number(range?.end || 0)).filter(Boolean);
  return {
    start: startValues.length ? Math.max(...startValues) : null,
    end: endValues.length ? Math.min(...endValues) : null,
  };
}

function sessionTimestamp(session, edge) {
  let timestamp = session?.endTimestamp || session?.sortTimestamp || 0;
  if (edge === "start") timestamp = session?.startTimestamp || 0;
  timestamp = Number(timestamp);
  return timestamp > 0 ? timestamp : null;
}

function capitalize(value) {
  const text = String(value || "");
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : "Unknown";
}

function emptyAnalysis() {
  return buildHealthFindings({ id: "empty", name: "", lastSeen: 0 }, [], {}, [], DEFAULT_THRESHOLDS);
}

function buildPosture(criticalCount, warningCount, findings) {
  if (criticalCount) return { label: "Immediate review", shortLabel: "Immediate", color: C.red };
  if (warningCount) return { label: "Needs attention", shortLabel: "Attention", color: C.amber };
  if (findings.some((finding) => finding.severity === "observe")) return { label: "Monitor", shortLabel: "Monitor", color: C.cyan };
  return { label: "Stable pattern", shortLabel: "Stable", color: C.green };
}

function stableReadingLabel(count) {
  if (!count) return "No valid samples";
  const suffix = count === 1 ? "" : "s";
  return `${count} valid sample${suffix}`;
}

function metricTrend(count, firstAverage, lastAverage, key) {
  if (count < 3) return "steady";
  const threshold = key === "temp" ? 0.5 : 2;
  if (lastAverage - firstAverage > threshold) return "rising";
  if (firstAverage - lastAverage > threshold) return "falling";
  return "steady";
}

function PanelHeader({ title, subtitle, meta, inset = false }) {
  return <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12, padding: inset ? "13px 15px" : "13px 0", marginBottom: 13, borderBottom: `1px solid ${C.borderSoft}` }}><div><div style={{ color: C.text, fontSize: 15, fontWeight: 950 }}>{title}</div><div style={{ color: C.textDim, fontSize: 12, lineHeight: 1.45, marginTop: 4 }}>{subtitle}</div></div>{meta && <span style={{ color: C.textMuted, fontSize: 11, whiteSpace: "nowrap" }}>{meta}</span>}</div>;
}

function PostureBadge({ posture }) {
  return <span className="health-analysis-posture" style={{ color: posture.color, borderColor: `${posture.color}50`, background: `${posture.color}12` }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: posture.color, boxShadow: `0 0 10px ${posture.color}` }} />{posture.label}</span>;
}

function AnalysisStat({ label, value, color }) {
  return <div className="health-analysis-stat"><span>{label}</span><strong style={{ color }}>{value}</strong></div>;
}

function FindingCard({ finding }) {
  const tone = findingTone(finding.severity);
  return (
    <article className="health-analysis-finding" style={{ borderLeftColor: tone, background: `${tone}08` }}>
      <div className="health-analysis-finding-top">
        <div>
          <span className="health-analysis-finding-level" style={{ color: tone }}>{finding.severity === "stable" ? "STABLE" : finding.severity.toUpperCase()}</span>
          <h3>{finding.title}</h3>
          <time className="health-analysis-finding-time" dateTime={finding.timestamp ? new Date(finding.timestamp).toISOString() : undefined}>
            {finding.timestamp ? formatSystemTimestamp(finding.timestamp) : "Timestamp unavailable"}
          </time>
        </div>
        <strong style={{ color: tone }}>{finding.reading}</strong>
      </div>
      <p>{finding.context}</p>
      <div className="health-analysis-finding-grid">
        <div><span>Interpretation</span><b>{finding.factors}</b></div>
        <div><span>Next action</span><b>{finding.action}</b></div>
      </div>
    </article>
  );
}

function FactorLegend() {
  return (
    <div className="health-analysis-factor-legend" aria-label="Factor level legend">
      <span className="health-analysis-factor-title">Signal level</span>
      <span><i style={{ background: C.green }} />Low</span>
      <span><i style={{ background: C.cyan }} />Moderate</span>
      <span><i style={{ background: C.amber }} />High</span>
      <span><i style={{ background: C.red }} />Critical</span>
    </div>
  );
}

function BehaviorMetric({ metric, data }) {
  const flagged = data.count ? Math.round((data.outOfRangeCount / data.count) * 100) : 0;
  const averageLabel = data.count ? `${formatReading(data.average, metric.digits)} ${metric.unit}` : "--";
  const rangeLabel = data.count ? `${data.min.toFixed(metric.digits)}–${data.max.toFixed(metric.digits)} ${metric.unit}` : "No readings";
  const trendLabel = data.count ? trendCopy(data.trend) : "Awaiting data";
  const flagLabel = data.count ? `${data.outOfRangeCount} of ${data.count} out of range` : "No readings";
  const meterColor = behaviorMeterColor(data.criticalCount, flagged);
  return (
    <div className="health-analysis-behavior">
      <div className="health-analysis-behavior-head"><span><i style={{ background: metric.color }} />{metric.label}</span><b style={{ color: metric.color }}>{averageLabel}</b></div>
      <div className="health-analysis-meter-caption"><span>Attention share</span><span>{flagged}%</span></div>
      <div className="health-analysis-meter"><span style={{ width: `${Math.min(100, flagged)}%`, background: meterColor }} /></div>
      <div className="health-analysis-behavior-foot"><span>Observed: {rangeLabel}</span><span style={{ color: meterColor }}>{flagLabel}</span></div>
      <div className="health-analysis-behavior-trend">{trendLabel}</div>
    </div>
  );
}

function trendCopy(trend) {
  if (trend === "rising") return "Trend: rising across the session";
  if (trend === "falling") return "Trend: falling across the session";
  return "Trend: steady across the session";
}

function behaviorMeterColor(criticalCount, flagged) {
  if (criticalCount) return C.red;
  return flagged ? C.amber : C.green;
}

function findingTone(severity) {
  if (severity === "critical") return C.red;
  if (severity === "warning") return C.amber;
  if (severity === "observe") return C.cyan;
  return C.green;
}

function EmptyState({ title, text }) {
  return <div style={{ padding: 24, textAlign: "center" }}><div style={{ color: C.text, fontSize: 12, fontWeight: 900 }}>{title}</div><div style={{ color: C.textMuted, fontSize: 10.5, lineHeight: 1.5, marginTop: 5 }}>{text}</div></div>;
}
